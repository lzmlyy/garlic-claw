import type {
  ChatAfterModelHookPayload,
  MessageCreatedHookPayload,
  MessageUpdatedHookPayload,
  PluginCallContext,
  PluginHookName,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { JsonValue } from '../common/types/json-value';
import { listDispatchableHookRecords } from './plugin-runtime-dispatch.helpers';
import {
  applyChatAfterModelMutation,
  applyMessageCreatedMutation,
  applyMessageUpdatedMutation,
} from './plugin-runtime-hook-mutation.helpers';
import { runMutatingHookChain } from './plugin-runtime-hook-runner.helpers';
import {
  normalizeChatAfterModelHookResult,
  normalizeMessageCreatedHookResult,
  normalizeMessageUpdatedHookResult,
} from './plugin-runtime-hook-result.helpers';
import {
  cloneChatAfterModelPayload,
  cloneMessageCreatedHookPayload,
  cloneMessageUpdatedHookPayload,
} from './plugin-runtime-clone.helpers';

@Injectable()
export class PluginRuntimeMessageHooksFacade {
  runChatAfterModelHooks(input: {
    records: Iterable<{
      manifest: import('@garlic-claw/shared').PluginManifest;
      governance: {
        scope: {
          defaultEnabled: boolean;
          conversations: Record<string, boolean>;
        };
      };
    }>;
    context: PluginCallContext;
    payload: ChatAfterModelHookPayload;
    invokeHook: (input: {
      pluginId: string;
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    }) => Promise<JsonValue | null | undefined>;
  }) {
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: input.records,
        hookName: 'chat:after-model',
        context: input.context,
      }),
      hookName: 'chat:after-model',
      context: input.context,
      payload: cloneChatAfterModelPayload(input.payload),
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeChatAfterModelHookResult,
      applyMutation: applyChatAfterModelMutation,
    });
  }

  runMessageCreatedHooks(input: {
    records: Iterable<{
      manifest: import('@garlic-claw/shared').PluginManifest;
      governance: {
        scope: {
          defaultEnabled: boolean;
          conversations: Record<string, boolean>;
        };
      };
    }>;
    context: PluginCallContext;
    payload: MessageCreatedHookPayload;
    invokeHook: (input: {
      pluginId: string;
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    }) => Promise<JsonValue | null | undefined>;
  }) {
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: input.records,
        hookName: 'message:created',
        context: input.context,
      }),
      hookName: 'message:created',
      context: input.context,
      payload: cloneMessageCreatedHookPayload(input.payload),
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeMessageCreatedHookResult,
      applyMutation: applyMessageCreatedMutation,
    });
  }

  runMessageUpdatedHooks(input: {
    records: Iterable<{
      manifest: import('@garlic-claw/shared').PluginManifest;
      governance: {
        scope: {
          defaultEnabled: boolean;
          conversations: Record<string, boolean>;
        };
      };
    }>;
    context: PluginCallContext;
    payload: MessageUpdatedHookPayload;
    invokeHook: (input: {
      pluginId: string;
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    }) => Promise<JsonValue | null | undefined>;
  }) {
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: input.records,
        hookName: 'message:updated',
        context: input.context,
      }),
      hookName: 'message:updated',
      context: input.context,
      payload: cloneMessageUpdatedHookPayload(input.payload),
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeMessageUpdatedHookResult,
      applyMutation: applyMessageUpdatedMutation,
    });
  }
}
