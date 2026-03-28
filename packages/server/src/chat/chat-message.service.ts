import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ChatBeforeModelRequest,
  ChatMessagePart,
  PluginCallContext,
  PluginConversationMessageInfo,
  PluginResponseSource,
} from '@garlic-claw/shared';
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
import {
  deserializeMessageParts,
  normalizeAssistantMessageOutput,
  normalizeUserMessageInput,
  serializeMessageParts,
} from './message-parts';
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
  assistantParts: ChatMessagePart[];
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
    const initialModelConfig = this.aiProvider.getModelConfig(dto.provider, dto.model);
    const resolvedPersona = await this.buildSystemPrompt(conversationId);
    const messageReceivedContext = this.createChatLifecycleContext({
      userId,
      conversationId,
      activeProviderId: initialModelConfig.providerId,
      activeModelId: initialModelConfig.id,
      activePersonaId: resolvedPersona.activePersonaId,
    });
    const receivedMessageResult = await this.pluginRuntime.runMessageReceivedHooks({
      context: messageReceivedContext,
      payload: {
        context: messageReceivedContext,
        conversationId,
        providerId: initialModelConfig.providerId,
        modelId: initialModelConfig.id,
        message: {
          role: 'user',
          content: payload.persistedMessage.content,
          parts: deserializeMessageParts(payload.persistedMessage.partsJson),
        },
        modelMessages: payload.modelMessages,
      },
    });
    const receivedMessagePayload = receivedMessageResult.payload;
    const modelConfig = this.aiProvider.getModelConfig(
      receivedMessagePayload.providerId,
      receivedMessagePayload.modelId,
    );
    const messageCreatedContext = this.createChatLifecycleContext({
      userId,
      conversationId,
      activeProviderId: modelConfig.providerId,
      activeModelId: modelConfig.id,
      activePersonaId: resolvedPersona.activePersonaId,
    });
    const createdMessagePayload = await this.pluginRuntime.runMessageCreatedHooks({
      context: messageCreatedContext,
      payload: {
        context: messageCreatedContext,
        conversationId,
        message: {
          role: 'user',
          content: receivedMessagePayload.message.content,
          parts: receivedMessagePayload.message.parts,
          status: 'completed',
        },
        modelMessages: receivedMessagePayload.modelMessages,
      },
    });

    const userMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: createdMessagePayload.message.content ?? '',
        partsJson: serializeMessageParts(createdMessagePayload.message.parts),
        status: createdMessagePayload.message.status ?? 'completed',
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
      if (receivedMessageResult.action === 'short-circuit') {
        const completedAssistantMessage = await this.completeShortCircuitedAssistant({
          assistantMessageId: assistantMessage.id,
          userId,
          conversationId,
          providerId: receivedMessageResult.providerId,
          modelId: receivedMessageResult.modelId,
          activePersonaId: resolvedPersona.activePersonaId,
          assistantContent: receivedMessageResult.assistantContent,
          assistantParts: receivedMessageResult.assistantParts,
        });
        return {
          userMessage,
          assistantMessage: completedAssistantMessage,
        };
      }

      const beforeModelResult = await this.applyChatBeforeModelHooks({
        userId,
        conversationId,
        activePersonaId: resolvedPersona.activePersonaId,
        systemPrompt: resolvedPersona.systemPrompt,
        modelConfig,
        messages: createdMessagePayload.modelMessages as ChatRuntimeMessage[],
      });
      if (beforeModelResult.action === 'short-circuit') {
        const completedAssistantMessage = await this.completeShortCircuitedAssistant({
          assistantMessageId: assistantMessage.id,
          userId,
          conversationId,
          providerId: beforeModelResult.providerId,
          modelId: beforeModelResult.modelId,
          activePersonaId: resolvedPersona.activePersonaId,
          assistantContent: beforeModelResult.assistantContent,
          assistantParts: beforeModelResult.assistantParts,
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
          assistantMessageId: assistantMessage.id,
          userId,
          conversationId,
          request: beforeModelResult.request,
          preparedInvocation,
          activeProviderId: beforeModelResult.modelConfig.providerId,
          activeModelId: beforeModelResult.modelConfig.id,
          activePersonaId: resolvedPersona.activePersonaId,
          supportsToolCall: beforeModelResult.modelConfig.capabilities.toolCall,
        }),
        onComplete: (result) =>
          this.applyFinalResponseHooks({
            userId,
            conversationId,
            activePersonaId: resolvedPersona.activePersonaId,
            responseSource: 'model',
            result,
          }),
        onSent: (result) =>
          this.runResponseAfterSendHooks({
            userId,
            conversationId,
            activePersonaId: resolvedPersona.activePersonaId,
            responseSource: 'model',
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
      if (beforeModelResult.action === 'short-circuit') {
        return this.completeShortCircuitedAssistant({
          assistantMessageId: messageId,
          userId,
          conversationId,
          providerId: beforeModelResult.providerId,
          modelId: beforeModelResult.modelId,
          activePersonaId: resolvedPersona.activePersonaId,
          assistantContent: beforeModelResult.assistantContent,
          assistantParts: beforeModelResult.assistantParts,
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
          assistantMessageId: messageId,
          userId,
          conversationId,
          request: beforeModelResult.request,
          preparedInvocation,
          activeProviderId: beforeModelResult.modelConfig.providerId,
          activeModelId: beforeModelResult.modelConfig.id,
          activePersonaId: resolvedPersona.activePersonaId,
          supportsToolCall: beforeModelResult.modelConfig.capabilities.toolCall,
        }),
        onComplete: (result) =>
          this.applyFinalResponseHooks({
            userId,
            conversationId,
            activePersonaId: resolvedPersona.activePersonaId,
            responseSource: 'model',
            result,
          }),
        onSent: (result) =>
          this.runResponseAfterSendHooks({
            userId,
            conversationId,
            activePersonaId: resolvedPersona.activePersonaId,
            responseSource: 'model',
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
    const hookContext = this.createChatLifecycleContext({
      userId,
      conversationId,
    });
    const updatedPayload = await this.pluginRuntime.runMessageUpdatedHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        conversationId,
        messageId,
        currentMessage: this.toMessageHookInfo(message),
        nextMessage: message.role === 'user'
          ? {
              role: 'user',
              content: updated?.content ?? '',
              parts: updated?.parts ?? [],
              status: 'completed',
            }
          : {
              role: message.role,
              content: dto.content?.trim() ?? '',
              parts: [],
              provider: message.provider,
              model: message.model,
              status: 'completed',
            },
      },
    });

    const result = await this.prisma.message.update({
      where: { id: messageId },
      data: message.role === 'user'
        ? {
            content: updatedPayload.nextMessage.content ?? '',
            partsJson: serializeMessageParts(updatedPayload.nextMessage.parts),
            status: updatedPayload.nextMessage.status ?? 'completed',
            error: null,
          }
        : {
            content: updatedPayload.nextMessage.content ?? '',
            provider: updatedPayload.nextMessage.provider ?? message.provider,
            model: updatedPayload.nextMessage.model ?? message.model,
            status: updatedPayload.nextMessage.status ?? 'completed',
            error: null,
          },
    });
    await this.touchConversation(conversationId);
    return result;
  }

  /** 删除一条消息，不会自动删除其后的消息。 */
  async deleteMessage(userId: string, conversationId: string, messageId: string) {
    const { message } = await this.getOwnedMessage(userId, conversationId, messageId);
    await this.chatTaskService.stopTask(messageId);
    const hookContext = this.createChatLifecycleContext({
      userId,
      conversationId,
    });
    await this.pluginRuntime.runMessageDeletedHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        conversationId,
        messageId,
        message: this.toMessageHookInfo(message),
      },
    });
    await this.prisma.message.delete({ where: { id: messageId } });
    await this.touchConversation(conversationId);
    return { success: true };
  }

  /** 供插件主动向当前或指定会话追加一条已完成的 assistant 消息。 */
  async createPluginConversationMessage(input: {
    context: PluginCallContext;
    conversationId?: string;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<PluginConversationMessageInfo> {
    const targetConversationId = input.conversationId ?? input.context.conversationId;
    if (!targetConversationId) {
      throw new BadRequestException('conversation.message.create 需要 conversationId 上下文');
    }

    await this.ensureConversationAccess(input.context, targetConversationId);

    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.content,
      parts: input.parts,
    });
    if (!normalizedAssistant.content && normalizedAssistant.parts.length === 0) {
      throw new BadRequestException(
        'conversation.message.create 需要非空 content 或 parts',
      );
    }

    const provider = input.provider ?? input.context.activeProviderId ?? null;
    const model = input.model ?? input.context.activeModelId ?? null;
    const hookContext = this.createChatLifecycleContext({
      source: input.context.source,
      userId: input.context.userId,
      conversationId: targetConversationId,
      ...(provider ? { activeProviderId: provider } : {}),
      ...(model ? { activeModelId: model } : {}),
      ...(input.context.activePersonaId
        ? { activePersonaId: input.context.activePersonaId }
        : {}),
    });
    const createdMessagePayload = await this.pluginRuntime.runMessageCreatedHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        conversationId: targetConversationId,
        message: {
          role: 'assistant',
          content: normalizedAssistant.content,
          parts: normalizedAssistant.parts,
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
          status: 'completed',
        },
        modelMessages: [
          {
            role: 'assistant',
            content: normalizedAssistant.parts,
          },
        ],
      },
    });

    const createdMessage = await this.prisma.message.create({
      data: {
        conversationId: targetConversationId,
        role: 'assistant',
        content: createdMessagePayload.message.content ?? '',
        partsJson: createdMessagePayload.message.parts.length
          ? serializeMessageParts(createdMessagePayload.message.parts)
          : null,
        provider: createdMessagePayload.message.provider ?? null,
        model: createdMessagePayload.message.model ?? null,
        status: createdMessagePayload.message.status ?? 'completed',
        error: null,
      },
    });
    await this.touchConversation(targetConversationId);

    return {
      id: createdMessage.id,
      conversationId: targetConversationId,
      role: 'assistant',
      content: createdMessage.content ?? '',
      parts: deserializeMessageParts(createdMessage.partsJson),
      ...(typeof createdMessage.provider !== 'undefined'
        ? { provider: createdMessage.provider }
        : {}),
      ...(typeof createdMessage.model !== 'undefined'
        ? { model: createdMessage.model }
        : {}),
      status: createdMessage.status as
        'pending' | 'streaming' | 'completed' | 'stopped' | 'error',
      createdAt: createdMessage.createdAt.toISOString(),
      updatedAt: createdMessage.updatedAt.toISOString(),
    };
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
   * 校验插件要写入的目标会话确实存在，并在有 userId 时复用现有所有权校验。
   * @param context 插件调用上下文
   * @param conversationId 目标会话 ID
   * @returns 无返回值
   */
  private async ensureConversationAccess(
    context: PluginCallContext,
    conversationId: string,
  ) {
    if (context.userId) {
      await this.chatService.getConversation(context.userId, conversationId);
      return;
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        id: true,
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
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

  /**
   * 构造聊天生命周期 Hook 调用上下文。
   * @param input 当前用户、会话与可选激活上下文
   * @returns 统一插件调用上下文
   */
  private createChatLifecycleContext(input: {
    source?: PluginCallContext['source'];
    userId?: string;
    conversationId: string;
    activeProviderId?: string;
    activeModelId?: string;
    activePersonaId?: string;
  }) {
    return {
      source: input.source ?? ('chat-hook' as const),
      ...(input.userId ? { userId: input.userId } : {}),
      conversationId: input.conversationId,
      ...(input.activeProviderId ? { activeProviderId: input.activeProviderId } : {}),
      ...(input.activeModelId ? { activeModelId: input.activeModelId } : {}),
      ...(input.activePersonaId ? { activePersonaId: input.activePersonaId } : {}),
    };
  }

  /**
   * 将持久化消息记录映射为消息生命周期 Hook 快照。
   * @param message 已持久化消息
   * @returns Hook 可见的消息快照
   */
  private toMessageHookInfo(message: {
    id: string;
    role: string;
    content: string | null;
    partsJson?: string | null;
    provider?: string | null;
    model?: string | null;
    status: string;
  }) {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      parts: deserializeMessageParts(message.partsJson),
      ...(typeof message.provider !== 'undefined' ? { provider: message.provider } : {}),
      ...(typeof message.model !== 'undefined' ? { model: message.model } : {}),
      status: message.status as 'pending' | 'streaming' | 'completed' | 'stopped' | 'error',
    };
  }

  /** 统一构造聊天流工厂，供 send/retry 复用。 */
  private buildStreamFactory(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    request: ChatBeforeModelRequest;
    preparedInvocation: PreparedChatModelInvocation;
    activeProviderId: string;
    activeModelId: string;
    activePersonaId: string;
    supportsToolCall: boolean;
  }) {
    return (abortSignal: AbortSignal) => {
      const hookContext = this.createChatLifecycleContext({
        userId: input.userId,
        conversationId: input.conversationId,
        activeProviderId: input.activeProviderId,
        activeModelId: input.activeModelId,
        activePersonaId: input.activePersonaId,
      });

      void this.pluginRuntime.runChatWaitingModelHooks({
        context: hookContext,
        payload: {
          context: hookContext,
          conversationId: input.conversationId,
          assistantMessageId: input.assistantMessageId,
          providerId: input.activeProviderId,
          modelId: input.activeModelId,
          request: input.request,
        },
      });

      return this.modelInvocation.streamPrepared({
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
    };
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
      const normalizedAssistant = normalizeAssistantMessageOutput({
        content: hookResult.assistantContent,
        parts: hookResult.assistantParts,
      });

      return {
        action: 'short-circuit',
        request: hookResult.request,
        assistantContent: normalizedAssistant.content,
        assistantParts: normalizedAssistant.parts,
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
    const currentParts = input.result.parts ?? [];
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
        assistantParts: currentParts,
        toolCalls: input.result.toolCalls,
        toolResults: input.result.toolResults,
      },
    });

    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: patchedPayload.assistantContent,
      parts: patchedPayload.assistantParts,
    });

    if (
      normalizedAssistant.content === input.result.content
      && JSON.stringify(normalizedAssistant.parts) === JSON.stringify(currentParts)
    ) {
      return input.result;
    }

    return {
      ...input.result,
      content: normalizedAssistant.content,
      parts: normalizedAssistant.parts,
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
    assistantParts?: ChatMessagePart[];
  }) {
    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.assistantContent,
      parts: input.assistantParts,
    });
    const assistantMessage = await this.prisma.message.update({
      where: { id: input.assistantMessageId },
      data: {
        content: normalizedAssistant.content,
        partsJson: normalizedAssistant.parts.length
          ? serializeMessageParts(normalizedAssistant.parts)
          : null,
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
        content: normalizedAssistant.content,
        parts: normalizedAssistant.parts,
        toolCalls: [],
        toolResults: [],
      },
    });
    const finalResult = await this.applyResponseBeforeSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: patchedResult,
    });

    const serializedFinalParts = finalResult.parts.length
      ? serializeMessageParts(finalResult.parts)
      : null;
    const finalAssistantMessage = finalResult.content === assistantMessage.content
      && serializedFinalParts === ((assistantMessage as { partsJson?: string | null }).partsJson ?? null)
      && finalResult.providerId === assistantMessage.provider
      && finalResult.modelId === assistantMessage.model
      ? assistantMessage
      : await this.prisma.message.update({
        where: { id: input.assistantMessageId },
        data: {
          content: finalResult.content,
          partsJson: serializedFinalParts,
          provider: finalResult.providerId,
          model: finalResult.modelId,
          status: 'completed',
          error: null,
          toolCalls: finalResult.toolCalls.length
            ? JSON.stringify(finalResult.toolCalls)
            : null,
          toolResults: finalResult.toolResults.length
            ? JSON.stringify(finalResult.toolResults)
            : null,
        },
      });
    await this.touchConversation(input.conversationId);
    await this.runResponseAfterSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: finalResult,
    });
    return finalAssistantMessage;
  }

  /**
   * 串行执行 assistant 完成态上的模型后 Hook 与最终发送前 Hook。
   * @param input 当前用户、会话、回复来源与完成态快照
   * @returns 最终可发送的 assistant 快照
   */
  private async applyFinalResponseHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    const afterModelResult = await this.applyChatAfterModelHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      result: input.result,
    });

    return this.applyResponseBeforeSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: input.responseSource,
      result: afterModelResult,
    });
  }

  /**
   * 在最终 assistant 发送前运行统一插件 Hook。
   * @param input 当前用户、会话、回复来源与完成态快照
   * @returns 可能被插件改写后的最终 assistant 快照
   */
  private async applyResponseBeforeSendHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    const currentParts = input.result.parts ?? [];
    const hookContext = this.createChatLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activeProviderId: input.result.providerId,
      activeModelId: input.result.modelId,
      activePersonaId: input.activePersonaId,
    });
    const patchedPayload = await this.pluginRuntime.runResponseBeforeSendHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        responseSource: input.responseSource,
        assistantMessageId: input.result.assistantMessageId,
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        assistantContent: input.result.content,
        assistantParts: currentParts,
        toolCalls: input.result.toolCalls,
        toolResults: input.result.toolResults,
      },
    });

    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: patchedPayload.assistantContent,
      parts: patchedPayload.assistantParts,
    });

    return {
      ...input.result,
      providerId: patchedPayload.providerId,
      modelId: patchedPayload.modelId,
      content: normalizedAssistant.content,
      parts: normalizedAssistant.parts,
      toolCalls: patchedPayload.toolCalls,
      toolResults: patchedPayload.toolResults,
    };
  }

  /**
   * 在最终 assistant 发送完成后派发统一插件 Hook。
   * @param input 当前用户、会话、回复来源与最终 assistant 快照
   * @returns 无返回值
   */
  private async runResponseAfterSendHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<void> {
    const currentParts = input.result.parts ?? [];
    const hookContext = this.createChatLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activeProviderId: input.result.providerId,
      activeModelId: input.result.modelId,
      activePersonaId: input.activePersonaId,
    });

    await this.pluginRuntime.runResponseAfterSendHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        responseSource: input.responseSource,
        assistantMessageId: input.result.assistantMessageId,
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        assistantContent: input.result.content,
        assistantParts: currentParts,
        toolCalls: input.result.toolCalls,
        toolResults: input.result.toolResults,
        sentAt: new Date().toISOString(),
      },
    });
  }
}
