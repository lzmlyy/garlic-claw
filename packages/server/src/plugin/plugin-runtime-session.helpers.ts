import {
  cloneMessageHookInfo,
  cloneMessageReceivedHookPayload,
} from '@garlic-claw/shared';
import type {
  MessageReceivedHookPayload,
  PluginCallContext,
  PluginConversationSessionInfo,
  PluginHookName,
  PluginMessageHookInfo,
  PluginManifest,
} from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import type { PluginGovernanceSnapshot } from './plugin.service';
import { isRuntimeRecordEnabledForContext } from './plugin-runtime-dispatch.helpers';
import { requireRuntimeConversationId } from './plugin-runtime-input.helpers';
import { findManifestHookDescriptor } from './plugin-runtime-manifest.helpers';

export interface ConversationSessionRecord {
  pluginId: string;
  conversationId: string;
  startedAt: number;
  expiresAt: number;
  lastMatchedAt: number | null;
  captureHistory: boolean;
  historyMessages: PluginMessageHookInfo[];
  metadata?: JsonValue;
}

type ConversationSessionDispatchRecord = {
  manifest: PluginManifest;
  governance: Pick<PluginGovernanceSnapshot, 'scope'>;
};

export function createConversationSessionRecord(input: {
  pluginId: string;
  conversationId: string;
  timeoutMs: number;
  captureHistory: boolean;
  metadata?: JsonValue;
  now: number;
}): ConversationSessionRecord {
  return {
    pluginId: input.pluginId,
    conversationId: input.conversationId,
    startedAt: input.now,
    expiresAt: input.now + input.timeoutMs,
    lastMatchedAt: null,
    captureHistory: input.captureHistory,
    historyMessages: [],
    ...(typeof input.metadata !== 'undefined'
      ? { metadata: toJsonValue(input.metadata) }
      : {}),
  };
}

export function getActiveConversationSession(
  sessions: Map<string, ConversationSessionRecord>,
  conversationId: string | undefined,
  now: number,
): ConversationSessionRecord | null {
  if (!conversationId) {
    return null;
  }

  const session = sessions.get(conversationId);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= now) {
    sessions.delete(conversationId);
    return null;
  }

  return session;
}

export function getOwnedConversationSession(
  sessions: Map<string, ConversationSessionRecord>,
  pluginId: string,
  conversationId: string,
  now: number,
): ConversationSessionRecord | null {
  const session = getActiveConversationSession(sessions, conversationId, now);
  if (!session || session.pluginId !== pluginId) {
    return null;
  }

  return session;
}

export function getActiveConversationSessionInfo(
  sessions: Map<string, ConversationSessionRecord>,
  conversationId: string | undefined,
  now: number,
): PluginConversationSessionInfo | null {
  const session = getActiveConversationSession(sessions, conversationId, now);
  return session ? toConversationSessionInfo(session, now) : null;
}

export function getDispatchableConversationSessionRecord<
  T extends ConversationSessionDispatchRecord,
>(input: {
  sessions: Map<string, ConversationSessionRecord>;
  records: ReadonlyMap<string, T>;
  conversationId: string | undefined;
  context: PluginCallContext;
  hookName: PluginHookName;
  now: number;
}): { session: ConversationSessionRecord; record: T } | null {
  const session = getActiveConversationSession(
    input.sessions,
    input.conversationId,
    input.now,
  );
  if (!session) {
    return null;
  }

  const record = input.records.get(session.pluginId);
  if (
    !record
    || !isRuntimeRecordEnabledForContext(record, input.context)
    || !findManifestHookDescriptor(record.manifest, input.hookName)
  ) {
    input.sessions.delete(session.conversationId);
    return null;
  }

  return {
    session,
    record,
  };
}

export function prepareDispatchableConversationSessionMessageReceivedHook<
  T extends ConversationSessionDispatchRecord,
>(input: {
  sessions: Map<string, ConversationSessionRecord>;
  records: ReadonlyMap<string, T>;
  context: PluginCallContext;
  payload: MessageReceivedHookPayload;
  now: number;
}): { session: ConversationSessionRecord; record: T; payload: MessageReceivedHookPayload } | null {
  const matched = getDispatchableConversationSessionRecord({
    sessions: input.sessions,
    records: input.records,
    conversationId: input.payload.conversationId,
    context: input.context,
    hookName: 'message:received',
    now: input.now,
  });
  if (!matched) {
    return null;
  }

  return {
    ...matched,
    payload: createConversationSessionMessageReceivedPayload({
      session: matched.session,
      payload: input.payload,
      now: input.now,
    }),
  };
}

export function extendConversationSession(
  session: ConversationSessionRecord,
  input: {
    timeoutMs: number;
    resetTimeout: boolean;
    now: number;
  },
): ConversationSessionRecord {
  session.expiresAt = input.resetTimeout
    ? input.now + input.timeoutMs
    : session.expiresAt + input.timeoutMs;
  return session;
}

export function finishOwnedConversationSession(
  sessions: Map<string, ConversationSessionRecord>,
  pluginId: string,
  conversationId: string,
  now = Date.now(),
): boolean {
  const session = getOwnedConversationSession(sessions, pluginId, conversationId, now);
  if (!session) {
    return false;
  }

  sessions.delete(conversationId);
  return true;
}

