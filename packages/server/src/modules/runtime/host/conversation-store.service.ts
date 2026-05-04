import type { ChatMessageMetadata, ChatMessagePart, ConversationKind, ConversationSubagentState, JsonObject, JsonValue, PluginCallContext } from '@garlic-claw/shared';
import { BadRequestException, ConflictException, ForbiddenException, forwardRef, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { uuidv7 } from 'uuidv7';
import { SINGLE_USER_ID } from '../../auth/single-user-auth';
import { createConversationHistorySignatureFromHistoryMessages } from '../../conversation/conversation-history-signature';
import { buildConversationVisibleModelMessages, readConversationVisiblePreviewText } from '../../conversation/conversation-model-visible-history';
import { readConversationModelUsageAnnotation, readLatestConversationModelUsageAnnotation } from '../../conversation/conversation-model-usage.annotation';
import { RuntimeSessionEnvironmentService } from '../../execution/runtime/runtime-session-environment.service';
import { listDispatchableHookPluginIds } from '../kernel/runtime-plugin-hook-governance';
import { createServerTestArtifactPath, resolveServerStatePath } from '../../../core/runtime/server-workspace-paths';
import { PluginDispatchService } from './plugin-dispatch.service';
import { ConversationTodoService } from './conversation-todo.service';
import { asJsonValue, cloneJsonValue, readJsonObject, readOptionalBoolean, readPositiveInteger, requireContextField } from './host-input.codec';

export interface RuntimeConversationRecord { activePersonaId?: string; createdAt: string; id: string; kind?: ConversationKind; messages: JsonObject[]; parentId?: string; revision: string; revisionVersion: number; runtimePermissionApprovals?: string[]; subagent?: ConversationSubagentState; title: string; updatedAt: string; userId: string; }
interface RuntimeConversationSessionRecord { captureHistory: boolean; conversationId: string; expiresAt: string; historyMessages: JsonObject[]; lastMatchedAt: string | null; metadata?: JsonObject; pluginId: string; startedAt: string; timeoutMs: number; }
interface RuntimeConversationStoragePayload { conversations?: Record<string, RuntimeConversationRecord>; pluginConversationSessions?: Record<string, RuntimeConversationSessionRecord>; }
type RuntimeConversationRecordView = 'detail' | 'history' | 'overview' | 'summary';
const CONVERSATION_HISTORY_STATUSES = new Set(['pending', 'streaming', 'completed', 'stopped', 'error']);

@Injectable()
export class ConversationStoreService {
  private readonly conversationSessions: Map<string, RuntimeConversationSessionRecord>;
  private readonly storagePath = resolveConversationStoragePath();
  private readonly conversations: Map<string, RuntimeConversationRecord>;

  constructor(
    @Optional() private readonly pluginDispatch?: PluginDispatchService,
    @Optional() private readonly runtimeSessionEnvironmentService?: RuntimeSessionEnvironmentService,
    @Optional() @Inject(forwardRef(() => ConversationTodoService)) private readonly conversationTodoService?: ConversationTodoService,
  ) {
    const stored = this.readStoredConversations();
    this.conversationSessions = stored.sessions;
    this.conversations = stored.records;
    const settledInterruptedResponses = this.settleInterruptedMainConversationResponses();
    if (stored.migrated || settledInterruptedResponses) {this.persistConversations();}
  }

  createConversation(input: { id?: string; title?: string; userId?: string; parentId?: string; kind?: ConversationKind; subagent?: ConversationSubagentState | null }): JsonValue {
    const timestamp = new Date().toISOString(), conversationId = input.id ?? uuidv7();
    const conversation: RuntimeConversationRecord = {
      createdAt: timestamp,
      id: conversationId,
      ...(input.kind ? { kind: input.kind } : {}),
      messages: [],
      ...(input.parentId ? { parentId: input.parentId } : {}),
      revision: `${conversationId}:${timestamp}:${Math.random().toString(36).slice(2)}:0`,
      revisionVersion: 0,
      runtimePermissionApprovals: [],
      ...(input.subagent ? { subagent: cloneJsonValue(input.subagent) as ConversationSubagentState } : {}),
      title: input.title?.trim() || '新的对话',
      updatedAt: timestamp,
      userId: input.userId ?? SINGLE_USER_ID,
    };
    this.conversations.set(conversation.id, conversation);
    this.persistConversations();
    const overview = readConversationRecordValue(conversation, 'overview') as JsonObject;
    void this.broadcastConversationCreated(overview, conversation.userId);
    return overview;
  }

  async deleteConversation(conversationId: string, userId?: string): Promise<JsonValue> {
    this.requireConversation(conversationId, userId);
    const conversationIds = this.collectConversationTreeIds(conversationId, userId);
    for (const currentConversationId of conversationIds) {
      this.conversationTodoService?.deleteSessionTodo(currentConversationId);
      this.conversations.delete(currentConversationId);
      this.removeConversationSessions(currentConversationId);
      await this.runtimeSessionEnvironmentService?.deleteSessionEnvironment(currentConversationId);
    }
    this.persistConversations();
    return { message: 'Conversation deleted' };
  }

  getConversationSession(pluginId: string, context: PluginCallContext): JsonValue { return serializeConversationSession(this.readConversationSession(pluginId, readConversationId(context))); }
  getConversation(conversationId: string, userId?: string): JsonValue { return readConversationRecordValue(this.requireConversation(conversationId, userId), 'detail'); }
  listConversations(userId?: string): JsonValue { return [...this.conversations.values()].filter((conversation) => !userId || conversation.userId === userId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map((conversation) => readConversationRecordValue(conversation, 'overview')); }

  listChildConversations(parentId: string): JsonValue { return [...this.conversations.values()].filter(c => c.parentId === parentId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map(c => readConversationRecordValue(c, 'overview')); }
  listConversationTreeRecords(conversationId: string, userId?: string): RuntimeConversationRecord[] {
    return this.collectConversationTreeIds(conversationId, userId)
      .map((currentConversationId) => cloneJsonValue(this.requireConversation(currentConversationId, userId)) as RuntimeConversationRecord);
  }
  listChildSubagentConversations(parentId: string, userId?: string): JsonValue {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.parentId === parentId)
      .filter((conversation) => conversation.kind === 'subagent' && Boolean(conversation.subagent))
      .filter((conversation) => !userId || conversation.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((conversation) => readConversationRecordValue(conversation, 'overview'));
  }
  listSubagentConversations(userId?: string): JsonValue {
    return this.listSubagentConversationRecords(userId).map((conversation) => readConversationRecordValue(conversation, 'overview'));
  }
  listSubagentConversationRecords(userId?: string): RuntimeConversationRecord[] {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.kind === 'subagent' && Boolean(conversation.subagent) && (!userId || conversation.userId === userId))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((conversation) => cloneJsonValue(conversation) as RuntimeConversationRecord);
  }
  listPluginConversationSessions(pluginId: string): JsonValue { this.pruneExpiredConversationSessions(); return [...this.conversationSessions.values()].filter((session) => session.pluginId === pluginId).sort((left, right) => left.startedAt.localeCompare(right.startedAt)).map(serializeConversationSession); }
  readConversationRevision(conversationId: string): string | null { return this.conversations.get(conversationId)?.revision ?? null; }
  readConversationSubagent(conversationId: string, userId?: string): ConversationSubagentState | null {
    const subagent = this.requireConversation(conversationId, userId).subagent;
    return subagent ? cloneJsonValue(subagent) as ConversationSubagentState : null;
  }
  finishPluginConversationSession(pluginId: string, conversationId: string): boolean {
    const deleted = this.conversationSessions.delete(readConversationSessionKey(pluginId, conversationId));
    if (deleted) {this.persistConversations();}
    return deleted;
  }
  deletePluginConversationSessions(pluginId: string): number {
    let deleted = 0;
    for (const [key, session] of this.conversationSessions.entries()) {
      if (session.pluginId !== pluginId) {
        continue;
      }
      this.conversationSessions.delete(key);
      deleted += 1;
    }
    if (deleted > 0) {
      this.persistConversations();
    }
    return deleted;
  }
  readConversationSummary(conversationId: string, userId?: string): JsonValue { return readConversationRecordValue(this.requireConversation(conversationId, userId), 'summary'); }
  readRuntimePermissionApprovals(conversationId: string, userId?: string): string[] { return [...(this.requireConversation(conversationId, userId).runtimePermissionApprovals ?? [])]; }
  readConversationHistory(conversationId: string, userId?: string): JsonValue { return readConversationRecordValue(this.requireConversation(conversationId, userId), 'history'); }
  readCurrentMessageTarget(conversationId: string, userId?: string): JsonValue { const conversation = this.requireConversation(conversationId, userId); return { id: conversation.id, label: conversation.title, type: 'conversation' }; }
  updateConversationSubagent<T>(conversationId: string, mutate: (subagent: ConversationSubagentState | null, conversation: RuntimeConversationRecord) => { nextSubagent: ConversationSubagentState | null; result: T }, userId?: string): T {
    return this.updateConversationRecord(conversationId, userId, (conversation) => {
      const currentSubagent = conversation.subagent ? cloneJsonValue(conversation.subagent) as ConversationSubagentState : null;
      const mutated = mutate(currentSubagent, cloneJsonValue(conversation) as RuntimeConversationRecord);
      if (mutated.nextSubagent) {
        conversation.kind = 'subagent';
        conversation.subagent = cloneJsonValue(mutated.nextSubagent) as ConversationSubagentState;
      } else {
        delete conversation.subagent;
        conversation.kind = conversation.kind === 'subagent' ? 'main' : conversation.kind;
      }
      return mutated.result;
    });
  }

  keepConversationSession(pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const current = this.readConversationSession(pluginId, readConversationId(context));
    if (!current) {return null;}
    const timeoutMs = this.readSessionTimeoutMs(params), resetTimeout = readOptionalBoolean(params, 'resetTimeout') ?? true, baseTime = resetTimeout ? Date.now() : Date.parse(current.expiresAt);
    return this.saveConversationSession({ ...current, expiresAt: new Date(baseTime + timeoutMs).toISOString(), timeoutMs: resetTimeout ? timeoutMs : current.timeoutMs + timeoutMs });
  }

  startConversationSession(pluginId: string, context: PluginCallContext, params: JsonObject): JsonValue {
    const conversation = this.requireConversation(readConversationId(context)), startedAt = new Date().toISOString(), timeoutMs = this.readSessionTimeoutMs(params), captureHistory = readOptionalBoolean(params, 'captureHistory') ?? false, metadata = readJsonObject(params.metadata);
    return this.saveConversationSession({ captureHistory, conversationId: conversation.id, expiresAt: new Date(Date.parse(startedAt) + timeoutMs).toISOString(), historyMessages: captureHistory ? conversation.messages.map((message) => cloneJsonValue(message)) : [], lastMatchedAt: null, ...(metadata ? { metadata } : {}), pluginId, startedAt, timeoutMs });
  }

  previewConversationHistory(conversationId: string, params: JsonObject, userId?: string): JsonValue {
    const messages = params.messages === undefined
      ? this.requireConversation(conversationId, userId).messages.map((message) => cloneJsonValue(message))
      : readConversationHistoryMessages(params.messages);
    const visibleMessages = buildConversationVisibleModelMessages(
      messages as unknown as Parameters<typeof buildConversationVisibleModelMessages>[0],
    );
    const textBytes = Buffer.byteLength(readConversationVisiblePreviewText(visibleMessages), 'utf8');
    const preview = readConversationHistoryPreviewTokens(messages, {
      historySignature: createConversationHistorySignatureFromHistoryMessages(
        messages as unknown as Parameters<typeof createConversationHistorySignatureFromHistoryMessages>[0],
      ),
      modelId: typeof params.modelId === 'string' ? params.modelId : null,
      preferLatestProviderUsage: params.usagePreference === 'latest-provider',
      providerId: typeof params.providerId === 'string' ? params.providerId : null,
      textBytes,
    });
    return asJsonValue({ ...preview, messageCount: messages.length, textBytes });
  }

  replaceConversationHistory(conversationId: string, params: JsonObject, userId?: string): JsonValue {
    const expectedRevision = readRequiredConversationHistoryString(params, 'expectedRevision');
    const nextMessages = readConversationHistoryMessages(params.messages);
    const current = this.requireConversation(conversationId, userId);
    assertConversationRevision(current, expectedRevision);
    if (JSON.stringify(current.messages) === JSON.stringify(nextMessages)) {return asJsonValue({ ...(readConversationRecordValue(current, 'history') as JsonObject), changed: false });}
    const updated = this.updateConversationRecord(conversationId, userId, (conversation) => { conversation.messages = cloneJsonValue(nextMessages); return conversation; });
    return asJsonValue({ ...(readConversationRecordValue(updated, 'history') as JsonObject), changed: true });
  }

  rememberConversationActivePersona(conversationId: string, activePersonaId: string, userId?: string): void {
    this.updateConversationRecord(conversationId, userId, (conversation) => {
      conversation.activePersonaId = activePersonaId;
      return null;
    });
  }

  replaceMessages(conversationId: string, messages: JsonObject[], userId?: string): RuntimeConversationRecord {
    return this.updateConversationRecord(conversationId, userId, (conversation) => {
      conversation.messages = cloneJsonValue(messages);
      return conversation;
    });
  }

  requireConversation(conversationId: string, userId?: string): RuntimeConversationRecord {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {throw new NotFoundException(`Conversation not found: ${conversationId}`);}
    if (userId && conversation.userId !== userId) {throw new ForbiddenException('Not your conversation');}
    return conversation;
  }

  writeConversationTitle(conversationId: string, title: string, userId?: string): JsonValue { return readConversationRecordValue(this.updateConversationRecord(conversationId, userId, (conversation) => { conversation.title = title; return conversation; }), 'summary'); }

  rememberRuntimePermissionApproval(conversationId: string, approvalKey: string, userId?: string): string[] {
    return [...(this.updateConversationRecord(conversationId, userId, (conversation) => {
      const approvals = new Set(conversation.runtimePermissionApprovals ?? []); approvals.add(approvalKey); conversation.runtimePermissionApprovals = [...approvals].sort((left, right) => left.localeCompare(right));
      return conversation.runtimePermissionApprovals ?? [];
    }, { bumpRevision: false }) ?? [])];
  }

  private updateConversationRecord<T>(conversationId: string, userId: string | undefined, mutate: (conversation: RuntimeConversationRecord) => T, options?: { bumpRevision?: boolean }): T {
    const conversation = this.requireConversation(conversationId, userId);
    const result = mutate(conversation);
    if (options?.bumpRevision !== false) { conversation.updatedAt = new Date().toISOString(); conversation.revisionVersion += 1; conversation.revision = `${readRevisionSeed(conversation.revision)}:${conversation.revisionVersion}`; }
    this.persistConversations();
    return result;
  }

  private readConversationSession(pluginId: string, conversationId: string): RuntimeConversationSessionRecord | null {
    const key = readConversationSessionKey(pluginId, conversationId);
    const session = this.conversationSessions.get(key);
    if (!session) {return null;}
    if (Date.parse(session.expiresAt) > Date.now()) {return session;}
    this.conversationSessions.delete(key);
    this.persistConversations();
    return null;
  }

  private saveConversationSession(session: RuntimeConversationSessionRecord): JsonValue {
    this.conversationSessions.set(readConversationSessionKey(session.pluginId, session.conversationId), cloneJsonValue(session) as RuntimeConversationSessionRecord);
    this.persistConversations();
    return serializeConversationSession(session);
  }

  private readSessionTimeoutMs(params: JsonObject): number { const timeoutMs = readPositiveInteger(params, 'timeoutMs'); if (timeoutMs) {return timeoutMs;} throw new BadRequestException('timeoutMs 必须是正整数'); }

  private persistConversations(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const payload: RuntimeConversationStoragePayload = {
      conversations: Object.fromEntries([...this.conversations.entries()].map(([id, record]) => [id, cloneJsonValue(record)])),
    };
    if (this.conversationSessions.size > 0) {
      payload.pluginConversationSessions = Object.fromEntries([...this.conversationSessions.entries()].map(([key, session]) => [key, cloneJsonValue(session)]));
    }
    fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private readStoredConversations(): {
    migrated: boolean;
    records: Map<string, RuntimeConversationRecord>;
    sessions: Map<string, RuntimeConversationSessionRecord>;
  } {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {return { migrated: false, records: new Map(), sessions: new Map() };}
      const payload = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as RuntimeConversationStoragePayload;
      const entries = Object.entries(payload.conversations ?? {});
      const records = new Map(entries.flatMap(([id, record]) => isPersistedConversationRecordValid(id, record) ? [[id, cloneJsonValue(record)]] : []));
      const sessionEntries = Object.entries(payload.pluginConversationSessions ?? {});
      const sessions = new Map(sessionEntries.flatMap(([key, session]) => isPersistedConversationSessionRecordValid(key, session) ? [[key, cloneJsonValue(session)]] : []));
      const activeSessions = new Map([...sessions.entries()].filter(([, session]) => Date.parse(session.expiresAt) > Date.now()));
      return {
        migrated: records.size !== entries.length || sessions.size !== sessionEntries.length || activeSessions.size !== sessions.size,
        records,
        sessions: activeSessions,
      };
    } catch {
      return { migrated: false, records: new Map(), sessions: new Map() };
    }
  }

  private settleInterruptedMainConversationResponses(): boolean {
    let changed = false;
    const interruptedAt = new Date().toISOString();
    for (const conversation of this.conversations.values()) {
      if (conversation.kind === 'subagent') {
        continue;
      }
      let conversationChanged = false;
      for (const message of conversation.messages) {
        if (
          (message.role === 'assistant' || message.role === 'display')
          && (message.status === 'pending' || message.status === 'streaming')
        ) {
          message.status = 'stopped';
          message.error = '服务重启时中断了正在运行的回复';
          message.updatedAt = interruptedAt;
          conversationChanged = true;
        }
      }
      if (!conversationChanged) {
        continue;
      }
      conversation.updatedAt = interruptedAt;
      conversation.revisionVersion += 1;
      conversation.revision = `${readRevisionSeed(conversation.revision)}:${conversation.revisionVersion}`;
      changed = true;
    }
    return changed;
  }

  private pruneExpiredConversationSessions(): void {
    let changed = false;
    for (const [key, session] of this.conversationSessions.entries()) {
      if (Date.parse(session.expiresAt) <= Date.now()) {
        this.conversationSessions.delete(key);
        changed = true;
      }
    }
    if (changed) {this.persistConversations();}
  }

  private removeConversationSessions(conversationId: string): void {
    for (const [key, session] of this.conversationSessions.entries()) {
      if (session.conversationId === conversationId) {
        this.conversationSessions.delete(key);
      }
    }
  }

  private collectConversationTreeIds(conversationId: string, userId?: string): string[] {
    const ids: string[] = [];
    const queue = [conversationId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const currentConversationId = queue.shift();
      if (!currentConversationId || visited.has(currentConversationId)) {
        continue;
      }
      const conversation = this.requireConversation(currentConversationId, userId);
      visited.add(currentConversationId);
      ids.push(currentConversationId);
      for (const childConversation of this.conversations.values()) {
        if (childConversation.parentId === conversation.id) {
          queue.push(childConversation.id);
        }
      }
    }
    return ids;
  }

  private async broadcastConversationCreated(conversation: JsonObject, userId: string): Promise<void> {
    const kernel = this.pluginDispatch;
    if (!kernel) {return;}
    const context = { conversationId: String(conversation.id), source: 'http-route' as const, userId };
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'conversation:created', kernel })) { await kernel.invokeHook({ context, hookName: 'conversation:created', payload: asJsonValue({ context, conversation }), pluginId }); }
  }
}

