import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ModelMessage } from 'ai';
import { stepCountIs, streamText } from 'ai';
import { AiProviderService } from '../ai/ai-provider.service';
import {
  getAutomationTools,
  getBuiltinTools,
  getDirectApiTools,
  getMemoryTools,
  getMcpTools,
  getPluginTools,
} from '../ai/tools';
import { AutomationService } from '../automation/automation.service';
import { CacheService } from '../cache/cache.service';
import { MemoryService } from '../memory/memory.service';
import { McpService } from '../mcp/mcp.service';
import { PluginGateway } from '../plugin/plugin.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto, SendMessageDto } from './dto/chat.dto';

const SYSTEM_PROMPT = `你是一个乐于助人的 AI 助手，名字叫 Garlic Claw。

你可以帮助用户完成各种任务，并在需要时调用工具获取信息或执行操作。
你可用的工具可能包括：
- 联网搜索
- 天气查询
- 设备控制
- 长期记忆读写
- 自动化任务创建和执行

工作要求：
- 优先用工具获取事实性信息，不要编造搜索结果、天气数据或设备状态。
- 当用户的问题明显需要实时信息时，优先调用对应工具。
- 当用户分享稳定偏好、个人事实或长期有效的指令时，可以使用 save_memory 保存。
- 回答要简洁、直接、友好。
- 始终使用用户当前使用的语言回复。`;

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private aiProvider: AiProviderService,
    private configService: ConfigService,
    private pluginGateway: PluginGateway,
    private memoryService: MemoryService,
    private automationService: AutomationService,
    private mcpService: McpService,
    private cacheService: CacheService,
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
    const conversation = await this.getConversation(userId, conversationId);

    await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: dto.content,
      },
    });

    const messages: ModelMessage[] = conversation.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content || '',
    }));
    messages.push({ role: 'user', content: dto.content });

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

    const model = this.aiProvider.getModel(dto.provider, dto.model);
    const builtinTools = getBuiltinTools();
    const directApiTools = getDirectApiTools(
      this.configService,
      this.cacheService,
    );
    const pluginTools = getPluginTools(this.pluginGateway);
    const memoryTools = getMemoryTools(this.memoryService, userId);
    const automationTools = getAutomationTools(this.automationService, userId);
    const mcpTools = await getMcpTools(this.mcpService, this.cacheService);
    const filteredMcpTools = Object.fromEntries(
      Object.entries(mcpTools).filter(
        ([name]) =>
          !name.startsWith('tavily-mcp__') &&
          !name.startsWith('weather-server__'),
      ),
    );
    const tools = {
      ...builtinTools,
      ...directApiTools,
      ...pluginTools,
      ...memoryTools,
      ...automationTools,
      ...filteredMcpTools,
    };

    return streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(5),
    });
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
