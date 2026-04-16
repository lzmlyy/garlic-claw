import type {
  JsonValue,
  PluginCallContext,
  PluginHookDescriptor,
  PluginHookName,
  PluginManifest,
  PluginScopeSettings,
} from '@garlic-claw/shared';
import type { RuntimeHostPluginDispatchService } from '../host/runtime-host-plugin-dispatch.service';

type RuntimeDispatchRecord = {
  manifest: PluginManifest;
  defaultEnabled: boolean;
  conversationScopes?: Record<string, boolean>;
  pluginId: string;
};

type HookDispatcher = Pick<RuntimeHostPluginDispatchService, 'invokeHook' | 'listPlugins'>;
export type DispatchableHookChainResult<TPayload, TShortCircuit> =
  | { state: TPayload }
  | { shortCircuitResult: TShortCircuit };

export function isPluginEnabledForContext(
  scope: PluginScopeSettings,
  context: Pick<PluginCallContext, 'conversationId'>,
): boolean {
  const conversationId = context.conversationId;
  if (conversationId) {
    const scoped = scope.conversations[conversationId];
    if (typeof scoped === 'boolean') {
      return scoped;
    }
  }

  return scope.defaultEnabled;
}

export function isRuntimeRecordEnabledForContext(
  record: RuntimeDispatchRecord,
  context: PluginCallContext,
): boolean {
  return isPluginEnabledForContext({
    conversations: { ...(record.conversationScopes ?? {}) },
    defaultEnabled: record.defaultEnabled,
  }, context);
}

export function listDispatchableHookRecords<T extends RuntimeDispatchRecord>(input: {
  records: Iterable<T>;
  hookName: PluginHookName;
  context: PluginCallContext;
}): Array<{ hook: PluginHookDescriptor; record: T }> {
  return [...input.records]
    .map((record) => ({
      hook: record.manifest.hooks?.find((candidate) => candidate.name === input.hookName) ?? null,
      record,
    }))
    .filter((entry): entry is { hook: PluginHookDescriptor; record: T } =>
      entry.hook !== null,
    )
    .filter((entry) => isRuntimeRecordEnabledForContext(entry.record, input.context))
    .sort((left, right) => {
      const leftPriority = typeof left.hook.priority === 'number' ? Math.trunc(left.hook.priority) : 0;
      const rightPriority = typeof right.hook.priority === 'number' ? Math.trunc(right.hook.priority) : 0;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.record.manifest.id.localeCompare(right.record.manifest.id);
    });
}

export function listDispatchableHookPluginIds(input: {
  kernel: Pick<RuntimeHostPluginDispatchService, 'listPlugins'>;
  hookName: PluginHookName;
  context: PluginCallContext;
}): string[] {
  return listDispatchableHookRecords({
    context: input.context,
    hookName: input.hookName,
    records: input.kernel.listPlugins().filter((plugin) => plugin.connected),
  }).map((entry) => entry.record.pluginId);
}

export async function applyMutatingDispatchableHooks<TPayload>(input: {
  kernel: HookDispatcher;
  hookName: PluginHookName;
  payload: TPayload;
  readContext: (payload: TPayload) => PluginCallContext;
  mapPayload: (payload: TPayload, context: PluginCallContext) => JsonValue | Promise<JsonValue>;
  applyMutation: (payload: TPayload, mutation: Record<string, unknown>) => TPayload;
  excludedPluginId?: string;
}): Promise<TPayload> {
  const result = await runDispatchableHookChain<TPayload, Record<string, unknown>>({
    applyResponse: (payload, mutation) => ({
      state: mutation.action === 'mutate' ? input.applyMutation(payload, mutation) : payload,
    }),
    hookName: input.hookName,
    initialState: input.payload,
    kernel: input.kernel,
    mapPayload: input.mapPayload,
    readContext: input.readContext,
    ...(input.excludedPluginId ? { excludedPluginId: input.excludedPluginId } : {}),
  });
  return 'state' in result ? result.state : result.shortCircuitResult;
}

export async function runDispatchableHookChain<TPayload, TResult extends { action?: unknown }, TShortCircuit = never>(input: {
  kernel: HookDispatcher;
  hookName: PluginHookName;
  initialState: TPayload;
  readContext: (payload: TPayload) => PluginCallContext;
  mapPayload: (payload: TPayload, context: PluginCallContext) => JsonValue | Promise<JsonValue>;
  applyResponse: (payload: TPayload, response: Exclude<TResult, { action: 'pass' }>) => DispatchableHookChainResult<TPayload, TShortCircuit>;
  excludedPluginId?: string;
}): Promise<DispatchableHookChainResult<TPayload, TShortCircuit>> {
  let nextPayload = input.initialState;
  for (const pluginId of listDispatchableHookPluginIds({
    context: input.readContext(nextPayload),
    hookName: input.hookName,
    kernel: input.kernel,
  })) {
    if (pluginId === input.excludedPluginId) {continue;}
    const context = input.readContext(nextPayload);
    const response = await input.kernel.invokeHook({
      context,
      hookName: input.hookName,
      payload: await input.mapPayload(nextPayload, context),
      pluginId,
    }) as TResult | null;
    if (!response || response.action === 'pass') {continue;}
    const next = input.applyResponse(nextPayload, response as Exclude<TResult, { action: 'pass' }>);
    if ('shortCircuitResult' in next) {return next;}
    nextPayload = next.state;
  }
  return { state: nextPayload };
}
