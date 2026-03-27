import type {
  ActionConfig,
  ChatAfterModelHookPayload,
  ChatBeforeModelHookMutateResult,
  ChatBeforeModelRequest,
  ChatBeforeModelHookPayload,
  ChatBeforeModelHookPassResult,
  ChatBeforeModelHookShortCircuitResult,
  HostCallPayload,
  PluginCallContext,
  PluginCapability,
  PluginHookName,
  PluginHostMethod,
  PluginLlmMessage,
  PluginManifest,
  PluginPermission,
  PluginRouteDescriptor,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginRuntimeKind,
  PluginSubagentRunResult,
  TriggerConfig,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { createStepLimit } from '../ai/sdk-adapter';
import { filterToolSet, getPluginTools } from '../ai/tools';
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
  'automation.list': 'automation:read',
  'automation.run': 'automation:write',
  'automation.toggle': 'automation:write',
  'config.get': 'config:read',
  'cron.delete': 'cron:write',
  'cron.list': 'cron:read',
  'cron.register': 'cron:write',
  'conversation.get': 'conversation:read',
  'conversation.messages.list': 'conversation:read',
  'conversation.title.set': 'conversation:write',
  'kb.get': 'kb:read',
  'kb.list': 'kb:read',
  'kb.search': 'kb:read',
  'llm.generate': 'llm:generate',
  'llm.generate-text': 'llm:generate',
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
 * 归一化后的聊天模型前 Hook 返回。
 */
type NormalizedChatBeforeModelHookResult =
  | ChatBeforeModelHookPassResult
  | ChatBeforeModelHookMutateResult
  | ChatBeforeModelHookShortCircuitResult;

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
  private automationService?: AutomationService;

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

    this.records.set(input.manifest.id, {
      manifest: input.manifest,
      runtimeKind: input.runtimeKind,
      deviceType: input.deviceType ?? input.runtimeKind,
      transport: input.transport,
      governance,
    });
    await this.cronService.onPluginRegistered(
      input.manifest.id,
      input.manifest.crons ?? [],
    );

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
  }

  /**
   * 注销一个插件。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  async unregisterPlugin(pluginId: string): Promise<void> {
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
  }> {
    return [...this.records.entries()].map(([pluginId, record]) => ({
      pluginId,
      runtimeKind: record.runtimeKind,
      deviceType: record.deviceType,
      manifest: record.manifest,
    }));
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
  }): Promise<JsonValue> {
    const record = this.getRecordOrThrow(input.pluginId);
    this.assertPluginEnabled(record, input.context);

    try {
      return await this.runWithTimeout(
        Promise.resolve(
          record.transport.executeTool({
            toolName: input.toolName,
            params: input.params,
            context: input.context,
          }),
        ),
        this.readTimeoutMs(input.context, 30000),
        `插件 ${input.pluginId} 工具 ${input.toolName} 执行超时`,
      );
    } catch (error) {
      await this.pluginService.recordPluginFailure(input.pluginId, {
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
      return await this.runWithTimeout(
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
      );
    } catch (error) {
      await this.pluginService.recordPluginFailure(input.pluginId, {
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
      return await this.runWithTimeout(
        Promise.resolve(
          record.transport.invokeHook({
            hookName: input.hookName,
            context: input.context,
            payload: input.payload,
          }),
        ),
        this.readTimeoutMs(input.context, 10000),
        `插件 ${record.manifest.id} Hook ${input.hookName} 执行超时`,
      );
    } catch (error) {
      if (input.recordFailure !== false) {
        await this.pluginService.recordPluginFailure(record.manifest.id, {
          type: error instanceof Error && error.message.includes('超时')
            ? 'hook:timeout'
            : 'hook:error',
          message: error instanceof Error ? error.message : String(error),
          metadata: {
            hookName: input.hookName,
          },
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
          return {
            action: 'short-circuit',
            request,
            assistantContent: hookResult.assistantContent,
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
   * 运行所有聊天模型后 Hook。
   * @param input Hook 调用上下文与载荷
   * @returns 无返回值
   */
  async runChatAfterModelHooks(input: {
    context: PluginCallContext;
    payload: ChatAfterModelHookPayload;
  }): Promise<void> {
    await this.invokeHookAcrossPlugins({
      hookName: 'chat:after-model',
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
  ): PluginRuntimeRecord[] {
    return [...this.records.values()]
      .filter((record) =>
        this.isPluginEnabledForContext(record, context)
        && (record.manifest.hooks ?? []).some((hook) => hook.name === hookName),
      )
      .sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
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
   * 执行一次宿主侧 subagent 调用。
   * @param input 调用参数
   * @returns subagent 最终结果
   */
  private async runSubagent(input: {
    pluginId: string;
    context: PluginCallContext;
    params: JsonObject;
  }): Promise<PluginSubagentRunResult> {
    const providerId = this.readOptionalString(input.params, 'providerId', 'subagent.run');
    const modelId = this.readOptionalString(input.params, 'modelId', 'subagent.run');
    const system = this.readOptionalString(input.params, 'system', 'subagent.run');
    const variant = this.readOptionalString(input.params, 'variant', 'subagent.run');
    const providerOptions = this.readOptionalObject(
      input.params,
      'providerOptions',
      'subagent.run',
    );
    const headers = this.readOptionalStringRecord(
      input.params,
      'headers',
      'subagent.run',
    );
    const maxOutputTokens = this.readOptionalNumber(
      input.params,
      'maxOutputTokens',
      'subagent.run',
    );
    const maxSteps = normalizePositiveInteger(
      this.readOptionalNumber(input.params, 'maxSteps', 'subagent.run'),
      5,
    );
    const toolNames = this.readOptionalStringArray(
      input.params,
      'toolNames',
      'subagent.run',
    );
    const messages = this.readLlmMessages(input.params, 'subagent.run');
    const modelConfig = this.aiModelExecution.resolveModelConfig(providerId, modelId);

    if (hasImagePart(messages) && !modelConfig.capabilities.input.image) {
      throw new BadRequestException('subagent.run 当前模型不支持图片输入');
    }

    const prepared = this.aiModelExecution.prepareResolved({
      modelConfig,
      sdkMessages: toAiSdkMessages(messages as unknown as ChatRuntimeMessage[]),
    });
    const tools = this.buildSubagentToolSet({
      pluginId: input.pluginId,
      context: input.context,
      providerId: String(modelConfig.providerId),
      modelId: String(modelConfig.id),
      toolNames,
    });
    const executed = this.aiModelExecution.streamPrepared({
      prepared,
      system,
      tools,
      stopWhen: createStepLimit(maxSteps),
      variant,
      providerOptions,
      headers,
      maxOutputTokens,
    });

    let text = '';
    const toolCalls: PluginSubagentRunResult['toolCalls'] = [];
    const toolResults: PluginSubagentRunResult['toolResults'] = [];

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

    return {
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
  }

  /**
   * 构造 subagent 可见的工具集合，并默认排除调用插件自身的工具。
   * @param input 调用参数
   * @returns 裁剪后的工具集合
   */
  private buildSubagentToolSet(input: {
    pluginId: string;
    context: PluginCallContext;
    providerId: string;
    modelId: string;
    toolNames?: string[];
  }) {
    if (!input.context.userId || !input.context.conversationId) {
      return undefined;
    }

    const callerRecord = this.getRecordOrThrow(input.pluginId);
    const ownVisibleToolNames = new Set(
      (callerRecord.manifest.tools ?? []).map((tool) =>
        callerRecord.runtimeKind === 'builtin'
          ? tool.name
          : `${input.pluginId}__${tool.name}`),
    );
    const visibleTools = getPluginTools(this, {
      source: 'subagent',
      userId: input.context.userId,
      conversationId: input.context.conversationId,
      activeProviderId: input.providerId,
      activeModelId: input.modelId,
      activePersonaId: input.context.activePersonaId,
    });
    const filteredSelfTools = Object.fromEntries(
      Object.entries(visibleTools).filter(
        ([toolName]) => !ownVisibleToolNames.has(toolName),
      ),
    );

    return filterToolSet(filteredSelfTools, input.toolNames);
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
