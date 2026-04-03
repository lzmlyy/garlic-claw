import {
  applyChatAfterModelMutation,
  applyMessageCreatedMutation,
  applyMessageUpdatedMutation,
  cloneChatAfterModelPayload,
  cloneMessageCreatedHookPayload,
  cloneMessageUpdatedHookPayload,
} from '@garlic-claw/shared';
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
import { runMutatingHookChain } from './plugin-runtime-hook-runner.helpers';
import {
  normalizeChatAfterModelHookResult,
  normalizeMessageCreatedHookResult,
  normalizeMessageUpdatedHookResult,
} from './plugin-runtime-hook-result.helpers';

type DispatchableMessageHookRecord = {
  manifest: import('@garlic-claw/shared').PluginManifest;
  governance: {
    scope: {
      defaultEnabled: boolean;
      conversations: Record<string, boolean>;
    };
  };
};

type InvokeMessageHook = (input: {
  pluginId: string;
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: JsonValue;
}) => Promise<JsonValue | null | undefined>;

type MessageHookInput<TPayload> = {
  records: Iterable<DispatchableMessageHookRecord>;
  context: PluginCallContext;
  payload: TPayload;
  invokeHook: InvokeMessageHook;
};

@Injectable()
export class PluginRuntimeMessageHooksFacade {
  runChatAfterModelHooks(input: MessageHookInput<ChatAfterModelHookPayload>) {
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

  runMessageCreatedHooks(input: MessageHookInput<MessageCreatedHookPayload>) {
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

  runMessageUpdatedHooks(input: MessageHookInput<MessageUpdatedHookPayload>) {
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