function readConversationId(context: PluginCallContext): string { return requireContextField(context, 'conversationId'); }
function readRevisionSeed(revision: string): string { const lastSeparator = revision.lastIndexOf(':'); return lastSeparator > 0 ? revision.slice(0, lastSeparator) : revision; }
function readConversationSessionKey(pluginId: string, conversationId: string): string { return `${pluginId}:${conversationId}`; }
function assertConversationRevision(conversation: RuntimeConversationRecord, expectedRevision: string): void {
  if (conversation.revision !== expectedRevision) {throw new ConflictException(`Conversation revision mismatch: expected ${expectedRevision}, got ${conversation.revision}`);}
}

function readConversationRecordValue(conversation: RuntimeConversationRecord, view: RuntimeConversationRecordView): JsonValue {
  const summary = asJsonValue({
    createdAt: conversation.createdAt,
    id: conversation.id,
    ...(conversation.kind ? { kind: conversation.kind } : {}),
    ...(conversation.parentId ? { parentId: conversation.parentId } : {}),
    ...(conversation.subagent ? { subagent: cloneJsonValue(conversation.subagent) as unknown as JsonValue } : {}),
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  }) as JsonObject;
  if (view === 'history') {return { conversationId: conversation.id, revision: conversation.revision, messages: conversation.messages.map(serializeConversationHistoryMessage) };}
  if (view === 'summary') {return asJsonValue({ ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}), ...summary });}
  const counted = asJsonValue({ _count: { messages: conversation.messages.length }, ...summary }) as JsonObject;
  return view === 'overview' ? counted : asJsonValue({ ...counted, messages: conversation.messages.map(serializeConversationMessage) });
}

