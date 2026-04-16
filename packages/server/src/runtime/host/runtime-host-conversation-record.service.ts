import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConversationHostServices, JsonObject, JsonValue, PluginCallContext } from '@garlic-claw/shared';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { asJsonValue, cloneJsonValue, readJsonObject, readOptionalBoolean, readPositiveInteger, requireContextField } from './runtime-host-values';
import { listDispatchableHookPluginIds } from '../kernel/runtime-plugin-hook-governance';

export interface RuntimeConversationRecord {
  activePersonaId?: string;
  activeSkillIds: string[];
  createdAt: string;
  hostServices: ConversationHostServices;
  id: string;
  messages: JsonObject[];
  revision: string;
  revisionVersion: number;
  title: string;
  updatedAt: string;
  userId: string;
}

interface RuntimeConversationSessionRecord {
  captureHistory: boolean;
  conversationId: string;
  expiresAt: string;
  historyMessages: JsonObject[];
  lastMatchedAt: string | null;
  metadata?: JsonObject;
  pluginId: string;
  startedAt: string;
  timeoutMs: number;
}

@Injectable()
export class RuntimeHostConversationRecordService {
  private readonly conversationSessions = new Map<string, RuntimeConversationSessionRecord>();
  private readonly storagePath = resolveConversationStoragePath();
  private readonly conversations: Map<string, RuntimeConversationRecord>;

  constructor(
    @Optional()
    private readonly runtimeHostPluginDispatchService?: Pick<RuntimeHostPluginDispatchService, 'invokeHook' | 'listPlugins'>,
  ) {
    this.conversations = this.loadConversations();
  }

  createConversation(input: { title?: string; userId?: string }): JsonValue {
    const overview = this.buildConversationOverview(this.createConversationRecord({ conversationId: randomUUID(), timestamp: new Date().toISOString(), title: input.title?.trim() || 'New Chat', userId: input.userId ?? 'anonymous' }));
    void this.broadcastConversationCreated(overview, input.userId ?? 'anonymous');
    return overview;
  }

  deleteConversation(conversationId: string, userId?: string): JsonValue {
    this.requireConversation(conversationId, userId);
    this.conversations.delete(conversationId);
    this.saveConversations();
    return { message: 'Conversation deleted' };
  }

  finishConversationSession(pluginId: string, context: PluginCallContext): boolean {
    return this.finishPluginConversationSession(pluginId, this.readConversationId(context));
  }

  getConversationSession(pluginId: string, context: PluginCallContext): JsonValue {
    return this.serializeConversationSession(
      this.getConversationSessionRecord(pluginId, this.readConversationId(context)),
    );
  }

  getConversation(conversationId: string, userId?: string): JsonValue {
    return this.buildConversationDetail(this.requireConversation(conversationId, userId));
  }

