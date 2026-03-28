import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ChatBeforeModelRequest } from '@garlic-claw/shared';
import { AiProviderService } from '../ai/ai-provider.service';
import { createStepLimit } from '../ai/sdk-adapter';
import type { ModelConfig } from '../ai/types/provider.types';
import { PersonaService } from '../persona/persona.service';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildChatToolSet,
  CHAT_SYSTEM_PROMPT,
  hasActiveAssistantMessage,
  listChatAvailableTools,
  mapDtoParts,
  toRuntimeMessages,
  toUserMessageInput,
} from './chat-message.helpers';
import {
  ChatModelInvocationService,
  type PreparedChatModelInvocation,
} from './chat-model-invocation.service';
import type { ChatRuntimeMessage } from './chat-message-session';
import { prepareSendMessagePayload } from './chat-message-session';
import { ChatService } from './chat.service';
import { type RetryMessageDto, type SendMessageDto, type UpdateMessageDto } from './dto/chat.dto';
import { normalizeUserMessageInput, serializeMessageParts } from './message-parts';
import {
  ChatTaskService,
  type CompletedChatTaskResult,
} from './chat-task.service';

/**
 * 聊天模型前 Hook 归一化后的继续执行结果。
 */
interface AppliedChatBeforeModelContinueResult {
  action: 'continue';
  modelConfig: ModelConfig;
  request: ChatBeforeModelRequest;
}

/**
 * 聊天模型前 Hook 归一化后的短路结果。
 */
interface AppliedChatBeforeModelShortCircuitResult {
  action: 'short-circuit';
  request: ChatBeforeModelRequest;
  assistantContent: string;
  providerId: string;
  modelId: string;
  reason?: string;
}

/**
 * 聊天模型前 Hook 的服务内结果联合。
 */
type AppliedChatBeforeModelResult =
  | AppliedChatBeforeModelContinueResult
  | AppliedChatBeforeModelShortCircuitResult;

