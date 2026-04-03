import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import type {
  ChatMessagePart,
  PluginCallContext,
  PluginMessageSendInfo,
  PluginMessageSendParams,
  PluginMessageTargetInfo,
  PluginMessageTargetRef,
} from '@garlic-claw/shared';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';
import {
  createChatLifecycleContext,
  touchConversationTimestamp,
} from './chat-message-common.helpers';
import {
  deserializeMessageParts,
  normalizeAssistantMessageOutput,
  serializeMessageParts,
} from './message-parts';

interface ConversationTargetMessageRecord {
  id: string;
  conversationId: string;
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
export class ChatMessagePluginTargetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
  ) {}

  async getCurrentPluginMessageTarget(input: {
    context: PluginCallContext;
  }): Promise<PluginMessageTargetInfo | null> {
    if (!input.context.conversationId) {
      return null;
    }

    return this.resolvePluginMessageTarget(input.context, {
      type: 'conversation',
      id: input.context.conversationId,
    });
  }

  async sendPluginMessage(input: {
    context: PluginCallContext;
    target?: PluginMessageTargetRef | null;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<PluginMessageSendInfo> {
    const target = await this.resolveSendMessageTarget(input.context, input.target);
    if (target.type !== 'conversation') {
      throw new BadRequestException(`message.send 当前不支持目标类型 ${target.type}`);
    }

    const sentMessage = await this.appendConversationTargetMessage({
      context: input.context,
      conversationId: target.id,
      content: input.content,
      parts: input.parts,
      provider: input.provider,
      model: input.model,
    });

    return {
      id: sentMessage.id,
      target,
      role: sentMessage.role,
      content: sentMessage.content,
      parts: sentMessage.parts,
      ...(typeof sentMessage.provider !== 'undefined'
        ? { provider: sentMessage.provider }
        : {}),
      ...(typeof sentMessage.model !== 'undefined'
        ? { model: sentMessage.model }
        : {}),
      status: sentMessage.status,
      createdAt: sentMessage.createdAt,
      updatedAt: sentMessage.updatedAt,
    };
  }

  private async appendConversationTargetMessage(input: {
    context: PluginCallContext;
    conversationId?: string;
    content?: string | null;
    parts?: ChatMessagePart[] | null;
    provider?: string | null;
    model?: string | null;
  }): Promise<ConversationTargetMessageRecord> {
    const targetConversationId = input.conversationId ?? input.context.conversationId;
    if (!targetConversationId) {
      throw new BadRequestException('message.send 需要 conversationId 上下文');
    }

    await this.ensureConversationAccess(input.context, targetConversationId);

    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.content,
      parts: input.parts,
    });
    if (!normalizedAssistant.content && normalizedAssistant.parts.length === 0) {
      throw new BadRequestException('message.send 需要非空 content 或 parts');
    }

    const provider = input.provider ?? input.context.activeProviderId ?? null;
    const model = input.model ?? input.context.activeModelId ?? null;
    const hookContext = createChatLifecycleContext({
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
    await touchConversationTimestamp(this.prisma, targetConversationId);

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

  private async resolvePluginMessageTarget(
    context: PluginCallContext,
    target: PluginMessageTargetRef,
  ): Promise<PluginMessageTargetInfo> {
    if (target.type !== 'conversation') {
      throw new BadRequestException(`当前不支持消息目标类型 ${target.type}`);
    }

    const conversation = await this.getConversationTargetRecord(context, target.id);
    return {
      type: 'conversation',
      id: conversation.id,
      label: conversation.title,
    };
  }

  private async resolveSendMessageTarget(
    context: PluginCallContext,
    target?: PluginMessageSendParams['target'],
  ): Promise<PluginMessageTargetInfo> {
    if (target) {
      return this.resolvePluginMessageTarget(context, target);
    }
    if (context.conversationId) {
      return this.resolvePluginMessageTarget(context, {
        type: 'conversation',
        id: context.conversationId,
      });
    }

    throw new BadRequestException('message.send 需要消息目标上下文');
  }

  private async getConversationTargetRecord(
    context: PluginCallContext,
    conversationId: string,
  ): Promise<{ id: string; title: string }> {
    if (context.userId) {
      const conversation = await this.chatService.getConversation(context.userId, conversationId);
      return {
        id: conversation.id,
        title: conversation.title,
      };
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        id: true,
        title: true,
      },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return {
      id: conversation.id,
      title: conversation.title,
    };
  }
}