export function resolveConversationStoragePath(): string {
  if (process.env.GARLIC_CLAW_CONVERSATIONS_PATH) {return process.env.GARLIC_CLAW_CONVERSATIONS_PATH;}
  if (process.env.JEST_WORKER_ID) {return createServerTestArtifactPath({ extension: '.json', prefix: 'conversations.server.test', subdirectory: 'server' });}
  return resolveServerStatePath('conversations.server.json');
}

function serializeConversationSession(session: RuntimeConversationSessionRecord | null): JsonValue { return session ? { ...(session.metadata ? { metadata: cloneJsonValue(session.metadata) } : {}), captureHistory: session.captureHistory, conversationId: session.conversationId, expiresAt: session.expiresAt, historyMessages: session.historyMessages.map((message) => cloneJsonValue(message)), lastMatchedAt: session.lastMatchedAt, pluginId: session.pluginId, startedAt: session.startedAt, timeoutMs: session.timeoutMs } : null; }

export function serializeConversationMessage(message: JsonObject): JsonObject {
  return { content: typeof message.content === 'string' ? message.content : null, createdAt: String(message.createdAt), error: typeof message.error === 'string' ? message.error : null, id: String(message.id), metadataJson: typeof message.metadataJson === 'string' ? message.metadataJson : null, model: typeof message.model === 'string' ? message.model : null, partsJson: Array.isArray(message.parts) && message.parts.length > 0 ? JSON.stringify(message.parts) : null, provider: typeof message.provider === 'string' ? message.provider : null, role: String(message.role), status: message.status, toolCalls: Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? JSON.stringify(message.toolCalls) : null, toolResults: Array.isArray(message.toolResults) && message.toolResults.length > 0 ? JSON.stringify(message.toolResults) : null, updatedAt: String(message.updatedAt) };
}

