import type { ChatMessagePart, ChatMessageStatus, JsonObject, JsonValue, PluginCallContext } from '@garlic-claw/shared';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  RuntimeHostConversationRecordService,
  serializeConversationMessage,
} from './runtime-host-conversation-record.service';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { applyMutatingDispatchableHooks, listDispatchableHookPluginIds } from '../kernel/runtime-plugin-hook-governance';
import {
  asJsonValue,
  cloneJsonValue,
  readJsonValue,
  readMessageTarget,
  readOptionalString,
  requireContextField,
} from './runtime-host-values';

@Injectable()
export class RuntimeHostConversationMessageService {
  constructor(
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
    @Optional()
    private readonly runtimeHostPluginDispatchService?: Pick<RuntimeHostPluginDispatchService, 'invokeHook' | 'listPlugins'>,
  ) {}

  private createMessageRecord(input: MessageWriteInput, timestamp: string): JsonObject {
    const message: JsonObject = { content: input.content ?? '', createdAt: timestamp, id: randomUUID(), role: input.role, status: input.status, updatedAt: timestamp };
    if (input.parts?.length) {message.parts = asJsonValue(input.parts) as unknown as JsonObject['parts'];}
    if (input.provider) {message.provider = input.provider;}
    if (input.model) {message.model = input.model;}
    if (input.target) {message.target = asJsonValue(input.target) as unknown as JsonObject['target'];}
    return message;
  }

  createMessage(conversationId: string, input: MessageWriteInput) {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(conversationId);
    const message = this.createMessageRecord(input, new Date().toISOString());
    return cloneJsonValue(this.runtimeHostConversationRecordService.replaceMessages(conversationId, [...conversation.messages, message]).messages.at(-1) as JsonObject);
  }

  async createMessageWithHooks(
    conversationId: string,
    input: MessageWriteInput,
    userId?: string,
    kernelOverride?: Pick<RuntimeHostPluginDispatchService, 'invokeHook' | 'listPlugins'>,
  ): Promise<Record<string, unknown>> {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(conversationId, userId);
    const created = await this.applyMessageCreatedHooks(conversation, input, kernelOverride);
    return this.createMessage(conversation.id, created);
  }

  async deleteMessage(conversationId: string, messageId: string, userId?: string): Promise<JsonValue> {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(conversationId, userId);
    const message = conversation.messages.find((entry) => entry.id === messageId);
    if (!message) {throw new NotFoundException(`Message not found: ${messageId}`);}
    await this.broadcastMessageDeleted(conversation, message);
    this.runtimeHostConversationRecordService.replaceMessages(conversationId, conversation.messages.filter((entry) => entry.id !== messageId), userId);
    return { success: true };
  }

  readConversationRevision(conversationId: string): string | null {
    return this.runtimeHostConversationRecordService.readConversationRevision(conversationId);
  }

  async sendMessage(context: PluginCallContext, params: JsonObject): Promise<JsonValue> {
    const target = readMessageTarget(params.target);
    const conversationId = target?.id ?? requireContextField(context, 'conversationId');
    const conversation = this.runtimeHostConversationRecordService.requireConversation(conversationId, context.userId);
    const content = readOptionalString(params, 'content');
    const parts = readJsonValue(params.parts);
    if (!content && parts === null) {throw new BadRequestException('message.send requires content or parts');}

    const normalized = normalizePluginMessageOutput(content ?? null, Array.isArray(parts) ? parts as unknown as ChatMessagePart[] : null);
    const created = await this.createMessageWithHooks(conversation.id, {
      content: normalized.content,
      model: readOptionalString(params, 'model') ?? context.activeModelId ?? undefined,
      parts: normalized.parts,
      provider: readOptionalString(params, 'provider') ?? context.activeProviderId ?? undefined,
      role: 'assistant',
      status: 'completed',
      target: { id: conversation.id, label: conversation.title, type: 'conversation' as const },
    }, context.userId);
    return asJsonValue(created);
  }

  async updateMessage(conversationId: string, messageId: string, dto: Pick<MessagePatch, 'content' | 'parts'>, userId?: string): Promise<JsonValue> {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(conversationId, userId);
    const message = conversation.messages.find((entry) => entry.id === messageId);
    if (!message) {throw new NotFoundException(`Message not found: ${messageId}`);}
    const patch = await this.applyMessageUpdatedHooks(conversation, message, { ...(typeof dto.content === 'string' ? { content: dto.content } : {}), ...(dto.parts ? { parts: dto.parts } : {}) });
    return asJsonValue(serializeConversationMessage(this.writeMessage(conversationId, messageId, patch, userId) as JsonObject));
  }

