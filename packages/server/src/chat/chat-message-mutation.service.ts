import {
  createChatModelLifecycleContext,
  createChatLifecycleContext,
  createMessageCreatedHookPayload,
  createPluginMessageHookInfo,
  createPluginMessageHookInfoFromRecord,
  normalizeAssistantMessageOutput,
  type ChatMessagePart,
  type ChatMessageStatus,
  normalizeUserMessageInput,
  type PluginCallContext,
  type PluginLlmMessage,
  serializeMessageParts,
} from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import {
  getOwnedConversationMessage,
  touchConversationTimestamp,
} from './chat-message-common.helpers';
import { type UpdateMessageDto } from './dto/chat.dto';
import { mapDtoParts } from './chat-message.helpers';
import { ChatTaskService } from './chat-task.service';

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

export interface ConversationTargetAssistantMessageView {
  id: string;
  role: 'assistant';
  content: string;
  parts: ChatMessagePart[];
  provider?: string | null;
  model?: string | null;
  status: 'pending' | 'streaming' | 'completed' | 'stopped' | 'error';
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ChatMessageMutationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly chatTaskService: ChatTaskService,
  ) {}

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
          content: input.receivedMessagePayload.message.content ?? '',
          parts: input.receivedMessagePayload.message.parts,
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

  async createConversationTargetAssistantMessage(input: {
    context: PluginCallContext;
    conversationId: string;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<ConversationTargetAssistantMessageView> {
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
        content: normalizedAssistant.content,
        parts: normalizedAssistant.parts,
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
      status: (createdMessageInfo.status ??
        'completed') as ConversationTargetAssistantMessageView['status'],
      createdAt: createdMessage.createdAt.toISOString(),
      updatedAt: createdMessage.updatedAt.toISOString(),
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
    const { message } = await getOwnedConversationMessage(
      this.chatService,
      userId,
      conversationId,
      messageId,
    );
    await this.chatTaskService.stopTask(messageId);

    const updated = message.role === 'user'
      ? normalizeUserMessageInput({
          content: dto.content,
          parts: dto.parts ? mapDtoParts(dto.parts) : undefined,
        })
      : null;
    const nextMessage: HookableChatMessageInput = message.role === 'user'
      ? {
          role: 'user',
          content: updated?.content ?? '',
          parts: updated?.parts ?? [],
          status: 'completed',
        }
      : {
          role: 'assistant',
          content: dto.content?.trim() ?? '',
          parts: [],
          provider: message.provider,
          model: message.model,
          status: 'completed',
        };
    const hookContext = createChatLifecycleContext({
      userId,
      conversationId,
    });
    const updatedPayload = await this.pluginRuntime.runMessageHook({
      hookName: 'message:updated',
      context: hookContext,
      payload: {
        context: hookContext,
        conversationId,
        messageId,
        currentMessage: createPluginMessageHookInfoFromRecord(message),
        nextMessage: createPluginMessageHookInfo(nextMessage),
      },
    });

    const nextPersistedMessage = updatedPayload.nextMessage;
    const baseData = {
      content: nextPersistedMessage.content ?? '',
      status: nextPersistedMessage.status ?? 'completed',
      error: null,
    };
    return this.updateMessageAndTouch(
      messageId,
      conversationId,
      message.role === 'user'
        ? {
            ...baseData,
            partsJson: serializeMessageParts(nextPersistedMessage.parts),
          }
        : {
            ...baseData,
            provider: nextPersistedMessage.provider ?? message.provider,
            model: nextPersistedMessage.model ?? message.model,
          },
    );
  }

  async deleteMessage(
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
    await this.chatTaskService.stopTask(messageId);
    const hookContext = createChatLifecycleContext({
      userId,
      conversationId,
    });
    await this.pluginRuntime.runBroadcastHook({
      hookName: 'message:deleted',
      context: hookContext,
      payload: {
        context: hookContext,
        conversationId,
        messageId,
        message: createPluginMessageHookInfoFromRecord(message),
      },
    });
    await this.prisma.message.delete({ where: { id: messageId } });
    await touchConversationTimestamp(this.prisma, conversationId);
    return { success: true };
  }

  private async updateMessageAndTouch(
    messageId: string,
    conversationId: string,
    data: Record<string, unknown>,
  ) {
    const result = await this.prisma.message.update({
      where: { id: messageId },
      data,
    });
    await touchConversationTimestamp(this.prisma, conversationId);
    return result;
  }

  private async createHookedStoredMessage(input: {
    conversationId: string;
    hookContext: PluginCallContext;
    modelMessages?: PluginLlmMessage[];
    message: HookableChatMessageInput;
    touchConversation?: boolean;
  }) {
    const createdMessagePayload = await this.pluginRuntime.runMessageHook({
      hookName: 'message:created',
      context: input.hookContext,
      payload: createMessageCreatedHookPayload({
        context: input.hookContext,
        conversationId: input.conversationId,
        message: input.message,
        modelMessages: input.modelMessages ?? [{
          role: input.message.role,
          content: input.message.parts,
        }],
      }),
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
    const partsJson = message.parts === undefined
      ? undefined
      : message.parts?.length
        ? serializeMessageParts(message.parts)
        : null;
    const created = await this.prisma.message.create({
      data: {
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
    });
    if (touchConversation !== false) {
      await touchConversationTimestamp(this.prisma, conversationId);
    }
    return created;
  }

}