function serializeConversationHistoryMessage(message: JsonObject): JsonObject {
  const metadata = readStoredConversationMetadata(message.metadataJson);
  return asJsonValue({ content: typeof message.content === 'string' ? message.content : null, createdAt: String(message.createdAt), ...(typeof message.error === 'string' ? { error: message.error } : {}), id: String(message.id), ...(metadata ? { metadata } : {}), ...(typeof message.model === 'string' ? { model: message.model } : {}), parts: Array.isArray(message.parts) ? cloneJsonValue(message.parts) : [], ...(typeof message.provider === 'string' ? { provider: message.provider } : {}), role: String(message.role), status: typeof message.status === 'string' ? message.status : 'completed', ...(Array.isArray(message.toolCalls) ? { toolCalls: cloneJsonValue(message.toolCalls) } : {}), ...(Array.isArray(message.toolResults) ? { toolResults: cloneJsonValue(message.toolResults) } : {}), updatedAt: String(message.updatedAt) }) as JsonObject;
}

function readConversationHistoryMessages(value: unknown): JsonObject[] { return readConversationHistoryArray(value, 'messages', normalizeConversationHistoryMessage); }

function normalizeConversationHistoryMessage(value: unknown, index: number): JsonObject {
  const label = readConversationHistoryLabel(index);
  const object = readConversationHistoryObject(value, label);
  const metadata = readConversationHistoryMetadata(object.metadata, index);
  const toolCalls = readOptionalConversationHistoryArray(object.toolCalls, `${label}.toolCalls`, (entry) => cloneJsonValue(entry) as JsonValue);
  const toolResults = readOptionalConversationHistoryArray(object.toolResults, `${label}.toolResults`, (entry) => cloneJsonValue(entry) as JsonValue);
  return { content: readOptionalConversationHistoryString(object.content, `${label}.content`) ?? '', createdAt: readConversationHistoryTimestamp(object.createdAt), ...(typeof object.error === 'string' ? { error: object.error } : {}), id: readRequiredConversationHistoryString(object, 'id', index), ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}), ...(typeof object.model === 'string' ? { model: object.model } : {}), parts: asJsonValue(readOptionalConversationHistoryArray(object.parts, `${label}.parts`, (entry, partIndex) => readConversationHistoryPart(entry, index, partIndex)) ?? []), ...(typeof object.provider === 'string' ? { provider: object.provider } : {}), role: readRequiredConversationHistoryString(object, 'role', index), status: readOptionalConversationHistoryStatus(object.status, `${label}.status`) ?? 'completed', ...(toolCalls ? { toolCalls: asJsonValue(toolCalls) } : {}), ...(toolResults ? { toolResults: asJsonValue(toolResults) } : {}), updatedAt: readConversationHistoryTimestamp(object.updatedAt) };
}

