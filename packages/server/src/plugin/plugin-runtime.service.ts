import type {
  ActionConfig,
  AutomationAfterRunHookMutateResult,
  AutomationAfterRunHookPassResult,
  AutomationAfterRunHookPayload,
  AutomationBeforeRunHookMutateResult,
  AutomationBeforeRunHookPassResult,
  AutomationBeforeRunHookPayload,
  AutomationBeforeRunHookShortCircuitResult,
  ChatAfterModelHookPayload,
  ChatAfterModelHookMutateResult,
  ChatAfterModelHookPassResult,
  ChatBeforeModelHookMutateResult,
  ChatBeforeModelRequest,
  ChatBeforeModelHookPayload,
  ChatBeforeModelHookPassResult,
  ChatBeforeModelHookShortCircuitResult,
  ChatMessagePart,
  ChatWaitingModelHookPayload,
  ConversationCreatedHookPayload,
  HostCallPayload,
  PluginConversationSessionInfo,
  MessageReceivedHookMutateResult,
  MessageReceivedHookPassResult,
  MessageReceivedHookPayload,
  MessageReceivedHookShortCircuitResult,
  MessageCreatedHookMutateResult,
  MessageCreatedHookPayload,
  MessageDeletedHookPayload,
  MessageUpdatedHookMutateResult,
  MessageUpdatedHookPayload,
  PluginActionName,
  PluginCallContext,
  PluginCapability,
  PluginErrorHookPayload,
  PluginHookDescriptor,
  PluginHookFilterDescriptor,
  PluginMessageKind,
  PluginHookName,
  PluginHostMethod,
  PluginLifecycleHookInfo,
  PluginLlmMessage,
  PluginManifest,
  PluginMessageSendInfo,
  PluginMessageTargetInfo,
  PluginMessageTargetRef,
  PluginMessageHookInfo,
  PluginPermission,
  PluginLoadedHookPayload,
  PluginRouteDescriptor,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginRuntimePressureSnapshot,
  PluginRuntimeKind,
  PluginSelfInfo,
  PluginSubagentRequest,
  PluginSubagentToolCall,
  PluginSubagentToolResult,
  SubagentAfterRunHookMutateResult,
  SubagentAfterRunHookPassResult,
  SubagentAfterRunHookPayload,
  SubagentBeforeRunHookMutateResult,
  SubagentBeforeRunHookPassResult,
  SubagentBeforeRunHookPayload,
  SubagentBeforeRunHookShortCircuitResult,
  PluginSubagentRunResult,
  PluginUnloadedHookPayload,
  ResponseAfterSendHookPayload,
  ResponseBeforeSendHookMutateResult,
  ResponseBeforeSendHookPassResult,
  ResponseBeforeSendHookPayload,
  TriggerConfig,
  ToolAfterCallHookMutateResult,
  ToolAfterCallHookPassResult,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookMutateResult,
  ToolBeforeCallHookPassResult,
  ToolBeforeCallHookPayload,
  ToolBeforeCallHookShortCircuitResult,
} from '@garlic-claw/shared';
import type { Tool } from 'ai';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { createStepLimit } from '../ai/sdk-adapter';
import { AutomationService } from '../automation/automation.service';
import type { ChatRuntimeMessage } from '../chat/chat-message-session';
import { toAiSdkMessages } from '../chat/sdk-message-converter';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { PluginHostService } from './plugin-host.service';
import { PluginCronService } from './plugin-cron.service';
import {
  PluginService,
  type PluginGovernanceSnapshot,
} from './plugin.service';

/**
 * Host API 与权限的映射表。
 */
const HOST_METHOD_PERMISSION_MAP: Record<PluginHostMethod, PluginPermission | null> = {
  'automation.create': 'automation:write',
  'automation.event.emit': 'automation:write',
  'automation.list': 'automation:read',
  'automation.run': 'automation:write',
  'automation.toggle': 'automation:write',
  'config.get': 'config:read',
  'cron.delete': 'cron:write',
  'cron.list': 'cron:read',
  'cron.register': 'cron:write',
  'conversation.get': 'conversation:read',
  'conversation.session.finish': 'conversation:write',
  'conversation.session.get': 'conversation:write',
  'conversation.session.keep': 'conversation:write',
  'conversation.session.start': 'conversation:write',
  'conversation.messages.list': 'conversation:read',
  'conversation.title.set': 'conversation:write',
  'kb.get': 'kb:read',
  'kb.list': 'kb:read',
  'kb.search': 'kb:read',
  'llm.generate': 'llm:generate',
  'llm.generate-text': 'llm:generate',
  'log.write': 'log:write',
  'message.send': 'conversation:write',
  'message.target.current.get': 'conversation:read',
  'memory.search': 'memory:read',
  'memory.save': 'memory:write',
  'persona.activate': 'persona:write',
  'persona.current.get': 'persona:read',
  'persona.get': 'persona:read',
  'persona.list': 'persona:read',
  'plugin.self.get': null,
  'provider.current.get': 'provider:read',
  'provider.get': 'provider:read',
  'provider.list': 'provider:read',
  'provider.model.get': 'provider:read',
  'storage.delete': 'storage:write',
  'storage.get': 'storage:read',
  'storage.list': 'storage:read',
  'storage.set': 'storage:write',
  'subagent.run': 'subagent:run',
  'state.get': 'state:read',
  'state.set': 'state:write',
  'user.get': 'user:read',
};

/**
 * 插件治理动作展示顺序。
 */
const PLUGIN_ACTION_ORDER: PluginActionName[] = [
  'health-check',
  'reload',
  'reconnect',
];

const DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS = 6;

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
interface PluginConversationMessageWriter {
  getCurrentPluginMessageTarget(input: {
    context: PluginCallContext;
  }): Promise<PluginMessageTargetInfo | null>;
  sendPluginMessage(input: {
    context: PluginCallContext;
    target?: PluginMessageTargetRef | null;
    content?: string;
    parts?: ChatMessagePart[];
    provider?: string;
    model?: string;
  }): Promise<PluginMessageSendInfo>;
}

/**
 * 运行时维护的活动会话等待态。
 */
interface ConversationSessionRecord {
  pluginId: string;
  conversationId: string;
  startedAt: number;
  expiresAt: number;
  lastMatchedAt: number | null;
  captureHistory: boolean;
  historyMessages: PluginMessageHookInfo[];
  metadata?: JsonValue;
}

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
 * 归一化后的聊天模型前 Hook 返回。
 */
type NormalizedChatBeforeModelHookResult =
  | ChatBeforeModelHookPassResult
  | ChatBeforeModelHookMutateResult
  | ChatBeforeModelHookShortCircuitResult;

/**
 * 归一化后的收到消息 Hook 返回。
 */
type NormalizedMessageReceivedHookResult =
  | MessageReceivedHookPassResult
  | MessageReceivedHookMutateResult
  | MessageReceivedHookShortCircuitResult;

/**
 * 归一化后的聊天模型后 Hook 返回。
 */
type NormalizedChatAfterModelHookResult =
  | ChatAfterModelHookPassResult
  | ChatAfterModelHookMutateResult;

/**
 * 归一化后的消息创建 Hook 返回。
 */
type NormalizedMessageCreatedHookResult =
  | { action: 'pass' }
  | MessageCreatedHookMutateResult;

/**
 * 归一化后的消息更新 Hook 返回。
 */
type NormalizedMessageUpdatedHookResult =
  | { action: 'pass' }
  | MessageUpdatedHookMutateResult;

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
 * 归一化后的自动化运行前 Hook 返回。
 */
type NormalizedAutomationBeforeRunHookResult =
  | AutomationBeforeRunHookPassResult
  | AutomationBeforeRunHookMutateResult
  | AutomationBeforeRunHookShortCircuitResult;

/**
 * 归一化后的自动化运行后 Hook 返回。
 */
type NormalizedAutomationAfterRunHookResult =
  | AutomationAfterRunHookPassResult
  | AutomationAfterRunHookMutateResult;

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
 * 归一化后的工具调用前 Hook 返回。
 */
type NormalizedToolBeforeCallHookResult =
  | ToolBeforeCallHookPassResult
  | ToolBeforeCallHookMutateResult
  | ToolBeforeCallHookShortCircuitResult;

/**
 * 归一化后的工具调用后 Hook 返回。
 */
type NormalizedToolAfterCallHookResult =
  | ToolAfterCallHookPassResult
  | ToolAfterCallHookMutateResult;

/**
 * 归一化后的最终回复发送前 Hook 返回。
 */
type NormalizedResponseBeforeSendHookResult =
  | ResponseBeforeSendHookPassResult
  | ResponseBeforeSendHookMutateResult;

/**
 * 归一化后的子代理运行前 Hook 返回。
 */
type NormalizedSubagentBeforeRunHookResult =
  | SubagentBeforeRunHookPassResult
  | SubagentBeforeRunHookMutateResult
  | SubagentBeforeRunHookShortCircuitResult;

/**
 * 归一化后的子代理运行后 Hook 返回。
 */
type NormalizedSubagentAfterRunHookResult =
  | SubagentAfterRunHookPassResult
  | SubagentAfterRunHookMutateResult;