export function toConversationSessionInfo(
  session: ConversationSessionRecord,
  now: number,
): PluginConversationSessionInfo {
  return {
    pluginId: session.pluginId,
    conversationId: session.conversationId,
    timeoutMs: Math.max(0, session.expiresAt - now),
    startedAt: new Date(session.startedAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    lastMatchedAt: session.lastMatchedAt
      ? new Date(session.lastMatchedAt).toISOString()
      : null,
    captureHistory: session.captureHistory,
    historyMessages: session.historyMessages.map((message) => cloneMessageHookInfo(message)),
    ...(typeof session.metadata !== 'undefined'
      ? { metadata: toJsonValue(session.metadata) }
      : {}),
  };
}

export function recordConversationSessionMessage(
  session: ConversationSessionRecord,
  message: PluginMessageHookInfo,
  now: number,
): PluginConversationSessionInfo {
  session.lastMatchedAt = now;
  if (session.captureHistory) {
    session.historyMessages.push(cloneMessageHookInfo(message));
  }

  return toConversationSessionInfo(session, now);
}

export function createConversationSessionMessageReceivedPayload(input: {
  session: ConversationSessionRecord;
  payload: MessageReceivedHookPayload;
  now: number;
}): MessageReceivedHookPayload {
  const payload = cloneMessageReceivedHookPayload(input.payload);
  payload.session = recordConversationSessionMessage(
    input.session,
    payload.message,
    input.now,
  );
  return payload;
}

export function syncConversationSessionMessageReceivedPayload(input: {
  sessions: Map<string, ConversationSessionRecord>;
  session: ConversationSessionRecord;
  payload: MessageReceivedHookPayload;
  now: number;
}): MessageReceivedHookPayload {
  return {
    ...input.payload,
    session:
      getActiveConversationSessionInfo(
        input.sessions,
        input.session.conversationId,
        input.now,
      ) ?? input.payload.session,
  };
}

export function startConversationSessionForRuntime(input: {
  sessions: Map<string, ConversationSessionRecord>;
  pluginId: string;
  context: PluginCallContext;
  method: string;
  timeoutMs: number;
  captureHistory: boolean;
  metadata?: JsonValue;
  now: number;
}): PluginConversationSessionInfo {
  const conversationId = requireRuntimeConversationId(input.context, input.method);
  const record = createConversationSessionRecord({
    pluginId: input.pluginId,
    conversationId,
    timeoutMs: input.timeoutMs,
    captureHistory: input.captureHistory,
    ...(typeof input.metadata !== 'undefined'
      ? { metadata: toJsonValue(input.metadata) }
      : {}),
    now: input.now,
  });
  input.sessions.set(conversationId, record);
  return toConversationSessionInfo(record, input.now);
}

export function getConversationSessionInfoForRuntime(input: {
  sessions: Map<string, ConversationSessionRecord>;
  pluginId: string;
  context: PluginCallContext;
  method: string;
  now: number;
}): PluginConversationSessionInfo | null {
  const conversationId = requireRuntimeConversationId(input.context, input.method);
  const session = getOwnedConversationSession(
    input.sessions,
    input.pluginId,
    conversationId,
    input.now,
  );
  return session ? toConversationSessionInfo(session, input.now) : null;
}

export function keepConversationSessionForRuntime(input: {
  sessions: Map<string, ConversationSessionRecord>;
  pluginId: string;
  context: PluginCallContext;
  method: string;
  timeoutMs: number;
  resetTimeout: boolean;
  now: number;
}): PluginConversationSessionInfo | null {
  const conversationId = requireRuntimeConversationId(input.context, input.method);
  const session = getOwnedConversationSession(
    input.sessions,
    input.pluginId,
    conversationId,
    input.now,
  );
  if (!session) {
    return null;
  }

  extendConversationSession(session, {
    timeoutMs: input.timeoutMs,
    resetTimeout: input.resetTimeout,
    now: input.now,
  });
  return toConversationSessionInfo(session, input.now);
}

export function finishConversationSessionForRuntime(input: {
  sessions: Map<string, ConversationSessionRecord>;
  pluginId: string;
  context: PluginCallContext;
  method: string;
  now?: number;
}): boolean {
  const conversationId = requireRuntimeConversationId(input.context, input.method);
  return finishOwnedConversationSession(
    input.sessions,
    input.pluginId,
    conversationId,
    input.now,
  );
}

export function listActiveConversationSessionInfos(
  sessions: Map<string, ConversationSessionRecord>,
  pluginId: string | undefined,
  now: number,
): PluginConversationSessionInfo[] {
  const infos: PluginConversationSessionInfo[] = [];
  for (const conversationId of sessions.keys()) {
    const session = getActiveConversationSession(sessions, conversationId, now);
    if (!session) {
      continue;
    }
    if (pluginId && session.pluginId !== pluginId) {
      continue;
    }

    infos.push(toConversationSessionInfo(session, now));
  }

  return infos.sort((left, right) => left.expiresAt.localeCompare(right.expiresAt));
}