  listConversations(userId?: string): JsonValue {
    return [...this.conversations.values()]
      .filter((conversation) => !userId || conversation.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((conversation) => this.buildConversationOverview(conversation));
  }

  listPluginConversationSessions(pluginId: string): JsonValue {
    return [...this.conversationSessions.values()]
      .filter((session) => session.pluginId === pluginId)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
      .map((session) => this.serializeConversationSession(session));
  }

  readConversationHostServices(conversationId: string, userId?: string): JsonValue {
    return asJsonValue(this.requireConversation(conversationId, userId).hostServices);
  }

  readConversationRevision(conversationId: string): string | null {
    return this.conversations.get(conversationId)?.revision ?? null;
  }

  readConversationSkillState(conversationId: string, userId?: string): JsonValue {
    const conversation = this.requireConversation(conversationId, userId);
    return { activeSkillIds: [...conversation.activeSkillIds], activeSkills: conversation.activeSkillIds.map((skillId) => ({ id: skillId, name: skillId })) };
  }

  finishPluginConversationSession(pluginId: string, conversationId: string): boolean {
    return this.deleteConversationSession(pluginId, conversationId);
  }

  keepConversationSession(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): JsonValue {
    const session = this.getConversationSessionRecord(
      pluginId,
      this.readConversationId(context),
    );
    if (!session) {
      return null;
    }

    const timeoutMs = this.readSessionTimeoutMs(params);
    const resetTimeout = readOptionalBoolean(params, 'resetTimeout') ?? true;
    const nextSession = {
      ...session,
      expiresAt: resetTimeout
        ? new Date(Date.now() + timeoutMs).toISOString()
        : new Date(Date.parse(session.expiresAt) + timeoutMs).toISOString(),
      timeoutMs: resetTimeout ? timeoutMs : session.timeoutMs + timeoutMs,
    };
    this.conversationSessions.set(this.buildConversationSessionKey(nextSession.pluginId, nextSession.conversationId), nextSession);
    return this.serializeConversationSession(nextSession);
  }

  startConversationSession(
    pluginId: string,
    context: PluginCallContext,
    params: JsonObject,
  ): JsonValue {
    const conversation = this.requireConversation(this.readConversationId(context));
    const timeoutMs = this.readSessionTimeoutMs(params);
    const captureHistory = readOptionalBoolean(params, 'captureHistory') ?? false;
    const metadata = readJsonObject(params.metadata);
    const startedAt = new Date().toISOString();
    const session = {
      captureHistory,
      conversationId: conversation.id,
      expiresAt: new Date(Date.parse(startedAt) + timeoutMs).toISOString(),
      historyMessages: captureHistory
        ? conversation.messages.map((message) => cloneJsonValue(message))
        : [],
      lastMatchedAt: null,
      pluginId,
      startedAt,
      timeoutMs,
      ...(metadata ? { metadata } : {}),
    };
    this.conversationSessions.set(this.buildConversationSessionKey(session.pluginId, session.conversationId), session);
    return this.serializeConversationSession(session);
  }

  readConversationSummary(conversationId: string, userId?: string): JsonValue {
    return this.buildConversationSummary(this.requireConversation(conversationId, userId));
  }

  readCurrentMessageTarget(conversationId: string, userId?: string): JsonValue {
    const conversation = this.requireConversation(conversationId, userId);
    return { id: conversation.id, label: conversation.title, type: 'conversation' };
  }

  rememberConversationActivePersona(conversationId: string, activePersonaId: string, userId?: string): void {
    this.mutateConversation(conversationId, (conversation, timestamp) => { conversation.activePersonaId = activePersonaId; this.bumpRevision(conversation, timestamp); }, userId);
  }

  replaceMessages(conversationId: string, messages: JsonObject[], userId?: string): RuntimeConversationRecord {
    return this.mutateConversation(conversationId, (conversation, timestamp) => { conversation.messages = cloneJsonValue(messages); this.bumpRevision(conversation, timestamp); }, userId);
  }

  requireConversation(conversationId: string, userId?: string): RuntimeConversationRecord {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {throw new NotFoundException(`Conversation not found: ${conversationId}`);}
    if (userId && conversation.userId !== userId) {throw new ForbiddenException('Not your conversation');}
    return conversation;
  }

  writeConversationHostServices(
    conversationId: string,
    patch: Partial<ConversationHostServices>,
    userId?: string,
  ): JsonValue {
    return asJsonValue(this.mutateConversation(conversationId, (conversation, timestamp) => {
      conversation.hostServices = { ...conversation.hostServices, ...(typeof patch.sessionEnabled === 'boolean' ? { sessionEnabled: patch.sessionEnabled } : {}), ...(typeof patch.llmEnabled === 'boolean' ? { llmEnabled: patch.llmEnabled } : {}), ...(typeof patch.ttsEnabled === 'boolean' ? { ttsEnabled: patch.ttsEnabled } : {}) };
      this.bumpRevision(conversation, timestamp);
    }, userId).hostServices);
  }

  writeConversationSkillState(conversationId: string, activeSkillIds: string[], userId?: string): JsonValue {
    this.mutateConversation(conversationId, (conversation, timestamp) => { conversation.activeSkillIds = [...activeSkillIds]; this.bumpRevision(conversation, timestamp); }, userId);
    return this.readConversationSkillState(conversationId, userId);
  }

  writeConversationTitle(conversationId: string, title: string, userId?: string): JsonValue {
    return this.buildConversationSummary(this.mutateConversation(conversationId, (conversation, timestamp) => { conversation.title = title; this.bumpRevision(conversation, timestamp); }, userId));
  }

  private buildConversationDetail(conversation: RuntimeConversationRecord): JsonValue {
    return asJsonValue({ _count: { messages: conversation.messages.length }, createdAt: conversation.createdAt, id: conversation.id, messages: conversation.messages.map((message) => serializeConversationMessage(message)), title: conversation.title, updatedAt: conversation.updatedAt });
  }

  private buildConversationOverview(conversation: RuntimeConversationRecord): JsonObject {
    return { _count: { messages: conversation.messages.length }, createdAt: conversation.createdAt, id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt };
  }

  private buildConversationSummary(conversation: RuntimeConversationRecord): JsonValue {
    return { ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}), createdAt: conversation.createdAt, id: conversation.id, title: conversation.title, updatedAt: conversation.updatedAt };
  }

  private buildConversationSessionKey(pluginId: string, conversationId: string): string {
    return `${pluginId}:${conversationId}`;
  }

  private bumpRevision(conversation: RuntimeConversationRecord, timestamp: string): void {
    conversation.updatedAt = timestamp;
    conversation.revisionVersion += 1;
    conversation.revision = `${readRevisionSeed(conversation.revision)}:${conversation.revisionVersion}`;
  }

  private createConversationRecord(input: { conversationId: string; timestamp: string; title: string; userId: string }): RuntimeConversationRecord {
    const conversation: RuntimeConversationRecord = { activeSkillIds: [], createdAt: input.timestamp, hostServices: { llmEnabled: true, sessionEnabled: true, ttsEnabled: true }, id: input.conversationId, messages: [], revision: `${input.conversationId}:${input.timestamp}:${Math.random().toString(36).slice(2)}:0`, revisionVersion: 0, title: input.title, updatedAt: input.timestamp, userId: input.userId };
    this.conversations.set(conversation.id, conversation);
    this.saveConversations();
    return conversation;
  }

  private mutateConversation(
    conversationId: string,
    mutate: (conversation: RuntimeConversationRecord, timestamp: string) => void,
    userId?: string,
  ): RuntimeConversationRecord {
    const conversation = this.requireConversation(conversationId, userId);
    mutate(conversation, new Date().toISOString());
    this.saveConversations();
    return conversation;
  }

  private deleteConversationSession(pluginId: string, conversationId: string): boolean {
    return this.conversationSessions.delete(this.buildConversationSessionKey(pluginId, conversationId));
  }

  private getConversationSessionRecord(pluginId: string, conversationId: string): RuntimeConversationSessionRecord | null {
    const session = this.conversationSessions.get(this.buildConversationSessionKey(pluginId, conversationId));
    if (!session) {
      return null;
    }
    if (Date.parse(session.expiresAt) <= Date.now()) {
      this.deleteConversationSession(pluginId, conversationId);
      return null;
    }

    return session;
  }

  private readConversationId(context: PluginCallContext): string {
    return requireContextField(context, 'conversationId');
  }

  private readSessionTimeoutMs(params: JsonObject): number {
    const timeoutMs = readPositiveInteger(params, 'timeoutMs');
    if (timeoutMs) {
      return timeoutMs;
    }

    throw new BadRequestException('timeoutMs must be a positive integer');
  }

  private serializeConversationSession(session: RuntimeConversationSessionRecord | null): JsonValue {
    return session
      ? {
          ...(session.metadata ? { metadata: cloneJsonValue(session.metadata) } : {}),
          captureHistory: session.captureHistory,
          conversationId: session.conversationId,
          expiresAt: session.expiresAt,
          historyMessages: session.historyMessages.map((message) => cloneJsonValue(message)),
          lastMatchedAt: session.lastMatchedAt,
          pluginId: session.pluginId,
          startedAt: session.startedAt,
          timeoutMs: session.timeoutMs,
        }
      : null;
  }

  private saveConversations(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify({ conversations: Object.fromEntries([...this.conversations.entries()].map(([id, record]) => [id, cloneJsonValue(record)])) }, null, 2), 'utf-8');
  }

  private loadConversations(): Map<string, RuntimeConversationRecord> {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {return new Map<string, RuntimeConversationRecord>();}
      const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as { conversations?: Record<string, RuntimeConversationRecord> };
      return new Map(Object.entries(parsed.conversations ?? {}).map(([id, record]) => [id, cloneJsonValue(record)]));
    } catch {
      return new Map<string, RuntimeConversationRecord>();
    }
  }

  private async broadcastConversationCreated(
    conversation: JsonObject,
    userId: string,
  ): Promise<void> {
    const runtimeKernelService = this.runtimeHostPluginDispatchService;
    if (!runtimeKernelService) {return;}
    const context = { conversationId: String(conversation.id), source: 'http-route' as const, userId };
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'conversation:created', kernel: runtimeKernelService })) {
      await runtimeKernelService.invokeHook({
        context,
        hookName: 'conversation:created',
        payload: asJsonValue({ context, conversation }),
        pluginId,
      });
    }
  }
}