function readRequiredConversationHistoryString(params: JsonObject, key: string, index?: number): string {
  const label = index === undefined ? key : `${readConversationHistoryLabel(index)}.${key}`;
  return readConversationHistoryString(params[key], label, { required: true, trim: true }) as string;
}

function readOptionalConversationHistoryString(value: unknown, label: string): string | null { return readConversationHistoryString(value, label, { allowNull: true }); }

function readOptionalConversationHistoryStatus(value: unknown, label: string): string | null {
  if (value === undefined || value === null) {return null;}
  if (typeof value === 'string' && CONVERSATION_HISTORY_STATUSES.has(value)) {return value;}
  throw new BadRequestException(`${label} 不合法`);
}

function readConversationHistoryTimestamp(value: unknown): string { return typeof value === 'string' && value.trim() ? value : new Date().toISOString(); }

function readConversationHistoryObject(value: unknown, label: string): JsonObject {
  if (isPlainObject(value)) {return value as JsonObject;}
  throw new BadRequestException(`${label} 必须是对象`);
}

function readConversationHistoryArray<T>(value: unknown, label: string, readEntry: (entry: unknown, index: number) => T): T[] { if (!Array.isArray(value)) {throw new BadRequestException(`${label} 必须是数组`);} return value.map((entry, index) => readEntry(entry, index)); }

