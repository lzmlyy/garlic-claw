import type { ChatMessageMetadata, ChatMessagePart, JsonObject, RetryMessagePayload, SendMessagePayload } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AiManagementService } from '../ai-management/ai-management.service';
import { ConversationMessageService } from '../runtime/host/conversation-message.service';
import { ConversationStoreService, serializeConversationMessage } from '../runtime/host/conversation-store.service';
import { DEFAULT_PROVIDER_ID, DEFAULT_PROVIDER_MODEL_ID } from '../runtime/host/host-input.codec';
import { PluginDispatchService } from '../runtime/host/plugin-dispatch.service';
import { PersonaService } from '../persona/persona.service';
import { ConversationTaskService } from './conversation-task.service';
import { ConversationMessagePlanningService, createShortCircuitStream, type ConversationResponseSource } from './conversation-message-planning.service';
import type { AfterResponseCompactionContinuation } from './conversation-after-response-compaction.service';
import type { DeferredInternalCommandAction } from './context-governance.service';

@Injectable()
// Keep lifecycle orchestration and hook mutation together to avoid recreating the removed single-consumer hook owner.
export class ConversationMessageLifecycleService {
  constructor(
    private readonly aiManagementService: AiManagementService,
    private readonly conversationMessages: ConversationMessageService,
    private readonly conversationStore: ConversationStoreService,
    private readonly conversationTaskService: ConversationTaskService,
    private readonly conversationMessagePlanningService: ConversationMessagePlanningService,
    private readonly personaService: PersonaService,
    @Inject(PluginDispatchService) private readonly pluginDispatch: PluginDispatchService,
  ) {}