  writeMessage(conversationId: string, messageId: string, patch: MessagePatch, userId?: string): Record<string, unknown> {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(conversationId, userId);
    const messages = conversation.messages.map((entry) => entry.id === messageId ? this.applyMessagePatch(entry, patch) : entry);
    if (messages.every((entry) => entry.id !== messageId)) {throw new NotFoundException(`Message not found: ${messageId}`);}
    const updatedConversation = this.runtimeHostConversationRecordService.replaceMessages(conversationId, messages, userId);
    const message = updatedConversation.messages.find((entry) => entry.id === messageId);
    if (!message) {throw new NotFoundException(`Message not found: ${messageId}`);}
    return cloneJsonValue(message);
  }

  private applyMessagePatch(message: JsonObject, patch: MessagePatch): JsonObject {
    const next = cloneJsonValue(message) as JsonObject;
    if ('content' in patch) {next.content = patch.content ?? '';}
    if ('error' in patch) {next.error = patch.error ?? null;}
    if ('model' in patch) {next.model = patch.model ?? null;}
    if ('parts' in patch) {next.parts = asJsonValue(patch.parts ?? []) as unknown as JsonObject['parts'];}
    if ('provider' in patch) {next.provider = patch.provider ?? null;}
    if ('status' in patch) {next.status = patch.status ?? next.status;}
    if ('toolCalls' in patch) {next.toolCalls = patch.toolCalls ? asJsonValue(patch.toolCalls) as unknown as JsonObject['toolCalls'] : null;}
    if ('toolResults' in patch) {next.toolResults = patch.toolResults ? asJsonValue(patch.toolResults) as unknown as JsonObject['toolResults'] : null;}
    next.updatedAt = new Date().toISOString();
    return next;
  }

  private async applyMessageCreatedHooks(
    conversation: { activePersonaId?: string; id: string; title: string; userId: string },
    message: MessageWriteInput,
    kernelOverride?: Pick<RuntimeHostPluginDispatchService, 'invokeHook' | 'listPlugins'>,
  ): Promise<MessageWriteInput> {
    const kernel = kernelOverride ?? this.runtimeHostPluginDispatchService;
    if (!kernel) {return message;}
    return applyMutatingDispatchableHooks({
      applyMutation: (nextMessage, mutation) => applyMessageHookMutation(nextMessage, mutation, true),
      hookName: 'message:created',
      kernel,
      mapPayload: (nextMessage, context) => asJsonValue({
        context,
        conversationId: conversation.id,
        message: toHookMessage(nextMessage),
        modelMessages: [{ content: nextMessage.parts?.length ? nextMessage.parts : nextMessage.content ?? '', role: nextMessage.role }],
      }),
      payload: message,
      readContext: (nextMessage) => createHookContext(conversation, nextMessage),
    });
  }

  private async applyMessageUpdatedHooks(conversation: { activePersonaId?: string; id: string; userId: string }, message: JsonObject, patch: Pick<MessagePatch, 'content' | 'parts'>): Promise<MessagePatch> {
    const currentMessage = readStoredHookMessage(message);
    const nextMessage = { ...currentMessage, content: typeof patch.content === 'string' ? patch.content : currentMessage.content, parts: patch.parts ?? currentMessage.parts };
    const kernel = this.runtimeHostPluginDispatchService;
    const finalMessage = !kernel
      ? nextMessage
      : await applyMutatingDispatchableHooks({
          applyMutation: (candidate, mutation) => applyMessageHookMutation(candidate, mutation, false),
          hookName: 'message:updated',
          kernel,
          mapPayload: (candidate, context) => asJsonValue({
            context,
            conversationId: conversation.id,
            messageId: String(message.id),
            currentMessage,
            nextMessage: toHookMessage(candidate),
          }),
          payload: nextMessage,
          readContext: (candidate) => createHookContext(conversation, candidate),
        });
    return { content: finalMessage.content, parts: finalMessage.parts, ...(finalMessage.provider !== undefined ? { provider: finalMessage.provider } : {}), ...(finalMessage.model !== undefined ? { model: finalMessage.model } : {}), ...(finalMessage.status !== undefined ? { status: finalMessage.status as ChatMessageStatus } : {}) };
  }

