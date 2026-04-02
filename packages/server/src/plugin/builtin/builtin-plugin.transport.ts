import type {
  ActionConfig,
  AutomationEventDispatchInfo,
  AutomationInfo,
  ChatAfterModelHookPayload,
  ChatBeforeModelHookPayload,
  ChatBeforeModelHookResult,
  HostCallPayload,
  PluginActionName,
  PluginCallContext,
  PluginEventListResult,
  PluginEventLevel,
  PluginEventQuery,
  PluginKbEntryDetail,
  PluginKbEntrySummary,
  PluginCronDescriptor,
  PluginCronJobSummary,
  PluginConversationSessionInfo,
  PluginConversationSessionKeepParams,
  PluginConversationSessionStartParams,
  PluginHookName,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginManifest,
  PluginMessageSendInfo,
  PluginMessageSendParams,
  PluginMessageTargetInfo,
  PluginPersonaCurrentInfo,
  PluginPersonaSummary,
  PluginProviderCurrentInfo,
  PluginProviderModelSummary,
  PluginProviderSummary,
  PluginSubagentRunParams,
  PluginSubagentRunResult,
  PluginSubagentTaskDetail,
  PluginSubagentTaskStartParams,
  PluginSubagentTaskSummary,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginSelfInfo,
  TriggerConfig,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { PluginTransport } from '../plugin-runtime.types';
import { createBuiltinPluginHostFacade } from './builtin-plugin-host-facade.helpers';
import {
  type BuiltinPluginGenerateTextParams,
  type BuiltinPluginScopedStateOptions,
} from './builtin-plugin-host-params.helpers';
import { readBuiltinHookPayload } from './builtin-hook-payload.helpers';

/**
 * 内建插件可用的 Host API 调用器。
 */
interface BuiltinPluginHostCaller {
  /**
   * 执行一次 Host API 调用。
   * @param input 插件 ID、上下文、方法和参数
   * @returns JSON 可序列化结果
   */
  call(input: {
    pluginId: string;
    context: PluginCallContext;
    method: HostCallPayload['method'];
    params: JsonObject;
  }): Promise<JsonValue>;
}

/**
 * 内建插件可选的治理动作处理器。
 */
interface BuiltinPluginGovernanceHandlers {
  /**
   * 重新装载当前内建插件。
   * @returns 无返回值
   */
  reload?: () => Promise<void> | void;

  /**
   * 请求当前内建插件重连。
   * @returns 无返回值
   */
  reconnect?: () => Promise<void> | void;

  /**
   * 对当前内建插件执行健康检查。
   * @returns 健康检查结果
   */
  checkHealth?: () => Promise<{ ok: boolean }> | { ok: boolean };
}

/**
 * 内建插件的宿主 API 门面。
 */
interface BuiltinPluginHostFacade {
  /**
   * 透传调用任意 Host API 方法。
   * @param method 方法名
   * @param params JSON 参数
   * @returns Host API 返回值
   */
  call(method: HostCallPayload['method'], params: JsonObject): Promise<JsonValue>;

  /**
   * 读取当前 provider/model 上下文。
   * @returns 当前 provider/model 摘要
   */
  getCurrentProvider(): Promise<PluginProviderCurrentInfo>;

  /**
   * 列出宿主当前可用的 provider 摘要。
   * @returns provider 摘要列表
   */
  listProviders(): Promise<PluginProviderSummary[]>;

  /**
   * 读取单个 provider 摘要。
   * @param providerId provider ID
   * @returns provider 摘要
   */
  getProvider(providerId: string): Promise<PluginProviderSummary>;

  /**
   * 读取单个模型摘要。
   * @param providerId provider ID
   * @param modelId model ID
   * @returns 模型摘要
   */
  getProviderModel(
    providerId: string,
    modelId: string,
  ): Promise<PluginProviderModelSummary>;

  /**
   * 读取当前会话摘要。
   * @returns 会话摘要
   */
  getConversation(): Promise<JsonValue>;

  /**
   * 读取当前消息目标摘要。
   * @returns 当前目标；不存在时返回 null
   */
  getCurrentMessageTarget(): Promise<PluginMessageTargetInfo | null>;

  /**
   * 主动向当前或指定消息目标发送一条 assistant 消息。
   * @param input 目标与消息内容
   * @returns 已发送的消息摘要
   */
  sendMessage(input: PluginMessageSendParams): Promise<PluginMessageSendInfo>;

  /**
   * 为当前会话启动等待态，多轮用户消息会优先交给当前插件处理。
   * @param input 超时与历史记录参数
   * @returns 当前活动会话等待态摘要
   */
  startConversationSession(
    input: PluginConversationSessionStartParams,
  ): Promise<PluginConversationSessionInfo>;

  /**
   * 读取当前插件在当前会话上的活动等待态。
   * @returns 会话等待态摘要；不存在时返回 null
   */
  getConversationSession(): Promise<PluginConversationSessionInfo | null>;

  /**
   * 续期当前插件在当前会话上的等待态。
   * @param input 新的超时参数
   * @returns 更新后的会话等待态摘要；不存在时返回 null
   */
  keepConversationSession(
    input: PluginConversationSessionKeepParams,
  ): Promise<PluginConversationSessionInfo | null>;

  /**
   * 结束当前插件在当前会话上的等待态。
   * @returns 是否成功结束
   */
  finishConversationSession(): Promise<boolean>;

  /**
   * 列出宿主当前可见的知识库条目摘要。
   * @param limit 可选返回上限
   * @returns KB 摘要列表
   */
  listKnowledgeBaseEntries(limit?: number): Promise<PluginKbEntrySummary[]>;

  /**
   * 搜索宿主知识库。
   * @param query 搜索词
   * @param limit 可选返回上限
   * @returns KB 条目详情列表
   */
  searchKnowledgeBase(
    query: string,
    limit?: number,
  ): Promise<PluginKbEntryDetail[]>;

  /**
   * 读取单个知识库条目详情。
   * @param entryId 条目 ID
   * @returns KB 条目详情
   */
  getKnowledgeBaseEntry(entryId: string): Promise<PluginKbEntryDetail>;

  /**
   * 读取当前 persona 上下文。
   * @returns 当前 persona 摘要
   */
  getCurrentPersona(): Promise<PluginPersonaCurrentInfo>;

  /**
   * 列出宿主当前可用的 persona。
   * @returns persona 摘要列表
   */
  listPersonas(): Promise<PluginPersonaSummary[]>;

  /**
   * 读取单个 persona 摘要。
   * @param personaId persona ID
   * @returns persona 摘要
   */
  getPersona(personaId: string): Promise<PluginPersonaSummary>;

  /**
   * 为当前会话激活一个 persona。
   * @param personaId persona ID
   * @returns 激活后的当前 persona 摘要
   */
  activatePersona(personaId: string): Promise<PluginPersonaCurrentInfo>;

  /**
   * 注册或更新当前插件的 host cron job。
   * @param descriptor cron 描述
   * @returns 注册后的 job 摘要
   */
  registerCron(descriptor: PluginCronDescriptor): Promise<PluginCronJobSummary>;

  /**
   * 列出当前插件的 cron job。
   * @returns job 摘要列表
   */
  listCrons(): Promise<PluginCronJobSummary[]>;

  /**
   * 删除当前插件的一个 host cron job。
   * @param jobId job ID
   * @returns 是否删除成功
   */
  deleteCron(jobId: string): Promise<boolean>;

  /**
   * 创建一个自动化规则。
   * @param input 自动化名称、触发器与动作列表
   * @returns 新建后的自动化摘要
   */
  createAutomation(input: {
    name: string;
    trigger: TriggerConfig;
    actions: ActionConfig[];
  }): Promise<AutomationInfo>;

  /**
   * 列出当前用户的自动化规则。
   * @returns 自动化摘要列表
   */
  listAutomations(): Promise<AutomationInfo[]>;

  /**
   * 切换一个自动化的启用状态。
   * @param automationId 自动化 ID
   * @returns 切换结果；未找到时返回 null
   */
  toggleAutomation(
    automationId: string,
  ): Promise<{ id: string; enabled: boolean } | null>;

  /**
   * 立刻运行一个自动化。
   * @param automationId 自动化 ID
   * @returns 执行结果；未找到或不可运行时返回 null
   */
  runAutomation(
    automationId: string,
  ): Promise<{ status: string; results: JsonValue[] } | null>;

  /**
   * 发出一个自动化事件，触发当前用户下匹配该事件名的自动化。
   * @param event 事件名
   * @returns 命中的自动化 ID 摘要
   */
  emitAutomationEvent(event: string): Promise<AutomationEventDispatchInfo>;

  /**
   * 读取当前插件自身摘要。
   * @returns 插件摘要
   */
  getPluginSelf(): Promise<PluginSelfInfo>;

  /**
   * 读取当前插件自身的事件日志。
   * @param query 可选分页与过滤参数
   * @returns 事件日志分页结果
   */
  listLogs(query?: PluginEventQuery): Promise<PluginEventListResult>;

  /**
   * 主动向宿主写入一条插件事件日志。
   * @param input 日志级别、消息与可选上下文
   * @returns 是否记录成功
   */
  writeLog(input: {
    level: PluginEventLevel;
    message: string;
    type?: string;
    metadata?: JsonObject;
  }): Promise<boolean>;

  /**
   * 搜索当前用户记忆。
   * @param query 搜索词
   * @param limit 限制数量
   * @returns 命中的记忆列表
   */
  searchMemories(query: string, limit?: number): Promise<JsonValue>;

  /**
   * 保存一条用户记忆。
   * @param params 记忆内容和附加分类
   * @returns 新创建的记忆摘要
   */
  saveMemory(params: {
    content: string;
    category?: string;
    keywords?: string;
  }): Promise<JsonValue>;

  /**
   * 读取当前会话消息列表。
   * @returns 会话消息列表
   */
  listConversationMessages(): Promise<JsonValue>;

  /**
   * 读取插件持久化存储中的单个值。
   * @param key 存储键
   * @param options 可选作用域；默认 `plugin`
   * @returns JSON 值
   */
  getStorage(key: string, options?: BuiltinPluginScopedStateOptions): Promise<JsonValue>;

  /**
   * 写入插件持久化存储。
   * @param key 存储键
   * @param value JSON 值
   * @param options 可选作用域；默认 `plugin`
   * @returns 写入结果
   */
  setStorage(
    key: string,
    value: JsonValue,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;

  /**
   * 删除插件持久化存储中的一个键。
   * @param key 存储键
   * @param options 可选作用域；默认 `plugin`
   * @returns 是否删除成功
   */
  deleteStorage(key: string, options?: BuiltinPluginScopedStateOptions): Promise<JsonValue>;

  /**
   * 按前缀列出插件持久化存储。
   * @param prefix 可选前缀
   * @param options 可选作用域；默认 `plugin`
   * @returns 键值对列表
   */
  listStorage(
    prefix?: string,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;

  /**
   * 读取当前插件运行时状态。
   * @param key 状态键
   * @param options 可选作用域；默认 `plugin`
   * @returns JSON 值
   */
  getState(key: string, options?: BuiltinPluginScopedStateOptions): Promise<JsonValue>;

  /**
   * 写入当前插件运行时状态。
   * @param key 状态键
   * @param value JSON 值
   * @param options 可选作用域；默认 `plugin`
   * @returns 写入结果
   */
  setState(
    key: string,
    value: JsonValue,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;

  /**
   * 删除当前插件运行时状态。
   * @param key 状态键
   * @param options 可选作用域；默认 `plugin`
   * @returns 是否删除成功
   */
  deleteState(key: string, options?: BuiltinPluginScopedStateOptions): Promise<JsonValue>;

  /**
   * 按前缀列出当前插件运行时状态。
   * @param prefix 可选前缀
   * @param options 可选作用域；默认 `plugin`
   * @returns 键值对列表
   */
  listState(
    prefix?: string,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;

  /**
   * 读取当前插件解析后的配置。
   * @param key 可选单项配置键
   * @returns 配置对象或单个配置值
   */
  getConfig(key?: string): Promise<JsonValue>;

  /**
   * 读取当前用户摘要。
   * @returns 用户摘要
   */
  getUser(): Promise<JsonValue>;

  /**
   * 更新当前会话标题。
   * @param title 新标题
   * @returns 更新后的会话摘要
   */
  setConversationTitle(title: string): Promise<JsonValue>;

  /**
   * 发起一次宿主侧结构化生成。
   * @param params 消息与可选模型参数
   * @returns 结构化生成结果
   */
  generate(params: PluginLlmGenerateParams): Promise<PluginLlmGenerateResult>;

  /**
   * 发起一次宿主侧子代理调用。
   * @param params 子代理消息与可选模型参数
   * @returns 子代理执行结果
   */
  runSubagent(params: PluginSubagentRunParams): Promise<PluginSubagentRunResult>;

  /**
   * 启动一个后台子代理任务。
   * @param params 子代理消息、可选回写目标和模型参数
   * @returns 已排队的任务摘要
   */
  startSubagentTask(
    params: PluginSubagentTaskStartParams,
  ): Promise<PluginSubagentTaskSummary>;

  /**
   * 列出当前插件启动过的后台子代理任务。
   * @returns 任务摘要列表
   */
  listSubagentTasks(): Promise<PluginSubagentTaskSummary[]>;

  /**
   * 读取当前插件的一个后台子代理任务详情。
   * @param taskId 任务 ID
   * @returns 任务详情
   */
  getSubagentTask(taskId: string): Promise<PluginSubagentTaskDetail>;

  /**
   * 发起一次宿主侧文本生成。
   * @param params 提示词与可选模型参数
   * @returns 文本生成结果
   */
  generateText(params: BuiltinPluginGenerateTextParams): Promise<JsonValue>;
}

/**
 * 内建插件执行上下文。
 */
interface BuiltinPluginExecutionContext {
  /** 调用上下文。 */
  callContext: PluginCallContext;
  /** Host API 门面。 */
  host: BuiltinPluginHostFacade;
}

/**
 * 内建插件工具处理器。
 */
type BuiltinPluginToolHandler = (
  params: JsonObject,
  context: BuiltinPluginExecutionContext,
) => Promise<JsonValue> | JsonValue;

/**
 * 内建插件 Hook 处理器。
 */
type BuiltinPluginHookHandler = (
  payload: JsonValue,
  context: BuiltinPluginExecutionContext,
) => Promise<JsonValue | null | undefined> | JsonValue | null | undefined;

/**
 * 内建插件 Route 处理器。
 */
type BuiltinPluginRouteHandler = (
  request: PluginRouteRequest,
  context: BuiltinPluginExecutionContext,
) => Promise<PluginRouteResponse> | PluginRouteResponse;

/**
 * 内建插件定义。
 */
export interface BuiltinPluginDefinition {
  /** 插件清单。 */
  manifest: PluginManifest;
  /** 工具处理器表。 */
  tools?: Record<string, BuiltinPluginToolHandler>;
  /** Hook 处理器表。 */
  hooks?: Partial<Record<PluginHookName, BuiltinPluginHookHandler>>;
  /** Route 处理器表。 */
  routes?: Record<string, BuiltinPluginRouteHandler>;
}

/**
 * 内建插件 transport。
 *
 * 输入:
 * - 工具执行请求
 * - Hook 调用请求
 *
 * 输出:
 * - 插件执行结果
 *
 * 预期行为:
 * - 保持与 remote transport 相同的 executeTool / invokeHook / invokeRoute 语义
 * - 通过 Host API 门面访问宿主能力，而不是直接注入服务对象
 */
export class BuiltinPluginTransport implements PluginTransport {
  constructor(
    private readonly definition: BuiltinPluginDefinition,
    private readonly hostService: BuiltinPluginHostCaller,
    private readonly governance?: BuiltinPluginGovernanceHandlers,
  ) {}

  /**
   * 执行一个内建插件工具。
   * @param input 工具名、参数与调用上下文
   * @returns JSON 可序列化的执行结果
   */
  async executeTool(input: {
    toolName: string;
    params: JsonObject;
    context: PluginCallContext;
  }): Promise<JsonValue> {
    const handler = this.definition.tools?.[input.toolName];
    if (!handler) {
      throw new BadRequestException(
        `未知的内建插件工具: ${this.definition.manifest.id}:${input.toolName}`,
      );
    }

    return handler(input.params, {
      callContext: input.context,
      host: this.createHostFacade(input.context),
    });
  }

  /**
   * 调用一个内建插件 Hook。
   * @param input Hook 名称、上下文和 Hook 负载
   * @returns Hook 返回值
   */
  async invokeHook(input: {
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
  }): Promise<JsonValue | null | undefined> {
    const handler = this.definition.hooks?.[input.hookName];
    if (!handler) {
      return null;
    }

    return handler(input.payload, {
      callContext: input.context,
      host: this.createHostFacade(input.context),
    });
  }

  /**
   * 调用一个内建插件声明的 Route。
   * @param input Route 请求与调用上下文
   * @returns 标准化 Route 响应
   */
  async invokeRoute(input: {
    request: PluginRouteRequest;
    context: PluginCallContext;
  }): Promise<PluginRouteResponse> {
    const handler = this.definition.routes?.[normalizeBuiltinRoutePath(input.request.path)];
    if (!handler) {
      throw new BadRequestException(
        `未知的内建插件 Route: ${this.definition.manifest.id}:${input.request.path}`,
      );
    }

    return handler(input.request, {
      callContext: input.context,
      host: this.createHostFacade(input.context),
    });
  }

  /**
   * 重新装载当前内建插件。
   * @returns 无返回值
   */
  async reload(): Promise<void> {
    if (!this.governance?.reload) {
      throw new BadRequestException(
        `插件 ${this.definition.manifest.id} 不支持治理动作 reload`,
      );
    }

    await this.governance.reload();
  }

  /**
   * 请求当前内建插件重连。
   * @returns 无返回值
   */
  async reconnect(): Promise<void> {
    if (!this.governance?.reconnect) {
      throw new BadRequestException(
        `插件 ${this.definition.manifest.id} 不支持治理动作 reconnect`,
      );
    }

    await this.governance.reconnect();
  }

  /**
   * 对当前内建插件执行健康检查。
   * @returns 健康检查结果
   */
  async checkHealth(): Promise<{ ok: boolean }> {
    if (!this.governance?.checkHealth) {
      return {
        ok: true,
      };
    }

    return this.governance.checkHealth();
  }

  /**
   * 返回当前内建插件真实支持的治理动作。
   * @returns 治理动作列表
   */
  listSupportedActions(): PluginActionName[] {
    const actions: PluginActionName[] = ['health-check'];
    if (this.governance?.reload) {
      actions.push('reload');
    }
    if (this.governance?.reconnect) {
      actions.push('reconnect');
    }

    return actions;
  }

  /**
   * 执行一次原始 Host API 调用。
   * @param context 调用上下文
   * @param method Host 方法名
   * @param params JSON 参数
   * @returns 原始 JSON 返回值
   */
  private invokeHost(
    context: PluginCallContext,
    method: HostCallPayload['method'],
    params: JsonObject,
  ): Promise<JsonValue> {
    return this.hostService.call({
      pluginId: this.definition.manifest.id,
      context,
      method,
      params,
    });
  }

  /**
   * 执行一次带类型收口的 Host API 调用。
   * @param context 调用上下文
   * @param method Host 方法名
   * @param params JSON 参数
   * @returns 收口后的结构化结果
   */
  private callHost<T>(
    context: PluginCallContext,
    method: HostCallPayload['method'],
    params: JsonObject = {},
  ): Promise<T> {
    return this.invokeHost(context, method, params) as Promise<T>;
  }

  /**
   * 创建一个绑定到当前插件与调用上下文的 Host API 门面。
   * @param context 调用上下文
   * @returns 带便捷方法的 Host API 门面
   */
  private createHostFacade(
    context: PluginCallContext,
  ): BuiltinPluginHostFacade {
    return createBuiltinPluginHostFacade({
      call: (method, params) => this.invokeHost(context, method, params),
      callHost: <T>(
        method: HostCallPayload['method'],
        params: JsonObject = {},
      ) => this.callHost<T>(context, method, params),
    });
  }
}

/**
 * 将 JSON 负载收敛为聊天模型前 Hook 载荷。
 * @param payload 原始 JSON 负载
 * @returns 结构化 Hook 输入
 */
export function asChatBeforeModelPayload(
  payload: JsonValue,
): ChatBeforeModelHookPayload {
  return readBuiltinHookPayload<ChatBeforeModelHookPayload>(payload);
}

/**
 * 将 JSON 负载收敛为聊天模型后 Hook 载荷。
 * @param payload 原始 JSON 负载
 * @returns 结构化 Hook 输入
 */
export function asChatAfterModelPayload(
  payload: JsonValue,
): ChatAfterModelHookPayload {
  return readBuiltinHookPayload<ChatAfterModelHookPayload>(payload);
}

/**
 * 构造聊天模型前 Hook 返回值。
 * @param currentSystemPrompt 当前系统提示词
 * @param appendedSystemPrompt 要追加的系统提示词
 * @returns Hook 返回值对象
 */
export function createChatBeforeModelHookResult(
  currentSystemPrompt: string,
  appendedSystemPrompt: string,
): ChatBeforeModelHookResult {
  return {
    action: 'mutate',
    systemPrompt: currentSystemPrompt
      ? [currentSystemPrompt, appendedSystemPrompt].join('\n\n')
      : appendedSystemPrompt,
  };
}

/**
 * 归一化内建插件 Route 路径键。
 * @param path 原始路径
 * @returns 去掉首尾斜杠后的路径键
 */
function normalizeBuiltinRoutePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}