function readOptionalConversationHistoryArray<T>(value: unknown, label: string, readEntry: (entry: unknown, index: number) => T): T[] | null { if (value === undefined || value === null) {return null;} return readConversationHistoryArray(value, label, readEntry); }

function readConversationHistoryPart(value: unknown, messageIndex: number, partIndex: number): ChatMessagePart {
  const object = readConversationHistoryObject(value, `${readConversationHistoryLabel(messageIndex)}.parts[${partIndex}]`);
  if (object.type === 'text' && typeof object.text === 'string') {return { text: object.text, type: 'text' };}
  if (object.type === 'image' && typeof object.image === 'string') {
    return { image: object.image, ...(typeof object.mimeType === 'string' ? { mimeType: object.mimeType } : {}), type: 'image' };
  }
  throw new BadRequestException(`${readConversationHistoryLabel(messageIndex)}.parts[${partIndex}] 不合法`);
}

function readConversationHistoryMetadata(value: unknown, index: number): ChatMessageMetadata | null {
  if (value === undefined || value === null) {return null;}
  const object = readConversationHistoryObject(value, `${readConversationHistoryLabel(index)}.metadata`);
  const metadata: ChatMessageMetadata = { ...(object.visionFallback !== undefined ? { visionFallback: readConversationHistoryVisionFallback(object.visionFallback, index) } : {}), ...(object.customBlocks !== undefined ? { customBlocks: readConversationHistoryCustomBlocks(object.customBlocks, index) } : {}), ...(object.annotations !== undefined ? { annotations: readConversationHistoryAnnotations(object.annotations, index) } : {}) };
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function readConversationHistoryVisionFallback(value: unknown, index: number): NonNullable<ChatMessageMetadata['visionFallback']> {
  const label = `${readConversationHistoryLabel(index)}.metadata.visionFallback`;
  const object = readConversationHistoryObject(value, label);
  if ((object.state !== 'completed' && object.state !== 'transcribing') || !Array.isArray(object.entries)) {throw new BadRequestException(`${label} 不合法`);}
  return { entries: object.entries.map((entry, entryIndex) => { const item = readConversationHistoryObject(entry, `${label}.entries[${entryIndex}]`); if (typeof item.text !== 'string' || (item.source !== 'cache' && item.source !== 'generated')) {throw new BadRequestException(`${label}.entries[${entryIndex}] 不合法`);} return { source: item.source, text: item.text }; }), state: object.state };
}

function readConversationHistoryCustomBlocks(value: unknown, index: number): NonNullable<ChatMessageMetadata['customBlocks']> {
  const label = `${readConversationHistoryLabel(index)}.metadata.customBlocks`;
  return readConversationHistoryArray(value, label, (entry, blockIndex) => {
    const object = readConversationHistoryObject(entry, `${label}[${blockIndex}]`);
    if (typeof object.id !== 'string' || typeof object.title !== 'string') {throw new BadRequestException(`${label}[${blockIndex}] 不合法`);}
    const source = readConversationHistorySource(object.source);
    const state = object.state === 'done' || object.state === 'streaming' ? object.state : undefined;
    if (object.kind === 'text' && typeof object.text === 'string') {return { id: object.id, kind: 'text' as const, ...(source ? { source } : {}), ...(state ? { state } : {}), text: object.text, title: object.title };}
    const data = sanitizeHistoryJsonValue(object.data);
    if (object.kind === 'json' && data !== undefined) {return { data, id: object.id, kind: 'json' as const, ...(source ? { source } : {}), ...(state ? { state } : {}), title: object.title };}
    throw new BadRequestException(`${label}[${blockIndex}] 不合法`);
  });
}

function readConversationHistorySource(value: unknown): { key?: string; origin?: string; providerId?: string } | null {
  const object = isPlainObject(value) ? value : null;
  if (!object) {return null;}
  const sanitized = sanitizeHistoryJsonObject(object);
  return Object.keys(sanitized).length > 0
    ? sanitized as { key?: string; origin?: string; providerId?: string }
    : null;
}

function readConversationHistoryAnnotations(value: unknown, index: number): NonNullable<ChatMessageMetadata['annotations']> {
  const label = `${readConversationHistoryLabel(index)}.metadata.annotations`;
  return readConversationHistoryArray(value, label, (entry, annotationIndex) => {
    const object = readConversationHistoryObject(entry, `${label}[${annotationIndex}]`);
    if (typeof object.type !== 'string' || typeof object.owner !== 'string' || typeof object.version !== 'string') {throw new BadRequestException(`${label}[${annotationIndex}] 不合法`);}
    const data = sanitizeHistoryJsonValue(object.data);
    return { ...(data !== undefined ? { data } : {}), owner: object.owner, type: object.type, version: object.version };
  });
}

function readConversationHistoryLabel(index: number): string { return `history.messages[${index}]`; }

function readConversationHistoryString(value: unknown, label: string, options?: { allowNull?: boolean; required?: boolean; trim?: boolean }): string | null {
  if (value === undefined || value === null) { if (options?.required) {throw new BadRequestException(`${label} 不能为空`);} return null; }
  if (typeof value !== 'string') {throw new BadRequestException(`${label} 必须是字符串${options?.allowNull ? '或 null' : ''}`);}
  const nextValue = options?.trim ? value.trim() : value;
  if (!nextValue && options?.required) {throw new BadRequestException(`${label} 不能为空`);}
  return options?.trim && !nextValue ? null : nextValue;
}

function readStoredConversationMetadata(value: unknown): ChatMessageMetadata | null {
  if (typeof value !== 'string' || !value.trim()) {return null;}
  try { return JSON.parse(value) as ChatMessageMetadata; } catch { return null; }
}

function readConversationHistoryPreviewTokens(messages: JsonObject[], input: { historySignature: string; modelId: string | null; preferLatestProviderUsage?: boolean; providerId: string | null; textBytes: number }): { estimatedTokens: number; source: 'estimated' | 'provider' } {
  if (input.preferLatestProviderUsage) {
    const latestProviderUsage = readLatestConversationHistoryProviderUsage(messages, input);
    if (latestProviderUsage) {
      return { estimatedTokens: latestProviderUsage.totalTokens, source: 'provider' };
    }
  }
  if (input.modelId && input.providerId) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const usage = readConversationModelUsageAnnotation(
        readConversationHistoryPreviewMetadata(messages[index], index) ?? undefined,
        { modelId: input.modelId, providerId: input.providerId },
      );
      if (usage?.source !== 'provider') {
        continue;
      }
      if (usage.responseHistorySignature === input.historySignature) {
        return { estimatedTokens: usage.totalTokens, source: 'provider' };
      }
    }
  }
  return { estimatedTokens: Math.ceil(input.textBytes / 4), source: 'estimated' };
}