  private async broadcastMessageDeleted(conversation: { activePersonaId?: string; id: string; userId: string }, message: JsonObject): Promise<void> {
    const kernel = this.runtimeHostPluginDispatchService;
    if (!kernel) {return;}
    const hookMessage = readStoredHookMessage(message);
    const context = createHookContext(conversation, hookMessage);
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'message:deleted', kernel })) {
      await kernel.invokeHook({
        context,
        hookName: 'message:deleted',
        payload: asJsonValue({
          context,
          conversationId: conversation.id,
          messageId: String(message.id),
          message: hookMessage,
        }),
        pluginId,
      });
    }
  }
}

type MessageWriteInput = { content?: string; model?: string | null; parts?: ChatMessagePart[]; provider?: string | null; role: 'assistant' | 'user'; status: 'completed' | 'pending'; target?: { id: string; label: string; type: 'conversation' } };
type MessagePatch = { content?: string; error?: string | null; model?: string | null; parts?: ChatMessagePart[]; provider?: string | null; status?: ChatMessageStatus; toolCalls?: JsonValue[] | null; toolResults?: JsonValue[] | null };
type HookMessage = { content: string; model: string | null; parts: ChatMessagePart[]; provider: string | null; role: 'assistant' | 'user'; status: JsonValue };

function readStoredHookMessage(message: JsonObject): HookMessage {
  return toHookMessage({
    content: typeof message.content === 'string' ? message.content : '',
    model: typeof message.model === 'string' ? message.model : null,
    parts: Array.isArray(message.parts) ? message.parts as unknown as ChatMessagePart[] : [],
    provider: typeof message.provider === 'string' ? message.provider : null,
    role: (typeof message.role === 'string' ? message.role : 'assistant') as 'assistant' | 'user',
    status: message.status,
  });
}

function applyMessageHookMutation<T extends { content?: string | null; model?: string | null; parts?: ChatMessagePart[]; provider?: string | null; role: 'assistant' | 'user'; status?: JsonValue }>(
  message: T,
  mutation: Record<string, unknown>,
  allowModelMessages: boolean,
): T {
  const next = {
    ...message,
    ...(typeof mutation.content === 'string' ? { content: mutation.content } : {}),
    ...(Array.isArray(mutation.parts) ? { parts: mutation.parts as ChatMessagePart[] } : {}),
    ...(typeof mutation.provider === 'string' ? { provider: mutation.provider } : {}),
    ...(typeof mutation.model === 'string' ? { model: mutation.model } : {}),
    ...(typeof mutation.status === 'string' ? { status: mutation.status } : {}),
  };
  if (!allowModelMessages || !Array.isArray(mutation.modelMessages)) {return next;}
  const modelMessage = mutation.modelMessages.at(-1) as { content?: unknown } | undefined;
  if (!modelMessage) {return next;}
  if (Array.isArray(modelMessage.content)) {
    return { ...next, content: readMessageText(modelMessage.content), parts: modelMessage.content as ChatMessagePart[] };
  }
  return typeof modelMessage.content === 'string' ? { ...next, content: modelMessage.content } : next;
}

function readMessageText(parts: unknown[]): string {
  return parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text' && typeof (part as { text?: unknown }).text === 'string')
    .map((part) => part.text)
    .join('\n');
}

function createHookContext(
  conversation: { activePersonaId?: string; id: string; userId: string },
  message: { model?: string | null; provider?: string | null },
): PluginCallContext {
  return { ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}), ...(message.model ? { activeModelId: message.model } : {}), ...(message.provider ? { activeProviderId: message.provider } : {}), conversationId: conversation.id, source: 'http-route', userId: conversation.userId };
}

function toHookMessage(message: {
  content?: string | null;
  model?: string | null;
  parts?: ChatMessagePart[];
  provider?: string | null;
  role: 'assistant' | 'user';
  status?: unknown;
}): HookMessage {
  return { content: message.content ?? '', model: message.model ?? null, parts: message.parts ?? [], provider: message.provider ?? null, role: message.role, status: (message.status ?? 'completed') as JsonValue };
}

function normalizePluginMessageOutput(content: string | null, parts: ChatMessagePart[] | null): { content: string; parts: ChatMessagePart[] } {
  if (parts && parts.length > 0) {
    return {
      content: parts.filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text').map((part) => part.text).join('\n'),
      parts: cloneJsonValue(parts),
    };
  }

  const normalizedContent = content?.trim() ?? '';
  return { content: normalizedContent, parts: normalizedContent ? [{ text: normalizedContent, type: 'text' as const }] : [] };
}
