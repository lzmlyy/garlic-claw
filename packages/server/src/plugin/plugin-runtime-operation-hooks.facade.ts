import type {
  AutomationAfterRunHookPayload,
  AutomationBeforeRunHookPayload,
  PluginCallContext,
  PluginHookName,
  ResponseBeforeSendHookPayload,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookPayload,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { listDispatchableHookRecords } from './plugin-runtime-dispatch.helpers';
import {
  applyAutomationAfterRunMutation,
  applyAutomationBeforeRunMutation,
  applyResponseBeforeSendMutation,
  applyToolAfterCallMutation,
  applyToolBeforeCallMutation,
} from './plugin-runtime-hook-mutation.helpers';
import {
  runMutatingHookChain,
  runShortCircuitingHookChain,
} from './plugin-runtime-hook-runner.helpers';
import {
  normalizeAutomationAfterRunHookResult,
  normalizeAutomationBeforeRunHookResult,
  normalizeResponseBeforeSendHookResult,
  normalizeToolAfterCallHookResult,
  normalizeToolBeforeCallHookResult,
} from './plugin-runtime-hook-result.helpers';
import {
  cloneAutomationAfterRunPayload,
  cloneAutomationBeforeRunPayload,
  cloneJsonValueArray,
  cloneResponseBeforeSendHookPayload,
  cloneToolAfterCallHookPayload,
  cloneToolBeforeCallHookPayload,
} from './plugin-runtime-clone.helpers';

@Injectable()
export class PluginRuntimeOperationHooksFacade {
  runAutomationBeforeRunHooks(input: {
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
    payload: AutomationBeforeRunHookPayload;
    invokeHook: (input: {
      pluginId: string;
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    }) => Promise<JsonValue | null | undefined>;
  }) {
    return runShortCircuitingHookChain({
      records: listDispatchableHookRecords({
        records: input.records,
        hookName: 'automation:before-run',
        context: input.context,
      }),
      hookName: 'automation:before-run',
      context: input.context,
      payload: cloneAutomationBeforeRunPayload(input.payload),
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeAutomationBeforeRunHookResult,
      applyMutation: applyAutomationBeforeRunMutation,
      buildShortCircuitReturn: ({ result }) => ({
        action: 'short-circuit' as const,
        status: result.status,
        results: cloneJsonValueArray(result.results),
      }),
    });
  }

  runAutomationAfterRunHooks(input: {
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
    payload: AutomationAfterRunHookPayload;
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
        hookName: 'automation:after-run',
        context: input.context,
      }),
      hookName: 'automation:after-run',
      context: input.context,
      payload: cloneAutomationAfterRunPayload(input.payload),
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeAutomationAfterRunHookResult,
      applyMutation: applyAutomationAfterRunMutation,
    });
  }

  runToolBeforeCallHooks(input: {
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
    payload: ToolBeforeCallHookPayload;
    invokeHook: (input: {
      pluginId: string;
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    }) => Promise<JsonValue | null | undefined>;
  }) {
    return runShortCircuitingHookChain({
      records: listDispatchableHookRecords({
        records: input.records,
        hookName: 'tool:before-call',
        context: input.context,
      }),
      hookName: 'tool:before-call',
      context: input.context,
      payload: cloneToolBeforeCallHookPayload(input.payload),
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeToolBeforeCallHookResult,
      applyMutation: applyToolBeforeCallMutation,
      buildShortCircuitReturn: ({ result }) => ({
        action: 'short-circuit' as const,
        output: toJsonValue(result.output),
      }),
    });
  }

  runToolAfterCallHooks(input: {
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
    payload: ToolAfterCallHookPayload;
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
        hookName: 'tool:after-call',
        context: input.context,
      }),
      hookName: 'tool:after-call',
      context: input.context,
      payload: cloneToolAfterCallHookPayload(input.payload),
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeToolAfterCallHookResult,
      applyMutation: applyToolAfterCallMutation,
    });
  }

  runResponseBeforeSendHooks(input: {
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
    payload: ResponseBeforeSendHookPayload;
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
        hookName: 'response:before-send',
        context: input.context,
      }),
      hookName: 'response:before-send',
      context: input.context,
      payload: cloneResponseBeforeSendHookPayload(input.payload),
      invokeHook: (hookInput) => input.invokeHook(hookInput),
      normalizeResult: normalizeResponseBeforeSendHookResult,
      applyMutation: applyResponseBeforeSendMutation,
    });
  }
}
