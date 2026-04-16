import type { ChatAfterModelHookPayload, ChatBeforeModelHookPayload, ChatBeforeModelHookResult, JsonObject, JsonValue, PluginActionName, PluginCallContext, PluginHookName, PluginManifest, PluginRouteRequest, PluginRouteResponse } from "@garlic-claw/shared";
import type { PluginHostFacade } from "../host";
import { normalizeRoutePath } from "../utils/route";
export interface PluginAuthorExecutionContext<THost = PluginHostFacade> {
  callContext: PluginCallContext;
  host: THost;
}
export type PluginToolHandler<THost = PluginHostFacade> = (params: JsonObject, context: PluginAuthorExecutionContext<THost>) => Promise<JsonValue> | JsonValue;
export type PluginHookHandler<THost = PluginHostFacade> = (payload: JsonValue, context: PluginAuthorExecutionContext<THost>) => Promise<JsonValue | null | undefined> | JsonValue | null | undefined;
export type PluginRouteHandler<THost = PluginHostFacade> = (request: PluginRouteRequest, context: PluginAuthorExecutionContext<THost>) => Promise<PluginRouteResponse> | PluginRouteResponse;
export interface PluginAuthorDefinition<THost = PluginHostFacade> {
  manifest: PluginManifest;
  tools?: Record<string, PluginToolHandler<THost>>;
  hooks?: Partial<Record<PluginHookName, PluginHookHandler<THost>>>;
  routes?: Record<string, PluginRouteHandler<THost>>;
}
export interface PluginAuthorTransportGovernanceHandlers {
  reload?: () => Promise<void> | void;
  reconnect?: () => Promise<void> | void;
  checkHealth?: () => Promise<{ ok: boolean }> | { ok: boolean };
}
export interface PluginAuthorTransportExecutorInput<THost = PluginHostFacade> {
  definition: PluginAuthorDefinition<THost>;
  governance?: PluginAuthorTransportGovernanceHandlers;
  createExecutionContext(callContext: PluginCallContext): PluginAuthorExecutionContext<THost>;
}
export interface PluginAuthorTransportExecutor {
  executeTool(input: { toolName: string; params: JsonObject; context: PluginCallContext }): Promise<JsonValue> | JsonValue;
  invokeHook(input: { hookName: PluginHookName; payload: JsonValue; context: PluginCallContext }): Promise<JsonValue | null | undefined> | JsonValue | null | undefined;
  invokeRoute(input: { request: PluginRouteRequest; context: PluginCallContext }): Promise<PluginRouteResponse> | PluginRouteResponse;
  reload(): Promise<void>;
  reconnect(): Promise<void>;
  checkHealth(): Promise<{ ok: boolean }>;
  listSupportedActions(): PluginActionName[];
}
export function createPluginAuthorTransportExecutor<THost = PluginHostFacade>(input: PluginAuthorTransportExecutorInput<THost>): PluginAuthorTransportExecutor {
  const pluginId = input.definition.manifest.id;
  return {
    executeTool({ toolName, params, context }) {
      const handler = input.definition.tools?.[toolName];
      if (!handler) {throw new Error(`未知的插件工具: ${pluginId}:${toolName}`);}
      return handler(params, input.createExecutionContext(context));
    },
    invokeHook({ hookName, payload, context }) {
      const handler = input.definition.hooks?.[hookName];
      return handler ? handler(payload, input.createExecutionContext(context)) : null;
    },
    invokeRoute({ request, context }) {
      const handler = input.definition.routes?.[normalizeRoutePath(request.path)];
      if (!handler) {throw new Error(`未知的插件 Route: ${pluginId}:${request.path}`);}
      return handler(request, input.createExecutionContext(context));
    },
    async reload() {
      if (!input.governance?.reload) {throw new Error(`插件 ${pluginId} 不支持治理动作 reload`);}
      await input.governance.reload();
    },
    async reconnect() {
      if (!input.governance?.reconnect) {throw new Error(`插件 ${pluginId} 不支持治理动作 reconnect`);}
      await input.governance.reconnect();
    },
    async checkHealth() {
      return input.governance?.checkHealth ? input.governance.checkHealth() : { ok: true };
    },
    listSupportedActions() {
      const actions: PluginActionName[] = ["health-check"];
      if (input.governance?.reload) {actions.push("reload");}
      if (input.governance?.reconnect) {actions.push("reconnect");}
      return actions;
    },
  };
}
export function readPluginHookPayload<T>(payload: JsonValue): T { return payload as T; }
export function asChatBeforeModelPayload(payload: JsonValue): ChatBeforeModelHookPayload { return readPluginHookPayload<ChatBeforeModelHookPayload>(payload); }
export function asChatAfterModelPayload(payload: JsonValue): ChatAfterModelHookPayload { return readPluginHookPayload<ChatAfterModelHookPayload>(payload); }
export function createChatBeforeModelHookResult(currentSystemPrompt: string, appendedSystemPrompt: string): ChatBeforeModelHookResult { return { action: "mutate", systemPrompt: currentSystemPrompt ? [currentSystemPrompt, appendedSystemPrompt].join("\n\n") : appendedSystemPrompt }; }
export function createPassHookResult(): JsonObject { return { action: "pass" }; }
export function createSystemPromptMutateResult(systemPrompt: string): JsonObject { return { action: "mutate", systemPrompt }; }
export function resolveProviderRouterShortCircuitReply(reply?: string): string { return (reply ?? "").trim() || "本轮请求已由 provider-router 直接处理。"; }
export function createProviderRouterShortCircuitResult(input: { reply?: string; currentProviderId?: string; currentModelId?: string; requestProviderId: string; requestModelId: string }): JsonObject {
  return {
    action: "short-circuit",
    assistantContent: resolveProviderRouterShortCircuitReply(input.reply),
    providerId: input.currentProviderId ?? input.requestProviderId,
    modelId: input.currentModelId ?? input.requestModelId,
    reason: "matched-short-circuit-keyword",
  };
}
export function createProviderRouterMutateResult(input: { shouldRoute: boolean; targetProviderId: string; targetModelId: string; toolNames: string[] | null }): JsonObject {
  return {
    action: "mutate",
    ...(input.shouldRoute
      ? {
          providerId: input.targetProviderId,
          modelId: input.targetModelId,
        }
      : {}),
    ...(input.toolNames ? { toolNames: input.toolNames } : {}),
  };
}
