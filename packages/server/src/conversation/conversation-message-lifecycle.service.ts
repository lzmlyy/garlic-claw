import type { ChatMessagePart, JsonObject, RetryMessagePayload, SendMessagePayload } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { RuntimeHostConversationMessageService } from '../runtime/host/runtime-host-conversation-message.service';
import {
  RuntimeHostConversationRecordService,
  serializeConversationMessage,
} from '../runtime/host/runtime-host-conversation-record.service';
import { DEFAULT_PROVIDER_ID, DEFAULT_PROVIDER_MODEL_ID } from '../runtime/host/runtime-host-values';
import { RuntimeHostPluginDispatchService } from '../runtime/host/runtime-host-plugin-dispatch.service';
import { SkillSessionService } from '../execution/skill/skill-session.service';
import { ConversationTaskService } from './conversation-task.service';
import { ConversationMessagePlanningService, type ConversationResponseSource } from './conversation-message-planning.service';

@Injectable()
// Keep lifecycle orchestration and hook mutation together to avoid recreating the removed single-consumer hook owner.
export class ConversationMessageLifecycleService {
  constructor(
    private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService,
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
    private readonly conversationTaskService: ConversationTaskService,
    private readonly conversationMessagePlanningService: ConversationMessagePlanningService,
    private readonly skillSessionService: SkillSessionService,
    @Inject(RuntimeHostPluginDispatchService)
    private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
  ) {}

  async retryMessageGeneration(
    conversationId: string,
    messageId: string,
    dto: RetryMessagePayload,
    userId?: string,
  ) {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(conversationId, userId);
    const message = conversation.messages.find((entry) => entry.id === messageId);
    if (!message) {throw new NotFoundException(`Message not found: ${messageId}`);}

    const resolvedMessageId = readMessageId(message);
    const modelId = dto.model ?? readOptionalMessageField(message, 'model');
    const providerId = dto.provider ?? readOptionalMessageField(message, 'provider');
    const resetMessage = this.runtimeHostConversationMessageService.writeMessage(conversationId, resolvedMessageId, {
      content: '',
      error: null,
      model: modelId,
      parts: [],
      provider: providerId,
      status: 'pending',
      toolCalls: [],
      toolResults: [],
    });

    this.startConversationTask({
      activePersonaId: conversation.activePersonaId,
      conversationId,
      messageId: resolvedMessageId,
      modelId,
      providerId,
      userId: conversation.userId,
    });

    return resetMessage;
  }