  async retryMessageGeneration(conversationId: string, messageId: string, dto: RetryMessagePayload, userId?: string) {
    const conversation = this.conversationStore.requireConversation(conversationId, userId);
    const message = conversation.messages.find((entry) => entry.id === messageId);
    if (!message) {throw new NotFoundException(`Message not found: ${messageId}`);}
    if (message.role !== 'assistant') {throw new BadRequestException('Only assistant messages can be retried');}
    if (conversation.messages.some(isActiveResponseMessage)) {
      throw new BadRequestException('当前仍有回复在生成中，请先停止或等待完成');
    }

    const resolvedMessageId = readMessageId(message);
    const modelId = dto.model ?? readOptionalMessageField(message, 'model');
    const providerId = dto.provider ?? readOptionalMessageField(message, 'provider');
    const resetMessage = this.conversationMessages.writeMessage(conversationId, resolvedMessageId, {
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

  async startMessageGeneration(conversationId: string, dto: SendMessagePayload, userId?: string) {
    const conversation = this.conversationStore.requireConversation(conversationId, userId);
    if (conversation.messages.some(isActiveResponseMessage)) {
      throw new BadRequestException('当前仍有回复在生成中，请先停止或等待完成');
    }
    const defaultGenerationTarget = !dto.model && !dto.provider
      ? this.readDefaultGenerationTarget()
      : null;
    const messageText = dto.content ?? dto.parts?.find((part) => part.type === 'text')?.text ?? '';
    const received = await this.conversationMessagePlanningService.applyMessageReceived({
      activePersonaId: conversation.activePersonaId,
      content: messageText,
      conversationId,
      modelId: dto.model ?? defaultGenerationTarget?.modelId ?? DEFAULT_PROVIDER_MODEL_ID,
      parts: dto.parts ?? [],
      providerId: dto.provider ?? defaultGenerationTarget?.providerId ?? DEFAULT_PROVIDER_ID,
      userId: conversation.userId,
    });
    const commandDisplayOnly = received.action !== 'continue'
      && isDisplayOnlyCommandMessage(received.content, received.parts);
    const userMessage = await this.conversationMessages.createMessageWithHooks(conversationId, {
      content: received.content,
      ...(commandDisplayOnly ? { metadata: createDisplayMessageMetadata('command') } : {}),
      parts: received.parts,
      role: commandDisplayOnly ? 'display' : 'user',
      status: 'completed',
    }, conversation.userId, this.pluginDispatch);
    const assistantMessage = this.conversationMessages.createMessage(conversationId, {
      content: '',
      model: received.modelId,
      ...(commandDisplayOnly ? { metadata: createDisplayMessageMetadata('result') } : {}),
      parts: [],
      provider: received.providerId,
      role: commandDisplayOnly ? 'display' : 'assistant',
      status: 'pending',
    });
    const assistantMessageId = readMessageId(assistantMessage);
    const pluginShortCircuitInput = received.action === 'short-circuit'
      ? {
          shortCircuitContent: received.assistantContent,
          shortCircuitParts: received.assistantParts,
        }
      : received.action === 'deferred-short-circuit'
        ? {
            deferredShortCircuit: received.deferred,
            userMessageId: readMessageId(userMessage),
          }
        : {};

    this.startConversationTask({
      activePersonaId: conversation.activePersonaId,
      conversationId,
      messageId: assistantMessageId,
      modelId: received.modelId,
      providerId: received.providerId,
      ...pluginShortCircuitInput,
      userId: conversation.userId,
    });

    return {
      assistantMessage: serializeConversationMessage(assistantMessage as Record<string, unknown> as JsonObject),
      userMessage: serializeConversationMessage(userMessage as Record<string, unknown> as JsonObject),
    };
  }

  async stopMessageGeneration(conversationId: string, messageId: string, userId?: string) {
    const conversation = this.conversationStore.requireConversation(conversationId, userId);
    const message = conversation.messages.find((entry) => entry.id === messageId);
    if (!message) {throw new NotFoundException(`Message not found: ${messageId}`);}
    if (!isStoppableResponseMessage(message)) {throw new BadRequestException('Only assistant or display result messages can be stopped');}

    const stopped = await this.conversationTaskService.stopTask(messageId);
    if (!stopped && isActiveResponseMessage(message)) {this.conversationMessages.writeMessage(conversationId, messageId, { status: 'stopped' });}
    return { message: 'Generation stopped' };
  }

  private readDefaultGenerationTarget(): { modelId: string; providerId: string } | null {
    const selection = this.aiManagementService.getDefaultProviderSelection();
    return selection.modelId && selection.providerId
      ? { modelId: selection.modelId, providerId: selection.providerId }
      : null;
  }

  private startConversationTask(input: { activePersonaId?: string; conversationId: string; deferredShortCircuit?: DeferredInternalCommandAction; messageId: string; modelId: string; providerId: string; shortCircuitContent?: string; shortCircuitParts?: ChatMessagePart[]; userId?: string; userMessageId?: string }): void {
    let responseSource: ConversationResponseSource = 'model';
    let shortCircuitParts: ChatMessagePart[] | null = null;
    let customErrorMessage: string | null = null;

    this.conversationTaskService.startTask({
      assistantMessageId: input.messageId,
      conversationId: input.conversationId,
      createStream: async (abortSignal) => {
        const persona = this.personaService.readCurrentPersona({
          context: {
            activePersonaId: input.activePersonaId,
            conversationId: input.conversationId,
            source: 'http-route',
            ...(input.userId ? { userId: input.userId } : {}),
          },
          conversationId: input.conversationId,
        });
        customErrorMessage = persona.customErrorMessage;
        if (input.shortCircuitContent) {
          responseSource = 'short-circuit';
          shortCircuitParts = input.shortCircuitParts ?? [];
          return {
            modelId: input.modelId,
            providerId: input.providerId,
            stream: createShortCircuitStream(input.shortCircuitContent),
          };
        }
        if (input.deferredShortCircuit && input.userMessageId) {
          responseSource = 'short-circuit';
          const resolved = await input.deferredShortCircuit.execute({
            assistantMessageId: input.messageId,
            conversationId: input.conversationId,
            userId: input.userId,
            userMessageId: input.userMessageId,
          });
          shortCircuitParts = resolved.assistantParts;
          return {
            modelId: resolved.modelId,
            providerId: resolved.providerId,
            stream: createShortCircuitStream(resolved.assistantContent),
          };
        }
        const { responseSource: nextSource, shortCircuitParts: nextParts, ...streamSource } = await this.conversationMessagePlanningService.createStreamPlan({
          activePersonaId: input.activePersonaId,
          abortSignal,
          conversationId: input.conversationId,
          messageId: input.messageId,
          modelId: input.modelId,
          persona,
          providerId: input.providerId,
          userId: input.userId,
        });
        responseSource = nextSource;
        shortCircuitParts = nextParts;
        return streamSource;
      },
      modelId: input.modelId,
      onComplete: async (result) => this.conversationMessagePlanningService.finalizeTaskResult(result, responseSource, shortCircuitParts),
      resolveErrorMessage: () => customErrorMessage,
      onSent: async (result) => {
        const conversation = this.conversationStore.requireConversation(result.conversationId);
        const afterSend = await this.conversationMessagePlanningService.broadcastAfterSend({ activePersonaId: conversation.activePersonaId, conversationId: result.conversationId, userId: conversation.userId }, result, responseSource);
        if (afterSend.continuation) {
          this.startAutoCompactionContinuationTask({
            activePersonaId: conversation.activePersonaId,
            conversationId: result.conversationId,
            continuation: afterSend.continuation,
            modelId: result.modelId,
            providerId: result.providerId,
            userId: conversation.userId,
          });
        }
      },
      providerId: input.providerId,
    });
  }

  private startAutoCompactionContinuationTask(input: { activePersonaId?: string; continuation: AfterResponseCompactionContinuation; conversationId: string; modelId: string; providerId: string; userId?: string }): void {
    const userMessage = this.conversationMessages.createMessage(input.conversationId, {
      content: input.continuation.content,
      metadata: input.continuation.metadata,
      parts: input.continuation.parts,
      provider: input.providerId,
      model: input.modelId,
      role: 'user',
      status: 'completed',
    });
    const assistantMessage = this.conversationMessages.createMessage(input.conversationId, {
      content: '',
      model: input.modelId,
      parts: [],
      provider: input.providerId,
      role: 'assistant',
      status: 'pending',
    });

    this.startConversationTask({
      activePersonaId: input.activePersonaId,
      conversationId: input.conversationId,
      messageId: readMessageId(assistantMessage),
      modelId: input.modelId,
      providerId: input.providerId,
      userId: input.userId,
    });

    void userMessage;
  }
}

function readMessageId(message: { id?: unknown }): string {
  if (typeof message.id === 'string' && message.id.length > 0) {return message.id;}
  throw new NotFoundException('Message id missing');
}

function readOptionalMessageField(message: Record<string, unknown>, key: 'model' | 'provider'): string { return typeof message[key] === 'string' ? message[key] : key === 'model' ? DEFAULT_PROVIDER_MODEL_ID : DEFAULT_PROVIDER_ID; }

function isActiveResponseMessage(message: Record<string, unknown>): boolean {
  return isStoppableResponseMessage(message) && (message.status === 'pending' || message.status === 'streaming');
}

function isStoppableResponseMessage(message: Record<string, unknown>): boolean {
  return message.role === 'assistant' || isDisplayResultMessage(message);
}

function isDisplayResultMessage(message: Record<string, unknown>): boolean {
  if (message.role !== 'display') {return false;}
  const annotations = readMessageAnnotations(message);
  return annotations.some((annotation) => (
    annotation.owner === 'conversation.display-message'
    && annotation.type === 'display-message'
    && isRecord(annotation.data)
    && annotation.data.variant === 'result'
  ));
}

function readMessageAnnotations(message: Record<string, unknown>): Array<Record<string, unknown>> {
  if (isRecord(message.metadata) && Array.isArray(message.metadata.annotations)) {
    return message.metadata.annotations.filter(isRecord);
  }
  if (typeof message.metadataJson !== 'string' || !message.metadataJson.trim()) {return [];}
  try {
    const parsed = JSON.parse(message.metadataJson) as unknown;
    return isRecord(parsed) && Array.isArray(parsed.annotations)
      ? parsed.annotations.filter(isRecord)
      : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


function isDisplayOnlyCommandMessage(content: string, parts: ChatMessagePart[]): boolean {
  const normalized = content.trim();
  return normalized.startsWith('/')
    && !parts.some((part) => part.type !== 'text');
}

function createDisplayMessageMetadata(variant: 'command' | 'result'): ChatMessageMetadata {
  return {
    annotations: [
      {
        data: {
          variant,
        },
        owner: 'conversation.display-message',
        type: 'display-message',
        version: '1',
      },
    ],
  };
}
