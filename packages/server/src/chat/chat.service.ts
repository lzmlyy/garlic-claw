import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { ModelMessage } from 'ai';
import { stepCountIs, streamText } from 'ai';
import { AiProviderService } from '../ai/ai-provider.service';
import { getAutomationTools, getBuiltinTools, getMemoryTools, getPluginTools } from '../ai/tools';
import { AutomationService } from '../automation/automation.service';
import { MemoryService } from '../memory/memory.service';
import { PluginGateway } from '../plugin/plugin.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto, SendMessageDto } from './dto/chat.dto';

const SYSTEM_PROMPT = `你是一个乐于助人的 AI 助手，名为 Garlic Claw（蒜蓉龙虾）。你可以帮助用户完成各种任务。
你可以使用工具来获取信息和执行操作。
一些工具让你可以控制连接的设备（PC、手机、IoT）。设备工具以设备名称为前缀。
你可以使用 save_memory 将重要信息保存到长期记忆中，并使用 recall_memory 回忆过去的信息。
你可以使用 create_automation 创建自动化任务（支持计划间隔如 "5m"、"1h"）。
当用户分享个人偏好或重要事实时，主动将它们保存到记忆中。
始终保持乐于助人、简洁和友好的态度。使用用户使用的语言回复。`;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private aiProvider: AiProviderService,
    private pluginGateway: PluginGateway,
    private memoryService: MemoryService,
    private automationService: AutomationService,
  ) {}

  async createConversation(userId: string, dto: CreateConversationDto) {
    return this.prisma.conversation.create({
      data: {
        title: dto.title || 'New Chat',
        userId,
      },
    });
  }

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

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    // 验证所有权
    const conversation = await this.getConversation(userId, conversationId);

    // 保存用户消息
    await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: dto.content,
      },
    });

    // 为 AI 构建消息历史
    const messages: ModelMessage[] = conversation.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content || '',
    }));
    messages.push({ role: 'user', content: dto.content });

    // 将相关记忆注入到上下文中
    const memories = await this.memoryService.searchMemories(
      userId,
      dto.content,
      5,
    );
    let systemPrompt = SYSTEM_PROMPT;
    if (memories.length > 0) {
      const memoryContext = memories
        .map((m) => `- [${m.category}] ${m.content}`)
        .join('\n');
      systemPrompt += `\n\n与此用户相关的记忆：\n${memoryContext}`;
    }

    // 获取 AI 模型
    const model = this.aiProvider.getModel(dto.provider, dto.model);
    const builtinTools = getBuiltinTools();
    const pluginTools = getPluginTools(this.pluginGateway);
    const memoryTools = getMemoryTools(this.memoryService, userId);
    const automationTools = getAutomationTools(this.automationService, userId);
    const tools = { ...builtinTools, ...pluginTools, ...memoryTools, ...automationTools };

    // 流式 AI 响应，最多 5 轮工具调用
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5),
    });

    return result;
  }

  async saveAssistantMessage(
    conversationId: string,
    content: string,
    toolCalls?: unknown[],
    toolResults?: unknown[],
    modelId?: string,
  ) {
    return this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content,
        toolCalls: toolCalls?.length ? JSON.stringify(toolCalls) : null,
        toolResults: toolResults?.length ? JSON.stringify(toolResults) : null,
        model: modelId,
      },
    });
  }
}
