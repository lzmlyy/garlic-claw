import type {
  PluginCallContext,
  PluginHookName,
  PluginManifest,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { JsonValue } from '../common/types/json-value';
import { invokeDispatchableHooks } from './plugin-runtime-dispatch.helpers';

@Injectable()
export class PluginRuntimeBroadcastFacade {
  async invokeHookAcrossPlugins(input: {
    records: Iterable<{
      manifest: PluginManifest;
      governance: {
        scope: {
          defaultEnabled: boolean;
          conversations: Record<string, boolean>;
        };
      };
    }>;
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: unknown;
    invokeHook: (input: {
      pluginId: string;
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    }) => Promise<JsonValue | null | undefined>;
  }): Promise<Array<JsonValue | null | undefined>> {
    return invokeDispatchableHooks({
      records: input.records,
      hookName: input.hookName,
      context: input.context,
      payload: input.payload,
      invoke: (record, payload) => input.invokeHook({
        pluginId: record.manifest.id,
        hookName: input.hookName,
        context: input.context,
        payload,
      }),
    });
  }

  async dispatchVoidHook(input: {
    records: Iterable<{
      manifest: PluginManifest;
      governance: {
        scope: {
          defaultEnabled: boolean;
          conversations: Record<string, boolean>;
        };
      };
    }>;
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: unknown;
    invokeHook: (input: {
      pluginId: string;
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    }) => Promise<JsonValue | null | undefined>;
  }): Promise<void> {
    await this.invokeHookAcrossPlugins(input);
  }
}