function readLatestConversationHistoryProviderUsage(
  messages: JsonObject[],
  input: { modelId: string | null; providerId: string | null },
): { totalTokens: number } | null {
  const target = input.modelId && input.providerId
    ? { modelId: input.modelId, providerId: input.providerId }
    : undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const usage = readLatestConversationModelUsageAnnotation(
      readConversationHistoryPreviewMetadata(messages[index], index) ?? undefined,
      target,
    );
    if (usage?.source === 'provider') {
      return usage;
    }
  }
  if (!target) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const usage = readLatestConversationModelUsageAnnotation(
      readConversationHistoryPreviewMetadata(messages[index], index) ?? undefined,
    );
    if (usage?.source === 'provider') {
      return usage;
    }
  }
  return null;
}

function readConversationHistoryPreviewMetadata(message: JsonObject | undefined, index: number): ChatMessageMetadata | null { return message ? (readConversationHistoryMetadata(message.metadata, index) ?? readStoredConversationMetadata(message.metadataJson)) : null; }
function sanitizeHistoryJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const sanitized = sanitizeHistoryJsonValue(entry);
    return sanitized === undefined ? [] : [[key, sanitized] as const];
  })) as JsonObject;
}

function sanitizeHistoryJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {return value;}
  if (typeof value === 'number') {return Number.isFinite(value) ? value : undefined;}
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const sanitized = sanitizeHistoryJsonValue(entry);
      return sanitized === undefined ? [] : [sanitized];
    });
  }
  if (isPlainObject(value)) {
    return sanitizeHistoryJsonObject(value);
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPersistedConversationRecordValid(id: string, record: RuntimeConversationRecord): boolean {
  return record.userId === SINGLE_USER_ID
    && record.id === id
    && isUuidV7Text(record.id)
    && (record.parentId === undefined || isUuidV7Text(record.parentId))
    && (record.kind === undefined || record.kind === 'main' || record.kind === 'subagent')
    && (record.subagent === undefined || isConversationSubagentStateValid(record.subagent))
    && record.messages.every(isPersistedConversationMessageValid);
}

function isPersistedConversationMessageValid(message: JsonObject): boolean {
  return typeof message.id === 'string' && isUuidV7Text(message.id);
}

function isPersistedConversationSessionRecordValid(key: string, session: RuntimeConversationSessionRecord): boolean {
  return key === readConversationSessionKey(session.pluginId, session.conversationId)
    && typeof session.pluginId === 'string'
    && typeof session.conversationId === 'string'
    && typeof session.startedAt === 'string'
    && typeof session.expiresAt === 'string'
    && typeof session.timeoutMs === 'number'
    && typeof session.captureHistory === 'boolean'
    && (session.lastMatchedAt === null || typeof session.lastMatchedAt === 'string')
    && Array.isArray(session.historyMessages)
    && session.historyMessages.every((message) => typeof message === 'object' && message !== null && !Array.isArray(message));
}

function isUuidV7Text(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isConversationSubagentStateValid(value: ConversationSubagentState): boolean {
  return typeof value.pluginId === 'string'
    && typeof value.runtimeKind === 'string'
    && typeof value.requestPreview === 'string'
    && typeof value.requestedAt === 'string'
    && (value.startedAt === null || typeof value.startedAt === 'string')
    && (value.finishedAt === null || typeof value.finishedAt === 'string')
    && (value.closedAt === null || typeof value.closedAt === 'string')
    && typeof value.status === 'string';
}
