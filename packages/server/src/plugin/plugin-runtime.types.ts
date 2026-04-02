import type {
  AutomationBeforeRunHookPayload,
  ChatBeforeModelRequest,
  ChatMessagePart,
  PluginActionName,
  PluginCallContext,
  PluginHookName,
  PluginManifest,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginRuntimeKind,
  ToolBeforeCallHookPayload,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import type { PluginGovernanceSnapshot } from './plugin.service';

export interface PluginTransport {
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

  reload?(): Promise<void> | void;
  reconnect?(): Promise<void> | void;
  checkHealth?(): Promise<{ ok: boolean }> | { ok: boolean };
  listSupportedActions?(): PluginActionName[];
}

export interface PluginRuntimeRecord {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  deviceType: string;
  transport: PluginTransport;
  governance: PluginGovernanceSnapshot;
  activeExecutions: number;
  maxConcurrentExecutions: number;
}

export interface ChatBeforeModelContinueResult {
  action: 'continue';
  request: ChatBeforeModelRequest;
}

export interface ChatBeforeModelShortCircuitExecutionResult {
  action: 'short-circuit';
  request: ChatBeforeModelRequest;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  providerId: string;
  modelId: string;
  reason?: string;
}

export type ChatBeforeModelExecutionResult =
  | ChatBeforeModelContinueResult
  | ChatBeforeModelShortCircuitExecutionResult;

export interface MessageReceivedContinueResult {
  action: 'continue';
  payload: import('@garlic-claw/shared').MessageReceivedHookPayload;
}

export interface MessageReceivedShortCircuitExecutionResult {
  action: 'short-circuit';
  payload: import('@garlic-claw/shared').MessageReceivedHookPayload;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  providerId: string;
  modelId: string;
  reason?: string;
}

export type MessageReceivedExecutionResult =
  | MessageReceivedContinueResult
  | MessageReceivedShortCircuitExecutionResult;

export interface AutomationBeforeRunContinueResult {
  action: 'continue';
  payload: AutomationBeforeRunHookPayload;
}

export interface AutomationBeforeRunShortCircuitExecutionResult {
  action: 'short-circuit';
  status: string;
  results: JsonValue[];
}

export type AutomationBeforeRunExecutionResult =
  | AutomationBeforeRunContinueResult
  | AutomationBeforeRunShortCircuitExecutionResult;

export interface ToolBeforeCallContinueResult {
  action: 'continue';
  payload: ToolBeforeCallHookPayload;
}

export interface ToolBeforeCallShortCircuitExecutionResult {
  action: 'short-circuit';
  output: JsonValue;
}

export type ToolBeforeCallExecutionResult =
  | ToolBeforeCallContinueResult
  | ToolBeforeCallShortCircuitExecutionResult;