  async startMessageGeneration(
    conversationId: string,
    dto: SendMessagePayload,
    userId?: string,
  ) {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(conversationId, userId);
    assertConversationGenerationEnabled(conversation);
    if (conversation.messages.some(isActiveAssistantMessage)) {
      throw new BadRequestException('当前仍有回复在生成中，请先停止或等待完成');
    }
    const messageText = dto.content ?? dto.parts?.find((part) => part.type === 'text')?.text ?? '';
    const skillCommandResult = userId
      ? await this.skillSessionService.tryHandleMessage({
          userId: conversation.userId,
          conversationId,
          messageText,
        })
      : null;

    const received = await this.conversationMessagePlanningService.applyMessageReceived({
      activePersonaId: conversation.activePersonaId,
      content: messageText,
      conversationId,
      modelId: skillCommandResult?.modelId ?? dto.model ?? DEFAULT_PROVIDER_MODEL_ID,
      parts: dto.parts ?? [],
      providerId: skillCommandResult?.providerId ?? dto.provider ?? DEFAULT_PROVIDER_ID,
      userId: conversation.userId,
    });
    const userMessage = await this.runtimeHostConversationMessageService.createMessageWithHooks(conversationId, {
      content: received.content,
      parts: received.parts,
      role: 'user',
      status: 'completed',
    }, conversation.userId, this.runtimeHostPluginDispatchService);
    const assistantMessage = this.runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '',
      model: received.modelId,
      parts: [],
      provider: received.providerId,
      role: 'assistant',
      status: 'pending',
    });
    const assistantMessageId = readMessageId(assistantMessage);

    this.startConversationTask({
      activePersonaId: conversation.activePersonaId,
      conversationId,
      messageId: assistantMessageId,
      modelId: received.modelId,
      providerId: received.providerId,
      ...(skillCommandResult
        ? {
            shortCircuitContent: skillCommandResult.assistantContent,
            shortCircuitParts: skillCommandResult.assistantParts,
          }
        : {}),
      userId: conversation.userId,
    });

    return {
      assistantMessage: serializeConversationMessage(assistantMessage as Record<string, unknown> as JsonObject),
      userMessage: serializeConversationMessage(userMessage as Record<string, unknown> as JsonObject),
    };
  }

  async stopMessageGeneration(conversationId: string, messageId: string, userId?: string) {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(conversationId, userId);
    const message = conversation.messages.find((entry) => entry.id === messageId);
    if (!message) {throw new NotFoundException(`Message not found: ${messageId}`);}
    if (message.role !== 'assistant') {throw new BadRequestException('Only assistant messages can be stopped');}

    const stopped = await this.conversationTaskService.stopTask(messageId);
    if (!stopped && isActiveAssistantMessage(message)) {this.runtimeHostConversationMessageService.writeMessage(conversationId, messageId, { status: 'stopped' });}
    return { message: 'Generation stopped' };
  }

  private startConversationTask(input: {
    activePersonaId?: string;
    conversationId: string;
    messageId: string;
    modelId: string;
    providerId: string;
    shortCircuitContent?: string;
    shortCircuitParts?: ChatMessagePart[];
    userId?: string;
  }): void {
    let responseSource: ConversationResponseSource = 'model';
    let shortCircuitParts: ChatMessagePart[] | null = null;

    this.conversationTaskService.startTask({
      assistantMessageId: input.messageId,
      conversationId: input.conversationId,
      createStream: async (abortSignal) => {
        if (input.shortCircuitContent) {
          responseSource = 'short-circuit';
          shortCircuitParts = input.shortCircuitParts ?? [];
          return {
            modelId: input.modelId,
            providerId: input.providerId,
            stream: createShortCircuitStream(input.shortCircuitContent),
          };
        }
        const { responseSource: nextSource, shortCircuitParts: nextParts, ...streamSource } = await this.conversationMessagePlanningService.createStreamPlan({
          activePersonaId: input.activePersonaId,
          abortSignal,
          conversationId: input.conversationId,
          messageId: input.messageId,
          modelId: input.modelId,
          providerId: input.providerId,
          userId: input.userId,
        });
        responseSource = nextSource;
        shortCircuitParts = nextParts;
        return streamSource;
      },
      modelId: input.modelId,
      onComplete: async (result) => this.conversationMessagePlanningService.finalizeTaskResult(result, responseSource, shortCircuitParts),
      onSent: async (result) => {
        const conversation = this.runtimeHostConversationRecordService.requireConversation(result.conversationId);
        await this.conversationMessagePlanningService.broadcastAfterSend(
          { activePersonaId: conversation.activePersonaId, conversationId: result.conversationId, userId: conversation.userId },
          result,
          responseSource,
        );
      },
      providerId: input.providerId,
    });
  }

}

function readMessageId(message: { id?: unknown }): string {
  if (typeof message.id === 'string' && message.id.length > 0) {return message.id;}
  throw new NotFoundException('Message id missing');
}

function readOptionalMessageField(
  message: Record<string, unknown>,
  key: 'model' | 'provider',
): string {
  return typeof message[key] === 'string'
    ? message[key]
    : key === 'model'
      ? DEFAULT_PROVIDER_MODEL_ID
      : DEFAULT_PROVIDER_ID;
}

function isActiveAssistantMessage(message: Record<string, unknown>): boolean {
  return message.role === 'assistant' && (message.status === 'pending' || message.status === 'streaming');
}

function assertConversationGenerationEnabled(conversation: { hostServices: { llmEnabled?: boolean; sessionEnabled?: boolean } }): void {
  if (!conversation.hostServices.sessionEnabled) {throw new BadRequestException('当前会话宿主服务已停用');}
  if (!conversation.hostServices.llmEnabled) {throw new BadRequestException('当前会话已关闭 LLM 自动回复');}
}

function createShortCircuitStream(content: string) {
  const normalized = content.trim();
  return {
    finishReason: 'short-circuit',
    fullStream: (async function* () { if (normalized) {yield { text: normalized, type: 'text-delta' as const };} })(),
  };
}
