import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChatBeforeModelRequest,
  ChatMessagePart,
  PluginCallContext,
  PluginMessageSendInfo,
  PluginMessageTargetInfo,
  PluginMessageTargetRef,
} from '@garlic-claw/shared';
import { AiProviderService } from '../ai/ai-provider.service';
import { PersonaService } from '../persona/persona.service';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { SkillCommandService } from '../skill/skill-command.service';
import {
  CHAT_SYSTEM_PROMPT,
  hasActiveAssistantMessage,
  toRuntimeMessages,
  toUserMessageInput,
} from './chat-message.helpers';
import {
  ChatMessageOrchestrationService,
} from './chat-message-orchestration.service';
import { ChatMessageCompletionService } from './chat-message-completion.service';
import { ChatMessageMutationService } from './chat-message-mutation.service';
import { ChatMessagePluginTargetService } from './chat-message-plugin-target.service';
import { ChatModelInvocationService } from './chat-model-invocation.service';
import type { ChatRuntimeMessage } from './chat-message-session';
import { prepareSendMessagePayload } from './chat-message-session';
import { ChatService } from './chat.service';
import { type RetryMessageDto, type SendMessageDto, type UpdateMessageDto } from './dto/chat.dto';
import { normalizeConversationHostServices } from './chat-host-services';
import { deserializeMessageParts, serializeMessageParts } from './message-parts';
import {
  ChatTaskService,
} from './chat-task.service';