/**
 * 统一插件运行时。
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
  private automationService?: AutomationService;
  private chatMessageService?: PluginConversationMessageWriter;
  private toolRegistryPromise?: Promise<{
    buildToolSet: (input: {
      context: PluginCallContext;
      allowedToolNames?: string[];
      excludedSources?: Array<{
        kind: 'plugin' | 'mcp';
        id: string;
      }>;
    }) => Promise<Record<string, Tool> | undefined>;
  }>;

  constructor(
    private readonly pluginService: PluginService,
    private readonly hostService: PluginHostService,
    private readonly cronService: PluginCronService,
    private readonly aiModelExecution: AiModelExecutionService,
    private readonly moduleRef: ModuleRef,
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
  }): Promise<PluginManifest> {
    const governance = await this.pluginService.registerPlugin(
      input.manifest.id,
      input.deviceType ?? input.runtimeKind,
      input.manifest,
    );

    const record: PluginRuntimeRecord = {
      manifest: input.manifest,
      runtimeKind: input.runtimeKind,
      deviceType: input.deviceType ?? input.runtimeKind,
      transport: input.transport,
      governance,
      activeExecutions: 0,
      maxConcurrentExecutions: this.resolveMaxConcurrentExecutions(governance),
    };
    this.records.set(input.manifest.id, record);
    await this.cronService.onPluginRegistered(
      input.manifest.id,
      input.manifest.crons ?? [],
    );
    await this.runPluginLoadedHooks({
      context: {
        source: 'plugin',
      },
      payload: {
        context: {
          source: 'plugin',
        },
        plugin: this.buildPluginLifecycleHookInfo(record),
        loadedAt: new Date().toISOString(),
      },
    });

    return input.manifest;
  }

  /**
   * 刷新某个已注册插件的治理缓存。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  async refreshPluginGovernance(pluginId: string): Promise<void> {
    const record = this.records.get(pluginId);
    if (!record) {
      return;
    }

    record.governance = await this.pluginService.getGovernanceSnapshot(pluginId);
    record.maxConcurrentExecutions = this.resolveMaxConcurrentExecutions(record.governance);
  }

  /**
   * 注销一个插件。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  async unregisterPlugin(pluginId: string): Promise<void> {
    const record = this.records.get(pluginId);
    if (record) {
      await this.runPluginUnloadedHooks({
        context: {
          source: 'plugin',
        },
        payload: {
          context: {
            source: 'plugin',
          },
          plugin: this.buildPluginLifecycleHookInfo(record),
          unloadedAt: new Date().toISOString(),
        },
      });
    }

    this.cronService.onPluginUnregistered(pluginId);
    this.records.delete(pluginId);
    await this.pluginService.setOffline(pluginId);
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
    const tools: Array<{
      pluginId: string;
      runtimeKind: PluginRuntimeKind;
      tool: PluginCapability;
    }> = [];

    for (const [pluginId, record] of this.records) {
      if (context && !this.isPluginEnabledForContext(record, context)) {
        continue;
      }

      for (const tool of record.manifest.tools ?? []) {
        tools.push({
          pluginId,
          runtimeKind: record.runtimeKind,
          tool,
        });
      }
    }

    return tools;
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
    return [...this.records.entries()].map(([pluginId, record]) => ({
      pluginId,
      runtimeKind: record.runtimeKind,
      deviceType: record.deviceType,
      manifest: record.manifest,
      supportedActions: this.listSupportedActionsForRecord(record),
      runtimePressure: this.buildRuntimePressure(record),
    }));
  }

  /**
   * 读取指定插件当前的运行时压力快照。
   * @param pluginId 插件 ID
   * @returns 压力快照；插件未注册时返回 null
   */
  getRuntimePressure(pluginId: string): PluginRuntimePressureSnapshot | null {
    const record = this.records.get(pluginId);
    if (!record) {
      return null;
    }

    return this.buildRuntimePressure(record);
  }

  /**
   * 列出当前运行时中的活动会话等待态。
   * @param pluginId 可选插件 ID；提供时仅返回该插件拥有的会话
   * @returns 当前活动等待态列表
   */
  listConversationSessions(pluginId?: string): PluginConversationSessionInfo[] {
    const sessions: PluginConversationSessionInfo[] = [];

    for (const conversationId of this.conversationSessions.keys()) {
      const session = this.getActiveConversationSession(conversationId);
      if (!session) {
        continue;
      }
      if (pluginId && session.pluginId !== pluginId) {
        continue;
      }

      sessions.push(this.toConversationSessionInfo(session));
    }

    return sessions.sort((left, right) => left.expiresAt.localeCompare(right.expiresAt));
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
    const session = this.getOwnedConversationSession(pluginId, conversationId);
    if (!session) {
      return false;
    }

    this.conversationSessions.delete(conversationId);
    return true;
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
    const record = this.getRecordOrThrow(input.pluginId);
    const handler = input.action === 'reload'
      ? record.transport.reload
      : record.transport.reconnect;
    if (!handler) {
      throw new BadRequestException(
        `插件 ${input.pluginId} 不支持治理动作 ${input.action}`,
      );
    }

    await this.runWithTimeout(
      Promise.resolve(handler.call(record.transport)),
      15000,
      `插件 ${input.pluginId} 治理动作 ${input.action} 执行超时`,
    );
  }

  /**
   * 统一执行一次插件健康检查。
   * @param pluginId 插件 ID
   * @returns 健康检查结果
   */
  async checkPluginHealth(pluginId: string): Promise<{ ok: boolean }> {
    const record = this.records.get(pluginId);
    if (!record) {
      return {
        ok: false,
      };
    }
    if (!record.transport.checkHealth) {
      return {
        ok: true,
      };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.runWithTimeout(
          Promise.resolve(record.transport.checkHealth()),
          5000,
          `插件 ${pluginId} 健康检查超时`,
        );
        if (result.ok) {
          return result;
        }
      } catch {
        // 健康检查允许做一次轻量重试，以过滤瞬时网络抖动。
      }
    }

    return {
      ok: false,
    };
  }

  /**
   * 刷新插件最近一次心跳时间。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  async touchPluginHeartbeat(pluginId: string): Promise<void> {
    if (!pluginId) {
      return;
    }

    try {
      await this.pluginService.heartbeat(pluginId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return;
      }
      throw error;
    }
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
    const routes: Array<{
      pluginId: string;
      runtimeKind: PluginRuntimeKind;
      route: PluginRouteDescriptor;
    }> = [];

    for (const [pluginId, record] of this.records) {
      for (const route of record.manifest.routes ?? []) {
        routes.push({
          pluginId,
          runtimeKind: record.runtimeKind,
          route,
        });
      }
    }

    return routes;
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
    const record = this.getRecordOrThrow(input.pluginId);
    this.assertPluginEnabled(record, input.context);
    const targetTool = this.findToolOrThrow(record, input.toolName);
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
      const beforeCallResult = await this.runToolBeforeCallHooks({
        context: input.context,
        payload: lifecyclePayload,
      });

      if (beforeCallResult.action === 'short-circuit') {
        return beforeCallResult.output;
      }

      toolParams = beforeCallResult.payload.params;
    }

    try {
      const output = await this.runWithPluginExecutionSlot({
        record,
        type: 'tool',
        metadata: {
          toolName: input.toolName,
        },
        execute: () => this.runWithTimeout(
          Promise.resolve(
            record.transport.executeTool({
              toolName: input.toolName,
              params: toolParams,
              context: input.context,
            }),
          ),
          this.readTimeoutMs(input.context, 30000),
          `插件 ${input.pluginId} 工具 ${input.toolName} 执行超时`,
        ),
      });

      if (input.skipLifecycleHooks) {
        return output;
      }

      const afterCallPayload = await this.runToolAfterCallHooks({
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
    } catch (error) {
      if (isPluginOverloadedError(error)) {
        throw error;
      }
      await this.recordPluginFailureAndDispatch({
        pluginId: input.pluginId,
        context: input.context,
        type: error instanceof Error && error.message.includes('超时')
          ? 'tool:timeout'
          : 'tool:error',
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          toolName: input.toolName,
        },
      });
      throw error;
    }
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
    const record = this.getRecordOrThrow(input.pluginId);
    this.assertPluginEnabled(record, input.context);
    const route = this.findRouteOrThrow(record, input.request.path, input.request.method);

    try {
      return await this.runWithPluginExecutionSlot({
        record,
        type: 'route',
        metadata: {
          method: input.request.method,
          path: route.path,
        },
        execute: () => this.runWithTimeout(
          Promise.resolve(
            record.transport.invokeRoute({
              request: {
                ...input.request,
                path: normalizeRoutePath(route.path),
              },
              context: input.context,
            }),
          ),
          this.readTimeoutMs(input.context, 15000),
          `插件 ${input.pluginId} Route ${route.path} 执行超时`,
        ),
      });
    } catch (error) {
      if (isPluginOverloadedError(error)) {
        throw error;
      }
      await this.recordPluginFailureAndDispatch({
        pluginId: input.pluginId,
        context: input.context,
        type: error instanceof Error && error.message.includes('超时')
          ? 'route:timeout'
          : 'route:error',
        message: error instanceof Error ? error.message : String(error),
        metadata: {
          method: input.request.method,
          path: route.path,
        },
      });
      throw error;
    }
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
    if (input.method === 'plugin.self.get') {
      return toJsonValue(await this.buildPluginSelfInfo(input.pluginId));
    }

    const record = this.getRecordOrThrow(input.pluginId);
    const requiredPermission = HOST_METHOD_PERMISSION_MAP[input.method];
    if (requiredPermission && !record.manifest.permissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `插件 ${input.pluginId} 缺少权限 ${requiredPermission}`,
      );
    }

    if (input.method === 'automation.create') {
      return toJsonValue(
        await this.getAutomationService().create(
          this.requireUserId(input.context, 'automation.create'),
          this.requireString(input.params, 'name', 'automation.create'),
          this.readAutomationTrigger(input.params, 'automation.create'),
          this.readAutomationActions(input.params, 'automation.create'),
        ),
      );
    }
    if (input.method === 'automation.list') {
      return toJsonValue(
        await this.getAutomationService().findAllByUser(
          this.requireUserId(input.context, 'automation.list'),
        ),
      );
    }
    if (input.method === 'automation.event.emit') {
      return toJsonValue(
        await this.getAutomationService().emitEvent(
          this.requireString(input.params, 'event', 'automation.event.emit'),
          this.requireUserId(input.context, 'automation.event.emit'),
        ),
      );
    }
    if (input.method === 'automation.toggle') {
      return toJsonValue(
        await this.getAutomationService().toggle(
          this.requireString(input.params, 'automationId', 'automation.toggle'),
          this.requireUserId(input.context, 'automation.toggle'),
        ),
      );
    }
    if (input.method === 'automation.run') {
      return toJsonValue(
        await this.getAutomationService().executeAutomation(
          this.requireString(input.params, 'automationId', 'automation.run'),
          this.requireUserId(input.context, 'automation.run'),
        ),
      );
    }
    if (input.method === 'cron.register') {
      return toJsonValue(await this.cronService.registerCron(input.pluginId, {
        name: this.requireString(input.params, 'name', 'cron.register'),
        cron: this.requireString(input.params, 'cron', 'cron.register'),
        description: this.readOptionalString(input.params, 'description', 'cron.register'),
        data: Object.prototype.hasOwnProperty.call(input.params, 'data')
          ? input.params.data as JsonValue
          : undefined,
        enabled: this.readOptionalBoolean(input.params, 'enabled', 'cron.register'),
      }));
    }
    if (input.method === 'cron.list') {
      return toJsonValue(await this.cronService.listCronJobs(input.pluginId));
    }
    if (input.method === 'cron.delete') {
      return this.cronService.deleteCron(
        input.pluginId,
        this.requireString(input.params, 'jobId', 'cron.delete'),
      );
    }
    if (input.method === 'message.target.current.get') {
      const chatMessageService = await this.getChatMessageService();
      return toJsonValue(await chatMessageService.getCurrentPluginMessageTarget({
        context: input.context,
      }));
    }
    if (input.method === 'message.send') {
      const chatMessageService = await this.getChatMessageService();
      return toJsonValue(await chatMessageService.sendPluginMessage({
        context: input.context,
        target: this.readOptionalMessageTarget(
          input.params,
          'target',
          'message.send',
        ),
        content: this.readOptionalString(
          input.params,
          'content',
          'message.send',
        ),
        parts: this.readOptionalChatMessageParts(
          input.params,
          'parts',
          'message.send',
        ),
        provider: this.readOptionalString(
          input.params,
          'provider',
          'message.send',
        ),
        model: this.readOptionalString(
          input.params,
          'model',
          'message.send',
        ),
      }));
    }
    if (input.method === 'conversation.session.start') {
      return toJsonValue(this.startConversationSession({
        pluginId: input.pluginId,
        context: input.context,
        timeoutMs: this.requirePositiveNumber(
          input.params,
          'timeoutMs',
          'conversation.session.start',
        ),
        captureHistory: this.readOptionalBoolean(
          input.params,
          'captureHistory',
          'conversation.session.start',
        ) ?? false,
        metadata: Object.prototype.hasOwnProperty.call(input.params, 'metadata')
          ? input.params.metadata as JsonValue
          : undefined,
      }));
    }
    if (input.method === 'conversation.session.get') {
      return toJsonValue(this.getConversationSession(input.pluginId, input.context));
    }
    if (input.method === 'conversation.session.keep') {
      return toJsonValue(this.keepConversationSession({
        pluginId: input.pluginId,
        context: input.context,
        timeoutMs: this.requirePositiveNumber(
          input.params,
          'timeoutMs',
          'conversation.session.keep',
        ),
        resetTimeout: this.readOptionalBoolean(
          input.params,
          'resetTimeout',
          'conversation.session.keep',
        ) ?? true,
      }));
    }
    if (input.method === 'conversation.session.finish') {
      return this.finishConversationSession(input.pluginId, input.context);
    }
    if (input.method === 'subagent.run') {
      return toJsonValue(await this.runSubagent({
        pluginId: input.pluginId,
        context: input.context,
        params: input.params,
      }));
    }

    return this.hostService.call(input);
  }

  /**
   * 读取某个插件当前声明的治理动作。
   * @param pluginId 插件 ID
   * @returns 归一化后的治理动作列表
   */
  listSupportedActions(pluginId: string): PluginActionName[] {
    const record = this.records.get(pluginId);
    if (!record) {
      return ['health-check'];
    }

    return this.listSupportedActionsForRecord(record);
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
    const record = this.getRecordOrThrow(input.pluginId);
    this.assertPluginEnabled(record, input.context);

    try {
      return await this.runWithPluginExecutionSlot({
        record,
        type: 'hook',
        metadata: {
          hookName: input.hookName,
        },
        execute: () => this.runWithTimeout(
          Promise.resolve(
            record.transport.invokeHook({
              hookName: input.hookName,
              context: input.context,
              payload: input.payload,
            }),
          ),
          this.readTimeoutMs(input.context, 10000),
          `插件 ${record.manifest.id} Hook ${input.hookName} 执行超时`,
        ),
      });
    } catch (error) {
      if (isPluginOverloadedError(error)) {
        throw error;
      }
      if (input.recordFailure !== false) {
        await this.recordPluginFailureAndDispatch({
          pluginId: record.manifest.id,
          context: input.context,
          type: error instanceof Error && error.message.includes('超时')
            ? 'hook:timeout'
            : 'hook:error',
          message: error instanceof Error ? error.message : String(error),
          metadata: {
            hookName: input.hookName,
          },
          skipPluginErrorHook: input.hookName === 'plugin:error',
        });
      }
      throw error;
    }
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
    let request = cloneChatBeforeModelRequest(input.payload.request);

    for (const record of this.listHookRecords('chat:before-model', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'chat:before-model',
          context: input.context,
          payload: toJsonValue({
            context: input.payload.context,
            request,
          }),
        });
        const hookResult = this.normalizeChatBeforeModelHookResult(
          rawResult,
          request,
        );

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        if (hookResult.action === 'short-circuit') {
          const normalizedAssistant = normalizeAssistantOutput({
            assistantContent: hookResult.assistantContent,
            assistantParts: hookResult.assistantParts,
          });
          return {
            action: 'short-circuit',
            request,
            assistantContent: normalizedAssistant.assistantContent,
            assistantParts: normalizedAssistant.assistantParts,
            providerId: hookResult.providerId ?? request.providerId,
            modelId: hookResult.modelId ?? request.modelId,
            ...(hookResult.reason ? { reason: hookResult.reason } : {}),
          };
        }

        request = this.applyChatBeforeModelMutation(request, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return {
      action: 'continue',
      request,
    };
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
    let payload = cloneMessageReceivedHookPayload(input.payload);

    const sessionResult = await this.runConversationSessionMessageReceivedHook({
      context: input.context,
      payload,
    });
    if (sessionResult) {
      return sessionResult;
    }

    for (const record of this.listHookRecords(
      'message:received',
      input.context,
      payload,
    )) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'message:received',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeMessageReceivedHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        if (hookResult.action === 'short-circuit') {
          const normalizedAssistant = normalizeAssistantOutput({
            assistantContent: hookResult.assistantContent,
            assistantParts: hookResult.assistantParts,
          });
          return {
            action: 'short-circuit',
            payload,
            assistantContent: normalizedAssistant.assistantContent,
            assistantParts: normalizedAssistant.assistantParts,
            providerId: hookResult.providerId ?? payload.providerId,
            modelId: hookResult.modelId ?? payload.modelId,
            ...(hookResult.reason ? { reason: hookResult.reason } : {}),
          };
        }

        payload = this.applyMessageReceivedMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return {
      action: 'continue',
      payload,
    };
  }

  /**
   * 若当前会话存在活动等待态，则优先把消息交给该插件处理。
   * @param input Hook 调用上下文与载荷
   * @returns 已消费的结果；无活动等待态或等待态失效时返回 null
   */
  private async runConversationSessionMessageReceivedHook(input: {
    context: PluginCallContext;
    payload: MessageReceivedHookPayload;
  }): Promise<MessageReceivedExecutionResult | null> {
    const session = this.getActiveConversationSession(input.payload.conversationId);
    if (!session) {
      return null;
    }

    const ownerRecord = this.records.get(session.pluginId);
    if (!ownerRecord || !this.isPluginEnabledForContext(ownerRecord, input.context)) {
      this.conversationSessions.delete(session.conversationId);
      return null;
    }
    if (!this.getHookDescriptor(ownerRecord, 'message:received')) {
      this.conversationSessions.delete(session.conversationId);
      return null;
    }

    let payload = cloneMessageReceivedHookPayload(input.payload);
    payload.session = this.recordConversationSessionMessage(session, payload.message);

    try {
      const rawResult = await this.invokePluginHook({
        pluginId: ownerRecord.manifest.id,
        hookName: 'message:received',
        context: input.context,
        payload: toJsonValue(payload),
      });
      const hookResult = this.normalizeMessageReceivedHookResult(rawResult);

      if (!hookResult || hookResult.action === 'pass') {
        const activeSession = this.getActiveConversationSession(session.conversationId);
        payload.session = activeSession
          ? this.toConversationSessionInfo(activeSession)
          : payload.session;
        return {
          action: 'continue',
          payload,
        };
      }

      if (hookResult.action === 'short-circuit') {
        const normalizedAssistant = normalizeAssistantOutput({
          assistantContent: hookResult.assistantContent,
          assistantParts: hookResult.assistantParts,
        });
        const activeSession = this.getActiveConversationSession(session.conversationId);
        payload.session = activeSession
          ? this.toConversationSessionInfo(activeSession)
          : payload.session;
        return {
          action: 'short-circuit',
          payload,
          assistantContent: normalizedAssistant.assistantContent,
          assistantParts: normalizedAssistant.assistantParts,
          providerId: hookResult.providerId ?? payload.providerId,
          modelId: hookResult.modelId ?? payload.modelId,
          ...(hookResult.reason ? { reason: hookResult.reason } : {}),
        };
      }

      payload = this.applyMessageReceivedMutation(payload, hookResult);
      const activeSession = this.getActiveConversationSession(session.conversationId);
      payload.session = activeSession
        ? this.toConversationSessionInfo(activeSession)
        : payload.session;
      return {
        action: 'continue',
        payload,
      };
    } catch {
      this.conversationSessions.delete(session.conversationId);
      return null;
    }
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
    await this.invokeHookAcrossPlugins({
      hookName: 'chat:waiting-model',
      context: input.context,
      payload: input.payload,
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
    let payload = cloneChatAfterModelPayload(input.payload);

    for (const record of this.listHookRecords('chat:after-model', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'chat:after-model',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeChatAfterModelHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        payload = this.applyChatAfterModelMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return payload;
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
    await this.invokeHookAcrossPlugins({
      hookName: 'conversation:created',
      context: input.context,
      payload: input.payload,
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
    let payload = cloneMessageCreatedHookPayload(input.payload);

    for (const record of this.listHookRecords('message:created', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'message:created',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeMessageCreatedHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        payload = this.applyMessageCreatedMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return payload;
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
    let payload = cloneMessageUpdatedHookPayload(input.payload);

    for (const record of this.listHookRecords('message:updated', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'message:updated',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeMessageUpdatedHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        payload = this.applyMessageUpdatedMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return payload;
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
    await this.invokeHookAcrossPlugins({
      hookName: 'message:deleted',
      context: input.context,
      payload: input.payload,
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
    let payload = cloneAutomationBeforeRunPayload(input.payload);

    for (const record of this.listHookRecords('automation:before-run', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'automation:before-run',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeAutomationBeforeRunHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        if (hookResult.action === 'short-circuit') {
          return {
            action: 'short-circuit',
            status: hookResult.status,
            results: cloneJsonValueArray(hookResult.results),
          };
        }

        payload = this.applyAutomationBeforeRunMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return {
      action: 'continue',
      payload,
    };
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
    let payload = cloneAutomationAfterRunPayload(input.payload);

    for (const record of this.listHookRecords('automation:after-run', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'automation:after-run',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeAutomationAfterRunHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        payload = this.applyAutomationAfterRunMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return payload;
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
    let payload = cloneToolBeforeCallHookPayload(input.payload);

    for (const record of this.listHookRecords('tool:before-call', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'tool:before-call',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeToolBeforeCallHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }
        if (hookResult.action === 'short-circuit') {
          return {
            action: 'short-circuit',
            output: toJsonValue(hookResult.output),
          };
        }

        payload = this.applyToolBeforeCallMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return {
      action: 'continue',
      payload,
    };
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
    let payload = cloneToolAfterCallHookPayload(input.payload);

    for (const record of this.listHookRecords('tool:after-call', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'tool:after-call',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeToolAfterCallHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        payload = this.applyToolAfterCallMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return payload;
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
    let payload = cloneResponseBeforeSendHookPayload(input.payload);

    for (const record of this.listHookRecords('response:before-send', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'response:before-send',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeResponseBeforeSendHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        payload = this.applyResponseBeforeSendMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return payload;
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
    await this.invokeHookAcrossPlugins({
      hookName: 'response:after-send',
      context: input.context,
      payload: input.payload,
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
    let payload = cloneSubagentBeforeRunPayload(input.payload);

    for (const record of this.listHookRecords('subagent:before-run', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'subagent:before-run',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeSubagentBeforeRunHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }
        if (hookResult.action === 'short-circuit') {
          return {
            action: 'short-circuit',
            result: this.buildSubagentHookResult({
              providerId: hookResult.providerId ?? payload.request.providerId,
              modelId: hookResult.modelId ?? payload.request.modelId,
              text: hookResult.text,
              finishReason: hookResult.finishReason,
              toolCalls: hookResult.toolCalls,
              toolResults: hookResult.toolResults,
            }),
          };
        }

        payload = this.applySubagentBeforeRunMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return {
      action: 'continue',
      payload,
    };
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
    let payload = cloneSubagentAfterRunPayload(input.payload);

    for (const record of this.listHookRecords('subagent:after-run', input.context)) {
      try {
        const rawResult = await this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: 'subagent:after-run',
          context: input.context,
          payload: toJsonValue(payload),
        });
        const hookResult = this.normalizeSubagentAfterRunHookResult(rawResult);

        if (!hookResult || hookResult.action === 'pass') {
          continue;
        }

        payload = this.applySubagentAfterRunMutation(payload, hookResult);
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return payload;
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
    await this.invokeHookAcrossPlugins({
      hookName: 'plugin:loaded',
      context: input.context,
      payload: input.payload,
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
    await this.invokeHookAcrossPlugins({
      hookName: 'plugin:unloaded',
      context: input.context,
      payload: input.payload,
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
    await this.invokeHookAcrossPlugins({
      hookName: 'plugin:error',
      context: input.context,
      payload: input.payload,
    });
  }

  /**
   * 暴露 Host API 服务给后续 transport 适配器复用。
   * @returns Host API 服务实例
   */
  getHostService(): PluginHostService {
    return this.hostService;
  }

  /**
   * 记录一次插件失败，并向 `plugin:error` 观察者派发事件。
   * @param input 插件失败的上下文、消息与元数据
   * @returns 无返回值
   */
  private async recordPluginFailureAndDispatch(input: {
    pluginId: string;
    context: PluginCallContext;
    type: string;
    message: string;
    metadata?: JsonObject;
    checked?: boolean;
    skipPluginErrorHook?: boolean;
  }): Promise<void> {
    await this.pluginService.recordPluginFailure(input.pluginId, {
      type: input.type,
      message: input.message,
      metadata: input.metadata,
      checked: input.checked,
    });

    if (input.skipPluginErrorHook) {
      return;
    }

    const record = this.records.get(input.pluginId);
    await this.runPluginErrorHooks({
      context: input.context,
      payload: {
        context: {
          ...input.context,
        },
        plugin: record
          ? this.buildPluginLifecycleHookInfo(record)
          : {
            id: input.pluginId,
            runtimeKind: 'remote',
            deviceType: 'remote',
            manifest: null,
          },
        error: {
          type: input.type,
          message: input.message,
          metadata: input.metadata ?? null,
        },
        occurredAt: new Date().toISOString(),
      },
    });
  }

  /**
   * 读取一条运行时记录；不存在时抛错。
   * @param pluginId 插件 ID
   * @returns 运行时记录
   */
  private getRecordOrThrow(pluginId: string): PluginRuntimeRecord {
    const record = this.records.get(pluginId);
    if (!record) {
      throw new NotFoundException(`Plugin not found: ${pluginId}`);
    }

    return record;
  }

  /**
   * 归一化插件生命周期 Hook 可见的插件摘要。
   * @param record 运行时插件记录
   * @returns 可序列化的插件摘要
   */
  private buildPluginLifecycleHookInfo(
    record: PluginRuntimeRecord,
  ): PluginLifecycleHookInfo {
    return {
      id: record.manifest.id,
      runtimeKind: record.runtimeKind,
      deviceType: record.deviceType,
      manifest: record.manifest,
    };
  }

  /**
   * 构造插件自省信息，优先读取 runtime 中的实时声明。
   * @param pluginId 插件 ID
   * @returns 可返回给插件自身的摘要
   */
  private async buildPluginSelfInfo(pluginId: string): Promise<PluginSelfInfo> {
    const record = this.records.get(pluginId);
    if (!record) {
      const plugin = await this.pluginService.getPluginSelfInfo(pluginId);
      return {
        ...plugin,
        supportedActions: ['health-check'],
      };
    }

    return {
      id: record.manifest.id,
      name: record.manifest.name,
      runtimeKind: record.runtimeKind,
      permissions: [...record.manifest.permissions],
      hooks: [...(record.manifest.hooks ?? [])],
      routes: [...(record.manifest.routes ?? [])],
      supportedActions: this.listSupportedActionsForRecord(record),
      ...(record.manifest.version ? { version: record.manifest.version } : {}),
      ...(record.manifest.description
        ? { description: record.manifest.description }
        : {}),
      ...(record.manifest.crons
        ? { crons: [...record.manifest.crons] }
        : {}),
    };
  }

  /**
   * 判断插件在当前上下文是否启用。
   * @param record 插件记录
   * @param context 调用上下文
   * @returns 是否启用
   */
  private isPluginEnabledForContext(
    record: PluginRuntimeRecord,
    context: PluginCallContext,
  ): boolean {
    const conversationId = context.conversationId;
    if (conversationId) {
      const scoped = record.governance.scope.conversations[conversationId];
      if (typeof scoped === 'boolean') {
        return scoped;
      }
    }

    return record.governance.scope.defaultEnabled;
  }

  /**
   * 在执行前断言插件当前作用域可用。
   * @param record 插件记录
   * @param context 调用上下文
   * @returns 无返回值；禁用时抛错
   */
  private assertPluginEnabled(
    record: PluginRuntimeRecord,
    context: PluginCallContext,
  ): void {
    if (this.isPluginEnabledForContext(record, context)) {
      return;
    }

    throw new ForbiddenException(
      `插件 ${record.manifest.id} 在当前作用域已禁用`,
    );
  }

  /**
   * 按 path + method 读取一个已声明的 Route；不存在时抛错。
   * @param record 插件记录
   * @param path 请求路径
   * @param method HTTP 方法
   * @returns 命中的 Route 描述
   */
  private findRouteOrThrow(
    record: PluginRuntimeRecord,
    path: string,
    method: PluginRouteRequest['method'],
  ): PluginRouteDescriptor {
    const normalizedPath = normalizeRoutePath(path);
    const route = (record.manifest.routes ?? []).find(
      (item) =>
        normalizeRoutePath(item.path) === normalizedPath
        && item.methods.includes(method),
    );
    if (route) {
      return route;
    }

    throw new NotFoundException(
      `插件 ${record.manifest.id} 未声明 Route: ${method} ${normalizedPath}`,
    );
  }

  /**
   * 对当前作用域内支持指定 Hook 的插件执行统一调度。
   * @param input Hook 名称、调用上下文与 JSON 载荷
   * @returns 所有插件 Hook 的返回值
   */
  private async invokeHookAcrossPlugins(input: {
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: unknown;
  }): Promise<Array<JsonValue | null | undefined>> {
    const results: Array<JsonValue | null | undefined> = [];

    for (const record of this.listHookRecords(input.hookName, input.context)) {
      try {
        results.push(
          await this.invokePluginHook({
            pluginId: record.manifest.id,
            hookName: input.hookName,
            context: input.context,
            payload: toJsonValue(input.payload),
          }),
        );
      } catch {
        // 单个 Hook 失败已由 invokePluginHook 记录；这里继续执行后续插件。
      }
    }

    return results;
  }

  /**
   * 列出当前作用域内声明了指定 Hook 的插件，并按插件 ID 稳定排序。
   * @param hookName Hook 名称
   * @param context 调用上下文
   * @returns 已排序的运行时记录列表
   */
  private listHookRecords(
    hookName: PluginHookName,
    context: PluginCallContext,
    payload?: unknown,
  ): PluginRuntimeRecord[] {
    return [...this.records.values()]
      .map((record) => ({
        record,
        hook: this.getHookDescriptor(record, hookName),
      }))
      .filter((entry): entry is { record: PluginRuntimeRecord; hook: PluginHookDescriptor } =>
        entry.hook !== null,
      )
      .filter((entry) =>
        this.isPluginEnabledForContext(entry.record, context)
        && this.matchesHookFilter(entry.hook, hookName, payload),
      )
      .sort((left, right) => {
        const priorityDiff = this.getHookPriority(left.hook) - this.getHookPriority(right.hook);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return left.record.manifest.id.localeCompare(right.record.manifest.id);
      })
      .map((entry) => entry.record);
  }

  /**
   * 读取插件声明的指定 Hook 描述。
   * @param record 运行时插件记录
   * @param hookName Hook 名称
   * @returns 命中的 Hook 描述；不存在时返回 null
   */
  private getHookDescriptor(
    record: PluginRuntimeRecord,
    hookName: PluginHookName,
  ): PluginHookDescriptor | null {
    return (record.manifest.hooks ?? []).find((hook) => hook.name === hookName) ?? null;
  }

  /**
   * 读取 Hook 声明的调度优先级。
   * @param hook Hook 描述
   * @returns 归一化后的优先级，数字越小越先执行
   */
  private getHookPriority(hook: PluginHookDescriptor): number {
    if (typeof hook.priority !== 'number' || !Number.isFinite(hook.priority)) {
      return 0;
    }

    return Math.trunc(hook.priority);
  }

  /**
   * 判断指定 Hook 在当前载荷下是否命中过滤条件。
   * @param hook Hook 描述
   * @param hookName Hook 名称
   * @param payload 当前载荷
   * @returns 是否命中过滤
   */
  private matchesHookFilter(
    hook: PluginHookDescriptor,
    hookName: PluginHookName,
    payload?: unknown,
  ): boolean {
    if (hookName !== 'message:received' || !hook.filter?.message) {
      return true;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }

    const messagePayload = payload as MessageReceivedHookPayload;
    const filter = hook.filter.message;
    const messageText = this.getMessageReceivedText(messagePayload);
    const messageKind = this.detectMessageKind(messagePayload.message);

    if (
      Array.isArray(filter.commands)
      && filter.commands.length > 0
      && !filter.commands.some((command) => matchesMessageCommand(messageText, command))
    ) {
      return false;
    }

    if (filter.regex) {
      const regex = buildFilterRegex(filter.regex);
      if (!regex.test(messageText)) {
        return false;
      }
    }

    if (
      Array.isArray(filter.messageKinds)
      && filter.messageKinds.length > 0
      && !filter.messageKinds.includes(messageKind)
    ) {
      return false;
    }

    return true;
  }

  /**
   * 提取收到消息过滤时可匹配的文本。
   * @param payload 收到消息 Hook 载荷
   * @returns 归一化后的文本
   */
  private getMessageReceivedText(payload: MessageReceivedHookPayload): string {
    if (typeof payload.message.content === 'string') {
      return payload.message.content;
    }

    return payload.message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
  }

  /**
   * 判断收到消息的消息类型。
   * @param message 消息快照
   * @returns 归一化后的消息类型
   */
  private detectMessageKind(
    message: MessageReceivedHookPayload['message'],
  ): PluginMessageKind {
    const hasImage = message.parts.some((part) => part.type === 'image');
    const hasTextPart = message.parts.some((part) => part.type === 'text');
    const hasText = hasTextPart || Boolean(message.content?.trim());

    if (hasImage && hasText) {
      return 'mixed';
    }
    if (hasImage) {
      return 'image';
    }

    return 'text';
  }

  /**
   * 将插件返回的聊天前 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @param currentRequest 当前请求快照
   * @returns 归一化后的 Hook 结果
   */
  private normalizeChatBeforeModelHookResult(
    result: JsonValue | null | undefined,
    currentRequest: ChatBeforeModelRequest,
  ): NormalizedChatBeforeModelHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('chat:before-model Hook 返回值必须是对象');
    }

    if ('appendSystemPrompt' in result) {
      const appendSystemPrompt = result.appendSystemPrompt;
      if (appendSystemPrompt === null || typeof appendSystemPrompt === 'undefined') {
        return null;
      }
      if (typeof appendSystemPrompt !== 'string') {
        throw new Error('chat:before-model Hook 的 appendSystemPrompt 必须是字符串');
      }
      return {
        action: 'mutate',
        systemPrompt: currentRequest.systemPrompt
          ? [currentRequest.systemPrompt, appendSystemPrompt].join('\n\n')
          : appendSystemPrompt,
      };
    }

    if (result.action === 'pass') {
      return { action: 'pass' };
    }

    if (result.action === 'mutate') {
      if ('providerId' in result && typeof result.providerId !== 'string') {
        throw new Error('chat:before-model Hook 的 providerId 必须是字符串');
      }
      if ('modelId' in result && typeof result.modelId !== 'string') {
        throw new Error('chat:before-model Hook 的 modelId 必须是字符串');
      }
      if ('systemPrompt' in result && typeof result.systemPrompt !== 'string') {
        throw new Error('chat:before-model Hook 的 systemPrompt 必须是字符串');
      }
      if ('messages' in result && !Array.isArray(result.messages)) {
        throw new Error('chat:before-model Hook 的 messages 必须是数组');
      }
      if ('toolNames' in result && !isStringArray(result.toolNames)) {
        throw new Error('chat:before-model Hook 的 toolNames 必须是字符串数组');
      }
      if ('variant' in result && result.variant !== null && typeof result.variant !== 'string') {
        throw new Error('chat:before-model Hook 的 variant 必须是字符串或 null');
      }
      if (
        'providerOptions' in result
        && result.providerOptions !== null
        && !isJsonObjectValue(result.providerOptions)
      ) {
        throw new Error('chat:before-model Hook 的 providerOptions 必须是对象或 null');
      }
      if (
        'headers' in result
        && result.headers !== null
        && !isStringRecord(result.headers)
      ) {
        throw new Error('chat:before-model Hook 的 headers 必须是字符串对象或 null');
      }
      if (
        'maxOutputTokens' in result
        && result.maxOutputTokens !== null
        && typeof result.maxOutputTokens !== 'number'
      ) {
        throw new Error('chat:before-model Hook 的 maxOutputTokens 必须是数字或 null');
      }

      return result as unknown as ChatBeforeModelHookMutateResult;
    }

    if (result.action === 'short-circuit') {
      if (typeof result.assistantContent !== 'string') {
        throw new Error('chat:before-model Hook 的 assistantContent 必须是字符串');
      }
      if (
        'assistantParts' in result
        && result.assistantParts !== null
        && !isChatMessagePartArray(result.assistantParts)
      ) {
        throw new Error('chat:before-model Hook 的 assistantParts 必须是消息 part 数组或 null');
      }
      if ('providerId' in result && typeof result.providerId !== 'string') {
        throw new Error('chat:before-model Hook 的 providerId 必须是字符串');
      }
      if ('modelId' in result && typeof result.modelId !== 'string') {
        throw new Error('chat:before-model Hook 的 modelId 必须是字符串');
      }
      if ('reason' in result && typeof result.reason !== 'string') {
        throw new Error('chat:before-model Hook 的 reason 必须是字符串');
      }

      return result as unknown as ChatBeforeModelHookShortCircuitResult;
    }

    throw new Error('chat:before-model Hook 返回了未知 action');
  }

  /**
   * 将插件返回的收到消息 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeMessageReceivedHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedMessageReceivedHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('message:received Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if ('providerId' in result && typeof result.providerId !== 'string') {
        throw new Error('message:received Hook 的 providerId 必须是字符串');
      }
      if ('modelId' in result && typeof result.modelId !== 'string') {
        throw new Error('message:received Hook 的 modelId 必须是字符串');
      }
      if ('content' in result && result.content !== null && typeof result.content !== 'string') {
        throw new Error('message:received Hook 的 content 必须是字符串或 null');
      }
      if (
        'parts' in result
        && result.parts !== null
        && !isChatMessagePartArray(result.parts)
      ) {
        throw new Error('message:received Hook 的 parts 必须是消息 part 数组或 null');
      }
      if (
        'modelMessages' in result
        && !isPluginLlmMessageArray(result.modelMessages)
      ) {
        throw new Error('message:received Hook 的 modelMessages 必须是统一消息数组');
      }

      return result as unknown as MessageReceivedHookMutateResult;
    }
    if (result.action === 'short-circuit') {
      if (typeof result.assistantContent !== 'string') {
        throw new Error('message:received Hook 的 assistantContent 必须是字符串');
      }
      if (
        'assistantParts' in result
        && result.assistantParts !== null
        && !isChatMessagePartArray(result.assistantParts)
      ) {
        throw new Error('message:received Hook 的 assistantParts 必须是消息 part 数组或 null');
      }
      if ('providerId' in result && typeof result.providerId !== 'string') {
        throw new Error('message:received Hook 的 providerId 必须是字符串');
      }
      if ('modelId' in result && typeof result.modelId !== 'string') {
        throw new Error('message:received Hook 的 modelId 必须是字符串');
      }
      if ('reason' in result && typeof result.reason !== 'string') {
        throw new Error('message:received Hook 的 reason 必须是字符串');
      }

      return result as unknown as MessageReceivedHookShortCircuitResult;
    }

    throw new Error('message:received Hook 返回了未知 action');
  }

  /**
   * 将插件返回的聊天后 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeChatAfterModelHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedChatAfterModelHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('chat:after-model Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if (
        'assistantContent' in result
        && result.assistantContent !== null
        && typeof result.assistantContent !== 'string'
      ) {
        throw new Error('chat:after-model Hook 的 assistantContent 必须是字符串或 null');
      }
      if (
        'assistantParts' in result
        && result.assistantParts !== null
        && !isChatMessagePartArray(result.assistantParts)
      ) {
        throw new Error('chat:after-model Hook 的 assistantParts 必须是消息 part 数组或 null');
      }

      return result as unknown as ChatAfterModelHookMutateResult;
    }

    throw new Error('chat:after-model Hook 返回了未知 action');
  }

  /**
   * 将一条 mutate 结果应用到当前请求快照。
   * @param currentRequest 当前请求
   * @param mutation 变更结果
   * @returns 新的请求快照
   */
  private applyChatBeforeModelMutation(
    currentRequest: ChatBeforeModelRequest,
    mutation: ChatBeforeModelHookMutateResult,
  ): ChatBeforeModelRequest {
    const nextRequest = cloneChatBeforeModelRequest(currentRequest);

    if ('providerId' in mutation && typeof mutation.providerId === 'string') {
      nextRequest.providerId = mutation.providerId;
    }
    if ('modelId' in mutation && typeof mutation.modelId === 'string') {
      nextRequest.modelId = mutation.modelId;
    }
    if ('systemPrompt' in mutation && typeof mutation.systemPrompt === 'string') {
      nextRequest.systemPrompt = mutation.systemPrompt;
    }
    if ('messages' in mutation && Array.isArray(mutation.messages)) {
      nextRequest.messages = cloneChatMessages(mutation.messages);
    }
    if ('variant' in mutation) {
      nextRequest.variant = mutation.variant ?? undefined;
    }
    if ('providerOptions' in mutation) {
      nextRequest.providerOptions = mutation.providerOptions === null
        || typeof mutation.providerOptions === 'undefined'
        ? undefined
        : { ...mutation.providerOptions };
    }
    if ('headers' in mutation) {
      nextRequest.headers = mutation.headers === null
        || typeof mutation.headers === 'undefined'
        ? undefined
        : { ...mutation.headers };
    }
    if ('maxOutputTokens' in mutation) {
      nextRequest.maxOutputTokens = mutation.maxOutputTokens ?? undefined;
    }
    if ('toolNames' in mutation && Array.isArray(mutation.toolNames)) {
      const allowedToolNames = new Set(mutation.toolNames);
      nextRequest.availableTools = nextRequest.availableTools.filter(
        (tool: ChatBeforeModelRequest['availableTools'][number]) =>
          allowedToolNames.has(tool.name),
      );
    }

    return nextRequest;
  }

  /**
   * 将一条收到消息 mutate 结果应用到当前载荷。
   * @param currentPayload 当前收到消息载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applyMessageReceivedMutation(
    currentPayload: MessageReceivedHookPayload,
    mutation: MessageReceivedHookMutateResult,
  ): MessageReceivedHookPayload {
    const nextPayload = cloneMessageReceivedHookPayload(currentPayload);

    if ('providerId' in mutation && typeof mutation.providerId === 'string') {
      nextPayload.providerId = mutation.providerId;
    }
    if ('modelId' in mutation && typeof mutation.modelId === 'string') {
      nextPayload.modelId = mutation.modelId;
    }
    if ('content' in mutation) {
      nextPayload.message.content = mutation.content ?? null;
    }
    if ('parts' in mutation) {
      const parts = mutation.parts ?? [];
      nextPayload.message.parts = mutation.parts === null
        ? []
        : cloneChatMessageParts(parts);
    }
    if ('modelMessages' in mutation && Array.isArray(mutation.modelMessages)) {
      nextPayload.modelMessages = clonePluginLlmMessages(mutation.modelMessages);
    }

    return nextPayload;
  }

  /**
   * 将一条聊天后 mutate 结果应用到当前完成态载荷。
   * @param currentPayload 当前完成态载荷
   * @param mutation 变更结果
   * @returns 新的完成态载荷
   */
  private applyChatAfterModelMutation(
    currentPayload: ChatAfterModelHookPayload,
    mutation: ChatAfterModelHookMutateResult,
  ): ChatAfterModelHookPayload {
    const nextPayload = cloneChatAfterModelPayload(currentPayload);

    if (
      'assistantContent' in mutation
      && typeof mutation.assistantContent === 'string'
    ) {
      nextPayload.assistantContent = mutation.assistantContent;
    }
    if ('assistantParts' in mutation) {
      nextPayload.assistantParts = mutation.assistantParts === null
        ? []
        : cloneChatMessageParts(mutation.assistantParts ?? []);
    }

    return nextPayload;
  }

  /**
   * 将插件返回的消息创建 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeMessageCreatedHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedMessageCreatedHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('message:created Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if ('content' in result && result.content !== null && typeof result.content !== 'string') {
        throw new Error('message:created Hook 的 content 必须是字符串或 null');
      }
      if (
        'parts' in result
        && result.parts !== null
        && !isChatMessagePartArray(result.parts)
      ) {
        throw new Error('message:created Hook 的 parts 必须是消息 part 数组或 null');
      }
      if (
        'modelMessages' in result
        && !isPluginLlmMessageArray(result.modelMessages)
      ) {
        throw new Error('message:created Hook 的 modelMessages 必须是统一消息数组');
      }
      if ('provider' in result && result.provider !== null && typeof result.provider !== 'string') {
        throw new Error('message:created Hook 的 provider 必须是字符串或 null');
      }
      if ('model' in result && result.model !== null && typeof result.model !== 'string') {
        throw new Error('message:created Hook 的 model 必须是字符串或 null');
      }
      if (
        'status' in result
        && result.status !== null
        && !isChatMessageStatus(result.status)
      ) {
        throw new Error('message:created Hook 的 status 必须是合法消息状态或 null');
      }

      return result as unknown as MessageCreatedHookMutateResult;
    }

    throw new Error('message:created Hook 返回了未知 action');
  }

  /**
   * 将插件返回的消息更新 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeMessageUpdatedHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedMessageUpdatedHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('message:updated Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if ('content' in result && result.content !== null && typeof result.content !== 'string') {
        throw new Error('message:updated Hook 的 content 必须是字符串或 null');
      }
      if (
        'parts' in result
        && result.parts !== null
        && !isChatMessagePartArray(result.parts)
      ) {
        throw new Error('message:updated Hook 的 parts 必须是消息 part 数组或 null');
      }
      if ('provider' in result && result.provider !== null && typeof result.provider !== 'string') {
        throw new Error('message:updated Hook 的 provider 必须是字符串或 null');
      }
      if ('model' in result && result.model !== null && typeof result.model !== 'string') {
        throw new Error('message:updated Hook 的 model 必须是字符串或 null');
      }
      if (
        'status' in result
        && result.status !== null
        && !isChatMessageStatus(result.status)
      ) {
        throw new Error('message:updated Hook 的 status 必须是合法消息状态或 null');
      }

      return result as unknown as MessageUpdatedHookMutateResult;
    }

    throw new Error('message:updated Hook 返回了未知 action');
  }

  /**
   * 将插件返回的自动化运行前 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeAutomationBeforeRunHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedAutomationBeforeRunHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('automation:before-run Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if ('actions' in result && !isActionConfigArray(result.actions)) {
        throw new Error('automation:before-run Hook 的 actions 必须是动作数组');
      }

      return result as unknown as AutomationBeforeRunHookMutateResult;
    }
    if (result.action === 'short-circuit') {
      if (typeof result.status !== 'string') {
        throw new Error('automation:before-run Hook 的 status 必须是字符串');
      }
      if (!Array.isArray(result.results)) {
        throw new Error('automation:before-run Hook 的 results 必须是数组');
      }

      return result as unknown as AutomationBeforeRunHookShortCircuitResult;
    }

    throw new Error('automation:before-run Hook 返回了未知 action');
  }

  /**
   * 将插件返回的自动化运行后 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeAutomationAfterRunHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedAutomationAfterRunHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('automation:after-run Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if ('status' in result && typeof result.status !== 'string') {
        throw new Error('automation:after-run Hook 的 status 必须是字符串');
      }
      if ('results' in result && !Array.isArray(result.results)) {
        throw new Error('automation:after-run Hook 的 results 必须是数组');
      }

      return result as unknown as AutomationAfterRunHookMutateResult;
    }

    throw new Error('automation:after-run Hook 返回了未知 action');
  }

  /**
   * 将插件返回的子代理执行前 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeSubagentBeforeRunHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedSubagentBeforeRunHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('subagent:before-run Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if ('providerId' in result && result.providerId !== null && typeof result.providerId !== 'string') {
        throw new Error('subagent:before-run Hook 的 providerId 必须是字符串或 null');
      }
      if ('modelId' in result && result.modelId !== null && typeof result.modelId !== 'string') {
        throw new Error('subagent:before-run Hook 的 modelId 必须是字符串或 null');
      }
      if ('system' in result && result.system !== null && typeof result.system !== 'string') {
        throw new Error('subagent:before-run Hook 的 system 必须是字符串或 null');
      }
      if ('messages' in result && !isPluginLlmMessageArray(result.messages)) {
        throw new Error('subagent:before-run Hook 的 messages 必须是统一消息数组');
      }
      if ('toolNames' in result && result.toolNames !== null && !isStringArray(result.toolNames)) {
        throw new Error('subagent:before-run Hook 的 toolNames 必须是字符串数组或 null');
      }
      if ('variant' in result && result.variant !== null && typeof result.variant !== 'string') {
        throw new Error('subagent:before-run Hook 的 variant 必须是字符串或 null');
      }
      if ('providerOptions' in result && result.providerOptions !== null && !isJsonObjectValue(result.providerOptions)) {
        throw new Error('subagent:before-run Hook 的 providerOptions 必须是对象或 null');
      }
      if ('headers' in result && result.headers !== null && !isStringRecord(result.headers)) {
        throw new Error('subagent:before-run Hook 的 headers 必须是字符串字典或 null');
      }
      if ('maxOutputTokens' in result && result.maxOutputTokens !== null && typeof result.maxOutputTokens !== 'number') {
        throw new Error('subagent:before-run Hook 的 maxOutputTokens 必须是数字或 null');
      }
      if ('maxSteps' in result && result.maxSteps !== null && typeof result.maxSteps !== 'number') {
        throw new Error('subagent:before-run Hook 的 maxSteps 必须是数字或 null');
      }

      return result as unknown as SubagentBeforeRunHookMutateResult;
    }
    if (result.action === 'short-circuit') {
      if (typeof result.text !== 'string') {
        throw new Error('subagent:before-run Hook 的 text 必须是字符串');
      }
      if ('providerId' in result && result.providerId !== null && typeof result.providerId !== 'string') {
        throw new Error('subagent:before-run Hook 的 providerId 必须是字符串或 null');
      }
      if ('modelId' in result && result.modelId !== null && typeof result.modelId !== 'string') {
        throw new Error('subagent:before-run Hook 的 modelId 必须是字符串或 null');
      }
      if ('finishReason' in result && result.finishReason !== null && typeof result.finishReason !== 'string') {
        throw new Error('subagent:before-run Hook 的 finishReason 必须是字符串或 null');
      }
      if ('toolCalls' in result && !isPluginSubagentToolCallArray(result.toolCalls)) {
        throw new Error('subagent:before-run Hook 的 toolCalls 必须是工具调用数组');
      }
      if ('toolResults' in result && !isPluginSubagentToolResultArray(result.toolResults)) {
        throw new Error('subagent:before-run Hook 的 toolResults 必须是工具结果数组');
      }

      return result as unknown as SubagentBeforeRunHookShortCircuitResult;
    }

    throw new Error('subagent:before-run Hook 返回了未知 action');
  }

  /**
   * 将插件返回的子代理执行后 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeSubagentAfterRunHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedSubagentAfterRunHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('subagent:after-run Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if ('text' in result && typeof result.text !== 'string') {
        throw new Error('subagent:after-run Hook 的 text 必须是字符串');
      }
      if ('providerId' in result && result.providerId !== null && typeof result.providerId !== 'string') {
        throw new Error('subagent:after-run Hook 的 providerId 必须是字符串或 null');
      }
      if ('modelId' in result && result.modelId !== null && typeof result.modelId !== 'string') {
        throw new Error('subagent:after-run Hook 的 modelId 必须是字符串或 null');
      }
      if ('finishReason' in result && result.finishReason !== null && typeof result.finishReason !== 'string') {
        throw new Error('subagent:after-run Hook 的 finishReason 必须是字符串或 null');
      }
      if ('toolCalls' in result && !isPluginSubagentToolCallArray(result.toolCalls)) {
        throw new Error('subagent:after-run Hook 的 toolCalls 必须是工具调用数组');
      }
      if ('toolResults' in result && !isPluginSubagentToolResultArray(result.toolResults)) {
        throw new Error('subagent:after-run Hook 的 toolResults 必须是工具结果数组');
      }

      return result as unknown as SubagentAfterRunHookMutateResult;
    }

    throw new Error('subagent:after-run Hook 返回了未知 action');
  }

  /**
   * 将插件返回的工具调用前 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeToolBeforeCallHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedToolBeforeCallHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('tool:before-call Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if ('params' in result && !isJsonObjectValue(result.params)) {
        throw new Error('tool:before-call Hook 的 params 必须是对象');
      }

      return result as unknown as ToolBeforeCallHookMutateResult;
    }
    if (result.action === 'short-circuit') {
      if (!('output' in result) || typeof result.output === 'undefined') {
        throw new Error('tool:before-call Hook 的 output 不能为空');
      }

      return result as unknown as ToolBeforeCallHookShortCircuitResult;
    }

    throw new Error('tool:before-call Hook 返回了未知 action');
  }

  /**
   * 将插件返回的工具调用后 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeToolAfterCallHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedToolAfterCallHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('tool:after-call Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if (!('output' in result) || typeof result.output === 'undefined') {
        throw new Error('tool:after-call Hook 的 output 不能为空');
      }

      return result as unknown as ToolAfterCallHookMutateResult;
    }

    throw new Error('tool:after-call Hook 返回了未知 action');
  }

  /**
   * 将插件返回的最终回复发送前 Hook 结果归一为统一结构。
   * @param result 插件原始返回值
   * @returns 归一化后的 Hook 结果
   */
  private normalizeResponseBeforeSendHookResult(
    result: JsonValue | null | undefined,
  ): NormalizedResponseBeforeSendHookResult | null {
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (!isJsonObjectValue(result)) {
      throw new Error('response:before-send Hook 返回值必须是对象');
    }
    if (result.action === 'pass') {
      return { action: 'pass' };
    }
    if (result.action === 'mutate') {
      if ('providerId' in result && typeof result.providerId !== 'string') {
        throw new Error('response:before-send Hook 的 providerId 必须是字符串');
      }
      if ('modelId' in result && typeof result.modelId !== 'string') {
        throw new Error('response:before-send Hook 的 modelId 必须是字符串');
      }
      if (
        'assistantContent' in result
        && typeof result.assistantContent !== 'string'
      ) {
        throw new Error('response:before-send Hook 的 assistantContent 必须是字符串');
      }
      if (
        'assistantParts' in result
        && result.assistantParts !== null
        && !isChatMessagePartArray(result.assistantParts)
      ) {
        throw new Error('response:before-send Hook 的 assistantParts 必须是消息 part 数组或 null');
      }
      if ('toolCalls' in result && !Array.isArray(result.toolCalls)) {
        throw new Error('response:before-send Hook 的 toolCalls 必须是数组');
      }
      if ('toolResults' in result && !Array.isArray(result.toolResults)) {
        throw new Error('response:before-send Hook 的 toolResults 必须是数组');
      }

      return result as unknown as ResponseBeforeSendHookMutateResult;
    }

    throw new Error('response:before-send Hook 返回了未知 action');
  }

  /**
   * 将一条消息创建 mutate 结果应用到当前载荷。
   * @param currentPayload 当前消息创建载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applyMessageCreatedMutation(
    currentPayload: MessageCreatedHookPayload,
    mutation: MessageCreatedHookMutateResult,
  ): MessageCreatedHookPayload {
    const nextPayload = cloneMessageCreatedHookPayload(currentPayload);

    if ('content' in mutation) {
      nextPayload.message.content = mutation.content ?? null;
    }
    if ('parts' in mutation) {
      const parts = mutation.parts ?? [];
      nextPayload.message.parts = mutation.parts === null
        ? []
        : cloneChatMessageParts(parts);
    }
    if ('modelMessages' in mutation && Array.isArray(mutation.modelMessages)) {
      nextPayload.modelMessages = clonePluginLlmMessages(mutation.modelMessages);
    }
    if ('provider' in mutation) {
      nextPayload.message.provider = mutation.provider ?? null;
    }
    if ('model' in mutation) {
      nextPayload.message.model = mutation.model ?? null;
    }
    if ('status' in mutation) {
      nextPayload.message.status = mutation.status ?? undefined;
    }

    return nextPayload;
  }

  /**
   * 将一条消息更新 mutate 结果应用到当前载荷。
   * @param currentPayload 当前消息更新载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applyMessageUpdatedMutation(
    currentPayload: MessageUpdatedHookPayload,
    mutation: MessageUpdatedHookMutateResult,
  ): MessageUpdatedHookPayload {
    const nextPayload = cloneMessageUpdatedHookPayload(currentPayload);

    if ('content' in mutation) {
      nextPayload.nextMessage.content = mutation.content ?? null;
    }
    if ('parts' in mutation) {
      const parts = mutation.parts ?? [];
      nextPayload.nextMessage.parts = mutation.parts === null
        ? []
        : cloneChatMessageParts(parts);
    }
    if ('provider' in mutation) {
      nextPayload.nextMessage.provider = mutation.provider ?? null;
    }
    if ('model' in mutation) {
      nextPayload.nextMessage.model = mutation.model ?? null;
    }
    if ('status' in mutation) {
      nextPayload.nextMessage.status = mutation.status ?? undefined;
    }

    return nextPayload;
  }

  /**
   * 将一条自动化运行前 mutate 结果应用到当前载荷。
   * @param currentPayload 当前自动化运行前载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applyAutomationBeforeRunMutation(
    currentPayload: AutomationBeforeRunHookPayload,
    mutation: AutomationBeforeRunHookMutateResult,
  ): AutomationBeforeRunHookPayload {
    const nextPayload = cloneAutomationBeforeRunPayload(currentPayload);

    if ('actions' in mutation && Array.isArray(mutation.actions)) {
      nextPayload.actions = cloneAutomationActions(mutation.actions);
    }

    return nextPayload;
  }

  /**
   * 将一条自动化运行后 mutate 结果应用到当前载荷。
   * @param currentPayload 当前自动化运行后载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applyAutomationAfterRunMutation(
    currentPayload: AutomationAfterRunHookPayload,
    mutation: AutomationAfterRunHookMutateResult,
  ): AutomationAfterRunHookPayload {
    const nextPayload = cloneAutomationAfterRunPayload(currentPayload);

    if ('status' in mutation && typeof mutation.status === 'string') {
      nextPayload.status = mutation.status;
    }
    if ('results' in mutation && Array.isArray(mutation.results)) {
      nextPayload.results = cloneJsonValueArray(mutation.results);
    }

    return nextPayload;
  }

  /**
   * 将一条子代理执行前 mutate 结果应用到当前载荷。
   * @param currentPayload 当前子代理执行前载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applySubagentBeforeRunMutation(
    currentPayload: SubagentBeforeRunHookPayload,
    mutation: SubagentBeforeRunHookMutateResult,
  ): SubagentBeforeRunHookPayload {
    const nextPayload = cloneSubagentBeforeRunPayload(currentPayload);

    if ('providerId' in mutation) {
      nextPayload.request.providerId = mutation.providerId ?? undefined;
    }
    if ('modelId' in mutation) {
      nextPayload.request.modelId = mutation.modelId ?? undefined;
    }
    if ('system' in mutation) {
      nextPayload.request.system = mutation.system ?? undefined;
    }
    if ('messages' in mutation && Array.isArray(mutation.messages)) {
      nextPayload.request.messages = clonePluginLlmMessages(mutation.messages);
    }
    if ('toolNames' in mutation) {
      nextPayload.request.toolNames = mutation.toolNames === null
        ? undefined
        : [...(mutation.toolNames ?? [])];
    }
    if ('variant' in mutation) {
      nextPayload.request.variant = mutation.variant ?? undefined;
    }
    if ('providerOptions' in mutation) {
      nextPayload.request.providerOptions = mutation.providerOptions === null
        ? undefined
        : mutation.providerOptions
          ? { ...mutation.providerOptions }
          : undefined;
    }
    if ('headers' in mutation) {
      nextPayload.request.headers = mutation.headers === null
        ? undefined
        : mutation.headers
          ? { ...mutation.headers }
          : undefined;
    }
    if ('maxOutputTokens' in mutation) {
      nextPayload.request.maxOutputTokens = mutation.maxOutputTokens ?? undefined;
    }
    if ('maxSteps' in mutation && typeof mutation.maxSteps === 'number') {
      nextPayload.request.maxSteps = normalizePositiveInteger(mutation.maxSteps, 1);
    }

    return nextPayload;
  }

  /**
   * 将一条子代理执行后 mutate 结果应用到当前载荷。
   * @param currentPayload 当前子代理执行后载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applySubagentAfterRunMutation(
    currentPayload: SubagentAfterRunHookPayload,
    mutation: SubagentAfterRunHookMutateResult,
  ): SubagentAfterRunHookPayload {
    const nextPayload = cloneSubagentAfterRunPayload(currentPayload);

    if ('providerId' in mutation && typeof mutation.providerId === 'string') {
      nextPayload.result.providerId = mutation.providerId;
    }
    if ('modelId' in mutation && typeof mutation.modelId === 'string') {
      nextPayload.result.modelId = mutation.modelId;
    }
    if ('text' in mutation && typeof mutation.text === 'string') {
      nextPayload.result.text = mutation.text;
      nextPayload.result.message = {
        role: 'assistant',
        content: mutation.text,
      };
    }
    if ('finishReason' in mutation) {
      nextPayload.result.finishReason = mutation.finishReason ?? null;
    }
    if ('toolCalls' in mutation && Array.isArray(mutation.toolCalls)) {
      nextPayload.result.toolCalls = clonePluginSubagentToolCalls(mutation.toolCalls);
    }
    if ('toolResults' in mutation && Array.isArray(mutation.toolResults)) {
      nextPayload.result.toolResults = clonePluginSubagentToolResults(mutation.toolResults);
    }

    return nextPayload;
  }

  /**
   * 将一条工具调用前 mutate 结果应用到当前载荷。
   * @param currentPayload 当前工具调用前载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applyToolBeforeCallMutation(
    currentPayload: ToolBeforeCallHookPayload,
    mutation: ToolBeforeCallHookMutateResult,
  ): ToolBeforeCallHookPayload {
    const nextPayload = cloneToolBeforeCallHookPayload(currentPayload);

    if (
      'params' in mutation
      && typeof mutation.params !== 'undefined'
      && isJsonObjectValue(mutation.params)
    ) {
      nextPayload.params = {
        ...mutation.params,
      };
    }

    return nextPayload;
  }

  /**
   * 将一条工具调用后 mutate 结果应用到当前载荷。
   * @param currentPayload 当前工具调用后载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applyToolAfterCallMutation(
    currentPayload: ToolAfterCallHookPayload,
    mutation: ToolAfterCallHookMutateResult,
  ): ToolAfterCallHookPayload {
    const nextPayload = cloneToolAfterCallHookPayload(currentPayload);

    if ('output' in mutation && typeof mutation.output !== 'undefined') {
      nextPayload.output = toJsonValue(mutation.output);
    }

    return nextPayload;
  }

  /**
   * 将一条最终回复发送前 mutate 结果应用到当前载荷。
   * @param currentPayload 当前最终回复载荷
   * @param mutation 变更结果
   * @returns 新的载荷快照
   */
  private applyResponseBeforeSendMutation(
    currentPayload: ResponseBeforeSendHookPayload,
    mutation: ResponseBeforeSendHookMutateResult,
  ): ResponseBeforeSendHookPayload {
    const nextPayload = cloneResponseBeforeSendHookPayload(currentPayload);

    if ('providerId' in mutation && typeof mutation.providerId === 'string') {
      nextPayload.providerId = mutation.providerId;
    }
    if ('modelId' in mutation && typeof mutation.modelId === 'string') {
      nextPayload.modelId = mutation.modelId;
    }
    if (
      'assistantContent' in mutation
      && typeof mutation.assistantContent === 'string'
    ) {
      nextPayload.assistantContent = mutation.assistantContent;
    }
    if ('assistantParts' in mutation) {
      nextPayload.assistantParts = mutation.assistantParts === null
        ? []
        : cloneChatMessageParts(mutation.assistantParts ?? []);
    }
    if ('toolCalls' in mutation && Array.isArray(mutation.toolCalls)) {
      nextPayload.toolCalls = mutation.toolCalls.map((toolCall) => ({
        ...toolCall,
      }));
    }
    if ('toolResults' in mutation && Array.isArray(mutation.toolResults)) {
      nextPayload.toolResults = mutation.toolResults.map((toolResult) => ({
        ...toolResult,
      }));
    }

    return nextPayload;
  }

  /**
   * 读取指定工具定义；不存在时抛错。
   * @param record 插件运行时记录
   * @param toolName 工具名
   * @returns 工具定义
   */
  private findToolOrThrow(
    record: PluginRuntimeRecord,
    toolName: string,
  ): PluginCapability {
    const tool = (record.manifest.tools ?? []).find((item) => item.name === toolName);
    if (!tool) {
      throw new NotFoundException(`Tool not found: ${record.manifest.id}:${toolName}`);
    }

    return tool;
  }

  /**
   * 延迟解析自动化服务，避免与 runtime 形成构造期循环依赖。
   * @returns 自动化服务实例
   */
  private getAutomationService(): AutomationService {
    if (this.automationService) {
      return this.automationService;
    }

    const resolved = this.moduleRef.get(AutomationService, {
      strict: false,
    });
    if (!resolved) {
      throw new NotFoundException('AutomationService is not available');
    }

    this.automationService = resolved;
    return resolved;
  }

  /**
   * 延迟解析聊天消息服务，避免与 runtime 形成静态循环依赖。
   * @returns 聊天消息服务实例
   */
  private async getChatMessageService(): Promise<PluginConversationMessageWriter> {
    if (this.chatMessageService) {
      return this.chatMessageService;
    }

    const { ChatMessageService } = await import('../chat/chat-message.service');
    const resolved = this.moduleRef.get<PluginConversationMessageWriter>(
      ChatMessageService,
      {
        strict: false,
      },
    );
    if (!resolved) {
      throw new NotFoundException('ChatMessageService is not available');
    }

    this.chatMessageService = resolved;
    return resolved;
  }

  private async getToolRegistry() {
    if (this.toolRegistryPromise) {
      return this.toolRegistryPromise;
    }

    this.toolRegistryPromise = (async () => {
      const { ToolRegistryService } = await import('../tool/tool-registry.service');
      const resolved = this.moduleRef.get(ToolRegistryService, {
        strict: false,
      });
      if (!resolved) {
        throw new NotFoundException('ToolRegistryService is not available');
      }

      return resolved;
    })();

    return this.toolRegistryPromise;
  }

  /**
   * 为当前会话启动一条活动等待态。
   * @param input 插件、上下文与超时参数
   * @returns 当前活动等待态摘要
   */
  private startConversationSession(input: {
    pluginId: string;
    context: PluginCallContext;
    timeoutMs: number;
    captureHistory: boolean;
    metadata?: JsonValue;
  }): PluginConversationSessionInfo {
    const conversationId = this.requireConversationIdContext(
      input.context,
      'conversation.session.start',
    );
    const now = Date.now();
    const record: ConversationSessionRecord = {
      pluginId: input.pluginId,
      conversationId,
      startedAt: now,
      expiresAt: now + input.timeoutMs,
      lastMatchedAt: null,
      captureHistory: input.captureHistory,
      historyMessages: [],
      ...(typeof input.metadata !== 'undefined'
        ? { metadata: toJsonValue(input.metadata) }
        : {}),
    };
    this.conversationSessions.set(conversationId, record);
    return this.toConversationSessionInfo(record);
  }

  /**
   * 读取当前插件在当前会话上的活动等待态。
   * @param pluginId 当前插件 ID
   * @param context 插件调用上下文
   * @returns 会话等待态摘要；不存在时返回 null
   */
  private getConversationSession(
    pluginId: string,
    context: PluginCallContext,
  ): PluginConversationSessionInfo | null {
    const conversationId = this.requireConversationIdContext(
      context,
      'conversation.session.get',
    );
    const session = this.getOwnedConversationSession(pluginId, conversationId);
    return session ? this.toConversationSessionInfo(session) : null;
  }

  /**
   * 续期当前插件在当前会话上的活动等待态。
   * @param input 插件、上下文与超时参数
   * @returns 更新后的会话等待态摘要；不存在时返回 null
   */
  private keepConversationSession(input: {
    pluginId: string;
    context: PluginCallContext;
    timeoutMs: number;
    resetTimeout: boolean;
  }): PluginConversationSessionInfo | null {
    const conversationId = this.requireConversationIdContext(
      input.context,
      'conversation.session.keep',
    );
    const session = this.getOwnedConversationSession(input.pluginId, conversationId);
    if (!session) {
      return null;
    }

    const now = Date.now();
    session.expiresAt = input.resetTimeout
      ? now + input.timeoutMs
      : session.expiresAt + input.timeoutMs;
    return this.toConversationSessionInfo(session);
  }

  /**
   * 结束当前插件在当前会话上的活动等待态。
   * @param pluginId 当前插件 ID
   * @param context 插件调用上下文
   * @returns 是否成功结束
   */
  private finishConversationSession(
    pluginId: string,
    context: PluginCallContext,
  ): boolean {
    const conversationId = this.requireConversationIdContext(
      context,
      'conversation.session.finish',
    );
    const session = this.getOwnedConversationSession(pluginId, conversationId);
    if (!session) {
      return false;
    }

    this.conversationSessions.delete(conversationId);
    return true;
  }

  /**
   * 读取当前会话上活动且未过期的等待态。
   * @param conversationId 会话 ID
   * @returns 活动等待态；不存在或已过期时返回 null
   */
  private getActiveConversationSession(
    conversationId?: string,
  ): ConversationSessionRecord | null {
    if (!conversationId) {
      return null;
    }

    const session = this.conversationSessions.get(conversationId);
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      this.conversationSessions.delete(conversationId);
      return null;
    }

    return session;
  }

  /**
   * 读取当前插件在指定会话上的活动等待态。
   * @param pluginId 当前插件 ID
   * @param conversationId 会话 ID
   * @returns 会话等待态；不存在或不归当前插件所有时返回 null
   */
  private getOwnedConversationSession(
    pluginId: string,
    conversationId: string,
  ): ConversationSessionRecord | null {
    const session = this.getActiveConversationSession(conversationId);
    if (!session || session.pluginId !== pluginId) {
      return null;
    }

    return session;
  }

  /**
   * 读取当前会话等待态的安全摘要。
   * @param session 活动等待态
   * @returns 可暴露给插件的等待态摘要
   */
  private toConversationSessionInfo(
    session: ConversationSessionRecord,
  ): PluginConversationSessionInfo {
    return {
      pluginId: session.pluginId,
      conversationId: session.conversationId,
      timeoutMs: Math.max(0, session.expiresAt - Date.now()),
      startedAt: new Date(session.startedAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      lastMatchedAt: session.lastMatchedAt
        ? new Date(session.lastMatchedAt).toISOString()
        : null,
      captureHistory: session.captureHistory,
      historyMessages: session.historyMessages.map((message) => cloneMessageHookInfo(message)),
      ...(typeof session.metadata !== 'undefined'
        ? { metadata: toJsonValue(session.metadata) }
        : {}),
    };
  }

  /**
   * 记录一条命中活动等待态的消息。
   * @param session 活动等待态
   * @param message 当前收到的消息
   * @returns 最新的等待态摘要
   */
  private recordConversationSessionMessage(
    session: ConversationSessionRecord,
    message: PluginMessageHookInfo,
  ): PluginConversationSessionInfo {
    session.lastMatchedAt = Date.now();
    if (session.captureHistory) {
      session.historyMessages.push(cloneMessageHookInfo(message));
    }

    return this.toConversationSessionInfo(session);
  }

  /**
   * 从上下文中读取 conversationId。
   * @param context 插件调用上下文
   * @param method 当前 Host API 方法名
   * @returns conversationId
   */
  private requireConversationIdContext(
    context: PluginCallContext,
    method: string,
  ): string {
    if (!context.conversationId) {
      throw new BadRequestException(`${method} 需要 conversationId 上下文`);
    }

    return context.conversationId;
  }

  /**
   * 从调用上下文读取 userId。
   * @param context 插件调用上下文
   * @param method 当前 Host API 方法名
   * @returns userId
   */
  private requireUserId(
    context: PluginCallContext,
    method: string,
  ): string {
    if (!context.userId) {
      throw new BadRequestException(`${method} 需要 userId 上下文`);
    }

    return context.userId;
  }

  /**
   * 从参数对象读取自动化触发配置。
   * @param params 参数对象
   * @param method 当前 Host API 方法名
   * @returns 已校验的触发配置
   */
  private readAutomationTrigger(
    params: JsonObject,
    method: string,
  ): TriggerConfig {
    const value = params.trigger;
    if (!isJsonObjectValue(value)) {
      throw new BadRequestException(`${method} 的 trigger 必须是对象`);
    }
    if (
      value.type !== 'cron'
      && value.type !== 'event'
      && value.type !== 'manual'
    ) {
      throw new BadRequestException(`${method} 的 trigger.type 不合法`);
    }

    const trigger: TriggerConfig = {
      type: value.type,
    };
    if ('cron' in value && value.cron !== undefined) {
      if (typeof value.cron !== 'string') {
        throw new BadRequestException(`${method} 的 trigger.cron 必须是字符串`);
      }
      trigger.cron = value.cron;
    }
    if ('event' in value && value.event !== undefined) {
      if (typeof value.event !== 'string') {
        throw new BadRequestException(`${method} 的 trigger.event 必须是字符串`);
      }
      trigger.event = value.event;
    }

    return trigger;
  }

  /**
   * 从参数对象读取自动化动作列表。
   * @param params 参数对象
   * @param method 当前 Host API 方法名
   * @returns 已校验的动作配置数组
   */
  private readAutomationActions(
    params: JsonObject,
    method: string,
  ): ActionConfig[] {
    const value = params.actions;
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${method} 的 actions 必须是数组`);
    }

    return value.map((action, index) =>
      this.readAutomationAction(action, index, method),
    );
  }

  /**
   * 从参数对象读取单条自动化动作。
   * @param value 原始动作值
   * @param index 当前动作索引
   * @param method 当前 Host API 方法名
   * @returns 已校验的动作配置
   */
  private readAutomationAction(
    value: JsonValue,
    index: number,
    method: string,
  ): ActionConfig {
    if (!isJsonObjectValue(value)) {
      throw new BadRequestException(`${method} 的 actions[${index}] 必须是对象`);
    }
    if (value.type !== 'device_command' && value.type !== 'ai_message') {
      throw new BadRequestException(`${method} 的 actions[${index}].type 不合法`);
    }

    if (value.type === 'device_command') {
      if (typeof value.plugin !== 'string') {
        throw new BadRequestException(
          `${method} 的 actions[${index}].plugin 必须是字符串`,
        );
      }
      if (typeof value.capability !== 'string') {
        throw new BadRequestException(
          `${method} 的 actions[${index}].capability 必须是字符串`,
        );
      }

      const action: ActionConfig = {
        type: value.type,
        plugin: value.plugin,
        capability: value.capability,
      };
      if ('params' in value && value.params !== undefined) {
        if (!isJsonObjectValue(value.params)) {
          throw new BadRequestException(
            `${method} 的 actions[${index}].params 必须是对象`,
          );
        }
        action.params = value.params;
      }

      return action;
    }

    const action: ActionConfig = {
      type: value.type,
    };
    if ('message' in value && value.message !== undefined) {
      if (typeof value.message !== 'string') {
        throw new BadRequestException(
          `${method} 的 actions[${index}].message 必须是字符串`,
        );
      }
      action.message = value.message;
    }
    if ('target' in value && value.target !== undefined) {
      action.target = this.readOptionalMessageTarget(
        value,
        'target',
        `${method}.actions[${index}]`,
      );
    }

    return action;
  }

  /**
   * 从调用上下文读取超时参数。
   * @param context 插件调用上下文
   * @param fallback 默认超时
   * @returns 超时毫秒数
   */
  private readTimeoutMs(context: PluginCallContext, fallback: number): number {
    const raw = context.metadata?.timeoutMs;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
      return fallback;
    }

    return raw;
  }

  /**
   * 从参数对象读取必填字符串字段。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 字段值
   */
  private requireString(
    params: JsonObject,
    key: string,
    method: string,
  ): string {
    const value = params[key];
    if (typeof value === 'string') {
      return value;
    }

    throw new BadRequestException(`${method} 的 ${key} 必须是字符串`);
  }

  /**
   * 从参数对象读取可选字符串字段。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 字段值；缺失时返回 undefined
   */
  private readOptionalString(
    params: JsonObject,
    key: string,
    method: string,
  ): string | undefined {
    const value = params[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value;
    }

    throw new BadRequestException(`${method} 的 ${key} 必须是字符串`);
  }

  /**
   * 从参数对象读取可选布尔字段。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 字段值；缺失时返回 undefined
   */
  private readOptionalBoolean(
    params: JsonObject,
    key: string,
    method: string,
  ): boolean | undefined {
    const value = params[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }

    throw new BadRequestException(`${method} 的 ${key} 必须是布尔值`);
  }

  /**
   * 从参数对象读取可选数字字段。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 字段值；缺失时返回 undefined
   */
  private readOptionalNumber(
    params: JsonObject,
    key: string,
    method: string,
  ): number | undefined {
    const value = params[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'number') {
      return value;
    }

    throw new BadRequestException(`${method} 的 ${key} 必须是数字`);
  }

  /**
   * 从参数对象读取必填正数字段。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 正数字段值
   */
  private requirePositiveNumber(
    params: JsonObject,
    key: string,
    method: string,
  ): number {
    const value = this.readOptionalNumber(params, key, method);
    if (typeof value !== 'number' || value <= 0) {
      throw new BadRequestException(`${method} 的 ${key} 必须是正数`);
    }

    return value;
  }

  /**
   * 从参数对象读取可选对象字段。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 对象值；缺失时返回 undefined
   */
  private readOptionalObject(
    params: JsonObject,
    key: string,
    method: string,
  ): JsonObject | undefined {
    const value = params[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as JsonObject;
    }

    throw new BadRequestException(`${method} 的 ${key} 必须是对象`);
  }

  /**
   * 从参数对象读取可选字符串数组字段。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 字段值；缺失时返回 undefined
   */
  private readOptionalStringArray(
    params: JsonObject,
    key: string,
    method: string,
  ): string[] | undefined {
    const value = params[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value;
    }

    throw new BadRequestException(`${method} 的 ${key} 必须是字符串数组`);
  }

  /**
   * 从参数对象读取可选字符串字典字段。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 字段值；缺失时返回 undefined
   */
  private readOptionalStringRecord(
    params: JsonObject,
    key: string,
    method: string,
  ): Record<string, string> | undefined {
    const value = this.readOptionalObject(params, key, method);
    if (!value) {
      return undefined;
    }

    const record: Record<string, string> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (typeof entryValue !== 'string') {
        throw new BadRequestException(`${method} 的 ${key}.${entryKey} 必须是字符串`);
      }
      record[entryKey] = entryValue;
    }

    return record;
  }

  /**
   * 从参数对象读取结构化消息数组。
   * @param params 参数对象
   * @param method 当前 Host API 方法名
   * @returns 已校验的消息数组
   */
  private readLlmMessages(
    params: JsonObject,
    method: string,
  ): PluginLlmMessage[] {
    const value = params.messages;
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${method} 的 messages 必须是数组`);
    }

    return value.map((item, index) => this.readLlmMessage(item, index, method));
  }

  /**
   * 读取单条结构化消息。
   * @param value 原始消息值
   * @param index 当前消息索引
   * @param method 当前 Host API 方法名
   * @returns 已校验的消息
   */
  private readLlmMessage(
    value: JsonValue,
    index: number,
    method: string,
  ): PluginLlmMessage {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`${method} 的 messages[${index}] 必须是对象`);
    }

    const message = value as JsonObject;
    if (
      message.role !== 'user'
      && message.role !== 'assistant'
      && message.role !== 'system'
      && message.role !== 'tool'
    ) {
      throw new BadRequestException(
        `${method} 的 messages[${index}].role 必须是 user/assistant/system/tool`,
      );
    }

    return {
      role: message.role,
      content: this.readLlmMessageContent(
        message.content as JsonValue,
        `${method} 的 messages[${index}].content`,
      ),
    };
  }

  /**
   * 读取单条消息的 content。
   * @param value 原始 content
   * @param label 当前字段标签
   * @returns 字符串或结构化 part 数组
   */
  private readLlmMessageContent(
    value: JsonValue,
    label: string,
  ): string | Array<{ type: 'text'; text: string } | {
    type: 'image';
    image: string;
    mimeType?: string;
  }> {
    if (typeof value === 'string') {
      return value;
    }
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${label} 必须是字符串或数组`);
    }

    return value.map((part, index) =>
      this.readChatMessagePart(part, `${label}[${index}]`),
    );
  }

  /**
   * 读取单个消息 part。
   * @param value 原始 part
   * @param label 当前字段标签
   * @returns 已校验的消息 part
   */
  private readChatMessagePart(
    value: JsonValue,
    label: string,
  ): { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`${label} 必须是对象`);
    }

    const part = value as JsonObject;
    if (part.type === 'text' && typeof part.text === 'string') {
      return {
        type: 'text',
        text: part.text,
      };
    }
    if (part.type === 'image' && typeof part.image === 'string') {
      return {
        type: 'image',
        image: part.image,
        ...(typeof part.mimeType === 'string' ? { mimeType: part.mimeType } : {}),
      };
    }

    throw new BadRequestException(`${label} 不是合法的消息 part`);
  }

  /**
   * 从参数对象读取可选消息 part 数组。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 已校验的消息 part 数组；缺失时返回 undefined
   */
  private readOptionalChatMessageParts(
    params: JsonObject,
    key: string,
    method: string,
  ): ChatMessagePart[] | undefined {
    const value = params[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${method} 的 ${key} 必须是数组`);
    }

    return value.map((part, index) =>
      this.readChatMessagePart(part, `${method}.${key}[${index}]`),
    );
  }

  /**
   * 从参数对象读取可选消息目标。
   * @param params 参数对象
   * @param key 字段名
   * @param method 当前 Host API 方法名
   * @returns 归一化后的消息目标；缺失时返回 undefined
   */
  private readOptionalMessageTarget(
    params: JsonObject,
    key: string,
    method: string,
  ): PluginMessageTargetRef | undefined {
    const value = params[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (!isJsonObjectValue(value)) {
      throw new BadRequestException(`${method} 的 ${key} 必须是对象`);
    }
    if (value.type !== 'conversation') {
      throw new BadRequestException(`${method} 的 ${key}.type 当前只支持 conversation`);
    }
    if (typeof value.id !== 'string' || !value.id.trim()) {
      throw new BadRequestException(`${method} 的 ${key}.id 必须是非空字符串`);
    }

    return {
      type: 'conversation',
      id: value.id.trim(),
    };
  }

  /**
   * 从 Host API 参数中读取并归一化一份子代理请求。
   * @param params 参数对象
   * @param method 当前 Host API 方法名
   * @returns 统一子代理请求快照
   */
  private readSubagentRequest(
    params: JsonObject,
    method: string,
  ): PluginSubagentRequest {
    return {
      ...(this.readOptionalString(params, 'providerId', method)
        ? { providerId: this.readOptionalString(params, 'providerId', method) }
        : {}),
      ...(this.readOptionalString(params, 'modelId', method)
        ? { modelId: this.readOptionalString(params, 'modelId', method) }
        : {}),
      ...(this.readOptionalString(params, 'system', method)
        ? { system: this.readOptionalString(params, 'system', method) }
        : {}),
      messages: this.readLlmMessages(params, method),
      ...(this.readOptionalStringArray(params, 'toolNames', method)
        ? { toolNames: this.readOptionalStringArray(params, 'toolNames', method) }
        : {}),
      ...(this.readOptionalString(params, 'variant', method)
        ? { variant: this.readOptionalString(params, 'variant', method) }
        : {}),
      ...(this.readOptionalObject(params, 'providerOptions', method)
        ? { providerOptions: this.readOptionalObject(params, 'providerOptions', method) }
        : {}),
      ...(this.readOptionalStringRecord(params, 'headers', method)
        ? { headers: this.readOptionalStringRecord(params, 'headers', method) }
        : {}),
      ...(typeof this.readOptionalNumber(params, 'maxOutputTokens', method) === 'number'
        ? { maxOutputTokens: this.readOptionalNumber(params, 'maxOutputTokens', method) }
        : {}),
      maxSteps: normalizePositiveInteger(
        this.readOptionalNumber(params, 'maxSteps', method),
        5,
      ),
    };
  }

  /**
   * 构造一个统一的子代理执行结果，并在缺失模型信息时回退到宿主默认解析。
   * @param input 原始结果字段
   * @returns 标准化后的子代理结果
   */
  private buildSubagentHookResult(input: {
    providerId?: string;
    modelId?: string;
    text: string;
    finishReason?: string | null;
    toolCalls?: PluginSubagentToolCall[];
    toolResults?: PluginSubagentToolResult[];
  }): PluginSubagentRunResult {
    const modelConfig = this.aiModelExecution.resolveModelConfig(
      input.providerId,
      input.modelId,
    );

    return {
      providerId: String(modelConfig.providerId),
      modelId: String(modelConfig.id),
      text: input.text,
      message: {
        role: 'assistant',
        content: input.text,
      },
      ...(typeof input.finishReason !== 'undefined'
        ? { finishReason: input.finishReason }
        : {}),
      toolCalls: clonePluginSubagentToolCalls(input.toolCalls ?? []),
      toolResults: clonePluginSubagentToolResults(input.toolResults ?? []),
    };
  }

  /**
   * 执行一次宿主侧 subagent 调用。
   * @param input 调用参数
   * @returns subagent 最终结果
   */
  private async runSubagent(input: {
    pluginId: string;
    context: PluginCallContext;
    params: JsonObject;
  }): Promise<PluginSubagentRunResult> {
    const initialRequest = this.readSubagentRequest(input.params, 'subagent.run');
    const beforeRunResult = await this.runSubagentBeforeRunHooks({
      context: input.context,
      payload: {
        context: {
          ...input.context,
        },
        pluginId: input.pluginId,
        request: cloneSubagentRequest(initialRequest),
      },
    });
    if (beforeRunResult.action === 'short-circuit') {
      return beforeRunResult.result;
    }

    const request = beforeRunResult.payload.request;
    const modelConfig = this.aiModelExecution.resolveModelConfig(
      request.providerId,
      request.modelId,
    );

    if (hasImagePart(request.messages) && !modelConfig.capabilities.input.image) {
      throw new BadRequestException('subagent.run 当前模型不支持图片输入');
    }

    const prepared = this.aiModelExecution.prepareResolved({
      modelConfig,
      sdkMessages: toAiSdkMessages(request.messages as unknown as ChatRuntimeMessage[]),
    });
    const tools = await this.buildSubagentToolSet({
      pluginId: input.pluginId,
      context: input.context,
      providerId: String(modelConfig.providerId),
      modelId: String(modelConfig.id),
      toolNames: request.toolNames,
    });
    const executed = this.aiModelExecution.streamPrepared({
      prepared,
      system: request.system,
      tools,
      stopWhen: createStepLimit(request.maxSteps),
      variant: request.variant,
      providerOptions: request.providerOptions,
      headers: request.headers,
      maxOutputTokens: request.maxOutputTokens,
    });

    let text = '';
    const toolCalls: PluginSubagentToolCall[] = [];
    const toolResults: PluginSubagentToolResult[] = [];

    for await (const part of executed.result.fullStream) {
      if (part.type === 'text-delta') {
        text += part.text;
        continue;
      }
      if (part.type === 'tool-call') {
        toolCalls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: toJsonValue(part.input as never),
        });
        continue;
      }
      if (part.type === 'tool-result') {
        toolResults.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output: toJsonValue(part.output as never),
        });
      }
    }

    const finishReason = await executed.result.finishReason;
    const result: PluginSubagentRunResult = {
      providerId: String(modelConfig.providerId),
      modelId: String(modelConfig.id),
      text,
      message: {
        role: 'assistant',
        content: text,
      },
      ...(finishReason !== undefined
        ? {
            finishReason: finishReason === null ? null : String(finishReason),
          }
        : {}),
      toolCalls,
      toolResults,
    };

    const afterRunPayload = await this.runSubagentAfterRunHooks({
      context: input.context,
      payload: {
        context: {
          ...input.context,
        },
        pluginId: input.pluginId,
        request: {
          ...cloneSubagentRequest(request),
          providerId: String(modelConfig.providerId),
          modelId: String(modelConfig.id),
        },
        result,
      },
    });

    return afterRunPayload.result;
  }

  /**
   * 构造 subagent 可见的工具集合，并默认排除调用插件自身的工具。
   * @param input 调用参数
   * @returns 裁剪后的工具集合
   */
  private async buildSubagentToolSet(input: {
    pluginId: string;
    context: PluginCallContext;
    providerId: string;
    modelId: string;
    toolNames?: string[];
  }) {
    if (!input.context.userId || !input.context.conversationId) {
      return undefined;
    }

    const toolRegistry = await this.getToolRegistry();
    return toolRegistry.buildToolSet({
      context: {
        source: 'subagent',
        userId: input.context.userId,
        conversationId: input.context.conversationId,
        activeProviderId: input.providerId,
        activeModelId: input.modelId,
        activePersonaId: input.context.activePersonaId,
      },
      allowedToolNames: input.toolNames,
      excludedSources: [
        {
          kind: 'plugin',
          id: input.pluginId,
        },
      ],
    });
  }

  /**
   * 为插件执行包一层统一超时控制。
   * @param promise 原始执行 Promise
   * @param timeoutMs 超时毫秒数
   * @param message 超时错误消息
   * @returns Promise 结果
   */
  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 为插件执行添加统一并发保护。
   * @param input 插件记录、执行类型、附加元数据和实际执行函数
   * @returns 执行结果
   */
  private async runWithPluginExecutionSlot<T>(input: {
    record: PluginRuntimeRecord;
    type: 'tool' | 'route' | 'hook';
    metadata: JsonObject;
    execute: () => Promise<T>;
  }): Promise<T> {
    if (input.record.activeExecutions >= input.record.maxConcurrentExecutions) {
      const pressure = this.buildRuntimePressure(input.record);
      await this.pluginService.recordPluginEvent(input.record.manifest.id, {
        type: `${input.type}:overloaded`,
        level: 'warn',
        message: `插件 ${input.record.manifest.id} 当前执行并发已达上限，请稍后重试`,
        metadata: {
          ...input.metadata,
          activeExecutions: pressure.activeExecutions,
          maxConcurrentExecutions: pressure.maxConcurrentExecutions,
        },
      });
      throw new HttpException(
        `插件 ${input.record.manifest.id} 当前执行并发已达上限，请稍后重试`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    input.record.activeExecutions += 1;
    try {
      return await input.execute();
    } finally {
      input.record.activeExecutions = Math.max(0, input.record.activeExecutions - 1);
    }
  }

  /**
   * 从治理配置中解析插件并发上限。
   * @param governance 插件治理快照
   * @returns 合法的并发上限
   */
  private resolveMaxConcurrentExecutions(
    governance: PluginGovernanceSnapshot,
  ): number {
    const raw = governance.resolvedConfig.maxConcurrentExecutions;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.min(32, Math.max(1, Math.trunc(raw)));
    }

    return DEFAULT_PLUGIN_MAX_CONCURRENT_EXECUTIONS;
  }

  /**
   * 构建当前插件的运行时压力快照。
   * @param record 运行时插件记录
   * @returns 压力快照
   */
  private buildRuntimePressure(
    record: PluginRuntimeRecord,
  ): PluginRuntimePressureSnapshot {
    return {
      activeExecutions: record.activeExecutions,
      maxConcurrentExecutions: record.maxConcurrentExecutions,
    };
  }

  /**
   * 读取单个插件记录当前声明的治理动作。
   * @param record 运行时插件记录
   * @returns 归一化后的治理动作列表
   */
  private listSupportedActionsForRecord(
    record: PluginRuntimeRecord,
  ): PluginActionName[] {
    const actions = record.transport.listSupportedActions?.() ?? ['health-check'];
    const actionSet = new Set<PluginActionName>(actions);

    return PLUGIN_ACTION_ORDER.filter((action) => actionSet.has(action));
  }
}

/**
 * 复制聊天模型前 Hook 请求快照，避免插件结果意外污染原对象。
 * @param request 原始请求快照
 * @returns 新的请求副本
 */
function cloneChatBeforeModelRequest(
  request: ChatBeforeModelRequest,
): ChatBeforeModelRequest {
  return {
    providerId: request.providerId,
    modelId: request.modelId,
    systemPrompt: request.systemPrompt,
    messages: cloneChatMessages(request.messages),
    availableTools: request.availableTools.map(
      (tool: ChatBeforeModelRequest['availableTools'][number]) => ({
      ...tool,
      parameters: {
        ...tool.parameters,
      },
    })),
    ...(request.variant ? { variant: request.variant } : {}),
    ...(request.providerOptions ? { providerOptions: { ...request.providerOptions } } : {}),
    ...(request.headers ? { headers: { ...request.headers } } : {}),
    ...(typeof request.maxOutputTokens === 'number'
      ? { maxOutputTokens: request.maxOutputTokens }
      : {}),
  };
}

/**
 * 判断当前异常是否由插件并发保护主动拒绝。
 * @param error 捕获到的异常
 * @returns 是否为 429 超载拒绝
 */
function isPluginOverloadedError(error: unknown): boolean {
  return error instanceof HttpException
    && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS;
}

/**
 * 复制聊天模型后 Hook 载荷，避免插件变更污染原对象。
 * @param payload 原始完成态载荷
 * @returns 新的载荷副本
 */
function cloneChatAfterModelPayload(
  payload: ChatAfterModelHookPayload,
): ChatAfterModelHookPayload {
  return {
    providerId: payload.providerId,
    modelId: payload.modelId,
    assistantMessageId: payload.assistantMessageId,
    assistantContent: payload.assistantContent,
    assistantParts: cloneChatMessageParts(payload.assistantParts),
    toolCalls: payload.toolCalls.map((toolCall) => ({
      ...toolCall,
    })),
    toolResults: payload.toolResults.map((toolResult) => ({
      ...toolResult,
    })),
  };
}

/**
 * 复制收到消息 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneMessageReceivedHookPayload(
  payload: MessageReceivedHookPayload,
): MessageReceivedHookPayload {
  return {
    context: {
      ...payload.context,
    },
    conversationId: payload.conversationId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    ...(typeof payload.session !== 'undefined'
      ? { session: payload.session ? cloneConversationSessionInfo(payload.session) : null }
      : {}),
    message: cloneMessageHookInfo(payload.message),
    modelMessages: clonePluginLlmMessages(payload.modelMessages),
  };
}

/**
 * 复制消息创建 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneMessageCreatedHookPayload(
  payload: MessageCreatedHookPayload,
): MessageCreatedHookPayload {
  return {
    context: {
      ...payload.context,
    },
    conversationId: payload.conversationId,
    message: cloneMessageHookInfo(payload.message),
    modelMessages: clonePluginLlmMessages(payload.modelMessages),
  };
}

/**
 * 复制消息更新 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneMessageUpdatedHookPayload(
  payload: MessageUpdatedHookPayload,
): MessageUpdatedHookPayload {
  return {
    context: {
      ...payload.context,
    },
    conversationId: payload.conversationId,
    messageId: payload.messageId,
    currentMessage: cloneMessageHookInfo(payload.currentMessage),
    nextMessage: cloneMessageHookInfo(payload.nextMessage),
  };
}

/**
 * 复制单条消息 Hook 快照。
 * @param message 原始消息快照
 * @returns 新的消息副本
 */
function cloneMessageHookInfo(
  message: PluginMessageHookInfo,
): PluginMessageHookInfo {
  return {
    ...(message.id ? { id: message.id } : {}),
    role: message.role,
    content: message.content,
    parts: cloneChatMessageParts(message.parts),
    ...(typeof message.provider !== 'undefined' ? { provider: message.provider } : {}),
    ...(typeof message.model !== 'undefined' ? { model: message.model } : {}),
    ...(typeof message.status !== 'undefined' ? { status: message.status } : {}),
  };
}

/**
 * 复制会话等待态摘要。
 * @param session 原始等待态摘要
 * @returns 新的等待态副本
 */
function cloneConversationSessionInfo(
  session: PluginConversationSessionInfo,
): PluginConversationSessionInfo {
  return {
    pluginId: session.pluginId,
    conversationId: session.conversationId,
    timeoutMs: session.timeoutMs,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    lastMatchedAt: session.lastMatchedAt,
    captureHistory: session.captureHistory,
    historyMessages: session.historyMessages.map((message) => cloneMessageHookInfo(message)),
    ...(typeof session.metadata !== 'undefined'
      ? { metadata: toJsonValue(session.metadata) }
      : {}),
  };
}

/**
 * 复制自动化运行前 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneAutomationBeforeRunPayload(
  payload: AutomationBeforeRunHookPayload,
): AutomationBeforeRunHookPayload {
  return {
    context: {
      ...payload.context,
    },
    automation: {
      ...payload.automation,
      trigger: {
        ...payload.automation.trigger,
      },
      actions: cloneAutomationActions(payload.automation.actions),
      ...(payload.automation.logs
        ? {
            logs: payload.automation.logs.map((log: (typeof payload.automation.logs)[number]) => ({
              ...log,
            })),
          }
        : {}),
    },
    actions: cloneAutomationActions(payload.actions),
  };
}

/**
 * 复制自动化运行后 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneAutomationAfterRunPayload(
  payload: AutomationAfterRunHookPayload,
): AutomationAfterRunHookPayload {
  return {
    context: {
      ...payload.context,
    },
    automation: {
      ...payload.automation,
      trigger: {
        ...payload.automation.trigger,
      },
      actions: cloneAutomationActions(payload.automation.actions),
      ...(payload.automation.logs
        ? {
            logs: payload.automation.logs.map((log: (typeof payload.automation.logs)[number]) => ({
              ...log,
            })),
          }
        : {}),
    },
    status: payload.status,
    results: cloneJsonValueArray(payload.results),
  };
}

/**
 * 复制工具调用前 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneToolBeforeCallHookPayload(
  payload: ToolBeforeCallHookPayload,
): ToolBeforeCallHookPayload {
  return {
    context: {
      ...payload.context,
    },
    source: {
      ...payload.source,
    },
    ...(payload.pluginId ? { pluginId: payload.pluginId } : {}),
    ...(payload.runtimeKind ? { runtimeKind: payload.runtimeKind } : {}),
    tool: {
      ...payload.tool,
      parameters: {
        ...payload.tool.parameters,
      },
    },
    params: {
      ...payload.params,
    },
  };
}

/**
 * 复制工具调用后 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneToolAfterCallHookPayload(
  payload: ToolAfterCallHookPayload,
): ToolAfterCallHookPayload {
  return {
    context: {
      ...payload.context,
    },
    source: {
      ...payload.source,
    },
    ...(payload.pluginId ? { pluginId: payload.pluginId } : {}),
    ...(payload.runtimeKind ? { runtimeKind: payload.runtimeKind } : {}),
    tool: {
      ...payload.tool,
      parameters: {
        ...payload.tool.parameters,
      },
    },
    params: {
      ...payload.params,
    },
    output: toJsonValue(payload.output),
  };
}

/**
 * 复制最终回复发送前 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneResponseBeforeSendHookPayload(
  payload: ResponseBeforeSendHookPayload,
): ResponseBeforeSendHookPayload {
  return {
    context: {
      ...payload.context,
    },
    responseSource: payload.responseSource,
    assistantMessageId: payload.assistantMessageId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    assistantContent: payload.assistantContent,
    assistantParts: cloneChatMessageParts(payload.assistantParts),
    toolCalls: payload.toolCalls.map((toolCall) => ({
      ...toolCall,
    })),
    toolResults: payload.toolResults.map((toolResult) => ({
      ...toolResult,
    })),
  };
}

/**
 * 复制子代理执行前 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneSubagentBeforeRunPayload(
  payload: SubagentBeforeRunHookPayload,
): SubagentBeforeRunHookPayload {
  return {
    context: {
      ...payload.context,
    },
    pluginId: payload.pluginId,
    request: cloneSubagentRequest(payload.request),
  };
}

/**
 * 复制子代理执行后 Hook 载荷。
 * @param payload 原始载荷
 * @returns 新的载荷副本
 */
function cloneSubagentAfterRunPayload(
  payload: SubagentAfterRunHookPayload,
): SubagentAfterRunHookPayload {
  return {
    context: {
      ...payload.context,
    },
    pluginId: payload.pluginId,
    request: cloneSubagentRequest(payload.request),
    result: cloneSubagentRunResult(payload.result),
  };
}

/**
 * 复制子代理请求快照。
 * @param request 原始请求
 * @returns 新的请求副本
 */
function cloneSubagentRequest(
  request: PluginSubagentRequest,
): PluginSubagentRequest {
  return {
    ...(request.providerId ? { providerId: request.providerId } : {}),
    ...(request.modelId ? { modelId: request.modelId } : {}),
    ...(typeof request.system === 'string' ? { system: request.system } : {}),
    messages: clonePluginLlmMessages(request.messages),
    ...(request.toolNames ? { toolNames: [...request.toolNames] } : {}),
    ...(typeof request.variant === 'string' ? { variant: request.variant } : {}),
    ...(request.providerOptions ? { providerOptions: { ...request.providerOptions } } : {}),
    ...(request.headers ? { headers: { ...request.headers } } : {}),
    ...(typeof request.maxOutputTokens === 'number'
      ? { maxOutputTokens: request.maxOutputTokens }
      : {}),
    maxSteps: request.maxSteps,
  };
}

/**
 * 复制子代理执行结果。
 * @param result 原始结果
 * @returns 新的结果副本
 */
function cloneSubagentRunResult(
  result: PluginSubagentRunResult,
): PluginSubagentRunResult {
  return {
    providerId: result.providerId,
    modelId: result.modelId,
    text: result.text,
    message: {
      role: 'assistant',
      content: result.message.content,
    },
    ...(typeof result.finishReason !== 'undefined'
      ? { finishReason: result.finishReason }
      : {}),
    toolCalls: clonePluginSubagentToolCalls(result.toolCalls),
    toolResults: clonePluginSubagentToolResults(result.toolResults),
  };
}

/**
 * 复制子代理工具调用数组。
 * @param toolCalls 原始工具调用数组
 * @returns 深拷贝后的工具调用数组
 */
function clonePluginSubagentToolCalls(
  toolCalls: PluginSubagentToolCall[],
): PluginSubagentToolCall[] {
  return toolCalls.map((toolCall) => ({
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toJsonValue(toolCall.input),
  }));
}

/**
 * 复制子代理工具结果数组。
 * @param toolResults 原始工具结果数组
 * @returns 深拷贝后的工具结果数组
 */
function clonePluginSubagentToolResults(
  toolResults: PluginSubagentToolResult[],
): PluginSubagentToolResult[] {
  return toolResults.map((toolResult) => ({
    toolCallId: toolResult.toolCallId,
    toolName: toolResult.toolName,
    output: toJsonValue(toolResult.output),
  }));
}

/**
 * 复制自动化动作列表。
 * @param actions 原始动作数组
 * @returns 新的动作数组
 */
function cloneAutomationActions(actions: ActionConfig[]): ActionConfig[] {
  return actions.map((action) => ({
    ...action,
    ...(action.params ? { params: { ...action.params } } : {}),
  }));
}

/**
 * 复制统一 LLM 消息数组。
 * @param messages 原始消息数组
 * @returns 复制后的消息数组
 */
function clonePluginLlmMessages(messages: PluginLlmMessage[]) {
  return messages.map((message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map((part) => ({ ...part }))
      : message.content,
  }));
}

/**
 * 复制统一 LLM 消息数组。
 * @param messages 原始消息数组
 * @returns 复制后的消息数组
 */
function cloneChatMessages(messages: ChatBeforeModelRequest['messages']) {
  return messages.map((message: ChatBeforeModelRequest['messages'][number]) => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map((part) => ({ ...part }))
      : message.content,
  }));
}

/**
 * 复制聊天消息 part 数组。
 * @param parts 原始 part 数组
 * @returns 复制后的 part 数组
 */
function cloneChatMessageParts(parts: PluginMessageHookInfo['parts']) {
  return parts.map((part: PluginMessageHookInfo['parts'][number]) => ({ ...part }));
}

/**
 * 归一化插件短路返回的 assistant 输出。
 * @param input assistant 内容与可选结构化 parts
 * @returns 统一的 assistant 内容与 parts
 */
function normalizeAssistantOutput(input: {
  assistantContent: string;
  assistantParts?: ChatMessagePart[] | null;
}): {
  assistantContent: string;
  assistantParts: ChatMessagePart[];
} {
  const assistantParts = input.assistantParts
    ? cloneChatMessageParts(input.assistantParts)
    : [];

  if (assistantParts.length > 0) {
    return {
      assistantContent: assistantParts
        .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('\n'),
      assistantParts,
    };
  }

  const text = input.assistantContent.trim();
    return {
      assistantContent: text,
      assistantParts: text
        ? [
          {
            type: 'text' as const,
            text,
          },
        ]
      : [],
  };
}

/**
 * 复制 JSON 数组。
 * @param values 原始 JSON 数组
 * @returns 深拷贝后的数组
 */
function cloneJsonValueArray(values: JsonValue[]): JsonValue[] {
  return toJsonValue(values) as JsonValue[];
}

/**
 * 判断一个值是否为 JSON 对象。
 * @param value 任意 JSON 值
 * @returns 是否为对象
 */
function isJsonObjectValue(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断一个值是否为字符串数组。
 * @param value 任意 JSON 值
 * @returns 是否为字符串数组
 */
function isStringArray(value: JsonValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * 判断一个值是否为字符串值对象。
 * @param value 任意 JSON 值
 * @returns 是否为字符串对象
 */
function isStringRecord(value: JsonValue): value is Record<string, string> {
  return isJsonObjectValue(value)
    && Object.values(value).every((item) => typeof item === 'string');
}

/**
 * 判断一个值是否为合法的聊天消息状态。
 * @param value 原始值
 * @returns 是否为合法状态
 */
function isChatMessageStatus(value: JsonValue): boolean {
  return value === 'pending'
    || value === 'streaming'
    || value === 'completed'
    || value === 'stopped'
    || value === 'error';
}

/**
 * 判断一个值是否为聊天消息 part 数组。
 * @param value 原始值
 * @returns 是否为合法的 part 数组
 */
function isChatMessagePartArray(value: JsonValue): boolean {
  return Array.isArray(value)
    && value.every((part) => {
      if (!isJsonObjectValue(part) || typeof part.type !== 'string') {
        return false;
      }
      if (part.type === 'text') {
        return typeof part.text === 'string';
      }
      if (part.type === 'image') {
        return typeof part.image === 'string'
          && (!('mimeType' in part) || typeof part.mimeType === 'string');
      }
      return false;
    });
}

/**
 * 判断一个值是否为统一 LLM 消息数组。
 * @param value 原始值
 * @returns 是否为合法消息数组
 */
function isPluginLlmMessageArray(value: JsonValue | undefined): boolean {
  return Array.isArray(value)
    && value.every((message) => {
      if (
        !isJsonObjectValue(message)
        || typeof message.role !== 'string'
        || !['user', 'assistant', 'system', 'tool'].includes(message.role)
      ) {
        return false;
      }
      if (typeof message.content === 'string') {
        return true;
      }
      return Array.isArray(message.content) && isChatMessagePartArray(message.content);
    });
}

/**
 * 判断一个值是否为自动化动作数组。
 * @param value 原始值
 * @returns 是否为合法动作数组
 */
function isActionConfigArray(value: JsonValue | undefined): boolean {
  return Array.isArray(value)
    && value.every((action) => {
      if (!isJsonObjectValue(action) || typeof action.type !== 'string') {
        return false;
      }
      if (action.type !== 'device_command' && action.type !== 'ai_message') {
        return false;
      }
      if ('plugin' in action && action.plugin !== undefined && typeof action.plugin !== 'string') {
        return false;
      }
      if (
        'capability' in action
        && action.capability !== undefined
        && typeof action.capability !== 'string'
      ) {
        return false;
      }
      if ('params' in action && action.params !== undefined && !isJsonObjectValue(action.params)) {
        return false;
      }
      if ('message' in action && action.message !== undefined && typeof action.message !== 'string') {
        return false;
      }
      if ('target' in action && action.target !== undefined) {
        if (!isJsonObjectValue(action.target)) {
          return false;
        }
        if (action.target.type !== 'conversation') {
          return false;
        }
        if (typeof action.target.id !== 'string') {
          return false;
        }
      }
      return true;
    });
}

/**
 * 判断一个值是否为子代理工具调用数组。
 * @param value 原始值
 * @returns 是否为合法工具调用数组
 */
function isPluginSubagentToolCallArray(value: JsonValue | undefined): boolean {
  return Array.isArray(value)
    && value.every((toolCall) =>
      isJsonObjectValue(toolCall)
      && typeof toolCall.toolCallId === 'string'
      && typeof toolCall.toolName === 'string'
      && Object.prototype.hasOwnProperty.call(toolCall, 'input'),
    );
}

/**
 * 判断一个值是否为子代理工具结果数组。
 * @param value 原始值
 * @returns 是否为合法工具结果数组
 */
function isPluginSubagentToolResultArray(value: JsonValue | undefined): boolean {
  return Array.isArray(value)
    && value.every((toolResult) =>
      isJsonObjectValue(toolResult)
      && typeof toolResult.toolCallId === 'string'
      && typeof toolResult.toolName === 'string'
      && Object.prototype.hasOwnProperty.call(toolResult, 'output'),
    );
}

/**
 * 把声明式过滤里的正则配置编译成可执行 RegExp。
 * @param filterRegex 原始正则配置
 * @returns 编译后的正则对象
 */
function buildFilterRegex(
  filterRegex: NonNullable<NonNullable<PluginHookFilterDescriptor['message']>['regex']>,
): RegExp {
  if (typeof filterRegex === 'string') {
    return new RegExp(filterRegex);
  }

  return new RegExp(filterRegex.pattern, filterRegex.flags);
}

/**
 * 判断一条消息是否命中声明式 command 过滤。
 * @param messageText 消息文本
 * @param command 声明的命令前缀
 * @returns 是否命中
 */
function matchesMessageCommand(messageText: string, command: string): boolean {
  const normalizedCommand = command.trim();
  if (!normalizedCommand) {
    return false;
  }

  const normalizedMessage = messageText.trimStart();
  if (!normalizedMessage.startsWith(normalizedCommand)) {
    return false;
  }

  const nextChar = normalizedMessage.charAt(normalizedCommand.length);
  return nextChar === '' || /\s/.test(nextChar);
}

/**
 * 归一化插件 Route 路径。
 * @param path 原始路径
 * @returns 去掉首尾斜杠后的路径；根路径时返回空字符串
 */
function normalizeRoutePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * 把可选数字归一化成正整数；无效值时回退默认值。
 * @param value 原始数字
 * @param fallback 默认值
 * @returns 归一化后的正整数
 */
function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

/**
 * 判断消息列表中是否包含图片 part。
 * @param messages 结构化消息数组
 * @returns 是否包含图片
 */
function hasImagePart(messages: PluginLlmMessage[]): boolean {
  return messages.some((message) =>
    Array.isArray(message.content)
    && message.content.some((part) => part.type === 'image'),
  );
}
