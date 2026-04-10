import {
  createChatModelLifecycleContext,
  createChatLifecycleContext,
  createPluginMessageHookInfoFromRecord,
  normalizeAssistantMessageOutput,
  type ChatMessagePart,
  type ChatMessageStatus,
  type PluginCallContext,
  type PluginLlmMessage,
  type PluginMessageSendInfo,
  type PluginMessageTargetInfo,
  type PluginMessageTargetRef,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import {
  getOwnedConversationMessage,
} from './chat-message-common.helpers';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';
import { type UpdateMessageDto } from './dto/chat.dto';
import { ChatTaskService } from './chat-task.service';
import { MessageMutationOrchestrator } from './message-mutation/message-mutation.orchestrator';
import { MessagePartsMapper } from './message-mutation/domain/message-parts.mapper';
import { MessageRepository } from './message-mutation/domain/message-repository';
import { MessageTargetResolver } from './message-mutation/domain/message-target-resolver';

type CreateChatMessageInput = {
  role: 'user' | 'assistant';
  content?: string | null;
  parts?: ChatMessagePart[] | null;
  provider?: string | null;
  model?: string | null;
  status?: ChatMessageStatus | null;
};

type HookableChatMessageInput = CreateChatMessageInput & {
  content: string;
  parts: ChatMessagePart[];
  status: ChatMessageStatus;
};

type MessageRecordWithMetadata = { id: string; metadataJson?: string | null } & Record<string, unknown>;

interface ChatVisionFallbackMetadataEntry { text: string; source: 'cache' | 'generated' }

type ShortCircuitedAssistantOutput = {
  assistantContent: string;
  assistantParts?: ChatMessagePart[];
  providerId: string;
  modelId: string;
};

@Injectable()
export class ChatMessageMutationService {
  private pluginChatRuntimePromise?: Promise<import('../plugin/plugin-chat-runtime.facade').PluginChatRuntimeFacade>;
  private readonly messageRepository: MessageRepository;
  private readonly messageTargetResolver: MessageTargetResolver;
  private readonly messagePartsMapper: MessagePartsMapper;
  private readonly messageMutationOrchestrator: MessageMutationOrchestrator;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly orchestration: ChatMessageOrchestrationService,
    private readonly chatTaskService: ChatTaskService,
    private readonly moduleRef: ModuleRef,
  ) {
    this.messageRepository = new MessageRepository(this.prisma);
    this.messageTargetResolver = new MessageTargetResolver(this.prisma, this.chatService);
    this.messagePartsMapper = new MessagePartsMapper();
    this.messageMutationOrchestrator = new MessageMutationOrchestrator({
      messageRepository: this.messageRepository,
      resolveSendMessageTarget: (context, target) =>
        this.messageTargetResolver.resolve(context, target ?? undefined),
      createConversationTargetAssistantMessage: (input) =>
        this.createConversationTargetAssistantMessage(input),
      prepareOwnedMessageMutation: (input) => this.prepareOwnedMessageMutation(input),
      getPluginChatRuntime: () => this.getPluginChatRuntime(),
      mapDtoParts: (parts) => this.messagePartsMapper.fromDtoParts(parts),
      toUpdatePartsJson: (parts) => this.messagePartsMapper.toUpdatePartsJson(parts),
      updateMessageAndTouch: (messageId, conversationId, data) =>
        this.updateMessageAndTouch(messageId, conversationId, data),
    });
  }

  async startGenerationTurn(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    modelConfig: { providerId: string; id: string };
    receivedMessagePayload: {
      message: {
        content: string | null;
        parts: ChatMessagePart[];
      };
      modelMessages: PluginLlmMessage[];
    };
  }) {
    const { createdMessage: userMessage, modelMessages } =
      await this.createHookedStoredMessage({
        conversationId: input.conversationId,
        hookContext: createChatModelLifecycleContext({
          userId: input.userId,
          conversationId: input.conversationId,
          activePersonaId: input.activePersonaId,
          modelConfig: input.modelConfig,
        }),
        modelMessages: input.receivedMessagePayload.modelMessages,
        touchConversation: false,
        message: {
          role: 'user',
          ...input.receivedMessagePayload.message,
          content: input.receivedMessagePayload.message.content ?? '',
          status: 'completed',
        },
      });

    return {
      userMessage,
      modelMessages,
      assistantMessage: await this.createStoredMessage(
        input.conversationId,
        {
          role: 'assistant',
          content: '',
          provider: input.modelConfig.providerId,
          model: input.modelConfig.id,
          status: 'pending',
        },
      ),
    };
  }

  async getCurrentPluginMessageTarget(input: {
    context: PluginCallContext;
  }): Promise<PluginMessageTargetInfo | null> {
    return input.context.conversationId
      ? this.messageTargetResolver.resolve(input.context)
      : null;
  }

  async sendPluginMessage(input: {
    context: PluginCallContext;
    target?: PluginMessageTargetRef | null;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<PluginMessageSendInfo> {
    return this.messageMutationOrchestrator.sendPluginMessage(input);
  }

  async completeShortCircuitedAssistant(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    activePersonaId: string;
    completion: ShortCircuitedAssistantOutput;
  }) {
    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.completion.assistantContent,
      parts: input.completion.assistantParts,
    });
    const finalResult = await this.orchestration.applyFinalResponseHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: {
        assistantMessageId: input.assistantMessageId,
        conversationId: input.conversationId,
        providerId: input.completion.providerId,
        modelId: input.completion.modelId,
        content: normalizedAssistant.content,
        parts: normalizedAssistant.parts,
        toolCalls: [],
        toolResults: [],
      },
    });
    const finalAssistantMessage = await this.updateMessageAndTouch(
      input.assistantMessageId,
      input.conversationId,
      {
        content: finalResult.content,
        partsJson: this.messagePartsMapper.toNullablePartsJson(finalResult.parts),
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
    );
    await this.orchestration.runResponseAfterSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: finalResult,
    });
    return finalAssistantMessage;
  }

  async applyVisionFallbackMetadata<
    TUserMessage extends MessageRecordWithMetadata,
    TAssistantMessage extends MessageRecordWithMetadata,
  >(input: {
    userMessage?: TUserMessage | null;
    assistantMessage: TAssistantMessage;
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[];
  }): Promise<{
    userMessage: TUserMessage | null;
    assistantMessage: TAssistantMessage;
  }> {
    const userMessage = input.userMessage ?? null;
    const metadataJson = await this.persistVisionFallbackMetadata(
      userMessage
        ? [userMessage.id, input.assistantMessage.id]
        : [input.assistantMessage.id],
      input.visionFallbackEntries,
    );
    if (!metadataJson) {
      return {
        userMessage,
        assistantMessage: input.assistantMessage,
      };
    }

    return {
      userMessage: userMessage
        ? {
            ...userMessage,
            metadataJson,
          } as TUserMessage
        : null,
      assistantMessage: {
        ...input.assistantMessage,
        metadataJson,
      } as TAssistantMessage,
    };
  }

  async markAssistantStopped(messageId: string, conversationId: string): Promise<void> {
    await this.updateMessageAndTouch(messageId, conversationId, {
      status: 'stopped',
      error: null,
    });
  }

  async resetAssistantForRetry(input: {
    messageId: string;
    conversationId: string;
    providerId: string;
    modelId: string;
  }) {
    return this.updateMessageAndTouch(input.messageId, input.conversationId, {
      content: '',
      provider: input.providerId,
      model: input.modelId,
      status: 'pending',
      error: null,
      toolCalls: null,
      toolResults: null,
      metadataJson: null,
    });
  }

  async markAssistantError(
    messageId: string,
    conversationId: string,
    error: string,
  ): Promise<void> {
    await this.updateMessageAndTouch(messageId, conversationId, {
      status: 'error',
      error,
    });
  }

  async updateMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    dto: UpdateMessageDto,
  ) {
    return this.messageMutationOrchestrator.updateMessage(
      userId,
      conversationId,
      messageId,
      dto,
    );
  }

  async deleteMessage(
    userId: string,
    conversationId: string,
    messageId: string,
  ) {
    return this.messageMutationOrchestrator.deleteMessage(
      userId,
      conversationId,
      messageId,
    );
  }

  private async updateMessageAndTouch(
    messageId: string,
    conversationId: string,
    data: Record<string, unknown>,
  ) {
    return this.messageRepository.withTransaction(async (db) => {
      const result = await this.messageRepository.updateMessage(
        messageId,
        data,
        db,
      );
      await this.messageRepository.touchConversation(conversationId, db);
      return result;
    });
  }

  private async prepareOwnedMessageMutation(input: {
    userId: string;
    conversationId: string;
    messageId: string;
  }) {
    const { message } = await getOwnedConversationMessage(
      this.chatService,
      input.userId,
      input.conversationId,
      input.messageId,
    );
    await this.chatTaskService.stopTask(input.messageId);
    return {
      message,
      hookContext: createChatLifecycleContext({
        userId: input.userId,
        conversationId: input.conversationId,
      }),
    };
  }

  private async createConversationTargetAssistantMessage(input: {
    context: PluginCallContext;
    conversationId: string;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<Omit<PluginMessageSendInfo, 'target'>> {
    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.content,
      parts: input.parts,
    });
    if (!normalizedAssistant.content && normalizedAssistant.parts.length === 0) {
      throw new BadRequestException('message.send 需要非空 content 或 parts');
    }

    const provider = input.provider ?? input.context.activeProviderId ?? null;
    const model = input.model ?? input.context.activeModelId ?? null;
    const { createdMessage } = await this.createHookedStoredMessage({
      conversationId: input.conversationId,
      hookContext: createChatModelLifecycleContext({
        source: input.context.source,
        userId: input.context.userId,
        conversationId: input.conversationId,
        activePersonaId: input.context.activePersonaId,
        modelConfig: { providerId: provider, id: model },
      }),
      message: {
        role: 'assistant',
        ...normalizedAssistant,
        provider,
        model,
        status: 'completed',
      },
    });
    const createdMessageInfo = createPluginMessageHookInfoFromRecord(createdMessage);

    return {
      ...createdMessageInfo,
      id: createdMessage.id,
      role: 'assistant',
      content: createdMessageInfo.content ?? '',
      status: (createdMessageInfo.status ?? 'completed') as PluginMessageSendInfo['status'],
      createdAt: createdMessage.createdAt.toISOString(),
      updatedAt: createdMessage.updatedAt.toISOString(),
    };
  }

  private async createHookedStoredMessage(input: {
    conversationId: string;
    hookContext: PluginCallContext;
    modelMessages?: PluginLlmMessage[];
    message: HookableChatMessageInput;
    touchConversation?: boolean;
  }) {
    const createdMessagePayload = await (await this.getPluginChatRuntime()).applyMessageCreated({
      hookContext: input.hookContext,
      conversationId: input.conversationId,
      message: input.message,
      modelMessages: input.modelMessages,
    });

    return {
      createdMessage: await this.createStoredMessage(
        input.conversationId,
        createdMessagePayload.message as CreateChatMessageInput,
        input.touchConversation,
      ),
      modelMessages: createdMessagePayload.modelMessages,
    };
  }

  private async createStoredMessage(
    conversationId: string,
    message: CreateChatMessageInput,
    touchConversation?: boolean,
  ) {
    const partsJson = this.messagePartsMapper.toCreatePartsJson(message.parts);

    return this.messageRepository.withTransaction(async (db) => {
      const created = await this.messageRepository.createMessage(
        {
          conversationId,
          role: message.role,
          content: message.content ?? '',
          ...(partsJson !== undefined ? { partsJson } : {}),
          ...(message.role === 'assistant'
            ? {
                ...(message.provider !== undefined
                  ? { provider: message.provider ?? null }
                  : {}),
                ...(message.model !== undefined
                  ? { model: message.model ?? null }
                  : {}),
              }
            : {}),
          status: message.status ?? 'completed',
        },
        db,
      );
      if (touchConversation !== false) {
        await this.messageRepository.touchConversation(conversationId, db);
      }

      return created;
    });
  }

  private async persistVisionFallbackMetadata(
    messageIds: readonly string[],
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[],
  ): Promise<string | null> {
    if (visionFallbackEntries.length === 0) {
      return null;
    }

    const metadataJson = JSON.stringify({
      visionFallback: {
        state: 'completed',
        entries: visionFallbackEntries,
      },
    });
    if (messageIds.length === 1) {
      await this.messageRepository.updateMessage(
        messageIds[0],
        { metadataJson },
      );
    } else {
      await this.messageRepository.updateManyMessages(
        {
          id: {
            in: [...messageIds],
          },
        },
        { metadataJson },
      );
    }

    return metadataJson;
  }

  private async getPluginChatRuntime(): Promise<import('../plugin/plugin-chat-runtime.facade').PluginChatRuntimeFacade> {
    if (this.pluginChatRuntimePromise) {
      return this.pluginChatRuntimePromise;
    }

    this.pluginChatRuntimePromise = (async () => {
      const { PluginChatRuntimeFacade } = await import('../plugin/plugin-chat-runtime.facade');
      const resolved = this.moduleRef.get<import('../plugin/plugin-chat-runtime.facade').PluginChatRuntimeFacade>(
        PluginChatRuntimeFacade,
        {
          strict: false,
        },
      );
      if (!resolved) {
        throw new NotFoundException('PluginChatRuntimeFacade is not available');
      }

      return resolved;
    })();

    return this.pluginChatRuntimePromise;
  }

}
