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
  PluginHostMethod,
  PluginManifest,
  PluginPermission,
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
import { ForbiddenException, Injectable } from '@nestjs/common';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { PluginHostService } from './plugin-host.service';
import { PluginRuntimeGovernanceFacade } from './plugin-runtime-governance.facade';
import { PluginRuntimeHostFacade } from './plugin-runtime-host.facade';
import { PluginRuntimeSubagentFacade } from './plugin-runtime-subagent.facade';
import {
  cloneAutomationAfterRunPayload,
  cloneAutomationBeforeRunPayload,
  cloneChatAfterModelPayload,
  cloneChatBeforeModelRequest,
  cloneJsonValueArray,
  cloneMessageCreatedHookPayload,
  cloneMessageReceivedHookPayload,
  cloneMessageUpdatedHookPayload,
  cloneResponseBeforeSendHookPayload,
  cloneToolAfterCallHookPayload,
  cloneToolBeforeCallHookPayload,
} from './plugin-runtime-clone.helpers';
import {
  assertRuntimeRecordEnabled,
  getRuntimeRecordOrThrow,
  invokeDispatchableHooks,
  listDispatchableHookRecords,
} from './plugin-runtime-dispatch.helpers';
import {
  applyAutomationAfterRunMutation,
  applyAutomationBeforeRunMutation,
  applyChatAfterModelMutation,
  applyChatBeforeModelMutation,
  applyChatBeforeModelHookResult,
  applyMessageCreatedMutation,
  applyMessageReceivedMutation,
  applyMessageReceivedHookResult,
  applyMessageUpdatedMutation,
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
  normalizeChatAfterModelHookResult,
  normalizeChatBeforeModelHookResult,
  normalizeMessageCreatedHookResult,
  normalizeMessageReceivedHookResult,
  normalizeMessageUpdatedHookResult,
  normalizeResponseBeforeSendHookResult,
  normalizeToolAfterCallHookResult,
  normalizeToolBeforeCallHookResult,
} from './plugin-runtime-hook-result.helpers';
import { recordRuntimePluginFailureAndDispatch } from './plugin-runtime-failure.helpers';
import {
  isPluginOverloadedError,
  resolveMaxConcurrentExecutions,
  runWithRuntimeExecutionSlot,
} from './plugin-runtime-record.helpers';
import {
  findManifestRouteOrThrow,
  findManifestToolOrThrow,
} from './plugin-runtime-manifest.helpers';
import {
} from './plugin-runtime-subagent.helpers';
import { runPromiseWithTimeout } from './plugin-runtime-timeout.helpers';
import {
  prepareDispatchableConversationSessionMessageReceivedHook,
  syncConversationSessionMessageReceivedPayload,
  type ConversationSessionRecord,
} from './plugin-runtime-session.helpers';
import {
  readRuntimeSubagentRequest,
  readRuntimeTimeoutMs,
} from './plugin-runtime-input.helpers';
import {
  collectDisabledConversationSessionIds,
} from './plugin-runtime-scope';
import {
  normalizeRoutePath,
} from './plugin-runtime-validation.helpers';
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
  'log.list': 'log:read',
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
  'subagent.task.get': 'subagent:run',
  'subagent.task.list': 'subagent:run',
  'subagent.task.start': 'subagent:run',
  'state.delete': 'state:write',
  'state.get': 'state:read',
  'state.list': 'state:read',
  'state.set': 'state:write',
  'user.get': 'user:read',
};

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
    private readonly pluginService: PluginService,
    private readonly hostService: PluginHostService,
    private readonly aiModelExecution: AiModelExecutionService,
    private readonly runtimeGovernanceFacade: PluginRuntimeGovernanceFacade,
    private readonly runtimeHostFacade: PluginRuntimeHostFacade,
    private readonly runtimeSubagentFacade: PluginRuntimeSubagentFacade,
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
    const record = getRuntimeRecordOrThrow(this.records, input.pluginId);
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
      const beforeCallResult = await this.runToolBeforeCallHooks({
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
    const record = getRuntimeRecordOrThrow(this.records, input.pluginId);
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
    const record = input.method === 'plugin.self.get'
      ? this.records.get(input.pluginId)
      : getRuntimeRecordOrThrow(this.records, input.pluginId);
    const requiredPermission = HOST_METHOD_PERMISSION_MAP[input.method];
    if (
      requiredPermission
      && record
      && !record.manifest.permissions.includes(requiredPermission)
    ) {
      throw new ForbiddenException(
        `插件 ${input.pluginId} 缺少权限 ${requiredPermission}`,
      );
    }
    if (input.method === 'subagent.run') {
      return toJsonValue(await this.executeSubagentRequest({
        pluginId: input.pluginId,
        context: input.context,
        request: readRuntimeSubagentRequest(input.params, 'subagent.run'),
      }));
    }

    return this.runtimeHostFacade.call({
      records: this.records,
      conversationSessions: this.conversationSessions,
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
      params: input.params,
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
    const record = getRuntimeRecordOrThrow(this.records, input.pluginId);
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
      execute: () => Promise.resolve(
        record.transport.invokeHook({
          hookName: input.hookName,
          context: input.context,
          payload: input.payload,
        }),
      ),
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
    const result = await runShortCircuitingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'chat:before-model',
        context: input.context,
      }),
      hookName: 'chat:before-model',
      context: input.context,
      payload: {
        context: {
          ...input.payload.context,
        },
        request: cloneChatBeforeModelRequest(input.payload.request),
      },
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeChatBeforeModelHookResult,
      applyMutation: (payload, mutation) => ({
        context: {
          ...payload.context,
        },
        request: applyChatBeforeModelMutation(payload.request, mutation),
      }),
      buildShortCircuitReturn: ({ payload, result: hookResult }) => {
        const executionResult = applyChatBeforeModelHookResult({
          request: payload.request,
          result: hookResult,
        });
        if (executionResult.action !== 'short-circuit') {
          throw new Error('chat:before-model short-circuit result normalization failed');
        }

        return executionResult;
      },
    });

    return result.action === 'short-circuit'
      ? result
      : {
          action: 'continue',
          request: result.payload.request,
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
    const payload = cloneMessageReceivedHookPayload(input.payload);

    const sessionResult = await this.runConversationSessionMessageReceivedHook({
      context: input.context,
      payload,
    });
    if (sessionResult) {
      return sessionResult;
    }

    return runShortCircuitingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'message:received',
        context: input.context,
        payload,
      }),
      hookName: 'message:received',
      context: input.context,
      payload,
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeMessageReceivedHookResult,
      applyMutation: applyMessageReceivedMutation,
      buildShortCircuitReturn: ({ payload: currentPayload, result: hookResult }) => {
        const executionResult = applyMessageReceivedHookResult({
          payload: currentPayload,
          result: hookResult,
        });
        if (executionResult.action !== 'short-circuit') {
          throw new Error('message:received short-circuit result normalization failed');
        }

        return executionResult;
      },
    });
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
    const prepared = prepareDispatchableConversationSessionMessageReceivedHook({
      sessions: this.conversationSessions,
      records: this.records,
      context: input.context,
      payload: input.payload,
      now: Date.now(),
    });
    if (!prepared) {
      return null;
    }
    const { session, record: ownerRecord } = prepared;

    let { payload } = prepared;

    try {
      const rawResult = await this.invokePluginHook({
        pluginId: ownerRecord.manifest.id,
        hookName: 'message:received',
        context: input.context,
        payload: toJsonValue(payload),
      });
      const hookResult = normalizeMessageReceivedHookResult(rawResult);
      const executionResult = applyMessageReceivedHookResult({
        payload,
        result: hookResult,
      });
      payload = syncConversationSessionMessageReceivedPayload({
        sessions: this.conversationSessions,
        session,
        payload: executionResult.payload,
        now: Date.now(),
      });
      return executionResult.action === 'short-circuit'
        ? {
            ...executionResult,
            payload,
          }
        : {
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
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'chat:after-model',
        context: input.context,
      }),
      hookName: 'chat:after-model',
      context: input.context,
      payload: cloneChatAfterModelPayload(input.payload),
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeChatAfterModelHookResult,
      applyMutation: applyChatAfterModelMutation,
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
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'message:created',
        context: input.context,
      }),
      hookName: 'message:created',
      context: input.context,
      payload: cloneMessageCreatedHookPayload(input.payload),
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeMessageCreatedHookResult,
      applyMutation: applyMessageCreatedMutation,
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
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'message:updated',
        context: input.context,
      }),
      hookName: 'message:updated',
      context: input.context,
      payload: cloneMessageUpdatedHookPayload(input.payload),
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeMessageUpdatedHookResult,
      applyMutation: applyMessageUpdatedMutation,
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
    return runShortCircuitingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'automation:before-run',
        context: input.context,
      }),
      hookName: 'automation:before-run',
      context: input.context,
      payload: cloneAutomationBeforeRunPayload(input.payload),
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeAutomationBeforeRunHookResult,
      applyMutation: applyAutomationBeforeRunMutation,
      buildShortCircuitReturn: ({ result }) => ({
        action: 'short-circuit',
        status: result.status,
        results: cloneJsonValueArray(result.results),
      }),
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
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'automation:after-run',
        context: input.context,
      }),
      hookName: 'automation:after-run',
      context: input.context,
      payload: cloneAutomationAfterRunPayload(input.payload),
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeAutomationAfterRunHookResult,
      applyMutation: applyAutomationAfterRunMutation,
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
    return runShortCircuitingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'tool:before-call',
        context: input.context,
      }),
      hookName: 'tool:before-call',
      context: input.context,
      payload: cloneToolBeforeCallHookPayload(input.payload),
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeToolBeforeCallHookResult,
      applyMutation: applyToolBeforeCallMutation,
      buildShortCircuitReturn: ({ result }) => ({
        action: 'short-circuit',
        output: toJsonValue(result.output),
      }),
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
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'tool:after-call',
        context: input.context,
      }),
      hookName: 'tool:after-call',
      context: input.context,
      payload: cloneToolAfterCallHookPayload(input.payload),
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeToolAfterCallHookResult,
      applyMutation: applyToolAfterCallMutation,
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
    return runMutatingHookChain({
      records: listDispatchableHookRecords({
        records: this.records.values(),
        hookName: 'response:before-send',
        context: input.context,
      }),
      hookName: 'response:before-send',
      context: input.context,
      payload: cloneResponseBeforeSendHookPayload(input.payload),
      invokeHook: (hookInput) => this.invokePluginHook(hookInput),
      normalizeResult: normalizeResponseBeforeSendHookResult,
      applyMutation: applyResponseBeforeSendMutation,
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
    await recordRuntimePluginFailureAndDispatch({
      ...input,
      record: this.records.get(input.pluginId),
      recordFailure: async (failure) => {
        await this.pluginService.recordPluginFailure(failure.pluginId, {
          type: failure.type,
          message: failure.message,
          metadata: failure.metadata,
          checked: failure.checked,
        });
      },
      dispatchPluginErrorHook: async (payload) => {
        await this.runPluginErrorHooks({
          context: input.context,
          payload,
        });
      },
    });
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
    return invokeDispatchableHooks({
      records: this.records.values(),
      hookName: input.hookName,
      context: input.context,
      payload: input.payload,
      invoke: (record, payload) =>
        this.invokePluginHook({
          pluginId: record.manifest.id,
          hookName: input.hookName,
          context: input.context,
          payload,
        }),
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
    record: PluginRuntimeRecord;
    context: PluginCallContext;
    executionType: 'tool' | 'route' | 'hook';
    executionMetadata: JsonObject;
    failureTypePrefix: 'tool' | 'route' | 'hook';
    failureMetadata: JsonObject;
    timeoutMs: number;
    timeoutMessage: string;
    skipPluginErrorHook?: boolean;
    recordFailure?: boolean;
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
          pluginId: input.record.manifest.id,
          context: input.context,
          type: error instanceof Error && error.message.includes('超时')
            ? `${input.failureTypePrefix}:timeout`
            : `${input.failureTypePrefix}:error`,
          message: error instanceof Error ? error.message : String(error),
          metadata: input.failureMetadata,
          skipPluginErrorHook: input.skipPluginErrorHook,
        });
      }
      throw error;
    }
  }

}
