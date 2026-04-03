import { Inject, ForbiddenException, forwardRef, Injectable, NotFoundException } from '@nestjs/common';
import type { ConversationHostServices } from '@garlic-claw/shared';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CONVERSATION_HOST_SERVICES, mergeConversationHostServices, normalizeConversationHostServices } from './chat-host-services';
import { SkillSessionService } from '../skill/skill-session.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService, @Inject(forwardRef(() => PluginRuntimeService)) private readonly pluginRuntime: PluginRuntimeService, private readonly skillSession: SkillSessionService) {}

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
        hostServicesJson: JSON.stringify(DEFAULT_CONVERSATION_HOST_SERVICES),
        skillsJson: JSON.stringify([]),
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
    return this.assertOwnedConversation(
      await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      }),
      userId,
    );
  }

  /**
   * 删除对话并校验所有权。
   * @param userId 当前用户 ID
   * @param conversationId 对话 ID
   * @returns 删除结果
   */
  async deleteConversation(userId: string, conversationId: string) {
    this.assertOwnedConversation(
      await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      }),
      userId,
    );

    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { message: 'Conversation deleted' };
  }

  /**
   * 读取当前用户对话的宿主服务设置。
   * @param userId 当前用户 ID
   * @param conversationId 对话 ID
   * @returns 归一化后的会话宿主服务设置
   */
  async getConversationHostServices(
    userId: string,
    conversationId: string,
  ): Promise<ConversationHostServices> {
    const conversation = await this.getOwnedConversationRecord(userId, conversationId);
    return normalizeConversationHostServices(conversation.hostServicesJson);
  }

  /**
   * 更新当前用户对话的宿主服务设置。
   * @param userId 当前用户 ID
   * @param conversationId 对话 ID
   * @param patch 局部更新
   * @returns 写入后的会话宿主服务设置
   */
  async updateConversationHostServices(
    userId: string,
    conversationId: string,
    patch: Partial<ConversationHostServices>,
  ): Promise<ConversationHostServices> {
    const conversation = await this.getOwnedConversationRecord(userId, conversationId);
    const next = mergeConversationHostServices(
      normalizeConversationHostServices(conversation.hostServicesJson),
      patch,
    );

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        hostServicesJson: JSON.stringify(next),
      },
    });

    return next;
  }

  async getConversationSkillState(userId: string, conversationId: string) {
    return this.skillSession.getConversationSkillStateForUser(userId, conversationId);
  }

  async updateConversationSkills(
    userId: string,
    conversationId: string,
    activeSkillIds: string[],
  ) {
    return this.skillSession.updateConversationSkillStateForUser(
      userId,
      conversationId,
      activeSkillIds,
    );
  }

  /**
   * 读取并校验对话所有权，只返回宿主服务相关字段。
   * @param userId 当前用户 ID
   * @param conversationId 对话 ID
   * @returns 最小对话记录
   */
  private async getOwnedConversationRecord(userId: string, conversationId: string) {
    return this.assertOwnedConversation(
      await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          userId: true,
          hostServicesJson: true,
        },
      }),
      userId,
    );
  }

  private assertOwnedConversation<T extends { userId: string } | null>(conversation: T, userId: string): Exclude<T, null> {
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }

    return conversation as Exclude<T, null>;
  }
}
