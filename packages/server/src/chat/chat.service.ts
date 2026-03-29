import {
  Inject,
  ForbiddenException,
  forwardRef,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
  ) {}

  /**
   * 创建新对话。
   * @param userId 当前用户 ID
   * @param dto 创建对话 DTO
   * @returns 新创建的对话
   */
  async createConversation(userId: string, dto: { title?: string }) {
    const conversation = await this.prisma.conversation.create({
      data: {
        title: dto.title || 'New Chat',
        userId,
      },
    });

    const hookContext = {
      source: 'http-route' as const,
      userId,
      conversationId: conversation.id,
    };
    await this.pluginRuntime.runConversationCreatedHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
        },
      },
    });

    return conversation;
  }

  /**
   * 读取当前用户的对话列表。
   * @param userId 当前用户 ID
   * @returns 按更新时间倒序的对话摘要
   */
  async listConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
  }

  /**
   * 读取对话详情并校验所有权。
   * @param userId 当前用户 ID
   * @param conversationId 对话 ID
   * @returns 带消息列表的对话详情
   */
  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }

    return conversation;
  }

  /**
   * 删除对话并校验所有权。
   * @param userId 当前用户 ID
   * @param conversationId 对话 ID
   * @returns 删除结果
   */
  async deleteConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }

    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { message: 'Conversation deleted' };
  }
}