@Injectable()
export class ChatMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly aiProvider: AiProviderService,
    private readonly personaService: PersonaService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly modelInvocation: ChatModelInvocationService,
    private readonly orchestration: ChatMessageOrchestrationService,
    private readonly chatTaskService: ChatTaskService,
    private readonly completionService: ChatMessageCompletionService,
    private readonly mutationService: ChatMessageMutationService,
    private readonly pluginTargetService: ChatMessagePluginTargetService,
    private readonly skillCommands: SkillCommandService,
  ) {}

  /** 创建一轮新的用户消息与 assistant 生成任务，输出已落库的用户消息与 assistant 占位消息。 */
  async startMessageGeneration(userId: string, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.chatService.getConversation(userId, conversationId);
    this.assertConversationLlmEnabled(conversation);
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
    const baseReceivedPayload = {
      context: messageReceivedContext,
      conversationId,
      providerId: initialModelConfig.providerId,
      modelId: initialModelConfig.id,
      message: {
        role: 'user' as const,
        content: payload.persistedMessage.content,
        parts: deserializeMessageParts(payload.persistedMessage.partsJson),
      },
      modelMessages: payload.modelMessages,
    };
    const skillCommandResult = await this.skillCommands.tryHandleMessage({
      userId,
      conversationId,
      messageText: baseReceivedPayload.message.content ?? '',
    });
    const receivedMessageResult = skillCommandResult
      ? {
          action: 'short-circuit' as const,
          payload: baseReceivedPayload,
          assistantContent: skillCommandResult.assistantContent,
          assistantParts: skillCommandResult.assistantParts,
          providerId: skillCommandResult.providerId,
          modelId: skillCommandResult.modelId,
        }
      : await this.pluginRuntime.runMessageReceivedHooks({
          context: messageReceivedContext,
          payload: baseReceivedPayload,
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
        const completedAssistantMessage = await this.completionService.completeShortCircuitedAssistant({
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

      const beforeModelResult = await this.orchestration.applyChatBeforeModelHooks({
        userId,
        conversationId,
        activePersonaId: resolvedPersona.activePersonaId,
        systemPrompt: resolvedPersona.systemPrompt,
        modelConfig,
        messages: createdMessagePayload.modelMessages as ChatRuntimeMessage[],
      });
      if (beforeModelResult.action === 'short-circuit') {
        const completedAssistantMessage = await this.completionService.completeShortCircuitedAssistant({
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
      const {
        userMessage: userMessageWithMetadata,
        assistantMessage: assistantMessageWithMetadata,
      } = await this.completionService.applyVisionFallbackMetadata({
        userMessage,
        assistantMessage,
        visionFallbackEntries:
          preparedInvocation.transformResult?.visionFallback?.entries ?? [],
      });
      const chatToolSet = beforeModelResult.modelConfig.capabilities.toolCall
        ? beforeModelResult.buildToolSet({
          context: {
            source: 'chat-tool',
            userId,
            conversationId,
            activeProviderId: beforeModelResult.modelConfig.providerId,
            activeModelId: beforeModelResult.modelConfig.id,
            activePersonaId: resolvedPersona.activePersonaId,
          },
          allowedToolNames: beforeModelResult.request.availableTools.map(
            (tool: ChatBeforeModelRequest['availableTools'][number]) => tool.name,
          ),
        })
        : undefined;

      this.chatTaskService.startTask({
        assistantMessageId: assistantMessageWithMetadata.id,
        conversationId,
        providerId: beforeModelResult.modelConfig.providerId,
        modelId: beforeModelResult.modelConfig.id,
        createStream: this.orchestration.buildStreamFactory({
          assistantMessageId: assistantMessageWithMetadata.id,
          userId,
          conversationId,
          request: beforeModelResult.request,
          preparedInvocation,
          activeProviderId: beforeModelResult.modelConfig.providerId,
          activeModelId: beforeModelResult.modelConfig.id,
          activePersonaId: resolvedPersona.activePersonaId,
          tools: chatToolSet,
        }),
        onComplete: (result) =>
          this.orchestration.applyFinalResponseHooks({
            userId,
            conversationId,
            activePersonaId: resolvedPersona.activePersonaId,
            responseSource: 'model',
            result,
          }),
        onSent: (result) =>
          this.orchestration.runResponseAfterSendHooks({
            userId,
            conversationId,
            activePersonaId: resolvedPersona.activePersonaId,
            responseSource: 'model',
            result,
          }),
      });
      return {
        userMessage: userMessageWithMetadata,
        assistantMessage: assistantMessageWithMetadata,
      };
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
    this.assertConversationLlmEnabled(conversation);
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
        metadataJson: null,
      },
    });
    await this.touchConversation(conversationId);

    try {
      const runtimeMessages = toRuntimeMessages(historyMessages);
      const resolvedPersona = await this.buildSystemPrompt(conversationId);
      const beforeModelResult = await this.orchestration.applyChatBeforeModelHooks({
        userId,
        conversationId,
        activePersonaId: resolvedPersona.activePersonaId,
        systemPrompt: resolvedPersona.systemPrompt,
        modelConfig,
        messages: runtimeMessages,
      });
      if (beforeModelResult.action === 'short-circuit') {
        return this.completionService.completeShortCircuitedAssistant({
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
      const assistantMessageWithMetadata =
        await this.completionService.applyVisionFallbackMetadataToAssistant({
          assistantMessage,
          visionFallbackEntries:
            preparedInvocation.transformResult?.visionFallback?.entries ?? [],
        });
      const chatToolSet = beforeModelResult.modelConfig.capabilities.toolCall
        ? beforeModelResult.buildToolSet({
          context: {
            source: 'chat-tool',
            userId,
            conversationId,
            activeProviderId: beforeModelResult.modelConfig.providerId,
            activeModelId: beforeModelResult.modelConfig.id,
            activePersonaId: resolvedPersona.activePersonaId,
          },
          allowedToolNames: beforeModelResult.request.availableTools.map(
            (tool: ChatBeforeModelRequest['availableTools'][number]) => tool.name,
          ),
        })
        : undefined;

      this.chatTaskService.startTask({
        assistantMessageId: assistantMessageWithMetadata.id,
        conversationId,
        providerId: beforeModelResult.modelConfig.providerId,
        modelId: beforeModelResult.modelConfig.id,
        createStream: this.orchestration.buildStreamFactory({
          assistantMessageId: assistantMessageWithMetadata.id,
          userId,
          conversationId,
          request: beforeModelResult.request,
          preparedInvocation,
          activeProviderId: beforeModelResult.modelConfig.providerId,
          activeModelId: beforeModelResult.modelConfig.id,
          activePersonaId: resolvedPersona.activePersonaId,
          tools: chatToolSet,
        }),
        onComplete: (result) =>
          this.orchestration.applyFinalResponseHooks({
            userId,
            conversationId,
            activePersonaId: resolvedPersona.activePersonaId,
            responseSource: 'model',
            result,
          }),
        onSent: (result) =>
          this.orchestration.runResponseAfterSendHooks({
            userId,
            conversationId,
            activePersonaId: resolvedPersona.activePersonaId,
            responseSource: 'model',
            result,
          }),
      });
      return assistantMessageWithMetadata;
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
  }

  /** 更新一条已存在的消息，不会自动触发重跑。 */
  async updateMessage(userId: string, conversationId: string, messageId: string, dto: UpdateMessageDto) {
    return this.mutationService.updateMessage(userId, conversationId, messageId, dto);
  }

  /** 删除一条消息，不会自动删除其后的消息。 */
  async deleteMessage(userId: string, conversationId: string, messageId: string) {
    return this.mutationService.deleteMessage(userId, conversationId, messageId);
  }

  /** 供插件读取当前消息目标摘要；当前实现映射为当前会话。 */
  async getCurrentPluginMessageTarget(input: {
    context: PluginCallContext;
  }): Promise<PluginMessageTargetInfo | null> {
    return this.pluginTargetService.getCurrentPluginMessageTarget(input);
  }

  /** 供插件向当前或指定单用户消息目标发送一条 assistant 消息。 */
  async sendPluginMessage(input: {
    context: PluginCallContext;
    target?: PluginMessageTargetRef | null;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<PluginMessageSendInfo> {
    return this.pluginTargetService.sendPluginMessage(input);
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
   * 校验当前会话是否允许启动新的 LLM 生成任务。
   * @param conversation 当前会话记录
   */
  private assertConversationLlmEnabled(conversation: {
    hostServicesJson?: string | null;
  }) {
    const hostServices = normalizeConversationHostServices(
      conversation.hostServicesJson,
    );

    if (!hostServices.sessionEnabled) {
      throw new BadRequestException('当前会话宿主服务已停用');
    }

    if (!hostServices.llmEnabled) {
      throw new BadRequestException('当前会话已关闭 LLM 自动回复');
    }
  }

}