function readRevisionSeed(revision: string): string {
  const lastSeparator = revision.lastIndexOf(':');
  return lastSeparator > 0 ? revision.slice(0, lastSeparator) : revision;
}

function resolveConversationStoragePath(): string {
  if (process.env.GARLIC_CLAW_CONVERSATIONS_PATH) {return process.env.GARLIC_CLAW_CONVERSATIONS_PATH;}
  if (process.env.JEST_WORKER_ID) {
    return path.join(process.cwd(), 'tmp', `conversations.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  }
  return path.join(process.cwd(), 'tmp', 'conversations.server.json');
}

export function serializeConversationMessage(message: JsonObject) {
  return {
    content: typeof message.content === 'string' ? message.content : null,
    createdAt: String(message.createdAt),
    error: typeof message.error === 'string' ? message.error : null,
    id: String(message.id),
    metadataJson: typeof message.metadataJson === 'string' ? message.metadataJson : null,
    model: typeof message.model === 'string' ? message.model : null,
    partsJson: Array.isArray(message.parts) && message.parts.length > 0 ? JSON.stringify(message.parts) : null,
    provider: typeof message.provider === 'string' ? message.provider : null,
    role: String(message.role),
    status: message.status,
    toolCalls: Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? JSON.stringify(message.toolCalls) : null,
    toolResults: Array.isArray(message.toolResults) && message.toolResults.length > 0 ? JSON.stringify(message.toolResults) : null,
    updatedAt: String(message.updatedAt),
  };
}
