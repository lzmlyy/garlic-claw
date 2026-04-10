import {
  normalizeUserMessageInput,
  type ChatMessagePart,
  type PluginCallContext,
  type PluginMessageSendInfo,
  type PluginMessageTargetRef,
} from '@garlic-claw/shared';
import type { UpdateMessageDto } from '../dto/chat.dto';
import type { MessageRepository } from './domain/message-repository';

interface PreparedOwnedMessageMutation {
  message: {
    id: string;
    role: string;
    content: string | null;
    partsJson?: string | null;
    provider?: string | null;
    model?: string | null;
    status?: string | null;
  };
  hookContext: PluginCallContext;
}

interface MessageMutationOrchestratorDeps {
  readonly messageRepository: MessageRepository;
  resolveSendMessageTarget: (
    context: PluginCallContext,
    target?: PluginMessageTargetRef | null,
  ) => Promise<PluginMessageSendInfo['target']>;
  createConversationTargetAssistantMessage: (input: {
    context: PluginCallContext;
    conversationId: string;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }) => Promise<Omit<PluginMessageSendInfo, 'target'>>;
  prepareOwnedMessageMutation: (input: {
    userId: string;
    conversationId: string;
    messageId: string;
  }) => Promise<PreparedOwnedMessageMutation>;
  getPluginChatRuntime: () => Promise<{
    applyMessageUpdated: (input: {
      hookContext: PluginCallContext;
      conversationId: string;
      messageId: string;
      currentMessage: PreparedOwnedMessageMutation['message'];
      nextMessage: {
        role: 'user' | 'assistant';
        content: string;
        parts: ChatMessagePart[];
        status: 'completed';
        provider?: string | null;
        model?: string | null;
      };
    }) => Promise<{
      nextMessage: {
        role: string;
        content?: string | null;
        parts?: ChatMessagePart[] | null;
        status?: string | null;
        provider?: string | null;
        model?: string | null;
      };
    }>;
    dispatchMessageDeleted: (input: {
      hookContext: PluginCallContext;
      conversationId: string;
      messageId: string;
      message: PreparedOwnedMessageMutation['message'];
    }) => Promise<void>;
  }>;
  mapDtoParts: (parts: UpdateMessageDto['parts']) => ChatMessagePart[] | undefined;
  toUpdatePartsJson: (parts: ChatMessagePart[]) => string;
  updateMessageAndTouch: (
    messageId: string,
    conversationId: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
}

export class MessageMutationOrchestrator {
  constructor(private readonly deps: MessageMutationOrchestratorDeps) {}

  async sendPluginMessage(input: {
    context: PluginCallContext;
    target?: PluginMessageTargetRef | null;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<PluginMessageSendInfo> {
    const target = await this.deps.resolveSendMessageTarget(input.context, input.target);

    return {
      target,
      ...(await this.deps.createConversationTargetAssistantMessage({
        ...input,
        conversationId: target.id,
      })),
    };
  }

  async updateMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    dto: UpdateMessageDto,
  ) {
    const { message, hookContext } = await this.deps.prepareOwnedMessageMutation({
      userId,
      conversationId,
      messageId,
    });

    const nextMessage = message.role === 'user'
      ? {
          role: 'user' as const,
          ...normalizeUserMessageInput({
            content: dto.content,
            parts: this.deps.mapDtoParts(dto.parts),
          }),
          status: 'completed' as const,
        }
      : {
          role: 'assistant' as const,
          content: dto.content?.trim() ?? '',
          parts: [],
          provider: message.provider,
          model: message.model,
          status: 'completed' as const,
        };
    const updatedPayload = await (await this.deps.getPluginChatRuntime()).applyMessageUpdated({
      hookContext,
      conversationId,
      messageId,
      currentMessage: message,
      nextMessage,
    });

    const nextPersistedMessage = updatedPayload.nextMessage;
    const nextParts = Array.isArray(nextPersistedMessage.parts)
      ? nextPersistedMessage.parts
      : [];
    const baseData = {
      content: nextPersistedMessage.content ?? '',
      status: nextPersistedMessage.status ?? 'completed',
      error: null,
    };

    return this.deps.updateMessageAndTouch(
      messageId,
      conversationId,
      message.role === 'user'
        ? {
            ...baseData,
            partsJson: this.deps.toUpdatePartsJson(nextParts),
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
    const { message, hookContext } = await this.deps.prepareOwnedMessageMutation({
      userId,
      conversationId,
      messageId,
    });
    await (await this.deps.getPluginChatRuntime()).dispatchMessageDeleted({
      hookContext,
      conversationId,
      messageId,
      message,
    });
    await this.deps.messageRepository.withTransaction(async (db) => {
      await this.deps.messageRepository.deleteMessage(messageId, db);
      await this.deps.messageRepository.touchConversation(conversationId, db);
    });

    return { success: true };
  }
}
