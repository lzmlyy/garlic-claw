import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiProviderService } from '../ai/ai-provider.service';
import { createStepLimit, runStreamText } from '../ai/sdk-adapter';
import { AutomationService } from '../automation/automation.service';
import { MemoryService } from '../memory/memory.service';
import { PluginGateway } from '../plugin/plugin.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { buildChatToolSet, CHAT_SYSTEM_PROMPT, findLatestUserContent, hasActiveAssistantMessage, mapDtoParts, toRuntimeMessages, toUserMessageInput } from './chat-message.helpers';
import { ChatMessageTransformService } from './chat-message-transform.service';
import { prepareSendMessagePayload } from './chat-message-session';
import { ChatService } from './chat.service';
import { type RetryMessageDto, type SendMessageDto, type UpdateMessageDto } from './dto/chat.dto';
import { normalizeUserMessageInput, serializeMessageParts } from './message-parts';
import { toAiSdkMessages } from './sdk-message-converter';
import { ChatTaskService } from './chat-task.service';

@Injectable()
export class ChatMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatService: ChatService,
    private readonly aiProvider: AiProviderService,
    private readonly pluginGateway: PluginGateway,
    private readonly memoryService: MemoryService,
    private readonly automationService: AutomationService,
    private readonly messageTransform: ChatMessageTransformService,
    private readonly chatTaskService: ChatTaskService,
  ) {}

  /** 创建一轮新的用户消息与 assistant 生成任务，输出已落库的用户消息与 assistant 占位消息。 */
  async startMessageGeneration(userId: string, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.chatService.getConversation(userId, conversationId);
    if (hasActiveAssistantMessage(conversation.messages)) {
      throw new BadRequestException('当前仍有回复在生成中，请先停止或等待完成');
    }

    const payload = prepareSendMessagePayload({
      history: conversation.messages,
      input: toUserMessageInput(dto.parts, dto.content),
    });
    const modelConfig = this.aiProvider.getModelConfig(dto.provider, dto.model);

    const userMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content: payload.persistedMessage.content,
        partsJson: payload.persistedMessage.partsJson,
        status: 'completed',
      },
    });
    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: '',
        provider: modelConfig.providerId,
        model: modelConfig.id,
        status: 'pending',
      },
    });
    await this.touchConversation(conversationId);

    try {
      const systemPrompt = await this.buildSystemPrompt(userId, payload.searchableContent);
      const transformedMessages = await this.messageTransform.transformMessages(
        conversationId,
        payload.modelMessages,
        modelConfig,
      );

      this.chatTaskService.startTask({
        assistantMessageId: assistantMessage.id,
        conversationId,
        providerId: modelConfig.providerId,
        modelId: modelConfig.id,
        createStream: this.buildStreamFactory(
          userId,
          systemPrompt,
          transformedMessages,
          modelConfig.providerId,
          modelConfig.id,
          modelConfig.capabilities.toolCall,
        ),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      await this.prisma.message.update({
        where: { id: assistantMessage.id },
        data: {
          status: 'error',
          error: errorMessage,
        },
      });
      await this.touchConversation(conversationId);
      throw error;
    }

    return { userMessage, assistantMessage };
  }

  /** 主动停止指定 assistant 消息的后台生成任务，并返回最新消息状态。 */
  async stopMessageGeneration(userId: string, conversationId: string, messageId: string) {
    const { message } = await this.getOwnedMessage(userId, conversationId, messageId);
    if (message.role !== 'assistant') {
      throw new BadRequestException('只有 AI 回复消息可以停止');
    }

    const stopped = await this.chatTaskService.stopTask(messageId);
    if (!stopped && (message.status === 'pending' || message.status === 'streaming')) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'stopped',
          error: null,
        },
      });
      await this.touchConversation(conversationId);
    }

    return this.prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  }

  /** 原地重试最后一条 assistant 回复，可选覆盖 provider/model。 */
  async retryMessageGeneration(userId: string, conversationId: string, messageId: string, dto: RetryMessageDto) {
    const { conversation, message } = await this.getOwnedMessage(userId, conversationId, messageId);
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (!lastMessage || lastMessage.id !== messageId || message.role !== 'assistant') {
      throw new BadRequestException('只能重试最后一条 AI 回复');
    }

    await this.chatTaskService.stopTask(messageId);

    const providerId = dto.provider ?? message.provider;
    const modelId = dto.model ?? message.model;
    if (!providerId || !modelId) {
      throw new BadRequestException('缺少重试所需的 provider/model');
    }

    const historyMessages = conversation.messages.slice(0, -1);
    const modelConfig = this.aiProvider.getModelConfig(providerId, modelId);
    const assistantMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        provider: modelConfig.providerId,
        model: modelConfig.id,
        status: 'pending',
        error: null,
        toolCalls: null,
        toolResults: null,
      },
    });
    await this.touchConversation(conversationId);

    try {
      const searchableContent = findLatestUserContent(historyMessages);
      const systemPrompt = await this.buildSystemPrompt(
        userId,
        searchableContent,
      );
      const transformedMessages = await this.messageTransform.transformMessages(
        conversationId,
        toRuntimeMessages(historyMessages),
        modelConfig,
      );

      this.chatTaskService.startTask({
        assistantMessageId: messageId,
        conversationId,
        providerId: modelConfig.providerId,
        modelId: modelConfig.id,
        createStream: this.buildStreamFactory(
          userId,
          systemPrompt,
          transformedMessages,
          modelConfig.providerId,
          modelConfig.id,
          modelConfig.capabilities.toolCall,
        ),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'error',
          error: errorMessage,
        },
      });
      await this.touchConversation(conversationId);
      throw error;
    }

    return assistantMessage;
  }

  /** 更新一条已存在的消息，不会自动触发重跑。 */
  async updateMessage(userId: string, conversationId: string, messageId: string, dto: UpdateMessageDto) {
    const { message } = await this.getOwnedMessage(userId, conversationId, messageId);
    await this.chatTaskService.stopTask(messageId);

    const updated = message.role === 'user'
      ? normalizeUserMessageInput({
          content: dto.content,
          parts: dto.parts ? mapDtoParts(dto.parts) : undefined,
        })
      : null;

    const result = await this.prisma.message.update({
      where: { id: messageId },
      data: message.role === 'user'
        ? {
            content: updated?.content,
            partsJson: updated ? serializeMessageParts(updated.parts) : null,
            status: 'completed',
            error: null,
          }
        : {
            content: dto.content?.trim() ?? '',
            status: 'completed',
            error: null,
          },
    });
    await this.touchConversation(conversationId);
    return result;
  }

  /** 删除一条消息，不会自动删除其后的消息。 */
  async deleteMessage(userId: string, conversationId: string, messageId: string) {
    await this.getOwnedMessage(userId, conversationId, messageId);
    await this.chatTaskService.stopTask(messageId);
    await this.prisma.message.delete({ where: { id: messageId } });
    await this.touchConversation(conversationId);
    return { success: true };
  }

  /** 读取对话中的一条消息并校验所有权，输出对话与消息。 */
  private async getOwnedMessage(userId: string, conversationId: string, messageId: string) {
    const conversation = await this.chatService.getConversation(userId, conversationId);
    const message = conversation.messages.find((item) => item.id === messageId);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return { conversation, message };
  }

  /** 构建带记忆注入的系统提示词。 */
  private async buildSystemPrompt(userId: string, searchableContent: string) {
    const memories = await this.memoryService.searchMemories(userId, searchableContent, 5);
    if (memories.length === 0) {
      return CHAT_SYSTEM_PROMPT;
    }

    const memoryContext = memories
      .map((memory) => `- [${memory.category}] ${memory.content}`)
      .join('\n');

    return `${CHAT_SYSTEM_PROMPT}\n\n与此用户相关的记忆：\n${memoryContext}`;
  }

  /** 触发会话更新时间，保证列表排序能跟上最新消息状态。 */
  private async touchConversation(conversationId: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
      },
    });
  }

  /** 统一构造聊天流工厂，供 send/retry 复用。 */
  private buildStreamFactory(
    userId: string,
    systemPrompt: string,
    messages: ReturnType<typeof toRuntimeMessages>,
    providerId: string,
    modelId: string,
    supportsToolCall: boolean,
  ) {
    return (abortSignal: AbortSignal) =>
      runStreamText({
        model: this.aiProvider.getModel(providerId, modelId),
        system: systemPrompt,
        messages: toAiSdkMessages(messages),
        tools: buildChatToolSet({
          supportsToolCall,
          pluginGateway: this.pluginGateway,
          memoryService: this.memoryService,
          automationService: this.automationService,
          userId,
        }),
        stopWhen: createStepLimit(5),
        abortSignal,
      });
  }
}
