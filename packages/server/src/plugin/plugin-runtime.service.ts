import type {
  AutomationAfterRunHookPayload,
  AutomationBeforeRunHookPayload,
  ChatAfterModelHookPayload,
  ChatBeforeModelRequest,
  ChatBeforeModelHookPayload,
  ChatMessagePart,
  ChatWaitingModelHookPayload,
  ConversationCreatedHookPayload,
  HostCallPayload,
  PluginConversationSessionInfo,
  MessageReceivedHookPayload,
  MessageCreatedHookPayload,
  MessageDeletedHookPayload,
  MessageUpdatedHookPayload,
  PluginActionName,
  PluginCallContext,
  PluginCapability,
  PluginErrorHookPayload,
  PluginHookName,
  PluginManifest,
  PluginLoadedHookPayload,
  PluginRouteDescriptor,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginRuntimePressureSnapshot,
  PluginRuntimeKind,
  PluginSubagentRequest,
  SubagentAfterRunHookPayload,
  SubagentBeforeRunHookPayload,
  PluginSubagentRunResult,
  PluginUnloadedHookPayload,
  ResponseAfterSendHookPayload,
  ResponseBeforeSendHookPayload,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookPayload,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { PluginRuntimeBroadcastFacade } from './plugin-runtime-broadcast.facade';
import { PluginRuntimeGovernanceFacade } from './plugin-runtime-governance.facade';
import { PluginRuntimeHostFacade } from './plugin-runtime-host.facade';
import { PluginRuntimeInboundHooksFacade } from './plugin-runtime-inbound-hooks.facade';
import { PluginRuntimeMessageHooksFacade } from './plugin-runtime-message-hooks.facade';
import { PluginRuntimeOperationHooksFacade } from './plugin-runtime-operation-hooks.facade';
import { PluginRuntimeSubagentFacade } from './plugin-runtime-subagent.facade';
import { PluginRuntimeTransportFacade } from './plugin-runtime-transport.facade';
import {
  resolveMaxConcurrentExecutions,
} from './plugin-runtime-record.helpers';
import {
  type ConversationSessionRecord,
} from './plugin-runtime-session.helpers';
import {
  collectDisabledConversationSessionIds,
} from './plugin-runtime-scope';
import {
  type PluginGovernanceSnapshot,
} from './plugin.service';

/**
 * 插件传输适配器接口。
 *
 * 输入:
 * - 工具调用请求
 * - Hook 调用请求
 *
 * 输出:
 * - 工具执行结果
 * - Hook 返回结果
 * - Route 调用返回结果
 *
 * 预期行为:
 * - 将 builtin / remote 的差异收在 transport 内部
 * - 对 runtime 暴露统一的 executeTool / invokeHook / invokeRoute 接口
 */
export interface PluginTransport {
  /**
   * 执行插件工具。
   * @param input 工具名、参数和调用上下文
   * @returns JSON 可序列化的工具结果
   */
  executeTool(input: {
    toolName: string;
    params: JsonObject;
    context: PluginCallContext;
  }): Promise<JsonValue> | JsonValue;

  /**
   * 调用插件 Hook。
   * @param input Hook 名称、调用上下文和 Hook 负载
   * @returns Hook 返回值；无返回时返回 null/undefined
   */
  invokeHook(input: {
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
  }): Promise<JsonValue | null | undefined> | JsonValue | null | undefined;

  /**
   * 调用插件声明的 Web Route。
   * @param input Route 请求与调用上下文
   * @returns 标准化的 Route 响应
   */
  invokeRoute(input: {
    request: PluginRouteRequest;
    context: PluginCallContext;
  }): Promise<PluginRouteResponse> | PluginRouteResponse;

  /**
   * 重新装载当前插件。
   * @returns 无返回值
   */
  reload?(): Promise<void> | void;

  /**
   * 请求当前插件主动重连。
   * @returns 无返回值
   */
  reconnect?(): Promise<void> | void;

  /**
   * 执行一次当前插件的健康检查。
   * @returns 健康检查结果
   */
  checkHealth?(): Promise<{ ok: boolean }> | { ok: boolean };

  /**
   * 声明当前 transport 支持的治理动作。
   * @returns 动作列表
   */
  listSupportedActions?(): PluginActionName[];
}

function createDefaultGovernanceSnapshot(): PluginGovernanceSnapshot {
  return {
    configSchema: null,
    resolvedConfig: {},
    scope: {
      defaultEnabled: true,
      conversations: {},
    },
  };
}

/**
 * 注册到统一 runtime 的插件记录。
 */
interface PluginRuntimeRecord {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  deviceType: string;
  transport: PluginTransport;
  governance: PluginGovernanceSnapshot;
  activeExecutions: number;
  maxConcurrentExecutions: number;
}

/**
 * 宿主侧会话消息写入器。
 */
/**
 * 聊天模型前 Hook 继续执行模型调用。
 */
export interface ChatBeforeModelContinueResult {
  action: 'continue';
  request: ChatBeforeModelRequest;
}

/**
 * 聊天模型前 Hook 直接短路模型调用。
 */
export interface ChatBeforeModelShortCircuitExecutionResult {
  action: 'short-circuit';
  request: ChatBeforeModelRequest;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  providerId: string;
  modelId: string;
  reason?: string;
}

/**
 * 聊天模型前 Hook 执行结果。
 */
export type ChatBeforeModelExecutionResult =
  | ChatBeforeModelContinueResult
  | ChatBeforeModelShortCircuitExecutionResult;

/**
 * 收到消息后 Hook 继续执行。
 */
export interface MessageReceivedContinueResult {
  action: 'continue';
  payload: MessageReceivedHookPayload;
}

/**
 * 收到消息后 Hook 直接短路。
 */
export interface MessageReceivedShortCircuitExecutionResult {
  action: 'short-circuit';
  payload: MessageReceivedHookPayload;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  providerId: string;
  modelId: string;
  reason?: string;
}

/**
 * 收到消息后 Hook 执行结果。
 */
export type MessageReceivedExecutionResult =
  | MessageReceivedContinueResult
  | MessageReceivedShortCircuitExecutionResult;

/**
 * 自动化运行前 Hook 继续执行。
 */
export interface AutomationBeforeRunContinueResult {
  action: 'continue';
  payload: AutomationBeforeRunHookPayload;
}

/**
 * 自动化运行前 Hook 直接短路。
 */
export interface AutomationBeforeRunShortCircuitExecutionResult {
  action: 'short-circuit';
  status: string;
  results: JsonValue[];
}

/**
 * 自动化运行前 Hook 执行结果。
 */
export type AutomationBeforeRunExecutionResult =
  | AutomationBeforeRunContinueResult
  | AutomationBeforeRunShortCircuitExecutionResult;

/**
 * 工具调用前 Hook 继续执行。
 */
export interface ToolBeforeCallContinueResult {
  action: 'continue';
  payload: ToolBeforeCallHookPayload;
}

/**
 * 工具调用前 Hook 直接短路。
 */
export interface ToolBeforeCallShortCircuitExecutionResult {
  action: 'short-circuit';
  output: JsonValue;
}

/**
 * 工具调用前 Hook 执行结果。
 */
export type ToolBeforeCallExecutionResult =
  | ToolBeforeCallContinueResult
  | ToolBeforeCallShortCircuitExecutionResult;

/**
 * 统一插件运行时。
 *
 * NOTE: 当前保持单文件，因为 transport 调度、Hook 归一化、会话状态和运行时治理仍共享同一条执行边界；
 * 后续减法会继续外提重复解析与 clone/helper，但暂不把强耦合的执行链拆散到多个服务里。
 *
 * 输入:
 * - 插件 manifest
 * - transport 适配器
 * - 工具执行或 Hook 调用请求
 *
 * 输出:
 * - 插件列表与工具列表
 * - 统一执行后的工具结果
 * - 聚合后的 Hook 结果
 *
 * 预期行为:
 * - 统一管理 builtin / remote 插件注册
 * - 统一向聊天与自动化暴露插件工具
 * - 在运行时统一执行权限与作用域治理
 */
@Injectable()
export class PluginRuntimeService {
  private readonly records = new Map<string, PluginRuntimeRecord>();
  private readonly conversationSessions = new Map<string, ConversationSessionRecord>();

  constructor(
    private readonly runtimeBroadcastFacade: PluginRuntimeBroadcastFacade,
    private readonly runtimeGovernanceFacade: PluginRuntimeGovernanceFacade,
    private readonly runtimeHostFacade: PluginRuntimeHostFacade,
    private readonly runtimeInboundHooksFacade: PluginRuntimeInboundHooksFacade,
    private readonly runtimeMessageHooksFacade: PluginRuntimeMessageHooksFacade,
    private readonly runtimeOperationHooksFacade: PluginRuntimeOperationHooksFacade,
    private readonly runtimeSubagentFacade: PluginRuntimeSubagentFacade,
    private readonly runtimeTransportFacade: PluginRuntimeTransportFacade,
  ) {}

  /**
   * 注册一个插件到统一 runtime。
   * @param input manifest、runtime 类型和 transport
   * @returns 已注册插件的 manifest
   */
  async registerPlugin(input: {
    manifest: PluginManifest;
    runtimeKind: PluginRuntimeKind;
    deviceType?: string;
    transport: PluginTransport;
    governance?: PluginGovernanceSnapshot;
  }): Promise<PluginManifest> {
    const record: PluginRuntimeRecord = {
      manifest: input.manifest,
      runtimeKind: input.runtimeKind,
      deviceType: input.deviceType ?? input.runtimeKind,
      transport: input.transport,
      governance: input.governance ?? createDefaultGovernanceSnapshot(),
      activeExecutions: 0,
      maxConcurrentExecutions: resolveMaxConcurrentExecutions(
        input.governance ?? createDefaultGovernanceSnapshot(),
      ),
    };
    this.records.set(input.manifest.id, record);

    return input.manifest;
  }

  /**
   * 刷新某个已注册插件的治理缓存。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  refreshPluginGovernance(
    pluginId: string,
    governance: PluginGovernanceSnapshot,
  ): void {
    const record = this.records.get(pluginId);
    if (!record) {
      return;
    }

    record.governance = governance;
    record.maxConcurrentExecutions = resolveMaxConcurrentExecutions(record.governance);
    const disabledConversationIds = collectDisabledConversationSessionIds(
      this.conversationSessions.values(),
      pluginId,
      record.governance.scope,
    );
    for (const conversationId of disabledConversationIds) {
      this.conversationSessions.delete(conversationId);
    }
  }

  /**
   * 注销一个插件。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  unregisterPlugin(pluginId: string): void {
    this.records.delete(pluginId);
  }

  /**
   * 列出当前运行时中的工具。
   * @param context 可选调用上下文；提供时会按作用域过滤
   * @returns 统一工具描述列表
   */
  listTools(context?: PluginCallContext): Array<{
    pluginId: string;
    runtimeKind: PluginRuntimeKind;
    tool: PluginCapability;
  }> {
    return this.runtimeGovernanceFacade.listTools(this.records, context);
  }

  /**
   * 列出当前 runtime 中已注册的插件。
   * @returns 插件清单、运行类型和设备类型
   */
  listPlugins(): Array<{
    pluginId: string;
    runtimeKind: PluginRuntimeKind;
    deviceType: string;
    manifest: PluginManifest;
    supportedActions: PluginActionName[];
    runtimePressure: PluginRuntimePressureSnapshot;
  }> {
    return this.runtimeGovernanceFacade.listPlugins(this.records);
  }

  /**
   * 读取指定插件当前的运行时压力快照。
   * @param pluginId 插件 ID
   * @returns 压力快照；插件未注册时返回 null
   */
  getRuntimePressure(pluginId: string): PluginRuntimePressureSnapshot | null {
    return this.runtimeGovernanceFacade.getRuntimePressure(this.records, pluginId);
  }

  /**
   * 列出当前运行时中的活动会话等待态。
   * @param pluginId 可选插件 ID；提供时仅返回该插件拥有的会话
   * @returns 当前活动等待态列表
   */
  listConversationSessions(pluginId?: string): PluginConversationSessionInfo[] {
    return this.runtimeGovernanceFacade.listConversationSessions(
      this.conversationSessions,
      pluginId,
    );
  }

  /**
   * 为插件治理面强制结束一条活动会话等待态。
   * @param pluginId 插件 ID
   * @param conversationId 会话 ID
   * @returns 是否成功结束
   */
  finishConversationSessionForGovernance(
    pluginId: string,
    conversationId: string,
  ): boolean {
    return this.runtimeGovernanceFacade.finishConversationSessionForGovernance(
      this.conversationSessions,
      pluginId,
      conversationId,
    );
  }

  /**
   * 统一执行一个插件治理动作。
   * @param input 插件 ID 与治理动作名
   * @returns 无返回值
   */
  async runPluginAction(input: {
    pluginId: string;
    action: Exclude<PluginActionName, 'health-check'>;
  }): Promise<void> {
    await this.runtimeGovernanceFacade.runPluginAction({
      records: this.records,
      pluginId: input.pluginId,
      action: input.action,
    });
  }

  /**
   * 统一执行一次插件健康检查。
   * @param pluginId 插件 ID
   * @returns 健康检查结果
   */
  async checkPluginHealth(pluginId: string): Promise<{ ok: boolean }> {
    return this.runtimeGovernanceFacade.checkPluginHealth(this.records, pluginId);
  }

  /**
   * 列出当前 runtime 中声明的 Route。
   * @returns 插件 ID、运行类型与 Route 描述
   */
  listRoutes(): Array<{
    pluginId: string;
    runtimeKind: PluginRuntimeKind;
    route: PluginRouteDescriptor;
  }> {
    return this.runtimeGovernanceFacade.listRoutes(this.records);
  }

  /**
   * 统一执行一个插件工具。
   * @param input 插件 ID、工具名、参数和调用上下文
   * @returns 工具执行结果
   */
  async executeTool(input: {
    pluginId: string;
    toolName: string;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
  }): Promise<JsonValue> {
    return this.runtimeTransportFacade.executeTool({
      records: this.records,
      pluginId: input.pluginId,
      toolName: input.toolName,
      params: input.params,
      context: input.context,
      skipLifecycleHooks: input.skipLifecycleHooks,
      runToolBeforeCallHooks: (hookInput) => this.runToolBeforeCallHooks(hookInput),
      runToolAfterCallHooks: (hookInput) => this.runToolAfterCallHooks(hookInput),
      dispatchPluginErrorHook: (payload) => this.runPluginErrorHooks({
        context: input.context,
        payload,
      }),
    });
  }

  /**
   * 统一执行一个插件声明的 Web Route。
   * @param input 插件 ID、Route 请求与调用上下文
   * @returns Route 响应
   */
  async invokeRoute(input: {
    pluginId: string;
    request: PluginRouteRequest;
    context: PluginCallContext;
  }): Promise<PluginRouteResponse> {
    return this.runtimeTransportFacade.invokeRoute({
      records: this.records,
      pluginId: input.pluginId,
      request: input.request,
      context: input.context,
      dispatchPluginErrorHook: (payload) => this.runPluginErrorHooks({
        context: input.context,
        payload,
      }),
    });
  }

  /**
   * 统一执行插件 Host API 调用，并在入口处校验权限。
   * @param input 插件 ID、上下文、方法与参数
   * @returns Host API 返回值
   */
  async callHost(input: {
    pluginId: string;
    context: PluginCallContext;
    method: HostCallPayload['method'];
    params: JsonObject;
  }): Promise<JsonValue> {
    return this.runtimeHostFacade.call({
      records: this.records,
      conversationSessions: this.conversationSessions,
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
      params: input.params,
      runSubagentRequest: (subagentInput) => this.executeSubagentRequest({
        pluginId: subagentInput.pluginId,
        context: subagentInput.context,
        request: subagentInput.request as PluginSubagentRequest,
      }),
    });
  }

  /**
   * 读取某个插件当前声明的治理动作。
   * @param pluginId 插件 ID
   * @returns 归一化后的治理动作列表
   */
  listSupportedActions(pluginId: string): PluginActionName[] {
    return this.runtimeGovernanceFacade.listSupportedActions(this.records, pluginId);
  }

  /**
   * 调用指定插件的单个 Hook。
   * @param input 插件 ID、Hook 名称、调用上下文和载荷
   * @returns Hook 返回值
   */
  async invokePluginHook(input: {
    pluginId: string;
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
    recordFailure?: boolean;
  }): Promise<JsonValue | null | undefined> {
    return this.runtimeTransportFacade.invokePluginHook({
      records: this.records,
      pluginId: input.pluginId,
      hookName: input.hookName,
      context: input.context,
      payload: input.payload,
      recordFailure: input.recordFailure,
      dispatchPluginErrorHook: (payload) => this.runPluginErrorHooks({
        context: input.context,
        payload,
      }),
    });
  }

  /**
   * 运行所有聊天模型前 Hook，并按顺序改写请求快照。
   * @param input Hook 调用上下文与载荷
   * @returns 最终请求快照或短路结果
   */
  async runChatBeforeModelHooks(input: {
    context: PluginCallContext;
    payload: ChatBeforeModelHookPayload;
  }): Promise<ChatBeforeModelExecutionResult> {
    return this.runtimeInboundHooksFacade.runChatBeforeModelHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有收到消息后的前置 Hook，并按顺序改写消息载荷。
   * @param input Hook 调用上下文与载荷
   * @returns 最终消息载荷或短路结果
   */
  async runMessageReceivedHooks(input: {
    context: PluginCallContext;
    payload: MessageReceivedHookPayload;
  }): Promise<MessageReceivedExecutionResult> {
    return this.runtimeInboundHooksFacade.runMessageReceivedHooks({
      records: this.records,
      conversationSessions: this.conversationSessions,
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 在真正进入模型调用前派发 waiting Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 无返回值
   */
  async runChatWaitingModelHooks(input: {
    context: PluginCallContext;
    payload: ChatWaitingModelHookPayload;
  }): Promise<void> {
    await this.runtimeBroadcastFacade.dispatchVoidHook({
      records: this.records.values(),
      hookName: 'chat:waiting-model',
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有聊天模型后 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 顺序应用所有 mutate 后的最终载荷
   */
  async runChatAfterModelHooks(input: {
    context: PluginCallContext;
    payload: ChatAfterModelHookPayload;
  }): Promise<ChatAfterModelHookPayload> {
    return this.runtimeMessageHooksFacade.runChatAfterModelHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 派发会话创建 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 无返回值
   */
  async runConversationCreatedHooks(input: {
    context: PluginCallContext;
    payload: ConversationCreatedHookPayload;
  }): Promise<void> {
    await this.runtimeBroadcastFacade.dispatchVoidHook({
      records: this.records.values(),
      hookName: 'conversation:created',
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有消息创建 Hook，并按顺序改写消息草稿。
   * @param input Hook 调用上下文与载荷
   * @returns 顺序应用所有 mutate 后的最终载荷
   */
  async runMessageCreatedHooks(input: {
    context: PluginCallContext;
    payload: MessageCreatedHookPayload;
  }): Promise<MessageCreatedHookPayload> {
    return this.runtimeMessageHooksFacade.runMessageCreatedHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有消息更新 Hook，并按顺序改写待写入消息。
   * @param input Hook 调用上下文与载荷
   * @returns 顺序应用所有 mutate 后的最终载荷
   */
  async runMessageUpdatedHooks(input: {
    context: PluginCallContext;
    payload: MessageUpdatedHookPayload;
  }): Promise<MessageUpdatedHookPayload> {
    return this.runtimeMessageHooksFacade.runMessageUpdatedHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 派发消息删除 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 无返回值
   */
  async runMessageDeletedHooks(input: {
    context: PluginCallContext;
    payload: MessageDeletedHookPayload;
  }): Promise<void> {
    await this.runtimeBroadcastFacade.dispatchVoidHook({
      records: this.records.values(),
      hookName: 'message:deleted',
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有自动化执行前 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 最终动作列表或短路结果
   */
  async runAutomationBeforeRunHooks(input: {
    context: PluginCallContext;
    payload: AutomationBeforeRunHookPayload;
  }): Promise<AutomationBeforeRunExecutionResult> {
    return this.runtimeOperationHooksFacade.runAutomationBeforeRunHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有自动化执行后 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 顺序应用所有 mutate 后的最终载荷
   */
  async runAutomationAfterRunHooks(input: {
    context: PluginCallContext;
    payload: AutomationAfterRunHookPayload;
  }): Promise<AutomationAfterRunHookPayload> {
    return this.runtimeOperationHooksFacade.runAutomationAfterRunHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有工具调用前 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 最终工具参数或短路结果
   */
  async runToolBeforeCallHooks(input: {
    context: PluginCallContext;
    payload: ToolBeforeCallHookPayload;
  }): Promise<ToolBeforeCallExecutionResult> {
    return this.runtimeOperationHooksFacade.runToolBeforeCallHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有工具调用后 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 顺序应用所有 mutate 后的最终载荷
   */
  async runToolAfterCallHooks(input: {
    context: PluginCallContext;
    payload: ToolAfterCallHookPayload;
  }): Promise<ToolAfterCallHookPayload> {
    return this.runtimeOperationHooksFacade.runToolAfterCallHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有最终回复发送前 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 顺序应用所有 mutate 后的最终载荷
   */
  async runResponseBeforeSendHooks(input: {
    context: PluginCallContext;
    payload: ResponseBeforeSendHookPayload;
  }): Promise<ResponseBeforeSendHookPayload> {
    return this.runtimeOperationHooksFacade.runResponseBeforeSendHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 派发所有最终回复发送后 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 无返回值
   */
  async runResponseAfterSendHooks(input: {
    context: PluginCallContext;
    payload: ResponseAfterSendHookPayload;
  }): Promise<void> {
    await this.runtimeBroadcastFacade.dispatchVoidHook({
      records: this.records.values(),
      hookName: 'response:after-send',
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 运行所有子代理执行前 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 最终请求或短路结果
   */
  async runSubagentBeforeRunHooks(input: {
    context: PluginCallContext;
    payload: SubagentBeforeRunHookPayload;
  }): Promise<
    | { action: 'continue'; payload: SubagentBeforeRunHookPayload }
    | { action: 'short-circuit'; result: PluginSubagentRunResult }
  > {
    return this.runtimeSubagentFacade.runBeforeHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook({
        ...hookInput,
        payload: hookInput.payload as JsonValue,
      }),
    });
  }

  /**
   * 运行所有子代理执行后 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 顺序应用所有 mutate 后的最终载荷
   */
  async runSubagentAfterRunHooks(input: {
    context: PluginCallContext;
    payload: SubagentAfterRunHookPayload;
  }): Promise<SubagentAfterRunHookPayload> {
    return this.runtimeSubagentFacade.runAfterHooks({
      records: this.records.values(),
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook({
        ...hookInput,
        payload: hookInput.payload as JsonValue,
      }),
    });
  }

  /**
   * 派发所有插件加载 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 无返回值
   */
  async runPluginLoadedHooks(input: {
    context: PluginCallContext;
    payload: PluginLoadedHookPayload;
  }): Promise<void> {
    await this.runtimeBroadcastFacade.dispatchVoidHook({
      records: this.records.values(),
      hookName: 'plugin:loaded',
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 派发所有插件卸载 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 无返回值
   */
  async runPluginUnloadedHooks(input: {
    context: PluginCallContext;
    payload: PluginUnloadedHookPayload;
  }): Promise<void> {
    await this.runtimeBroadcastFacade.dispatchVoidHook({
      records: this.records.values(),
      hookName: 'plugin:unloaded',
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 派发所有插件失败 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 无返回值
   */
  async runPluginErrorHooks(input: {
    context: PluginCallContext;
    payload: PluginErrorHookPayload;
  }): Promise<void> {
    await this.runtimeBroadcastFacade.dispatchVoidHook({
      records: this.records.values(),
      hookName: 'plugin:error',
      context: input.context,
      payload: input.payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
    });
  }

  /**
   * 执行一份已经归一化的子代理请求。
   * @param input 插件 ID、调用上下文与归一化后的请求
   * @returns 子代理最终结果
   */
  async executeSubagentRequest(input: {
    pluginId: string;
    context: PluginCallContext;
    request: PluginSubagentRequest;
  }): Promise<PluginSubagentRunResult> {
    return this.runtimeSubagentFacade.executeRequest({
      records: this.records.values(),
      pluginId: input.pluginId,
      context: input.context,
      request: input.request,
      invokeHook: (hookInput) => this.invokePluginHook({
        ...hookInput,
        payload: hookInput.payload as JsonValue,
      }),
      runAfterHooks: (afterInput) => this.runtimeSubagentFacade.runAfterHooks({
        records: this.records.values(),
        context: afterInput.context,
        payload: afterInput.payload,
        invokeHook: (hookInput) => this.invokePluginHook({
          ...hookInput,
          payload: hookInput.payload as JsonValue,
        }),
      }),
    });
  }

}
