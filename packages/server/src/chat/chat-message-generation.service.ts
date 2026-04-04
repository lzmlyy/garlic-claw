import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import type { Message } from '@prisma/client';
import {
  createMessageReceivedHookPayload,
  createChatModelLifecycleContext,
  type ChatBeforeModelRequest,
} from '@garlic-claw/shared';
import { AiProviderService } from '../ai/ai-provider.service';
import type { ModelConfig } from '../ai/types/provider.types';
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
import { ChatMessageCompletionService } from './chat-message-completion.service';
import {
  assertConversationLlmEnabled,
  getOwnedConversationMessage,
} from './chat-message-common.helpers';
import { ChatMessageMutationService } from './chat-message-mutation.service';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';
import type { ChatRuntimeMessage } from './chat-message-session';
import { prepareSendMessagePayload } from './chat-message-session';
import {
  ChatModelInvocationService,
  type PreparedChatModelInvocation,
} from './chat-model-invocation.service';
import { ChatService } from './chat.service';
import { type RetryMessageDto, type SendMessageDto } from './dto/chat.dto';
import { ChatTaskService } from './chat-task.service';

type ResolvedPersonaPrompt = { systemPrompt: string; activePersonaId: string };

@Injectable()
export class ChatMessageGenerationService {
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
    private readonly mutationService: ChatMessageMutationService,
    private readonly completionService: ChatMessageCompletionService,
    private readonly skillCommands: SkillCommandService,
  ) {}

  async startMessageGeneration(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    const conversation = await this.chatService.getConversation(userId, conversationId);
    assertConversationLlmEnabled(conversation);
    if (hasActiveAssistantMessage(conversation.messages)) {
      throw new BadRequestException('当前仍有回复在生成中，请先停止或等待完成');
    }
    const payload = prepareSendMessagePayload({
      history: conversation.messages,
      input: toUserMessageInput(dto.parts, dto.content),
    });
    const initialModelConfig = this.aiProvider.getModelConfig(dto.provider, dto.model);
    const resolvedPersona = await this.buildSystemPrompt(conversationId);
    const messageReceivedContext = createChatModelLifecycleContext({
      userId,
      conversationId,
      activePersonaId: resolvedPersona.activePersonaId,
      modelConfig: initialModelConfig,
    });
    const baseReceivedPayload = createMessageReceivedHookPayload({
      context: messageReceivedContext,
      conversationId,
      providerId: initialModelConfig.providerId,
      modelId: initialModelConfig.id,
      message: {
        role: 'user',
        content: payload.persistedMessage.content,
        parts: payload.persistedMessage.parts,
      },
      modelMessages: payload.modelMessages,
    });
    const skillCommandResult = await this.skillCommands.tryHandleMessage({
      userId,
      conversationId,
      messageText: baseReceivedPayload.message.content ?? '',
    });
    const receivedMessageResult = skillCommandResult
      ? {
          action: 'short-circuit' as const,
          payload: baseReceivedPayload,
          ...skillCommandResult,
        }
      : await this.pluginRuntime.runInboundHook({
          hookName: 'message:received',
          context: messageReceivedContext,
          payload: baseReceivedPayload,
        });
    const modelConfig = this.aiProvider.getModelConfig(
      receivedMessageResult.payload.providerId,
      receivedMessageResult.payload.modelId,
    );
    const {
      userMessage: createdUserMessage,
      assistantMessage,
      modelMessages,
    } = await this.mutationService.startGenerationTurn({
      userId,
      conversationId,
      activePersonaId: resolvedPersona.activePersonaId,
      modelConfig,
      receivedMessagePayload: receivedMessageResult.payload,
    });

    const generation = receivedMessageResult.action === 'short-circuit'
      ? {
          userMessage: createdUserMessage,
          assistantMessage: await this.runWithAssistantErrorBoundary(
            assistantMessage.id,
            conversationId,
            () => this.completionService.completeShortCircuitedAssistant({
              assistantMessageId: assistantMessage.id,
              userId,
              conversationId,
              activePersonaId: resolvedPersona.activePersonaId,
              completion: receivedMessageResult,
            }),
          ),
        }
      : await this.continueAssistantGeneration({
          assistantMessage,
          userMessage: createdUserMessage,
          userId,
          conversationId,
          modelConfig,
          runtimeMessages: modelMessages as ChatRuntimeMessage[],
          resolvedPersona,
        });
    return {
      userMessage: generation.userMessage ?? createdUserMessage,
      assistantMessage: generation.assistantMessage,
    };
  }

  async stopMessageGeneration(
    userId: string,
    conversationId: string,
    messageId: string,
  ) {
    const { message } = await getOwnedConversationMessage(
      this.chatService,
      userId,
      conversationId,
      messageId,
    );
    if (message.role !== 'assistant') {
      throw new BadRequestException('只有 AI 回复消息可以停止');
    }

    const stopped = await this.chatTaskService.stopTask(messageId);
    if (!stopped && (message.status === 'pending' || message.status === 'streaming')) {
      await this.mutationService.markAssistantStopped(messageId, conversationId);
    }

    return this.prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  }

  async retryMessageGeneration(
    userId: string,
    conversationId: string,
    messageId: string,
    dto: RetryMessageDto,
  ) {
    const { conversation, message } = await getOwnedConversationMessage(
      this.chatService,
      userId,
      conversationId,
      messageId,
    );
    assertConversationLlmEnabled(conversation);
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

    const modelConfig = this.aiProvider.getModelConfig(providerId, modelId);
    const assistantMessage = await this.mutationService.resetAssistantForRetry({
      messageId,
      conversationId,
      providerId: modelConfig.providerId,
      modelId: modelConfig.id,
    });

    return (
      await this.continueAssistantGeneration({
        assistantMessage,
        userId,
        conversationId,
        modelConfig,
        runtimeMessages: toRuntimeMessages(conversation.messages.slice(0, -1)),
      })
    ).assistantMessage;
  }

  private async continueAssistantGeneration(input: {
    assistantMessage: Message;
    userMessage?: Message;
    userId: string;
    conversationId: string;
    modelConfig: ModelConfig;
    runtimeMessages: ChatRuntimeMessage[];
    resolvedPersona?: ResolvedPersonaPrompt;
  }): Promise<{
    assistantMessage: Message;
    userMessage: Message | null;
  }> {
    const resolvedPersona = input.resolvedPersona ?? await this.buildSystemPrompt(input.conversationId);
    const activePersonaId = resolvedPersona.activePersonaId;

    return this.runWithAssistantErrorBoundary(
      input.assistantMessage.id,
      input.conversationId,
      async () => {
        const beforeModelResult = await this.orchestration.applyChatBeforeModelHooks({
          userId: input.userId,
          conversationId: input.conversationId,
          activePersonaId,
          systemPrompt: resolvedPersona.systemPrompt,
          modelConfig: input.modelConfig,
          messages: input.runtimeMessages,
        });
        if (beforeModelResult.action === 'short-circuit') {
          return {
            userMessage: input.userMessage ?? null,
            assistantMessage: await this.completionService.completeShortCircuitedAssistant({
              assistantMessageId: input.assistantMessage.id,
              userId: input.userId,
              conversationId: input.conversationId,
              activePersonaId,
              completion: beforeModelResult,
            }),
          };
        }

        const preparedInvocation = await this.modelInvocation.prepareResolved({
          conversationId: input.conversationId,
          modelConfig: beforeModelResult.modelConfig,
          messages: beforeModelResult.request.messages,
        });
        const messageWithMetadata = await this.completionService.applyVisionFallbackMetadata({
          userMessage: input.userMessage,
          assistantMessage: input.assistantMessage,
          visionFallbackEntries:
            preparedInvocation.transformResult?.visionFallback?.entries ?? [],
        });
        this.startPreparedGenerationTask({
          assistantMessageId: messageWithMetadata.assistantMessage.id,
          userId: input.userId,
          conversationId: input.conversationId,
          activePersonaId,
          beforeModelResult,
          preparedInvocation,
        });
        return messageWithMetadata;
      },
    );
  }

  private startPreparedGenerationTask(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    activePersonaId: string;
    beforeModelResult: Extract<
      Awaited<ReturnType<ChatMessageOrchestrationService['applyChatBeforeModelHooks']>>,
      { action: 'continue' }
    >;
    preparedInvocation: PreparedChatModelInvocation;
  }) {
    const chatToolSet = input.beforeModelResult.modelConfig.capabilities.toolCall
      ? input.beforeModelResult.buildToolSet({
          context: createChatModelLifecycleContext({
            source: 'chat-tool',
            userId: input.userId,
            conversationId: input.conversationId,
            activePersonaId: input.activePersonaId,
            modelConfig: input.beforeModelResult.modelConfig,
          }),
          allowedToolNames: input.beforeModelResult.request.availableTools.map(
            (tool: ChatBeforeModelRequest['availableTools'][number]) => tool.name,
          ),
        })
      : undefined;

    this.chatTaskService.startTask({
      assistantMessageId: input.assistantMessageId,
      conversationId: input.conversationId,
      providerId: input.beforeModelResult.modelConfig.providerId,
      modelId: input.beforeModelResult.modelConfig.id,
      createStream: this.orchestration.buildStreamFactory({
        assistantMessageId: input.assistantMessageId,
        userId: input.userId,
        conversationId: input.conversationId,
        request: input.beforeModelResult.request,
        preparedInvocation: input.preparedInvocation,
        activeProviderId: input.beforeModelResult.modelConfig.providerId,
        activeModelId: input.beforeModelResult.modelConfig.id,
        activePersonaId: input.activePersonaId,
        tools: chatToolSet,
      }),
      onComplete: (result) =>
        this.orchestration.applyFinalResponseHooks({
          userId: input.userId,
          conversationId: input.conversationId,
          activePersonaId: input.activePersonaId,
          responseSource: 'model',
          result,
        }),
      onSent: (result) =>
        this.orchestration.runResponseAfterSendHooks({
          userId: input.userId,
          conversationId: input.conversationId,
          activePersonaId: input.activePersonaId,
          responseSource: 'model',
          result,
        }),
    });
  }

  private async runWithAssistantErrorBoundary<TResult>(
    assistantMessageId: string,
    conversationId: string,
    run: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await run();
    } catch (error) {
      await this.mutationService.markAssistantError(
        assistantMessageId,
        conversationId,
        error instanceof Error ? error.message : '未知错误',
      );
      throw error;
    }
  }

  private async buildSystemPrompt(conversationId: string): Promise<ResolvedPersonaPrompt> {
    const currentPersona = await this.personaService.getCurrentPersona({
      conversationId,
    });

    return {
      systemPrompt: currentPersona.prompt || CHAT_SYSTEM_PROMPT,
      activePersonaId: currentPersona.personaId,
    };
  }
}
