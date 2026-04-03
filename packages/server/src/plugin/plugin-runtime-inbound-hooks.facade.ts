import {
  applyChatBeforeModelHookResult,
  applyChatBeforeModelMutation,
  applyMessageReceivedHookResult,
  applyMessageReceivedMutation,
  cloneChatBeforeModelRequest,
  cloneMessageReceivedHookPayload,
} from '@garlic-claw/shared';
import type {
  ChatBeforeModelHookPayload,
  MessageReceivedHookPayload,
  PluginCallContext,
  PluginManifest,
  PluginHookName,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { listDispatchableHookRecords } from './plugin-runtime-dispatch.helpers';
import { runShortCircuitingHookChain } from './plugin-runtime-hook-runner.helpers';
import {
  normalizeChatBeforeModelHookResult,
  normalizeMessageReceivedHookResult,
} from './plugin-runtime-hook-result.helpers';
import {
  prepareDispatchableConversationSessionMessageReceivedHook,
  syncConversationSessionMessageReceivedPayload,
  type ConversationSessionRecord,
} from './plugin-runtime-session.helpers';

type RuntimeInboundHookRecord = {
  manifest: PluginManifest;
  governance: {
    scope: {
      defaultEnabled: boolean;
      conversations: Record<string, boolean>;
    };
  };
};

type InvokeRuntimeInboundHook = (input: {
  pluginId: string;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: JsonValue;
}) => Promise<JsonValue | null | undefined>;

type RuntimeInboundHookInput<TPayload> = {
  records: Iterable<RuntimeInboundHookRecord>;
  context: PluginCallContext;
  payload: TPayload;
  invokeHook: InvokeRuntimeInboundHook;
};

@Injectable()
export class PluginRuntimeInboundHooksFacade {
  async runChatBeforeModelHooks(
    input: RuntimeInboundHookInput<ChatBeforeModelHookPayload>,
  ) {
    const result = await runShortCircuitingHookChain({
      records: listDispatchableHookRecords({
        records: input.records,
        hookName: 'chat:before-model',
        context: input.context,
      }),
      hookName: 'chat:before-model',
      context: input.context,
      payload: {
        context: {
          ...input.payload.context,
        },
        request: cloneChatBeforeModelRequest(input.payload.request),
      },
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeChatBeforeModelHookResult,
      applyMutation: (payload, mutation) => ({
        context: {
          ...payload.context,
        },
        request: applyChatBeforeModelMutation(payload.request, mutation),
      }),
      buildShortCircuitReturn: ({ payload, result: hookResult }) => {
        const executionResult = applyChatBeforeModelHookResult({
          request: payload.request,
          result: hookResult,
        });
        if (executionResult.action !== 'short-circuit') {
          throw new Error('chat:before-model short-circuit result normalization failed');
        }

        return executionResult;
      },
    });

    return result.action === 'short-circuit'
      ? result
      : {
          action: 'continue' as const,
          request: result.payload.request,
        };
  }

  async runMessageReceivedHooks(input: {
    records: ReadonlyMap<string, RuntimeInboundHookRecord>;
    conversationSessions: Map<string, ConversationSessionRecord>;
    context: PluginCallContext;
    payload: MessageReceivedHookPayload;
    invokeHook: InvokeRuntimeInboundHook;
  }) {
    const payload = cloneMessageReceivedHookPayload(input.payload);
    const sessionResult = await this.runConversationSessionMessageReceivedHook({
      records: input.records,
      conversationSessions: input.conversationSessions,
      context: input.context,
      payload,
      invokeHook: input.invokeHook,
    });
    if (sessionResult) {
      return sessionResult;
    }

    return runShortCircuitingHookChain({
      records: listDispatchableHookRecords({
        records: input.records.values(),
        hookName: 'message:received',
        context: input.context,
        payload,
      }),
      hookName: 'message:received',
      context: input.context,
      payload,
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeMessageReceivedHookResult,
      applyMutation: applyMessageReceivedMutation,
      buildShortCircuitReturn: ({ payload: currentPayload, result: hookResult }) => {
        const executionResult = applyMessageReceivedHookResult({
          payload: currentPayload,
          result: hookResult,
        });
        if (executionResult.action !== 'short-circuit') {
          throw new Error('message:received short-circuit result normalization failed');
        }

        return executionResult;
      },
    });
  }

  private async runConversationSessionMessageReceivedHook(input: {
    records: ReadonlyMap<string, RuntimeInboundHookRecord>;
    conversationSessions: Map<string, ConversationSessionRecord>;
    context: PluginCallContext;
    payload: MessageReceivedHookPayload;
    invokeHook: InvokeRuntimeInboundHook;
  }) {
    const prepared = prepareDispatchableConversationSessionMessageReceivedHook({
      sessions: input.conversationSessions,
      records: input.records,
      context: input.context,
      payload: input.payload,
      now: Date.now(),
    });
    if (!prepared) {
      return null;
    }
    const { session, record: ownerRecord } = prepared;

    let { payload } = prepared;

    try {
      const rawResult = await input.invokeHook({
        pluginId: ownerRecord.manifest.id,
        hookName: 'message:received',
        context: input.context,
        payload: toJsonValue(payload),
      });
      const hookResult = normalizeMessageReceivedHookResult(rawResult);
      const executionResult = applyMessageReceivedHookResult({
        payload,
        result: hookResult,
      });
      payload = syncConversationSessionMessageReceivedPayload({
        sessions: input.conversationSessions,
        session,
        payload: executionResult.payload,
        now: Date.now(),
      });
      return executionResult.action === 'short-circuit'
        ? {
            ...executionResult,
            payload,
          }
        : {
            action: 'continue' as const,
            payload,
          };
    } catch {
      input.conversationSessions.delete(session.conversationId);
      return null;
    }
  }
}
