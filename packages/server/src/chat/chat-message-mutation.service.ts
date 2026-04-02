import { Injectable, NotFoundException } from '@nestjs/common';
import type { PluginCallContext } from '@garlic-claw/shared';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import { type UpdateMessageDto } from './dto/chat.dto';
import {
  deserializeMessageParts,
  normalizeUserMessageInput,
  serializeMessageParts,
} from './message-parts';
import { mapDtoParts } from './chat-message.helpers';
import { ChatTaskService } from './chat-task.service';

@Injectable()
export class ChatMessageMutationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly chatTaskService: ChatTaskService,
  ) {}

  async updateMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    dto: UpdateMessageDto,
  ) {
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

  async deleteMessage(
    userId: string,
    conversationId: string,
    messageId: string,
  ) {
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

  private async getOwnedMessage(userId: string, conversationId: string, messageId: string) {
    const conversation = await this.chatService.getConversation(userId, conversationId);
    const message = conversation.messages.find((item) => item.id === messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return { conversation, message };
  }

  private async touchConversation(conversationId: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
      },
    });
  }

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
}