@Injectable()
export class ChatMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly aiProvider: AiProviderService,
    private readonly personaService: PersonaService,
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly modelInvocation: ChatModelInvocationService,
    private readonly chatTaskService: ChatTaskService,
  ) {}

  /** 创建一轮新的用户消息与 assistant 生成任务，输出已落库的用户消息与 assistant 占位消息。 */
  async startMessageGeneration(userId: string, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.chatService.getConversation(userId, conversationId);
    if (hasActiveAssistantMessage(conversation.messages)) {
      throw new BadRequestException('当前仍有回复在生成中，请先停止或等待完成');
    }

    const payload = prepareSendMessagePayload({
      history: conversation.messages,
      input: toUserMessageInput(dto.parts, dto.content),
    });
    const modelConfig = this.aiProvider.getModelConfig(dto.provider, dto.model);

    const userMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: payload.persistedMessage.content,
        partsJson: payload.persistedMessage.partsJson,
        status: 'completed',
      },
    });
    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: '',
        provider: modelConfig.providerId,
        model: modelConfig.id,
        status: 'pending',
      },
    });
    await this.touchConversation(conversationId);

    try {
      const resolvedPersona = await this.buildSystemPrompt(conversationId);
      const beforeModelResult = await this.applyChatBeforeModelHooks({
        userId,
        conversationId,
        activePersonaId: resolvedPersona.activePersonaId,
        systemPrompt: resolvedPersona.systemPrompt,
        modelConfig,
        messages: payload.modelMessages,
      });
      const activePersona = await this.personaService.getCurrentPersona({
        conversationId,
      });
      if (beforeModelResult.action === 'short-circuit') {
        const completedAssistantMessage = await this.completeShortCircuitedAssistant({
          assistantMessageId: assistantMessage.id,
          userId,
          conversationId,
          providerId: beforeModelResult.providerId,
          modelId: beforeModelResult.modelId,
          activePersonaId: activePersona.personaId,
          assistantContent: beforeModelResult.assistantContent,
        });
        return {
          userMessage,
          assistantMessage: completedAssistantMessage,
        };
      }

      const preparedInvocation = await this.modelInvocation.prepareResolved({
        conversationId,
        modelConfig: beforeModelResult.modelConfig,
        messages: beforeModelResult.request.messages,
      });

      this.chatTaskService.startTask({
        assistantMessageId: assistantMessage.id,
        conversationId,
        providerId: beforeModelResult.modelConfig.providerId,
        modelId: beforeModelResult.modelConfig.id,
        createStream: this.buildStreamFactory({
          userId,
          conversationId,
          request: beforeModelResult.request,
          preparedInvocation,
          activeProviderId: beforeModelResult.modelConfig.providerId,
          activeModelId: beforeModelResult.modelConfig.id,
          activePersonaId: activePersona.personaId,
          supportsToolCall: beforeModelResult.modelConfig.capabilities.toolCall,
        }),
        onComplete: (result) =>
          this.applyChatAfterModelHooks({
            userId,
            conversationId,
            activePersonaId: activePersona.personaId,
            result,
          }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      await this.prisma.message.update({
        where: { id: assistantMessage.id },
        data: {
          status: 'error',
          error: errorMessage,
        },
      });
      await this.touchConversation(conversationId);
      throw error;
    }

    return { userMessage, assistantMessage };
  }

  /** 主动停止指定 assistant 消息的后台生成任务，并返回最新消息状态。 */
  async stopMessageGeneration(userId: string, conversationId: string, messageId: string) {
    const { message } = await this.getOwnedMessage(userId, conversationId, messageId);
    if (message.role !== 'assistant') {
      throw new BadRequestException('只有 AI 回复消息可以停止');
    }

    const stopped = await this.chatTaskService.stopTask(messageId);
    if (!stopped && (message.status === 'pending' || message.status === 'streaming')) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'stopped',
          error: null,
        },
      });
      await this.touchConversation(conversationId);
    }

    return this.prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  }

  /** 原地重试最后一条 assistant 回复，可选覆盖 provider/model。 */
  async retryMessageGeneration(userId: string, conversationId: string, messageId: string, dto: RetryMessageDto) {
    const { conversation, message } = await this.getOwnedMessage(userId, conversationId, messageId);
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (!lastMessage || lastMessage.id !== messageId || message.role !== 'assistant') {
      throw new BadRequestException('只能重试最后一条 AI 回复');
    }

    await this.chatTaskService.stopTask(messageId);

    const providerId = dto.provider ?? message.provider;
    const modelId = dto.model ?? message.model;
    if (!providerId || !modelId) {
      throw new BadRequestException('缺少重试所需的 provider/model');
    }

    const historyMessages = conversation.messages.slice(0, -1);
    const modelConfig = this.aiProvider.getModelConfig(providerId, modelId);
    const assistantMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        provider: modelConfig.providerId,
        model: modelConfig.id,
        status: 'pending',
        error: null,
        toolCalls: null,
        toolResults: null,
      },
    });
    await this.touchConversation(conversationId);

    try {
      const runtimeMessages = toRuntimeMessages(historyMessages);
      const resolvedPersona = await this.buildSystemPrompt(conversationId);
      const beforeModelResult = await this.applyChatBeforeModelHooks({
        userId,
        conversationId,
        activePersonaId: resolvedPersona.activePersonaId,
        systemPrompt: resolvedPersona.systemPrompt,
        modelConfig,
        messages: runtimeMessages,
      });
      const activePersona = await this.personaService.getCurrentPersona({
        conversationId,
      });
      if (beforeModelResult.action === 'short-circuit') {
        return this.completeShortCircuitedAssistant({
          assistantMessageId: messageId,
          userId,
          conversationId,
          providerId: beforeModelResult.providerId,
          modelId: beforeModelResult.modelId,
          activePersonaId: activePersona.personaId,
          assistantContent: beforeModelResult.assistantContent,
        });
      }

      const preparedInvocation = await this.modelInvocation.prepareResolved({
        conversationId,
        modelConfig: beforeModelResult.modelConfig,
        messages: beforeModelResult.request.messages,
      });

      this.chatTaskService.startTask({
        assistantMessageId: messageId,
        conversationId,
        providerId: beforeModelResult.modelConfig.providerId,
        modelId: beforeModelResult.modelConfig.id,
        createStream: this.buildStreamFactory({
          userId,
          conversationId,
          request: beforeModelResult.request,
          preparedInvocation,
          activeProviderId: beforeModelResult.modelConfig.providerId,
          activeModelId: beforeModelResult.modelConfig.id,
          activePersonaId: activePersona.personaId,
          supportsToolCall: beforeModelResult.modelConfig.capabilities.toolCall,
        }),
        onComplete: (result) =>
          this.applyChatAfterModelHooks({
            userId,
            conversationId,
            activePersonaId: activePersona.personaId,
            result,
          }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'error',
          error: errorMessage,
        },
      });
      await this.touchConversation(conversationId);
      throw error;
    }

    return assistantMessage;
  }

  /** 更新一条已存在的消息，不会自动触发重跑。 */
  async updateMessage(userId: string, conversationId: string, messageId: string, dto: UpdateMessageDto) {
    const { message } = await this.getOwnedMessage(userId, conversationId, messageId);
    await this.chatTaskService.stopTask(messageId);

    const updated = message.role === 'user'
      ? normalizeUserMessageInput({
          content: dto.content,
          parts: dto.parts ? mapDtoParts(dto.parts) : undefined,
        })
      : null;

    const result = await this.prisma.message.update({
      where: { id: messageId },
      data: message.role === 'user'
        ? {
            content: updated?.content,
            partsJson: updated ? serializeMessageParts(updated.parts) : null,
            status: 'completed',
            error: null,
          }
        : {
            content: dto.content?.trim() ?? '',
            status: 'completed',
            error: null,
          },
    });
    await this.touchConversation(conversationId);
    return result;
  }

  /** 删除一条消息，不会自动删除其后的消息。 */
  async deleteMessage(userId: string, conversationId: string, messageId: string) {
    await this.getOwnedMessage(userId, conversationId, messageId);
    await this.chatTaskService.stopTask(messageId);
    await this.prisma.message.delete({ where: { id: messageId } });
    await this.touchConversation(conversationId);
    return { success: true };
  }

  /** 读取对话中的一条消息并校验所有权，输出对话与消息。 */
  private async getOwnedMessage(userId: string, conversationId: string, messageId: string) {
    const conversation = await this.chatService.getConversation(userId, conversationId);
    const message = conversation.messages.find((item) => item.id === messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return { conversation, message };
  }

  /**
   * 构建当前会话的人设系统提示词。
   * @param conversationId 当前会话 ID
   * @returns 当前 persona 的系统提示词与 persona ID
   */
  private async buildSystemPrompt(conversationId: string) {
    const currentPersona = await this.personaService.getCurrentPersona({
      conversationId,
    });

    return {
      systemPrompt: currentPersona.prompt || CHAT_SYSTEM_PROMPT,
      activePersonaId: currentPersona.personaId,
    };
  }

  /** 触发会话更新时间，保证列表排序能跟上最新消息状态。 */
  private async touchConversation(conversationId: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
      },
    });
  }

  /** 统一构造聊天流工厂，供 send/retry 复用。 */
  private buildStreamFactory(input: {
    userId: string;
    conversationId: string;
    request: ChatBeforeModelRequest;
    preparedInvocation: PreparedChatModelInvocation;
    activeProviderId: string;
    activeModelId: string;
    activePersonaId: string;
    supportsToolCall: boolean;
  }) {
    return (abortSignal: AbortSignal) =>
      this.modelInvocation.streamPrepared({
        prepared: input.preparedInvocation,
        system: input.request.systemPrompt,
        tools: buildChatToolSet({
          supportsToolCall: input.supportsToolCall,
          pluginRuntime: this.pluginRuntime,
          userId: input.userId,
          conversationId: input.conversationId,
          activeProviderId: input.activeProviderId,
          activeModelId: input.activeModelId,
          activePersonaId: input.activePersonaId,
          allowedToolNames: input.request.availableTools.map(
            (tool: ChatBeforeModelRequest['availableTools'][number]) => tool.name,
          ),
        }),
        variant: input.request.variant,
        providerOptions: input.request.providerOptions,
        headers: input.request.headers,
        maxOutputTokens: input.request.maxOutputTokens,
        stopWhen: createStepLimit(5),
        abortSignal,
      }).result;
  }

  /**
   * 在模型调用前运行统一插件 Hook，并得到最终请求快照。
   * @param input 当前调用的用户、对话、模型和消息上下文
   * @returns 最终请求快照或短路结果
   */
  private async applyChatBeforeModelHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    systemPrompt: string;
    modelConfig: { providerId: string; id: string };
    messages: ChatRuntimeMessage[];
  }): Promise<AppliedChatBeforeModelResult> {
    const hookContext = {
      source: 'chat-hook' as const,
      userId: input.userId,
      conversationId: input.conversationId,
      activeProviderId: input.modelConfig.providerId,
      activeModelId: input.modelConfig.id,
      activePersonaId: input.activePersonaId,
    };
    const hookResult = await this.pluginRuntime.runChatBeforeModelHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        request: {
          providerId: input.modelConfig.providerId,
          modelId: input.modelConfig.id,
          systemPrompt: input.systemPrompt,
          messages: input.messages,
          availableTools: listChatAvailableTools({
            pluginRuntime: this.pluginRuntime,
            userId: input.userId,
            conversationId: input.conversationId,
            activeProviderId: input.modelConfig.providerId,
            activeModelId: input.modelConfig.id,
            activePersonaId: input.activePersonaId,
          }),
        },
      },
    });

    if (hookResult.action === 'short-circuit') {
      return {
        action: 'short-circuit',
        request: hookResult.request,
        assistantContent: hookResult.assistantContent,
        providerId: hookResult.providerId,
        modelId: hookResult.modelId,
        ...(hookResult.reason ? { reason: hookResult.reason } : {}),
      };
    }

    return {
      action: 'continue',
      request: hookResult.request,
      modelConfig: this.aiProvider.getModelConfig(
        hookResult.request.providerId,
        hookResult.request.modelId,
      ),
    };
  }

  /**
   * 在 assistant 成功完成后运行统一插件 Hook。
   * @param input 当前用户、会话与最终 assistant 快照
   * @returns 可能被插件改写后的最终 assistant 快照
   */
  private async applyChatAfterModelHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    const patchedPayload = await this.pluginRuntime.runChatAfterModelHooks({
      context: {
        source: 'chat-hook',
        userId: input.userId,
        conversationId: input.conversationId,
        activeProviderId: input.result.providerId,
        activeModelId: input.result.modelId,
        activePersonaId: input.activePersonaId,
      },
      payload: {
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        assistantMessageId: input.result.assistantMessageId,
        assistantContent: input.result.content,
        toolCalls: input.result.toolCalls,
        toolResults: input.result.toolResults,
      },
    });

    if (
      !patchedPayload
      || typeof patchedPayload.assistantContent !== 'string'
      || patchedPayload.assistantContent === input.result.content
    ) {
      return input.result;
    }

    return {
      ...input.result,
      content: patchedPayload.assistantContent,
    };
  }

  /**
   * 将短路结果直接写回 assistant 消息，并触发模型后 Hook。
   * @param input assistant 消息、上下文和最终回复
   * @returns 已更新完成态的 assistant 消息
   */
  private async completeShortCircuitedAssistant(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    providerId: string;
    modelId: string;
    activePersonaId: string;
    assistantContent: string;
  }) {
    const assistantMessage = await this.prisma.message.update({
      where: { id: input.assistantMessageId },
      data: {
        content: input.assistantContent,
        provider: input.providerId,
        model: input.modelId,
        status: 'completed',
        error: null,
        toolCalls: null,
        toolResults: null,
      },
    });
    await this.touchConversation(input.conversationId);
    const patchedResult = await this.applyChatAfterModelHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      result: {
        assistantMessageId: input.assistantMessageId,
        conversationId: input.conversationId,
        providerId: input.providerId,
        modelId: input.modelId,
        content: input.assistantContent,
        toolCalls: [],
        toolResults: [],
      },
    });

    if (patchedResult.content === assistantMessage.content) {
      return assistantMessage;
    }

    const patchedAssistantMessage = await this.prisma.message.update({
      where: { id: input.assistantMessageId },
      data: {
        content: patchedResult.content,
        provider: patchedResult.providerId,
        model: patchedResult.modelId,
        status: 'completed',
        error: null,
        toolCalls: null,
        toolResults: null,
      },
    });
    await this.touchConversation(input.conversationId);
    return patchedAssistantMessage;
  }
}
