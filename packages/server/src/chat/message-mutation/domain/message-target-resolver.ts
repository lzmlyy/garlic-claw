import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type {
  PluginCallContext,
  PluginMessageSendParams,
  PluginMessageTargetInfo,
} from '@garlic-claw/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ChatService } from '../../chat.service';

export class MessageTargetResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
  ) {}

  async resolve(
    context: PluginCallContext,
    target?: PluginMessageSendParams['target'],
  ): Promise<PluginMessageTargetInfo> {
    const conversationId = target?.id ?? context.conversationId;
    if (target && target.type !== 'conversation') {
      throw new BadRequestException(`当前不支持消息目标类型 ${target.type}`);
    }
    if (!conversationId) {
      throw new BadRequestException('message.send 需要消息目标上下文');
    }

    const conversation = context.userId
      ? await this.chatService.getConversation(context.userId, conversationId)
      : await this.prisma.conversation.findUnique({
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
      type: 'conversation',
      id: conversation.id,
      label: conversation.title,
    };
  }
}
