import type {
  PluginCallContext,
  PluginErrorHookPayload,
  PluginHookName,
  PluginManifest,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginRuntimeKind,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookPayload,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { assertRuntimeRecordEnabled, getRuntimeRecordOrThrow } from './plugin-runtime-dispatch.helpers';
import { recordRuntimePluginFailureAndDispatch } from './plugin-runtime-failure.helpers';
import {
  isPluginOverloadedError,
  runWithRuntimeExecutionSlot,
} from './plugin-runtime-record.helpers';
import {
  findManifestRouteOrThrow,
  findManifestToolOrThrow,
} from './plugin-runtime-manifest.helpers';
import { runPromiseWithTimeout } from './plugin-runtime-timeout.helpers';
import { readRuntimeTimeoutMs } from './plugin-runtime-input.helpers';
import { normalizeRoutePath } from './plugin-runtime-validation.helpers';
import { PluginService } from './plugin.service';

type RuntimeTransportRecord = {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  deviceType: string;
  transport: {
    executeTool(input: {
      toolName: string;
      params: JsonObject;
      context: PluginCallContext;
    }): Promise<JsonValue> | JsonValue;
    invokeHook(input: {
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    }): Promise<JsonValue | null | undefined> | JsonValue | null | undefined;
    invokeRoute(input: {
      request: PluginRouteRequest;
      context: PluginCallContext;
    }): Promise<PluginRouteResponse> | PluginRouteResponse;
  };
  governance: {
    scope: {
      defaultEnabled: boolean;
      conversations: Record<string, boolean>;
    };
  };
  activeExecutions: number;
  maxConcurrentExecutions: number;
};

@Injectable()
export class PluginRuntimeTransportFacade {
  constructor(private readonly pluginService: PluginService) {}

  async executeTool(input: {
    records: ReadonlyMap<string, RuntimeTransportRecord>;
    pluginId: string;
    toolName: string;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
    runToolBeforeCallHooks: (input: {
      context: PluginCallContext;
      payload: ToolBeforeCallHookPayload;
    }) => Promise<
      | { action: 'continue'; payload: ToolBeforeCallHookPayload }
      | { action: 'short-circuit'; output: JsonValue }
    >;
    runToolAfterCallHooks: (input: {
      context: PluginCallContext;
      payload: ToolAfterCallHookPayload;
    }) => Promise<ToolAfterCallHookPayload>;
    dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
  }): Promise<JsonValue> {
    const record = getRuntimeRecordOrThrow(input.records, input.pluginId);
    assertRuntimeRecordEnabled(record, input.context);
    const targetTool = findManifestToolOrThrow(record.manifest, input.toolName);
    const lifecyclePayload = {
      context: {
        ...input.context,
      },
      source: {
        kind: 'plugin' as const,
        id: input.pluginId,
        label: record.manifest.name || input.pluginId,
        pluginId: input.pluginId,
        runtimeKind: record.runtimeKind,
      },
      pluginId: input.pluginId,
      runtimeKind: record.runtimeKind,
      tool: {
        toolId: `plugin:${input.pluginId}:${targetTool.name}`,
        callName: record.runtimeKind === 'builtin'
          ? targetTool.name
          : `${input.pluginId}__${targetTool.name}`,
        ...targetTool,
        parameters: {
          ...targetTool.parameters,
        },
      },
      params: {
        ...input.params,
      },
    };
    let toolParams = lifecyclePayload.params;

    if (!input.skipLifecycleHooks) {
      const beforeCallResult = await input.runToolBeforeCallHooks({
        context: input.context,
        payload: lifecyclePayload,
      });

      if (beforeCallResult.action === 'short-circuit') {
        return beforeCallResult.output;
      }

      toolParams = beforeCallResult.payload.params;
    }

    const output = await this.runTimedPluginInvocation({
      record,
      context: input.context,
      executionType: 'tool',
      executionMetadata: {
        toolName: input.toolName,
      },
      failureTypePrefix: 'tool',
      failureMetadata: {
        toolName: input.toolName,
      },
      timeoutMs: readRuntimeTimeoutMs(input.context, 30000),
      timeoutMessage: `插件 ${input.pluginId} 工具 ${input.toolName} 执行超时`,
      dispatchPluginErrorHook: input.dispatchPluginErrorHook,
      execute: () => Promise.resolve(
        record.transport.executeTool({
          toolName: input.toolName,
          params: toolParams,
          context: input.context,
        }),
      ),
    });

    if (input.skipLifecycleHooks) {
      return output;
    }

    const afterCallPayload = await input.runToolAfterCallHooks({
      context: input.context,
      payload: {
        ...lifecyclePayload,
        params: {
          ...toolParams,
        },
        output,
      },
    });

    return afterCallPayload.output;
  }

  async invokeRoute(input: {
    records: ReadonlyMap<string, RuntimeTransportRecord>;
    pluginId: string;
    request: PluginRouteRequest;
    context: PluginCallContext;
    dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
  }): Promise<PluginRouteResponse> {
    const record = getRuntimeRecordOrThrow(input.records, input.pluginId);
    assertRuntimeRecordEnabled(record, input.context);
    const route = findManifestRouteOrThrow(
      record.manifest,
      input.request.method,
      input.request.path,
    );

    return this.runTimedPluginInvocation({
      record,
      context: input.context,
      executionType: 'route',
      executionMetadata: {
        method: input.request.method,
        path: route.path,
      },
      failureTypePrefix: 'route',
      failureMetadata: {
        method: input.request.method,
        path: route.path,
      },
      timeoutMs: readRuntimeTimeoutMs(input.context, 15000),
      timeoutMessage: `插件 ${input.pluginId} Route ${route.path} 执行超时`,
      dispatchPluginErrorHook: input.dispatchPluginErrorHook,
      execute: () => Promise.resolve(
        record.transport.invokeRoute({
          request: {
            ...input.request,
            path: normalizeRoutePath(route.path),
          },
          context: input.context,
        }),
      ),
    });
  }

  async invokePluginHook(input: {
    records: ReadonlyMap<string, RuntimeTransportRecord>;
    pluginId: string;
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
    recordFailure?: boolean;
    dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
  }): Promise<JsonValue | null | undefined> {
    const record = getRuntimeRecordOrThrow(input.records, input.pluginId);
    assertRuntimeRecordEnabled(record, input.context);

    return this.runTimedPluginInvocation({
      record,
      context: input.context,
      executionType: 'hook',
      executionMetadata: {
        hookName: input.hookName,
      },
      failureTypePrefix: 'hook',
      failureMetadata: {
        hookName: input.hookName,
      },
      timeoutMs: readRuntimeTimeoutMs(input.context, 10000),
      timeoutMessage: `插件 ${record.manifest.id} Hook ${input.hookName} 执行超时`,
      skipPluginErrorHook: input.hookName === 'plugin:error',
      recordFailure: input.recordFailure !== false,
      dispatchPluginErrorHook: input.dispatchPluginErrorHook,
      execute: () => Promise.resolve(
        record.transport.invokeHook({
          hookName: input.hookName,
          context: input.context,
          payload: input.payload,
        }),
      ),
    });
  }

  private async recordPluginFailureAndDispatch(input: {
    records: ReadonlyMap<string, RuntimeTransportRecord>;
    pluginId: string;
    context: PluginCallContext;
    type: string;
    message: string;
    metadata?: JsonObject;
    checked?: boolean;
    skipPluginErrorHook?: boolean;
    dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
  }): Promise<void> {
    await recordRuntimePluginFailureAndDispatch({
      ...input,
      record: input.records.get(input.pluginId),
      recordFailure: async (failure) => {
        await this.pluginService.recordPluginFailure(failure.pluginId, {
          type: failure.type,
          message: failure.message,
          metadata: failure.metadata,
          checked: failure.checked,
        });
      },
      dispatchPluginErrorHook: input.dispatchPluginErrorHook,
    });
  }

  private async runWithPluginExecutionSlot<T>(input: {
    record: RuntimeTransportRecord;
    type: 'tool' | 'route' | 'hook';
    metadata: JsonObject;
    execute: () => Promise<T>;
  }): Promise<T> {
    return runWithRuntimeExecutionSlot({
      record: input.record,
      type: input.type,
      metadata: input.metadata,
      recordPluginEvent: async (pluginId, event) => {
        await this.pluginService.recordPluginEvent(pluginId, event);
      },
      execute: input.execute,
    });
  }

  private async runTimedPluginInvocation<T>(input: {
    record: RuntimeTransportRecord;
    context: PluginCallContext;
    executionType: 'tool' | 'route' | 'hook';
    executionMetadata: JsonObject;
    failureTypePrefix: 'tool' | 'route' | 'hook';
    failureMetadata: JsonObject;
    timeoutMs: number;
    timeoutMessage: string;
    skipPluginErrorHook?: boolean;
    recordFailure?: boolean;
    dispatchPluginErrorHook: (payload: PluginErrorHookPayload) => Promise<void>;
    execute: () => Promise<T>;
  }): Promise<T> {
    try {
      return await this.runWithPluginExecutionSlot({
        record: input.record,
        type: input.executionType,
        metadata: input.executionMetadata,
        execute: () => runPromiseWithTimeout(
          Promise.resolve().then(() => input.execute()),
          input.timeoutMs,
          input.timeoutMessage,
        ),
      });
    } catch (error) {
      if (isPluginOverloadedError(error)) {
        throw error;
      }

      if (input.recordFailure !== false) {
        await this.recordPluginFailureAndDispatch({
          records: new Map([[input.record.manifest.id, input.record]]),
          pluginId: input.record.manifest.id,
          context: input.context,
          type: error instanceof Error && error.message.includes('超时')
            ? `${input.failureTypePrefix}:timeout`
            : `${input.failureTypePrefix}:error`,
          message: error instanceof Error ? error.message : String(error),
          metadata: input.failureMetadata,
          skipPluginErrorHook: input.skipPluginErrorHook,
          dispatchPluginErrorHook: input.dispatchPluginErrorHook,
        });
      }
      throw error;
    }
  }
}
