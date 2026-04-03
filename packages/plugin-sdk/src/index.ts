import {
  type ActionConfig,
  type AutomationEventDispatchInfo,
  type AuthPayload,
  type AutomationInfo,
  type ChatAfterModelHookPayload,
  type ChatBeforeModelHookPayload,
  type ChatBeforeModelHookResult,
  type ChatMessagePart,
  type DeviceType,
    type ExecuteErrorPayload,
    type ExecutePayload,
    type ExecuteResultPayload,
    type HostCallPayload,
    type HostResultPayload,
    type HookInvokePayload,
  type JsonObject,
  type JsonValue,
  type MessageReceivedHookPayload,
  type MessageReceivedHookResult,
  type PluginCallContext,
  type PluginActionName,
  type PluginEventListResult,
  type PluginEventLevel,
  type PluginEventQuery,
  type PluginHookDescriptor,
  type PluginHookMessageFilter,
  type PluginKbEntryDetail,
  type PluginKbEntrySummary,
  type PluginCapability,
  type PluginCronDescriptor,
  type PluginCronJobSummary,
  type PluginConversationSessionInfo,
  type PluginConversationSessionKeepParams,
  type PluginConversationSessionStartParams,
  type PluginCommandDescriptor,
  type PluginHookName,
  type PluginMessageKind,
  type PluginMessageHookInfo,
  type PluginMessageSendInfo,
  type PluginMessageSendParams,
  type PluginMessageTargetInfo,
  type PluginLlmGenerateParams,
  type PluginLlmGenerateResult,
  type PluginManifest,
  type PluginPersonaCurrentInfo,
  type PluginPersonaSummary,
  type PluginProviderCurrentInfo,
  type PluginProviderModelSummary,
  type PluginProviderSummary,
  type PluginRouteDescriptor,
  type PluginRouteRequest,
  type PluginRouteResponse,
  type PluginScopedStateScope,
  type PluginSelfInfo,
  type PluginSubagentRunParams,
  type PluginSubagentRunResult,
  type PluginSubagentTaskDetail,
  type PluginSubagentTaskStartParams,
  type PluginSubagentTaskSummary,
  type RemotePluginBootstrapInfo,
    type RegisterPayload,
    type RouteInvokePayload,
    type RouteResultPayload,
  type TriggerConfig,
  WS_ACTION,
  WS_TYPE,
  type WsMessage,
} from '@garlic-claw/shared';
import WebSocket from 'ws';

/**
 * 插件客户端中的 manifest 输入。
 */
export interface PluginManifestInput {
  /** 展示名称。 */
  name?: string;
  /** 插件版本。 */
  version?: string;
  /** 插件描述。 */
  description?: string;
  /** 权限列表。 */
  permissions?: PluginManifest['permissions'];
  /** 工具描述列表。 */
  tools?: PluginCapability[];
  /** 命令描述列表。 */
  commands?: NonNullable<PluginManifest['commands']>;
  /** Hook 描述列表。 */
  hooks?: NonNullable<PluginManifest['hooks']>;
  /** 插件配置 schema。 */
  config?: PluginManifest['config'];
  /** 插件声明的 Web Route。 */
  routes?: PluginRouteDescriptor[];
}

export interface PluginClientOptions {
  /** WebSocket 服务器地址，例如 ws://localhost:23331 */
  serverUrl: string;
  /** 用于认证的 JWT 令牌 */
  token: string;
  /** 此插件实例的唯一名称 */
  pluginName: string;
  /** 设备类型 */
  deviceType: DeviceType;
  /** 新版 manifest 输入 */
  manifest?: PluginManifestInput;
  /** 断开时自动重连（默认：true） */
  autoReconnect?: boolean;
  /** 重连间隔（毫秒，默认：5000） */
  reconnectInterval?: number;
  /** 心跳间隔（毫秒，默认：20000） */
  heartbeatInterval?: number;
}

export interface PluginScopedStateOptions {
  scope?: PluginScopedStateScope;
}

export interface PluginGenerateTextParams {
  prompt: string;
  system?: string;
  providerId?: string;
  modelId?: string;
  variant?: string;
  maxOutputTokens?: number;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
}

/**
 * 插件 Host API 门面。
 */
export interface PluginHostFacade {
  /**
   * 调用任意 Host API 方法。
   * @param method Host API 方法名
   * @param params JSON 参数
   * @returns Host API 返回值
   */
  call(method: HostCallPayload['method'], params: JsonObject): Promise<JsonValue>;

  /**
   * 读取当前 provider/model 上下文。
   * @returns provider/model 摘要
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
   * 当前执行上下文绑定的会话等待态控制器。
   *
   * 这是对现有 `conversation.session.*` Host API 的本地封装，
   * 不会引入新的宿主协议。
   */
  conversationSession: PluginConversationSessionController;

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
   * 搜索用户长期记忆。
   * @param query 搜索词
   * @param limit 限制数量
   * @returns 搜索结果
   */
  searchMemories(query: string, limit?: number): Promise<JsonValue>;

  /**
   * 保存一条用户长期记忆。
   * @param params 保存参数
   * @returns 保存结果
   */
  saveMemory(params: {
    content: string;
    category?: string;
    keywords?: string;
  }): Promise<JsonValue>;

  /**
   * 列出当前对话消息。
   * @returns 对话消息列表
   */
  listConversationMessages(): Promise<JsonValue>;

  /**
   * 读取插件持久化存储中的单个值。
   * @param key 存储键
   * @param options 可选作用域；默认 `plugin`
   * @returns JSON 值
   */
  getStorage(key: string, options?: PluginScopedStateOptions): Promise<JsonValue>;

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
    options?: PluginScopedStateOptions,
  ): Promise<JsonValue>;

  /**
   * 删除插件持久化存储中的一个键。
   * @param key 存储键
   * @param options 可选作用域；默认 `plugin`
   * @returns 是否删除成功
   */
  deleteStorage(key: string, options?: PluginScopedStateOptions): Promise<JsonValue>;

  /**
   * 列出插件持久化存储。
   * @param prefix 可选前缀
   * @param options 可选作用域；默认 `plugin`
   * @returns 键值对列表
   */
  listStorage(
    prefix?: string,
    options?: PluginScopedStateOptions,
  ): Promise<JsonValue>;

  /**
   * 读取插件自身状态。
   * @param key 状态键
   * @param options 可选作用域；默认 `plugin`
   * @returns 状态值
   */
  getState(key: string, options?: PluginScopedStateOptions): Promise<JsonValue>;

  /**
   * 写入插件自身状态。
   * @param key 状态键
   * @param value JSON 值
   * @param options 可选作用域；默认 `plugin`
   * @returns 写入后的状态值
   */
  setState(
    key: string,
    value: JsonValue,
    options?: PluginScopedStateOptions,
  ): Promise<JsonValue>;

  /**
   * 删除插件自身状态。
   * @param key 状态键
   * @param options 可选作用域；默认 `plugin`
   * @returns 是否删除成功
   */
  deleteState(key: string, options?: PluginScopedStateOptions): Promise<JsonValue>;

  /**
   * 列出插件自身状态。
   * @param prefix 可选前缀
   * @param options 可选作用域；默认 `plugin`
   * @returns 键值对列表
   */
  listState(
    prefix?: string,
    options?: PluginScopedStateOptions,
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
  generateText(params: PluginGenerateTextParams): Promise<JsonValue>;
}

export type PluginHostFacadeMethods = Omit<PluginHostFacade, 'conversationSession'>;

export interface PluginHostFacadeFactoryInput {
  call: PluginHostFacade['call'];
  callHost<T>(
    method: HostCallPayload['method'],
    params?: JsonObject,
  ): Promise<T>;
  conversationSessionController?: {
    start(
      input: PluginConversationSessionStartParams,
    ): Promise<PluginConversationSessionInfo>;
    get(): Promise<PluginConversationSessionInfo | null>;
    keep(
      input: PluginConversationSessionKeepParams,
    ): Promise<PluginConversationSessionInfo | null>;
    finish(): Promise<boolean>;
  };
}

/** 会话等待态控制器。 */
export interface PluginConversationSessionController {
  /** 当前绑定的会话 ID；无上下文时返回 null。 */
  readonly conversationId: string | null;
  /** 当前同步到本地的等待态快照。 */
  readonly session: PluginConversationSessionInfo | null;
  /** 当前等待态的超时毫秒数。 */
  readonly timeoutMs: number | null;
  /** 当前等待态开始时间。 */
  readonly startedAt: string | null;
  /** 当前等待态过期时间。 */
  readonly expiresAt: string | null;
  /** 当前等待态最后一次命中的时间。 */
  readonly lastMatchedAt: string | null;
  /** 当前等待态是否记录历史。 */
  readonly captureHistory: boolean;
  /** 当前等待态累计的历史消息。 */
  readonly historyMessages: PluginMessageHookInfo[];
  /** 当前等待态 metadata。 */
  readonly metadata: JsonValue | undefined;

  /** 启动等待态。 */
  start(
    input: PluginConversationSessionStartParams,
  ): Promise<PluginConversationSessionInfo>;

  /** 读取当前等待态。 */
  get(): Promise<PluginConversationSessionInfo | null>;

  /** 同步一次当前等待态快照。 */
  sync(): Promise<PluginConversationSessionInfo | null>;

  /** 续期当前等待态。 */
  keep(
    input: PluginConversationSessionKeepParams,
  ): Promise<PluginConversationSessionInfo | null>;

  /** 结束当前等待态。 */
  finish(): Promise<boolean>;
}

/**
 * 插件执行上下文。
 */
export interface PluginAuthorExecutionContext<THost = PluginHostFacade> {
  /** 当前调用上下文。 */
  callContext: PluginCallContext;
  /** Host API 门面。 */
  host: THost;
}

/**
 * 插件执行上下文。
 */
export interface PluginExecutionContext
  extends PluginAuthorExecutionContext<PluginHostFacade> {}

/** `client.sessionWaiter(...)` 返回的 waiter 句柄。 */
export interface PluginSessionWaiterHandle {
  /**
   * 在当前执行上下文里启动等待态，并把后续命中的会话消息
   * 优先交给对应 handler。
   */
  start(
    context: PluginExecutionContext,
    input: PluginConversationSessionStartParams,
  ): Promise<PluginConversationSessionInfo>;
}

/** SDK 级消息监听配置。 */
export interface PluginMessageHandlerOptions {
  /** 当前监听器在插件内的优先级；数字越小越先执行。 */
  priority?: number;
  /** 当前监听器的声明式过滤条件。 */
  filter?: PluginHookMessageFilter;
  /** 可选描述文本，用于文档或自动帮助。 */
  description?: string;
}

/** SDK 级命令注册配置。 */
export interface PluginCommandOptions {
  /** 命令别名。 */
  alias?: Iterable<string>;
  /** 当前命令在插件内的优先级；数字越小越先执行。 */
  priority?: number;
  /** 命令描述，会出现在自动帮助里。 */
  description?: string;
}

/** SDK 级命令组注册配置。 */
export interface PluginCommandGroupOptions extends PluginCommandOptions {}

/** 命令命中后的上下文。 */
export interface PluginCommandInvocation {
  /** 实际命中的命令路径，可能是别名。 */
  matchedCommand: string;
  /** 归一化后的规范命令路径。 */
  canonicalCommand: string;
  /** 命令路径分段。 */
  path: string[];
  /** 已按空白拆分的参数。 */
  args: string[];
  /** 未进一步拆分的原始参数串。 */
  rawArgs: string;
  /** 当前消息 Hook 载荷。 */
  payload: MessageReceivedHookPayload;
}

/** SDK 返回短路消息的便捷结构。 */
export interface PluginMessageContentResult {
  content: string;
  parts?: ChatMessagePart[] | null;
}

/** SDK 级命令组注册器。 */
export interface PluginCommandGroupRegistration {
  /** 在当前组下注册一个子命令。 */
  command(
    name: string,
    handler: MessageCommandHandler,
    options?: PluginCommandOptions,
  ): PluginCommandGroupRegistration;

  /** 在当前组下注册一个子命令组。 */
  group(
    name: string,
    options?: PluginCommandGroupOptions,
  ): PluginCommandGroupRegistration;
}

export type PluginToolHandler<THost = PluginHostFacade> = (
  params: JsonObject,
  context: PluginAuthorExecutionContext<THost>,
) => Promise<JsonValue> | JsonValue;

export type PluginHookHandler<THost = PluginHostFacade> = (
  payload: JsonValue,
  context: PluginAuthorExecutionContext<THost>,
) => Promise<JsonValue | null | undefined> | JsonValue | null | undefined;

export type PluginRouteHandler<THost = PluginHostFacade> = (
  request: PluginRouteRequest,
  context: PluginAuthorExecutionContext<THost>,
) => Promise<PluginRouteResponse> | PluginRouteResponse;

export interface PluginAuthorDefinition<THost = PluginHostFacade> {
  manifest: PluginManifest;
  tools?: Record<string, PluginToolHandler<THost>>;
  hooks?: Partial<Record<PluginHookName, PluginHookHandler<THost>>>;
  routes?: Record<string, PluginRouteHandler<THost>>;
}

/**
 * 将插件 Hook 负载收口为目标类型。
 * @param payload 原始 Hook 负载
 * @returns 收口后的 Hook 负载
 */
export function readPluginHookPayload<T>(payload: JsonValue): T {
  return payload as T;
}

/**
 * 将 JSON 负载收口为聊天模型前 Hook 载荷。
 * @param payload 原始 JSON 负载
 * @returns 结构化 Hook 输入
 */
export function asChatBeforeModelPayload(
  payload: JsonValue,
): ChatBeforeModelHookPayload {
  return readPluginHookPayload<ChatBeforeModelHookPayload>(payload);
}

/**
 * 将 JSON 负载收口为聊天模型后 Hook 载荷。
 * @param payload 原始 JSON 负载
 * @returns 结构化 Hook 输入
 */
export function asChatAfterModelPayload(
  payload: JsonValue,
): ChatAfterModelHookPayload {
  return readPluginHookPayload<ChatAfterModelHookPayload>(payload);
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

export interface PluginAuthorTransportGovernanceHandlers {
  reload?: () => Promise<void> | void;
  reconnect?: () => Promise<void> | void;
  checkHealth?: () => Promise<{ ok: boolean }> | { ok: boolean };
}

export interface PluginAuthorTransportExecutorInput<THost = PluginHostFacade> {
  definition: PluginAuthorDefinition<THost>;
  governance?: PluginAuthorTransportGovernanceHandlers;
  createExecutionContext(
    callContext: PluginCallContext,
  ): PluginAuthorExecutionContext<THost>;
}

export interface PluginAuthorTransportExecutor {
  executeTool(input: {
    toolName: string;
    params: JsonObject;
    context: PluginCallContext;
  }): Promise<JsonValue> | JsonValue;
  invokeHook(input: {
    hookName: PluginHookName;
    payload: JsonValue;
    context: PluginCallContext;
  }): Promise<JsonValue | null | undefined> | JsonValue | null | undefined;
  invokeRoute(input: {
    request: PluginRouteRequest;
    context: PluginCallContext;
  }): Promise<PluginRouteResponse> | PluginRouteResponse;
  reload(): Promise<void>;
  reconnect(): Promise<void>;
  checkHealth(): Promise<{ ok: boolean }>;
  listSupportedActions(): PluginActionName[];
}

export function createPluginAuthorTransportExecutor<THost = PluginHostFacade>(
  input: PluginAuthorTransportExecutorInput<THost>,
): PluginAuthorTransportExecutor {
  const pluginId = input.definition.manifest.id;

  return {
    executeTool({ toolName, params, context }) {
      const handler = input.definition.tools?.[toolName];
      if (!handler) {
        throw new Error(`未知的插件工具: ${pluginId}:${toolName}`);
      }

      return handler(params, input.createExecutionContext(context));
    },
    invokeHook({ hookName, payload, context }) {
      const handler = input.definition.hooks?.[hookName];
      if (!handler) {
        return null;
      }

      return handler(payload, input.createExecutionContext(context));
    },
    invokeRoute({ request, context }) {
      const handler = input.definition.routes?.[normalizeRoutePath(request.path)];
      if (!handler) {
        throw new Error(`未知的插件 Route: ${pluginId}:${request.path}`);
      }

      return handler(request, input.createExecutionContext(context));
    },
    async reload() {
      if (!input.governance?.reload) {
        throw new Error(`插件 ${pluginId} 不支持治理动作 reload`);
      }

      await input.governance.reload();
    },
    async reconnect() {
      if (!input.governance?.reconnect) {
        throw new Error(`插件 ${pluginId} 不支持治理动作 reconnect`);
      }

      await input.governance.reconnect();
    },
    async checkHealth() {
      if (!input.governance?.checkHealth) {
        return {
          ok: true,
        };
      }

      return input.governance.checkHealth();
    },
    listSupportedActions() {
      const actions: PluginActionName[] = ['health-check'];
      if (input.governance?.reload) {
        actions.push('reload');
      }
      if (input.governance?.reconnect) {
        actions.push('reconnect');
      }

      return actions;
    },
  };
}

export function sanitizeOptionalText(value?: string): string {
  return (value ?? '').trim();
}

export function parseCommaSeparatedNames(raw?: string): string[] | undefined {
  const normalized = sanitizeOptionalText(raw);
  if (!normalized) {
    return undefined;
  }

  const names = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return names.length > 0 ? names : undefined;
}

export function filterAllowedToolNames(
  allowedToolNames: string[] | undefined,
  currentToolNames: string[],
): string[] | null {
  if (!allowedToolNames || allowedToolNames.length === 0) {
    return null;
  }

  const allowed = new Set(allowedToolNames);
  return currentToolNames.filter((toolName) => allowed.has(toolName));
}

export function sameToolNames(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((toolName, index) => toolName === right[index]);
}

export function readLatestUserTextFromMessages(
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | Array<{ type: string; text?: string }>;
  }>,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }

    if (typeof message.content === 'string') {
      return message.content.trim();
    }

    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    if (text) {
      return text;
    }
  }

  return '';
}

export function readConversationSummary(
  value: JsonValue,
): {
  id?: string;
  title?: string;
} {
  const object = readJsonObjectValue(value);
  if (!object) {
    return {};
  }

  return {
    ...(typeof object.id === 'string' ? { id: object.id } : {}),
    ...(typeof object.title === 'string' ? { title: object.title } : {}),
  };
}

export function readConversationMessages(
  value: JsonValue,
): Array<{
  role?: string;
  content?: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const object = readJsonObjectValue(entry);
    if (!object) {
      return [];
    }

    const message = {
      ...(typeof object.role === 'string' ? { role: object.role } : {}),
      ...(typeof object.content === 'string' ? { content: object.content } : {}),
    };

    return Object.keys(message).length > 0 ? [message] : [];
  });
}

export function readTextGenerationResult(
  value: JsonValue,
): {
  text?: string;
} {
  const object = readJsonObjectValue(value);
  if (!object || typeof object.text !== 'string') {
    return {};
  }

  return {
    text: object.text,
  };
}

export function readMemorySearchResults(
  value: JsonValue,
): Array<{
  content?: string;
  category?: string;
  createdAt?: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const object = readJsonObjectValue(entry);
    if (!object) {
      return [];
    }

    return [{
      ...(typeof object.content === 'string' ? { content: object.content } : {}),
      ...(typeof object.category === 'string' ? { category: object.category } : {}),
      ...(typeof object.createdAt === 'string' ? { createdAt: object.createdAt } : {}),
    }];
  });
}

export function readMemorySaveResultId(value: JsonValue): string | null {
  const object = readJsonObjectValue(value);
  return object && typeof object.id === 'string' ? object.id : null;
}

export function readJsonObjectValue(
  value: JsonValue,
): Record<string, JsonValue> | null {
  return isJsonObjectValue(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

export function describeJsonValueKind(value: JsonValue): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }

  return typeof value;
}

export function readRequiredStringParam(params: JsonObject, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} 必填`);
  }

  return value;
}

export function readOptionalStringParam(
  params: JsonObject,
  key: string,
): string | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${key} 必须是字符串`);
  }

  return value;
}

export function readOptionalObjectParam(
  params: JsonObject,
  key: string,
): JsonObject | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  const object = readJsonObjectValue(value);
  if (!object) {
    throw new Error(`${key} 必须是对象`);
  }

  return object;
}

export function readPluginCreateAutomationParams(params: JsonObject): {
  name: string;
  trigger: TriggerConfig;
  actions: ActionConfig[];
} {
  const triggerType = readRequiredStringParam(params, 'triggerType');
  if (
    triggerType !== 'cron'
    && triggerType !== 'manual'
    && triggerType !== 'event'
  ) {
    throw new Error('triggerType 必须是 cron/manual/event');
  }

  return {
    name: readRequiredStringParam(params, 'name'),
    trigger: {
      type: triggerType,
      ...(triggerType === 'cron'
        ? {
            cron: readRequiredStringParam(params, 'cronInterval'),
          }
        : triggerType === 'event'
          ? {
              event: readRequiredStringParam(params, 'eventName'),
            }
          : {}),
    },
    actions: readPluginAutomationActionsParam(params),
  };
}

export function readRequiredTextValue(value: JsonValue, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} 必须是非空字符串`);
  }

  return value.trim();
}

export function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

export function readBooleanFlag(value: JsonValue, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

export function createSubagentRunSummary(result: PluginSubagentRunResult): JsonValue {
  return toHostJsonValue({
    providerId: result.providerId,
    modelId: result.modelId,
    text: result.text,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
    ...(result.finishReason !== undefined
      ? { finishReason: result.finishReason }
      : {}),
  });
}

function readPluginAutomationActionsParam(params: JsonObject): ActionConfig[] {
  const value = params.actions;
  if (!Array.isArray(value)) {
    throw new Error('actions 必须是数组');
  }

  return value.map((action, index) =>
    readPluginAutomationAction(action, `actions[${index}]`));
}

function readPluginAutomationAction(value: JsonValue, label: string): ActionConfig {
  const action = requireJsonObjectValue(value, label);
  const type = readRequiredStringParam(action, 'type');
  if (type !== 'device_command' && type !== 'ai_message') {
    throw new Error(`${label}.type 不合法`);
  }

  if (type === 'device_command') {
    return {
      type,
      plugin: readRequiredStringParam(action, 'plugin'),
      capability: readRequiredStringParam(action, 'capability'),
      params: readOptionalObjectParam(action, 'params'),
    };
  }

  return {
    type,
    message: readOptionalStringParam(action, 'message') ?? undefined,
    target: readPluginAutomationActionTarget(action, label),
  };
}

function readPluginAutomationActionTarget(
  params: JsonObject,
  label: string,
): ActionConfig['target'] | undefined {
  const value = params.target;
  if (value === undefined || value === null) {
    return undefined;
  }

  const target = requireJsonObjectValue(value, `${label}.target`);
  const type = readRequiredStringParam(target, 'type');
  if (type !== 'conversation') {
    throw new Error(`${label}.target.type 当前只支持 conversation`);
  }

  return {
    type: 'conversation',
    id: readRequiredStringParam(target, 'id'),
  };
}

function requireJsonObjectValue(value: JsonValue, label: string): JsonObject {
  const object = readJsonObjectValue(value);
  if (!object) {
    throw new Error(`${label} 必须是对象`);
  }

  return object;
}

type CommandHandler = (
  params: JsonObject,
  context: PluginExecutionContext,
) => Promise<JsonValue> | JsonValue;

type PluginMessageHandlerResult =
  | MessageReceivedHookResult
  | PluginMessageContentResult
  | string
  | null
  | undefined;

type MessageHandler = (
  payload: MessageReceivedHookPayload,
  context: PluginExecutionContext,
) => Promise<PluginMessageHandlerResult> | PluginMessageHandlerResult;

type MessageCommandHandler = (
  input: PluginCommandInvocation,
  context: PluginExecutionContext,
) => Promise<PluginMessageHandlerResult> | PluginMessageHandlerResult;

type SessionWaiterHandler = (
  controller: PluginConversationSessionController,
  payload: MessageReceivedHookPayload,
  context: PluginExecutionContext,
) => Promise<PluginMessageHandlerResult> | PluginMessageHandlerResult;

type HookHandler = (
  payload: JsonValue,
  context: PluginExecutionContext,
) => Promise<JsonValue | null | undefined> | JsonValue | null | undefined;

type RouteHandler = (
  request: PluginRouteRequest,
  context: PluginExecutionContext,
) => Promise<PluginRouteResponse> | PluginRouteResponse;

type PluginClientPayload =
  | AuthPayload
  | RegisterPayload
  | ExecutePayload
  | ExecuteResultPayload
  | ExecuteErrorPayload
  | HostCallPayload
  | HostResultPayload
  | RouteResultPayload
  | JsonValue;

interface InternalMessageListener {
  kind: 'listener';
  order: number;
  priority: number;
  specificity: number;
  filter?: PluginHookMessageFilter;
  description?: string;
  handler: MessageHandler;
}

interface InternalCommandRegistration {
  kind: 'command' | 'group-help';
  order: number;
  priority: number;
  specificity: number;
  canonicalCommand: string;
  path: string[];
  variants: string[];
  description?: string;
  exactMatchOnly?: boolean;
  handler: MessageCommandHandler;
}

interface InternalCommandGroupNode {
  segment: string;
  aliases: string[];
  canonicalCommand: string;
  priority: number;
  description?: string;
  parent: InternalCommandGroupNode | null;
  children: InternalCommandGroupNode[];
  commands: InternalCommandRegistration[];
}

interface CommandSegmentDescriptor {
  segment: string;
  aliases: string[];
}

interface InternalConversationSessionController
  extends PluginConversationSessionController {
  setSession(session: PluginConversationSessionInfo | null): void;
}

interface InternalSessionWaiterRegistration {
  conversationId: string;
  handler: SessionWaiterHandler;
}

/**
 * 输出插件 SDK 的普通运行日志。
 * @param message 完整日志文本
 * @returns 无返回值
 */
function writePluginSdkLog(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * 输出插件 SDK 的错误日志。
 * @param message 完整日志文本
 * @returns 无返回值
 */
function writePluginSdkError(message: string): void {
  process.stderr.write(`${message}\n`);
}

export class PluginClient {
  private ws: WebSocket | null = null;
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly hookHandlers = new Map<PluginHookName, HookHandler>();
  private readonly routeHandlers = new Map<string, RouteHandler>();
  private readonly messageHandlers: InternalMessageListener[] = [];
  private readonly commandHandlers: InternalCommandRegistration[] = [];
  private readonly commandGroups: InternalCommandGroupNode[] = [];
  private readonly commandPaths = new Set<string>();
  private readonly commandGroupPaths = new Set<string>();
  private readonly sessionWaiters = new Map<string, InternalSessionWaiterRegistration>();
  private readonly pendingHostCalls = new Map<string, {
    resolve: (value: JsonValue) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private connected = false;
  private messageHandlerOrder = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly options: Required<PluginClientOptions> & {
    manifest: PluginManifestInput;
  };

  constructor(options: PluginClientOptions) {
    this.options = {
      autoReconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 20000,
      manifest: {},
      ...options,
    };
  }

  /**
   * 直接使用宿主返回的 remote bootstrap 信息创建一个插件客户端。
   * @param bootstrap 宿主 bootstrap 接口返回的连接信息
   * @param options 其余插件选项，例如 manifest 与重连参数
   * @returns 已准备好的插件客户端
   */
  static fromBootstrap(
    bootstrap: RemotePluginBootstrapInfo,
    options: Omit<PluginClientOptions, 'serverUrl' | 'token' | 'pluginName' | 'deviceType'> = {},
  ): PluginClient {
    return new PluginClient({
      ...options,
      serverUrl: bootstrap.serverUrl,
      token: bootstrap.token,
      pluginName: bootstrap.pluginName,
      deviceType: bootstrap.deviceType,
    });
  }

  /** 注册工具处理器。 */
  onCommand(capabilityName: string, handler: CommandHandler) {
    this.handlers.set(capabilityName, handler);
    return this;
  }

  /** 注册 Hook 处理器。 */
  onHook(hookName: PluginHookName, handler: HookHandler) {
    this.hookHandlers.set(hookName, handler);
    return this;
  }

  /** 注册 SDK 级消息监听器。 */
  onMessage(handler: MessageHandler, options: PluginMessageHandlerOptions = {}) {
    this.messageHandlers.push({
      kind: 'listener',
      order: this.nextMessageHandlerOrder(),
      priority: normalizePriority(options.priority),
      specificity: computeFilterSpecificity(options.filter),
      filter: cloneMessageFilter(options.filter),
      description: options.description,
      handler,
    });
    return this;
  }

  /** 注册一个消息命令。 */
  command(
    name: string,
    handler: MessageCommandHandler,
    options: PluginCommandOptions = {},
  ) {
    this.registerCommand(null, name, handler, options);
    return this;
  }

  /** 创建一个命令组。 */
  commandGroup(
    name: string,
    options: PluginCommandGroupOptions = {},
  ): PluginCommandGroupRegistration {
    const group = this.createCommandGroup(null, name, options);
    this.commandGroups.push(group);
    return this.createCommandGroupRegistration(group);
  }

  /** 注册 Route 处理器。 */
  onRoute(path: string, handler: RouteHandler) {
    this.routeHandlers.set(normalizeRoutePath(path), handler);
    return this;
  }

  /** 注册一个本地会话 waiter。 */
  sessionWaiter(handler: SessionWaiterHandler): PluginSessionWaiterHandle {
    return {
      start: async (context, input) => {
        const controller = context.host.conversationSession;
        const session = await controller.start(input);
        this.sessionWaiters.set(session.conversationId, {
          conversationId: session.conversationId,
          handler,
        });
        return session;
      },
    };
  }

  /**
   * 创建命令组注册器。
   * @param group 当前命令组节点
   * @returns 可继续挂子命令与子命令组的注册器
   */
  private createCommandGroupRegistration(
    group: InternalCommandGroupNode,
  ): PluginCommandGroupRegistration {
    return {
      command: (name, handler, options = {}) => {
        this.registerCommand(group, name, handler, options);
        return this.createCommandGroupRegistration(group);
      },
      group: (name, options = {}) => {
        const child = this.createCommandGroup(group, name, options);
        group.children.push(child);
        return this.createCommandGroupRegistration(child);
      },
    };
  }

  /**
   * 注册一个命令组并顺手生成“精确命中时自动帮助”的内部处理器。
   * @param parentGroup 父命令组；根组时传 null
   * @param name 命令组名
   * @param options 别名、优先级与描述
   * @returns 已注册的命令组节点
   */
  private createCommandGroup(
    parentGroup: InternalCommandGroupNode | null,
    name: string,
    options: PluginCommandGroupOptions,
  ): InternalCommandGroupNode {
    const segment = normalizeCommandSegment(name);
    const aliases = normalizeCommandAliases(options.alias);
    const canonicalPath = this.buildCommandPathSegments(parentGroup, segment);
    const canonicalCommand = buildCanonicalCommandPath(canonicalPath);

    this.assertCommandPathAvailable(canonicalCommand, '命令组');
    this.commandGroupPaths.add(canonicalCommand);

    const group: InternalCommandGroupNode = {
      segment,
      aliases,
      canonicalCommand,
      priority: normalizePriority(options.priority),
      description: options.description,
      parent: parentGroup,
      children: [],
      commands: [],
    };

    this.commandHandlers.push({
      kind: 'group-help',
      order: this.nextMessageHandlerOrder(),
      priority: group.priority,
      specificity: canonicalPath.length,
      canonicalCommand,
      path: canonicalPath,
      variants: this.buildCommandVariants(parentGroup, segment, aliases),
      description: options.description,
      exactMatchOnly: true,
      handler: async () => ({
        content: renderCommandGroupHelp(group),
      }),
    });

    return group;
  }

  /**
   * 注册一个命令处理器。
   * @param parentGroup 父命令组；根命令时传 null
   * @param name 命令名
   * @param handler 命令处理器
   * @param options 别名、优先级与描述
   * @returns 无返回值
   */
  private registerCommand(
    parentGroup: InternalCommandGroupNode | null,
    name: string,
    handler: MessageCommandHandler,
    options: PluginCommandOptions,
  ) {
    const segment = normalizeCommandSegment(name);
    const aliases = normalizeCommandAliases(options.alias);
    const path = this.buildCommandPathSegments(parentGroup, segment);
    const canonicalCommand = buildCanonicalCommandPath(path);

    this.assertCommandPathAvailable(canonicalCommand, '命令');
    this.commandPaths.add(canonicalCommand);

    const entry: InternalCommandRegistration = {
      kind: 'command',
      order: this.nextMessageHandlerOrder(),
      priority: normalizePriority(options.priority),
      specificity: path.length,
      canonicalCommand,
      path,
      variants: this.buildCommandVariants(parentGroup, segment, aliases),
      description: options.description,
      handler,
    };
    this.commandHandlers.push(entry);
    parentGroup?.commands.push(entry);
  }

  /**
   * 校验命令或命令组路径没有和既有声明冲突。
   * @param canonicalCommand 规范命令路径
   * @param label 当前注册对象名称
   * @returns 无返回值
   */
  private assertCommandPathAvailable(
    canonicalCommand: string,
    label: '命令' | '命令组',
  ) {
    if (this.commandPaths.has(canonicalCommand) || this.commandGroupPaths.has(canonicalCommand)) {
      throw new Error(`${label} ${canonicalCommand} 已注册，不能重复声明`);
    }
  }

  /**
   * 构建当前命令的规范路径分段。
   * @param parentGroup 父命令组
   * @param segment 当前段名
   * @returns 规范路径分段
   */
  private buildCommandPathSegments(
    parentGroup: InternalCommandGroupNode | null,
    segment: string,
  ): string[] {
    if (!parentGroup) {
      return [segment];
    }

    return [...parentGroup.canonicalCommand.replace(/^\//, '').split(' '), segment];
  }

  /**
   * 构建命令或命令组的所有完整命令路径。
   * @param parentGroup 父命令组
   * @param segment 当前段名
   * @param aliases 当前段别名
   * @returns 完整命令路径列表
   */
  private buildCommandVariants(
    parentGroup: InternalCommandGroupNode | null,
    segment: string,
    aliases: string[],
  ): string[] {
    return buildCommandVariants([
      ...this.getCommandSegmentDescriptors(parentGroup),
      {
        segment,
        aliases,
      },
    ]);
  }

  /**
   * 读取某个命令组自根向下的路径描述。
   * @param group 当前命令组
   * @returns 路径描述数组
   */
  private getCommandSegmentDescriptors(
    group: InternalCommandGroupNode | null,
  ): CommandSegmentDescriptor[] {
    if (!group) {
      return [];
    }

    return [
      ...this.getCommandSegmentDescriptors(group.parent),
      {
        segment: group.segment,
        aliases: group.aliases,
      },
    ];
  }

  /**
   * 为内部消息监听器生成稳定顺序。
   * @returns 自增序号
   */
  private nextMessageHandlerOrder(): number {
    const next = this.messageHandlerOrder;
    this.messageHandlerOrder += 1;
    return next;
  }

  /** 连接到服务器。 */
  connect() {
    if (this.ws) {
      return;
    }

    this.ws = new WebSocket(this.options.serverUrl);

    this.ws.on('open', () => {
      writePluginSdkLog(`[plugin-sdk] 已连接到 ${this.options.serverUrl}`);
      this.authenticate();
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg: WsMessage<PluginClientPayload> = JSON.parse(raw.toString());
        void this.handleMessage(msg);
      } catch (error) {
        writePluginSdkError(
          `[plugin-sdk] 消息解析失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    this.ws.on('close', () => {
      writePluginSdkLog('[plugin-sdk] 已断开连接');
      this.connected = false;
      this.stopHeartbeat();
      this.rejectPendingHostCalls(new Error('连接已关闭'));
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (error) => {
      writePluginSdkError(`[plugin-sdk] WebSocket 错误: ${error.message}`);
    });
  }

  /** 断开连接。 */
  disconnect() {
    this.options.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.rejectPendingHostCalls(new Error('插件主动断开连接'));
    this.ws?.close();
    this.ws = null;
  }

  /**
   * 发送认证请求。
   * @returns 无返回值
   */
  private authenticate() {
    this.send(WS_TYPE.AUTH, WS_ACTION.AUTHENTICATE, {
      token: this.options.token,
      pluginName: this.options.pluginName,
      deviceType: this.options.deviceType,
    });
  }

  /**
   * 发送 manifest 注册请求。
   * @returns 无返回值
   */
  private registerManifest() {
    this.send(WS_TYPE.PLUGIN, WS_ACTION.REGISTER, {
      manifest: this.resolveManifest(),
    });
  }

  /**
   * 处理服务器消息。
   * @param msg 服务器消息
   * @returns 无返回值
   */
  private async handleMessage(msg: WsMessage<PluginClientPayload>) {
    switch (msg.type) {
      case WS_TYPE.AUTH:
        if (msg.action === WS_ACTION.AUTH_OK) {
          writePluginSdkLog('[plugin-sdk] 认证通过');
          this.connected = true;
          this.registerManifest();
          this.startHeartbeat();
        } else if (msg.action === WS_ACTION.AUTH_FAIL) {
          writePluginSdkError(
            `[plugin-sdk] 认证失败: ${this.readErrorMessage(msg.payload)}`,
          );
          this.options.autoReconnect = false;
          this.ws?.close();
        }
        return;

      case WS_TYPE.PLUGIN:
        await this.handlePluginMessage(msg);
        return;

      case WS_TYPE.COMMAND:
        if (msg.action === WS_ACTION.EXECUTE) {
          await this.handleExecute(msg);
        }
        return;

      case WS_TYPE.HEARTBEAT:
        return;

      default:
        return;
    }
  }

  /**
   * 处理插件相关消息。
   * @param msg 插件消息
   * @returns 无返回值
   */
  private async handlePluginMessage(msg: WsMessage<PluginClientPayload>) {
    switch (msg.action) {
      case WS_ACTION.REGISTER_OK:
        writePluginSdkLog('[plugin-sdk] Manifest 已注册');
        return;
      case WS_ACTION.HOOK_INVOKE:
        await this.handleHookInvoke(msg);
        return;
      case WS_ACTION.ROUTE_INVOKE:
        await this.handleRouteInvoke(msg);
        return;
      case WS_ACTION.HOST_RESULT:
        try {
          this.resolveHostCall(
            msg.requestId,
            readHostResultPayload(msg.payload).data,
          );
        } catch (error) {
          this.rejectHostCall(
            msg.requestId,
            error instanceof Error ? error.message : String(error),
          );
        }
        return;
      case WS_ACTION.HOST_ERROR:
        this.rejectHostCall(
          msg.requestId,
          this.readErrorMessage(msg.payload),
        );
        return;
      default:
        return;
    }
  }

  /**
   * 处理工具执行请求。
   * @param msg 命令消息
   * @returns 无返回值
   */
  private async handleExecute(msg: WsMessage<PluginClientPayload>) {
    let payload: ExecutePayload;
    try {
      payload = readExecutePayload(msg.payload);
    } catch (error) {
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
      return;
    }

    const toolName = payload.toolName ?? payload.capability ?? '';
    const handler = this.handlers.get(toolName);

    if (!handler) {
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_ERROR,
        { error: `未知工具：${toolName}` },
        msg.requestId,
      );
      return;
    }

    try {
      const result = await handler(
        payload.params,
        this.createExecutionContext(payload.context),
      );
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_RESULT,
        { data: result },
        msg.requestId,
      );
    } catch (error) {
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
    }
  }

  /**
   * 处理 Hook 调用请求。
   * @param msg Hook 消息
   * @returns 无返回值
   */
  private async handleHookInvoke(msg: WsMessage<PluginClientPayload>) {
    let payload: HookInvokePayload;
    try {
      payload = readHookInvokePayload(msg.payload);
    } catch (error) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOOK_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
      return;
    }

    const executionContext = this.createExecutionContext(payload.context);
    const hasInternalMessagePipeline = payload.hookName === 'message:received'
      && (this.messageHandlers.length > 0 || this.commandHandlers.length > 0);
    const handler = this.hookHandlers.get(payload.hookName);

    if (!handler && !hasInternalMessagePipeline) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOOK_ERROR,
        { error: `未知 Hook：${payload.hookName}` },
        msg.requestId,
      );
      return;
    }

    try {
      let result: JsonValue | null | undefined;
      if (payload.hookName === 'message:received') {
        result = await this.handleMessageReceivedHook(
          readMessageReceivedHookPayload(payload.payload),
          executionContext,
        );
      } else if (handler) {
        result = await handler(
          payload.payload,
          executionContext,
        );
      } else {
        throw new Error(`未知 Hook：${payload.hookName}`);
      }
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOOK_RESULT,
        { data: result ?? null },
        msg.requestId,
      );
    } catch (error) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOOK_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
    }
  }

  /**
   * 处理 Route 调用请求。
   * @param msg Route 消息
   * @returns 无返回值
   */
  private async handleRouteInvoke(msg: WsMessage<PluginClientPayload>) {
    let payload: RouteInvokePayload;
    try {
      payload = readRouteInvokePayload(msg.payload);
    } catch (error) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.ROUTE_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
      return;
    }

    const handler = this.routeHandlers.get(normalizeRoutePath(payload.request.path));

    if (!handler) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.ROUTE_ERROR,
        { error: `未知 Route：${payload.request.path}` },
        msg.requestId,
      );
      return;
    }

    try {
      const result = await handler(
        payload.request,
        this.createExecutionContext(payload.context),
      );
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.ROUTE_RESULT,
        { data: normalizeRouteResponse(result) },
        msg.requestId,
      );
    } catch (error) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.ROUTE_ERROR,
        { error: error instanceof Error ? error.message : String(error) },
        msg.requestId,
      );
    }
  }

  /**
   * 创建插件执行上下文。
   * @param callContext 当前调用上下文
   * @returns 带 Host API 门面的执行上下文
   */
  private createExecutionContext(
    callContext?: PluginCallContext,
  ): PluginExecutionContext {
    const context = callContext ?? { source: 'plugin' as const };
    const conversationSession = this.createConversationSessionController(context);
    const call: PluginHostFacade['call'] = (method, params) =>
      this.sendHostCall(method, params, context);
    const callHost = <T>(
      method: HostCallPayload['method'],
      params: JsonObject = {},
    ): Promise<T> => this.callHost<T>(method, params, context);

    return {
      callContext: context,
      host: {
        ...createPluginHostFacade({
          call,
          callHost,
          conversationSessionController: conversationSession,
        }),
        conversationSession,
      },
    };
  }

  /**
   * 解析当前插件最终应声明的 Hook 描述。
   * @returns 去重后的 Hook 描述列表
   */
  private resolveHookDescriptors(): PluginHookDescriptor[] {
    const hooks = (this.options.manifest.hooks ?? []).map((hook) => cloneHookDescriptor(hook));

    for (const hookName of this.hookHandlers.keys()) {
      if (hookName === 'message:received') {
        continue;
      }
      this.ensureHookDescriptor(hooks, {
        name: hookName,
      });
    }

    const messageHook = this.buildSyntheticMessageReceivedHook();
    if (messageHook) {
      this.ensureHookDescriptor(hooks, messageHook);
    }

    return hooks;
  }

  /**
   * 解析当前插件最终应声明的命令描述。
   * @returns 去重后的命令描述列表
   */
  private resolveCommandDescriptors(): PluginCommandDescriptor[] {
    const commands = (this.options.manifest.commands ?? []).map((command) =>
      cloneCommandDescriptor(command));

    for (const entry of this.commandHandlers) {
      this.ensureCommandDescriptor(commands, {
        kind: entry.kind,
        canonicalCommand: entry.canonicalCommand,
        path: [...entry.path],
        aliases: entry.variants.filter((variant) => variant !== entry.canonicalCommand),
        variants: [...entry.variants],
        ...(entry.description ? { description: entry.description } : {}),
        priority: normalizePriority(entry.priority),
      });
    }

    return commands;
  }

  /**
   * 把一个 Hook 描述合并到最终 manifest 中。
   * @param hooks 当前 Hook 列表
   * @param descriptor 待合并的 Hook 描述
   * @returns 无返回值
   */
  private ensureHookDescriptor(
    hooks: PluginHookDescriptor[],
    descriptor: PluginHookDescriptor,
  ) {
    const existing = hooks.find((hook) => hook.name === descriptor.name);
    if (existing) {
      if (typeof existing.priority !== 'number' && typeof descriptor.priority === 'number') {
        existing.priority = descriptor.priority;
      }
      if (!existing.description && descriptor.description) {
        existing.description = descriptor.description;
      }
      if (!existing.filter && descriptor.filter) {
        existing.filter = cloneHookFilterDescriptor(descriptor.filter);
      }
      return;
    }

    hooks.push(cloneHookDescriptor(descriptor));
  }

  /**
   * 把一个命令描述合并到最终 manifest 中。
   * @param commands 当前命令列表
   * @param descriptor 待合并的命令描述
   * @returns 无返回值
   */
  private ensureCommandDescriptor(
    commands: PluginCommandDescriptor[],
    descriptor: PluginCommandDescriptor,
  ) {
    const existing = commands.find((command) =>
      command.kind === descriptor.kind
      && command.canonicalCommand === descriptor.canonicalCommand);
    if (existing) {
      existing.path = descriptor.path.length > 0 ? [...descriptor.path] : [...existing.path];
      existing.aliases = dedupeStrings([...existing.aliases, ...descriptor.aliases])
        .filter((alias) => alias !== existing.canonicalCommand);
      existing.variants = dedupeStrings([...existing.variants, ...descriptor.variants]);
      if (!existing.description && descriptor.description) {
        existing.description = descriptor.description;
      }
      if (typeof existing.priority !== 'number' && typeof descriptor.priority === 'number') {
        existing.priority = descriptor.priority;
      }
      return;
    }

    commands.push(cloneCommandDescriptor(descriptor));
  }

  /**
   * 当 SDK 内部注册了消息监听器或命令 DSL 时，自动合成一个 `message:received` Hook 描述。
   * @returns 合成后的 Hook 描述；没有消息管线时返回 null
   */
  private buildSyntheticMessageReceivedHook(): PluginHookDescriptor | null {
    if (
      this.messageHandlers.length === 0
      && this.commandHandlers.length === 0
      && !this.hookHandlers.has('message:received')
    ) {
      return null;
    }

    const priorities = [
      ...this.messageHandlers.map((listener) => listener.priority),
      ...this.commandHandlers.map((command) => command.priority),
    ];
    const filter = this.buildSyntheticMessageFilter();

    return {
      name: 'message:received',
      ...(priorities.length > 0 ? { priority: Math.min(...priorities) } : {}),
      ...(filter ? { filter: { message: filter } } : {}),
    };
  }

  /**
   * 尝试从 SDK 内部消息监听器里收敛一个安全可合成的 message filter。
   * @returns 可声明的统一过滤器；无法安全收敛时返回 undefined
   */
  private buildSyntheticMessageFilter(): PluginHookMessageFilter | undefined {
    const filters: PluginHookMessageFilter[] = [
      ...this.messageHandlers
        .map((listener) => listener.filter)
        .filter((filter): filter is PluginHookMessageFilter => Boolean(filter)),
      ...this.commandHandlers.map((command) => ({
        commands: [...command.variants],
      })),
    ];

    if (filters.length === 0 || filters.some((filter) => isEmptyMessageFilter(filter))) {
      return undefined;
    }

    if (filters.every((filter) => hasOnlyMessageFilterKey(filter, 'commands'))) {
      return {
        commands: dedupeStrings(filters.flatMap((filter) => filter.commands ?? [])),
      };
    }

    if (filters.every((filter) => hasOnlyMessageFilterKey(filter, 'messageKinds'))) {
      return {
        messageKinds: dedupeStrings(filters.flatMap((filter) => filter.messageKinds ?? [])) as
          PluginHookMessageFilter['messageKinds'],
      };
    }

    if (filters.every((filter) => hasOnlyMessageFilterKey(filter, 'regex'))) {
      const regexes = filters
        .map((filter) => filter.regex)
        .filter((regex): regex is NonNullable<PluginHookMessageFilter['regex']> => Boolean(regex));
      const flags = dedupeStrings(
        regexes
          .map((regex) => typeof regex === 'string' ? '' : regex.flags ?? '')
          .join('')
          .split(''),
      ).join('');

      return {
        regex: {
          pattern: regexes
            .map((regex) => `(?:${typeof regex === 'string' ? regex : regex.pattern})`)
            .join('|'),
          ...(flags ? { flags } : {}),
        },
      };
    }

    return undefined;
  }

  /**
   * 在 SDK 内部执行 `message:received` 二次分发。
   * @param payload 当前消息 Hook 载荷
   * @param context 插件执行上下文
   * @returns 最终要回给宿主的 Hook 结果
   */
  private async handleMessageReceivedHook(
    payload: MessageReceivedHookPayload,
    context: PluginExecutionContext,
  ): Promise<JsonValue | null> {
    const originalPayload = cloneJsonValue(payload);
    let currentPayload = cloneJsonValue(payload);
    let hasMutation = false;

    const sessionWaiterResult = await this.runSessionWaiter(currentPayload, context);
    if (sessionWaiterResult) {
      if (sessionWaiterResult.action === 'short-circuit') {
        return toHostJsonValue(sessionWaiterResult);
      }
      if (sessionWaiterResult.action === 'mutate') {
        currentPayload = applyMessageReceivedMutation(currentPayload, sessionWaiterResult);
        hasMutation = true;
      }
    }

    for (const listener of this.listMessagePipelineEntries()) {
      const normalizedResult = await this.runMessagePipelineEntry(listener, currentPayload, context);
      if (!normalizedResult || normalizedResult.action === 'pass') {
        continue;
      }
      if (normalizedResult.action === 'short-circuit') {
        return toHostJsonValue(normalizedResult);
      }

      currentPayload = applyMessageReceivedMutation(currentPayload, normalizedResult);
      hasMutation = true;
    }

    if (hasMutation) {
      return toHostJsonValue(buildMessageReceivedMutationResult(
        originalPayload,
        currentPayload,
      ));
    }

    const fallbackHandler = this.hookHandlers.get('message:received');
    if (!fallbackHandler) {
      return {
        action: 'pass',
      };
    }

    const rawResult = await fallbackHandler(
      toHostJsonValue(cloneJsonValue(payload)),
      context,
    );

    return normalizeRawMessageHookResult(rawResult);
  }

  /**
   * 当当前会话命中了本地 waiter 时，优先执行 waiter handler。
   * @param payload 当前消息载荷
   * @param context 当前执行上下文
   * @returns 归一化后的 Hook 结果；没有 waiter 时返回 null
   */
  private async runSessionWaiter(
    payload: MessageReceivedHookPayload,
    context: PluginExecutionContext,
  ): Promise<MessageReceivedHookResult | null> {
    const conversationId = payload.conversationId;
    const registration = this.sessionWaiters.get(conversationId);
    if (!registration) {
      return null;
    }

    if (!payload.session || payload.session.pluginId !== this.options.pluginName) {
      this.sessionWaiters.delete(conversationId);
      return null;
    }

    const controller = this.createConversationSessionController(context.callContext);
    controller.setSession(payload.session);

    return normalizeMessageListenerResult(await registration.handler(
      controller,
      cloneJsonValue(payload),
      context,
    ));
  }

  /**
   * 为当前执行上下文创建一个本地会话控制器。
   * @param context 插件调用上下文
   * @returns 绑定当前上下文的会话控制器
   */
  private createConversationSessionController(
    context: PluginCallContext,
  ): InternalConversationSessionController {
    let currentSession: PluginConversationSessionInfo | null = null;
    const callHost = <T>(
      method: HostCallPayload['method'],
      params: JsonObject = {},
    ): Promise<T> => this.callHost<T>(method, params, context);

    const setSession = (session: PluginConversationSessionInfo | null) => {
      currentSession = session ? cloneConversationSessionInfo(session) : null;
    };
    const clearLocalWaiter = (conversationId?: string | null) => {
      const targetConversationId = conversationId
        ?? currentSession?.conversationId
        ?? context.conversationId
        ?? null;
      if (targetConversationId) {
        this.sessionWaiters.delete(targetConversationId);
      }
    };
    const startSession = async (
      input: PluginConversationSessionStartParams,
    ): Promise<PluginConversationSessionInfo> => {
      const params: JsonObject = {
        timeoutMs: input.timeoutMs,
      };
      if (typeof input.captureHistory === 'boolean') {
        params.captureHistory = input.captureHistory;
      }
      if (typeof input.metadata !== 'undefined') {
        params.metadata = input.metadata;
      }

      const session = await callHost<PluginConversationSessionInfo>(
        'conversation.session.start',
        params,
      );
      setSession(session);
      return cloneConversationSessionInfo(session);
    };
    const getSession = async (): Promise<PluginConversationSessionInfo | null> => {
      const previousConversationId = currentSession?.conversationId ?? context.conversationId;
      const session = await callHost<PluginConversationSessionInfo | null>(
        'conversation.session.get',
      );
      setSession(session);
      if (!session) {
        clearLocalWaiter(previousConversationId);
      }
      return session ? cloneConversationSessionInfo(session) : null;
    };
    const keepSession = async (
      input: PluginConversationSessionKeepParams,
    ): Promise<PluginConversationSessionInfo | null> => {
      const previousConversationId = currentSession?.conversationId ?? context.conversationId;
      const params: JsonObject = {
        timeoutMs: input.timeoutMs,
      };
      if (typeof input.resetTimeout === 'boolean') {
        params.resetTimeout = input.resetTimeout;
      }

      const session = await callHost<PluginConversationSessionInfo | null>(
        'conversation.session.keep',
        params,
      );
      setSession(session);
      if (!session) {
        clearLocalWaiter(previousConversationId);
      }
      return session ? cloneConversationSessionInfo(session) : null;
    };
    const finishSession = async (): Promise<boolean> => {
      const previousConversationId = currentSession?.conversationId ?? context.conversationId;
      const finished = await callHost<boolean>('conversation.session.finish');
      clearLocalWaiter(previousConversationId);
      setSession(null);
      return finished;
    };

    return {
      get conversationId() {
        return currentSession?.conversationId ?? context.conversationId ?? null;
      },
      get session() {
        return currentSession ? cloneConversationSessionInfo(currentSession) : null;
      },
      get timeoutMs() {
        return currentSession?.timeoutMs ?? null;
      },
      get startedAt() {
        return currentSession?.startedAt ?? null;
      },
      get expiresAt() {
        return currentSession?.expiresAt ?? null;
      },
      get lastMatchedAt() {
        return currentSession?.lastMatchedAt ?? null;
      },
      get captureHistory() {
        return currentSession?.captureHistory ?? false;
      },
      get historyMessages() {
        return currentSession
          ? currentSession.historyMessages.map((message) => cloneMessageHookInfo(message))
          : [];
      },
      get metadata() {
        return typeof currentSession?.metadata !== 'undefined'
          ? cloneJsonValue(currentSession.metadata)
          : undefined;
      },
      start: startSession,
      get: getSession,
      async sync() {
        return getSession();
      },
      keep: keepSession,
      finish: finishSession,
      setSession,
    };
  }

  /**
   * 读取当前插件内部消息管线的稳定执行顺序。
   * @returns 已排序的消息监听与命令列表
   */
  private listMessagePipelineEntries(): Array<InternalMessageListener | InternalCommandRegistration> {
    return [...this.messageHandlers, ...this.commandHandlers].sort((left, right) => {
      const priorityDiff = left.priority - right.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const specificityDiff = right.specificity - left.specificity;
      if (specificityDiff !== 0) {
        return specificityDiff;
      }

      if (left.kind !== right.kind) {
        if (left.kind === 'command') {
          return -1;
        }
        if (right.kind === 'command') {
          return 1;
        }
      }

      return left.order - right.order;
    });
  }

  /**
   * 执行单个 SDK 内部消息管线节点。
   * @param entry 当前监听器或命令
   * @param payload 当前消息载荷
   * @param context 插件执行上下文
   * @returns 归一化后的 Hook 结果；未命中时返回 null
   */
  private async runMessagePipelineEntry(
    entry: InternalMessageListener | InternalCommandRegistration,
    payload: MessageReceivedHookPayload,
    context: PluginExecutionContext,
  ): Promise<MessageReceivedHookResult | null> {
    if (entry.kind === 'listener') {
      if (!matchesMessageFilter(payload, entry.filter)) {
        return null;
      }

      return normalizeMessageListenerResult(await entry.handler(
        cloneJsonValue(payload),
        context,
      ));
    }

    const matchedCommand = matchRegisteredCommand(payload, entry);
    if (!matchedCommand) {
      return null;
    }

    return normalizeMessageListenerResult(await entry.handler(
      {
        matchedCommand: matchedCommand.command,
        canonicalCommand: entry.canonicalCommand,
        path: [...entry.path],
        args: matchedCommand.args,
        rawArgs: matchedCommand.rawArgs,
        payload: cloneJsonValue(payload),
      },
      context,
    ));
  }

  /**
   * 通过 WebSocket 发起一次 Host API 调用。
   * @param method Host API 方法名
   * @param params JSON 参数
   * @param context 调用上下文
   * @returns Host API 返回值
   */
  private sendHostCall(
    method: HostCallPayload['method'],
    params: JsonObject,
    context: PluginCallContext,
  ): Promise<JsonValue> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('插件尚未连接到服务器'));
    }

    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingHostCalls.delete(requestId);
        reject(new Error(`Host API 调用超时: ${method}`));
      }, 30000);

      this.pendingHostCalls.set(requestId, { resolve, reject, timer });
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOST_CALL,
        {
          method,
          params,
          context,
        },
        requestId,
      );
    });
  }

  /**
   * 发起一次带类型收口的 Host API 调用。
   * @param method Host API 方法名
   * @param params JSON 参数
   * @param context 调用上下文
   * @returns 收口后的结构化结果
   */
  private callHost<T>(
    method: HostCallPayload['method'],
    params: JsonObject = {},
    context: PluginCallContext,
  ): Promise<T> {
    return this.sendHostCall(method, params, context) as Promise<T>;
  }

  /**
   * 解析当前插件应发送的 manifest。
   * @returns 完整 manifest
   */
  private resolveManifest(): PluginManifest {
    const hooks = this.resolveHookDescriptors();
    const commands = this.resolveCommandDescriptors();

    return {
      id: this.options.pluginName,
      name: this.options.manifest.name ?? this.options.pluginName,
      version: this.options.manifest.version ?? '0.0.0',
      runtime: 'remote',
      description: this.options.manifest.description,
      permissions: this.options.manifest.permissions ?? [],
      tools: this.options.manifest.tools ?? [],
      ...(commands.length > 0 ? { commands } : {}),
      hooks,
      config: this.options.manifest.config,
      routes: this.options.manifest.routes ?? [],
    };
  }

  /**
   * 启动心跳。
   * @returns 无返回值
   */
  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send(WS_TYPE.HEARTBEAT, WS_ACTION.PING, {});
    }, this.options.heartbeatInterval);
  }

  /**
   * 停止心跳。
   * @returns 无返回值
   */
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 安排重连。
   * @returns 无返回值
   */
  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    writePluginSdkLog(
      `[plugin-sdk] 将在 ${this.options.reconnectInterval}ms 后重连...`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ws = null;
      this.connect();
    }, this.options.reconnectInterval);
  }

  /**
   * 发送一条 WebSocket 消息。
   * @param type 消息 type
   * @param action 消息 action
   * @param payload JSON 负载
   * @param requestId 可选 requestId
   * @returns 无返回值
   */
  private send(
    type: string,
    action: string,
    payload: PluginClientPayload,
    requestId?: string,
  ) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: WsMessage<PluginClientPayload> = { type, action, payload, requestId };
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * 成功解析一个等待中的 Host API 调用。
   * @param requestId 请求 ID
   * @param value Host API 返回值
   * @returns 无返回值
   */
  private resolveHostCall(requestId: string | undefined, value: JsonValue) {
    if (!requestId) {
      return;
    }
    const pending = this.pendingHostCalls.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingHostCalls.delete(requestId);
    pending.resolve(value);
  }

  /**
   * 失败终止一个等待中的 Host API 调用。
   * @param requestId 请求 ID
   * @param message 错误信息
   * @returns 无返回值
   */
  private rejectHostCall(requestId: string | undefined, message: string) {
    if (!requestId) {
      return;
    }
    const pending = this.pendingHostCalls.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingHostCalls.delete(requestId);
    pending.reject(new Error(message));
  }

  /**
   * 统一失败所有等待中的 Host API 调用。
   * @param error 要抛出的错误
   * @returns 无返回值
   */
  private rejectPendingHostCalls(error: Error) {
    for (const [requestId, pending] of this.pendingHostCalls) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingHostCalls.delete(requestId);
    }
  }

  /**
   * 从 payload 中读取错误文本。
   * @param payload JSON 负载
   * @returns 错误文本
   */
  private readErrorMessage(payload: PluginClientPayload): string {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
    ) {
      return payload.error;
    }

    return String(payload);
  }
}

export {
  DeviceType,
  type PluginCapability,
  type PluginCronDescriptor,
  type PluginCronJobSummary,
  type PluginHookName,
  type PluginHookMessageFilter,
  type PluginRouteDescriptor,
  type PluginRouteRequest,
  type PluginRouteResponse,
} from '@garlic-claw/shared';

/**
 * 归一化命令段名。
 * @param name 原始命令段名
 * @returns 去掉前导 `/` 后的命令段名
 */
function normalizeCommandSegment(name: string): string {
  const normalized = name.trim().replace(/^\/+/, '');
  if (!normalized) {
    throw new Error('命令名不能为空');
  }
  if (/\s/.test(normalized)) {
    throw new Error(`命令名 ${name} 不能包含空白字符`);
  }

  return normalized;
}

/**
 * 归一化命令别名集合。
 * @param aliases 原始别名输入
 * @returns 去重后的别名数组
 */
function normalizeCommandAliases(aliases?: Iterable<string>): string[] {
  if (!aliases) {
    return [];
  }

  return dedupeStrings(
    [...aliases]
      .map((alias) => normalizeCommandSegment(alias))
      .filter(Boolean),
  );
}

/**
 * 构建规范命令路径。
 * @param path 命令路径分段
 * @returns 带 `/` 前缀的完整命令
 */
function buildCanonicalCommandPath(path: string[]): string {
  return `/${path.join(' ')}`.trim();
}

/**
 * 展开一组命令段描述的所有完整命令路径。
 * @param descriptors 命令段描述
 * @returns 完整命令路径列表
 */
function buildCommandVariants(descriptors: CommandSegmentDescriptor[]): string[] {
  let variants = [''];
  for (const descriptor of descriptors) {
    const candidates = [descriptor.segment, ...descriptor.aliases];
    const nextVariants: string[] = [];

    for (const prefix of variants) {
      for (const candidate of candidates) {
        nextVariants.push(`${prefix} ${candidate}`.trim());
      }
    }

    variants = nextVariants;
  }

  return dedupeStrings(variants.map((variant) => `/${variant}`));
}

/**
 * 渲染命令组帮助树。
 * @param group 命令组节点
 * @returns 可直接短路发回宿主的帮助文本
 */
function renderCommandGroupHelp(group: InternalCommandGroupNode): string {
  const lines = [group.canonicalCommand];
  const treeLines = renderCommandGroupTree(group, '');

  if (treeLines.length === 0) {
    if (group.description) {
      lines.push(group.description);
    }
    return lines.join('\n');
  }

  lines.push(...treeLines);
  return lines.join('\n');
}

/**
 * 递归渲染命令组树。
 * @param group 命令组节点
 * @param prefix 当前层级前缀
 * @returns 树形文本行
 */
function renderCommandGroupTree(
  group: InternalCommandGroupNode,
  prefix: string,
): string[] {
  const lines: string[] = [];
  const commands = group.commands
    .filter((command) => command.kind === 'command')
    .sort((left, right) => left.path[left.path.length - 1].localeCompare(right.path[right.path.length - 1]));
  const children = [...group.children].sort((left, right) =>
    left.segment.localeCompare(right.segment),
  );

  for (const command of commands) {
    lines.push(
      formatCommandTreeLine(
        prefix,
        command.path[command.path.length - 1],
        command.variants
          .map((variant) => variant.replace(/^\//, '').split(' ').pop() ?? '')
          .filter((alias) => alias !== command.path[command.path.length - 1]),
        command.description,
      ),
    );
  }

  for (const child of children) {
    lines.push(formatCommandTreeLine(prefix, child.segment, child.aliases, child.description));
    lines.push(...renderCommandGroupTree(child, `${prefix}│   `));
  }

  return lines;
}

/**
 * 格式化一条命令帮助行。
 * @param prefix 当前树前缀
 * @param segment 命令段名
 * @param aliases 命令别名
 * @param description 可选描述
 * @returns 单行帮助文本
 */
function formatCommandTreeLine(
  prefix: string,
  segment: string,
  aliases: string[],
  description?: string,
): string {
  const aliasText = aliases.length > 0 ? ` [${aliases.join(', ')}]` : '';
  const descriptionText = description ? `: ${description}` : '';
  return `${prefix}├── ${segment}${aliasText}${descriptionText}`;
}

/**
 * 深拷贝 JSON 兼容值。
 * @param value 原始值
 * @returns 深拷贝后的值
 */
function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

const PLUGIN_INVOCATION_SOURCES: PluginCallContext['source'][] = [
  'chat-tool',
  'chat-hook',
  'cron',
  'automation',
  'http-route',
  'subagent',
  'plugin',
];

const PLUGIN_ROUTE_METHODS: PluginRouteRequest['method'][] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
];

const PLUGIN_HOOK_NAMES: PluginHookName[] = [
  'message:received',
  'chat:before-model',
  'chat:waiting-model',
  'chat:after-model',
  'conversation:created',
  'message:created',
  'message:updated',
  'message:deleted',
  'automation:before-run',
  'automation:after-run',
  'subagent:before-run',
  'subagent:after-run',
  'tool:before-call',
  'tool:after-call',
  'response:before-send',
  'response:after-send',
  'plugin:loaded',
  'plugin:unloaded',
  'plugin:error',
  'cron:tick',
];

const CHAT_MESSAGE_STATUSES: Array<NonNullable<PluginMessageHookInfo['status']>> = [
  'pending',
  'streaming',
  'completed',
  'stopped',
  'error',
];

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.some((option) => option === value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.values(value).every((item) => isJsonValue(item));
}

function isJsonObjectValue(value: unknown): value is JsonObject {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => isJsonValue(item));
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isJsonObjectValue(value)
    && Object.values(value).every((item) => typeof item === 'string');
}

function isChatMessageStatus(value: unknown): value is NonNullable<PluginMessageHookInfo['status']> {
  return isOneOf(value, CHAT_MESSAGE_STATUSES);
}

function isChatMessagePartArray(
  value: unknown,
): value is NonNullable<PluginMessageHookInfo['parts']> {
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

function isPluginLlmMessageArray(
  value: unknown,
): value is MessageReceivedHookPayload['modelMessages'] {
  return Array.isArray(value)
    && value.every((message) => {
      if (
        !isJsonObjectValue(message)
        || !isOneOf(message.role, ['user', 'assistant', 'system', 'tool'])
      ) {
        return false;
      }

      return typeof message.content === 'string'
        || isChatMessagePartArray(message.content);
    });
}

function isPluginCallContext(value: unknown): value is PluginCallContext {
  if (!isJsonObjectValue(value) || !isOneOf(value.source, PLUGIN_INVOCATION_SOURCES)) {
    return false;
  }

  return (!('userId' in value) || typeof value.userId === 'string')
    && (!('conversationId' in value) || typeof value.conversationId === 'string')
    && (!('automationId' in value) || typeof value.automationId === 'string')
    && (!('cronJobId' in value) || typeof value.cronJobId === 'string')
    && (!('activeProviderId' in value) || typeof value.activeProviderId === 'string')
    && (!('activeModelId' in value) || typeof value.activeModelId === 'string')
    && (!('activePersonaId' in value) || typeof value.activePersonaId === 'string')
    && (!('metadata' in value) || isJsonObjectValue(value.metadata));
}

function isPluginMessageHookInfo(value: unknown): value is PluginMessageHookInfo {
  if (
    !isJsonObjectValue(value)
    || typeof value.role !== 'string'
    || (value.content !== null && typeof value.content !== 'string')
    || !isChatMessagePartArray(value.parts)
  ) {
    return false;
  }

  return (!('id' in value) || typeof value.id === 'string')
    && (!('provider' in value) || value.provider === null || typeof value.provider === 'string')
    && (!('model' in value) || value.model === null || typeof value.model === 'string')
    && (!('status' in value) || typeof value.status === 'undefined' || isChatMessageStatus(value.status));
}

function isPluginConversationSessionInfo(
  value: unknown,
): value is PluginConversationSessionInfo {
  if (
    !isJsonObjectValue(value)
    || typeof value.pluginId !== 'string'
    || typeof value.conversationId !== 'string'
    || typeof value.timeoutMs !== 'number'
    || typeof value.startedAt !== 'string'
    || typeof value.expiresAt !== 'string'
    || (value.lastMatchedAt !== null && typeof value.lastMatchedAt !== 'string')
    || typeof value.captureHistory !== 'boolean'
    || !Array.isArray(value.historyMessages)
    || !value.historyMessages.every((message) => isPluginMessageHookInfo(message))
  ) {
    return false;
  }

  return !('metadata' in value) || isJsonValue(value.metadata);
}

function isPluginRouteMethod(value: unknown): value is PluginRouteRequest['method'] {
  return isOneOf(value, PLUGIN_ROUTE_METHODS);
}

function isPluginRouteRequest(value: unknown): value is PluginRouteRequest {
  return isJsonObjectValue(value)
    && typeof value.path === 'string'
    && isPluginRouteMethod(value.method)
    && isStringRecord(value.headers)
    && isJsonObjectValue(value.query)
    && Object.prototype.hasOwnProperty.call(value, 'body')
    && (value.body === null || isJsonValue(value.body));
}

function isPluginHookName(value: unknown): value is PluginHookName {
  return isOneOf(value, PLUGIN_HOOK_NAMES);
}

function readJsonObjectPayload(payload: PluginClientPayload | JsonValue, label: string): JsonObject {
  if (!isJsonObjectValue(payload)) {
    throw new Error(`Invalid ${label} payload: expected JSON object`);
  }

  return payload;
}

/**
 * 读取 Hook 调用负载。
 * @param payload 原始消息负载
 * @returns 结构化 Hook 调用负载
 */
function readHookInvokePayload(payload: PluginClientPayload): HookInvokePayload {
  const jsonPayload = readJsonObjectPayload(payload, 'hook invoke');

  if (!isPluginHookName(jsonPayload.hookName)) {
    throw new Error('Invalid hook invoke payload: hookName');
  }
  if (!isPluginCallContext(jsonPayload.context)) {
    throw new Error('Invalid hook invoke payload: context');
  }
  if (
    !Object.prototype.hasOwnProperty.call(jsonPayload, 'payload')
    || !isJsonValue(jsonPayload.payload)
  ) {
    throw new Error('Invalid hook invoke payload: payload');
  }

  return {
    hookName: jsonPayload.hookName,
    context: jsonPayload.context,
    payload: jsonPayload.payload,
  };
}

/**
 * 读取工具执行负载。
 * @param payload 原始消息负载
 * @returns 结构化执行负载
 */
function readExecutePayload(payload: PluginClientPayload): ExecutePayload {
  const jsonPayload = readJsonObjectPayload(payload, 'execute');

  if (
    'toolName' in jsonPayload
    && typeof jsonPayload.toolName !== 'undefined'
    && typeof jsonPayload.toolName !== 'string'
  ) {
    throw new Error('Invalid execute payload: toolName');
  }
  if (
    'capability' in jsonPayload
    && typeof jsonPayload.capability !== 'undefined'
    && typeof jsonPayload.capability !== 'string'
  ) {
    throw new Error('Invalid execute payload: capability');
  }
  if (!isJsonObjectValue(jsonPayload.params)) {
    throw new Error('Invalid execute payload: params');
  }
  if (
    'context' in jsonPayload
    && typeof jsonPayload.context !== 'undefined'
    && !isPluginCallContext(jsonPayload.context)
  ) {
    throw new Error('Invalid execute payload: context');
  }

  return {
    ...(typeof jsonPayload.toolName === 'string' ? { toolName: jsonPayload.toolName } : {}),
    ...(typeof jsonPayload.capability === 'string' ? { capability: jsonPayload.capability } : {}),
    params: jsonPayload.params,
    ...(isPluginCallContext(jsonPayload.context) ? { context: jsonPayload.context } : {}),
  };
}

/**
 * 读取 Host API 返回负载。
 * @param payload 原始消息负载
 * @returns 结构化 Host 返回负载
 */
function readHostResultPayload(payload: PluginClientPayload): HostResultPayload {
  const jsonPayload = readJsonObjectPayload(payload, 'host result');

  if (
    !Object.prototype.hasOwnProperty.call(jsonPayload, 'data')
    || !isJsonValue(jsonPayload.data)
  ) {
    throw new Error('Invalid host result payload: data');
  }

  return {
    data: jsonPayload.data,
  };
}

/**
 * 读取 Route 调用负载。
 * @param payload 原始消息负载
 * @returns 结构化 Route 调用负载
 */
function readRouteInvokePayload(payload: PluginClientPayload): RouteInvokePayload {
  const jsonPayload = readJsonObjectPayload(payload, 'route invoke');

  if (!isPluginRouteRequest(jsonPayload.request)) {
    throw new Error('Invalid route invoke payload: request');
  }
  if (!isPluginCallContext(jsonPayload.context)) {
    throw new Error('Invalid route invoke payload: context');
  }

  return {
    request: jsonPayload.request,
    context: jsonPayload.context,
  };
}

/**
 * 读取收到消息 Hook 负载。
 * @param payload 原始 Hook 负载
 * @returns 结构化收到消息 Hook 负载
 */
function readMessageReceivedHookPayload(
  payload: JsonValue,
): MessageReceivedHookPayload {
  const jsonPayload = readJsonObjectPayload(payload, 'message:received');

  if (!isPluginCallContext(jsonPayload.context)) {
    throw new Error('Invalid message:received payload: context');
  }
  if (typeof jsonPayload.conversationId !== 'string') {
    throw new Error('Invalid message:received payload: conversationId');
  }
  if (typeof jsonPayload.providerId !== 'string') {
    throw new Error('Invalid message:received payload: providerId');
  }
  if (typeof jsonPayload.modelId !== 'string') {
    throw new Error('Invalid message:received payload: modelId');
  }
  if (!isPluginMessageHookInfo(jsonPayload.message)) {
    throw new Error('Invalid message:received payload: message');
  }
  if (!isPluginLlmMessageArray(jsonPayload.modelMessages)) {
    throw new Error('Invalid message:received payload: modelMessages');
  }
  if (
    typeof jsonPayload.session !== 'undefined'
    && jsonPayload.session !== null
    && !isPluginConversationSessionInfo(jsonPayload.session)
  ) {
    throw new Error('Invalid message:received payload: session');
  }

  return {
    context: jsonPayload.context,
    conversationId: jsonPayload.conversationId,
    providerId: jsonPayload.providerId,
    modelId: jsonPayload.modelId,
    ...(typeof jsonPayload.session !== 'undefined' ? { session: jsonPayload.session } : {}),
    message: jsonPayload.message,
    modelMessages: jsonPayload.modelMessages,
  };
}

export function createPluginHostFacade(
  input: PluginHostFacadeFactoryInput,
): PluginHostFacadeMethods {
  const {
    call,
    callHost,
    conversationSessionController,
  } = input;

  return {
    call,
    getCurrentProvider: () =>
      callHost<PluginProviderCurrentInfo>('provider.current.get'),
    listProviders: () => callHost<PluginProviderSummary[]>('provider.list'),
    getProvider: (providerId) =>
      callHost<PluginProviderSummary>('provider.get', {
        providerId,
      }),
    getProviderModel: (providerId, modelId) =>
      callHost<PluginProviderModelSummary>('provider.model.get', {
        providerId,
        modelId,
      }),
    getConversation: () => call('conversation.get', {}),
    getCurrentMessageTarget: () =>
      callHost<PluginMessageTargetInfo | null>('message.target.current.get'),
    sendMessage: (params) =>
      callHost<PluginMessageSendInfo>('message.send', buildPluginMessageSendParams(params)),
    startConversationSession: (params) =>
      conversationSessionController
        ? conversationSessionController.start(params)
        : callHost<PluginConversationSessionInfo>(
          'conversation.session.start',
          buildPluginConversationSessionStartParams(params),
        ),
    getConversationSession: () =>
      conversationSessionController
        ? conversationSessionController.get()
        : callHost<PluginConversationSessionInfo | null>('conversation.session.get'),
    keepConversationSession: (params) =>
      conversationSessionController
        ? conversationSessionController.keep(params)
        : callHost<PluginConversationSessionInfo | null>(
          'conversation.session.keep',
          buildPluginConversationSessionKeepParams(params),
        ),
    finishConversationSession: () =>
      conversationSessionController
        ? conversationSessionController.finish()
        : callHost<boolean>('conversation.session.finish'),
    listKnowledgeBaseEntries: (limit) =>
      callHost<PluginKbEntrySummary[]>(
        'kb.list',
        typeof limit === 'number' ? { limit } : {},
      ),
    searchKnowledgeBase: (query, limit = 5) =>
      callHost<PluginKbEntryDetail[]>('kb.search', {
        query,
        limit,
      }),
    getKnowledgeBaseEntry: (entryId) =>
      callHost<PluginKbEntryDetail>('kb.get', {
        entryId,
      }),
    getCurrentPersona: () =>
      callHost<PluginPersonaCurrentInfo>('persona.current.get'),
    listPersonas: () => callHost<PluginPersonaSummary[]>('persona.list'),
    getPersona: (personaId) =>
      callHost<PluginPersonaSummary>('persona.get', {
        personaId,
      }),
    activatePersona: (personaId) =>
      callHost<PluginPersonaCurrentInfo>('persona.activate', {
        personaId,
      }),
    registerCron: (descriptor) =>
      callHost<PluginCronJobSummary>(
        'cron.register',
        buildPluginRegisterCronParams(descriptor),
      ),
    listCrons: () => callHost<PluginCronJobSummary[]>('cron.list'),
    deleteCron: (jobId) =>
      callHost<boolean>('cron.delete', {
        jobId,
      }),
    createAutomation: (inputParams) =>
      callHost<AutomationInfo>(
        'automation.create',
        buildPluginCreateAutomationParams(inputParams),
      ),
    listAutomations: () => callHost<AutomationInfo[]>('automation.list'),
    toggleAutomation: (automationId) =>
      callHost<{ id: string; enabled: boolean } | null>('automation.toggle', {
        automationId,
      }),
    runAutomation: (automationId) =>
      callHost<{ status: string; results: JsonValue[] } | null>('automation.run', {
        automationId,
      }),
    emitAutomationEvent: (event) =>
      callHost<AutomationEventDispatchInfo>('automation.event.emit', {
        event,
      }),
    getPluginSelf: () => callHost<PluginSelfInfo>('plugin.self.get'),
    listLogs: (query = {}) =>
      callHost<PluginEventListResult>('log.list', {
        ...(toHostJsonValue(query) as JsonObject),
      }),
    writeLog: ({ level, message, type, metadata }) =>
      callHost<boolean>('log.write', {
        level,
        message,
        ...(type ? { type } : {}),
        ...(metadata ? { metadata: toHostJsonValue(metadata) } : {}),
      }),
    searchMemories: (query, limit = 10) =>
      call('memory.search', {
        query,
        limit,
      }),
    saveMemory: ({ content, category, keywords }) =>
      call('memory.save', {
        content,
        ...(category ? { category } : {}),
        ...(keywords ? { keywords } : {}),
      }),
    listConversationMessages: () =>
      call('conversation.messages.list', {}),
    getStorage: (key, options) =>
      call('storage.get', {
        key,
        ...toScopedStateParams(options),
      }),
    setStorage: (key, value, options) =>
      call('storage.set', {
        key,
        value,
        ...toScopedStateParams(options),
      }),
    deleteStorage: (key, options) =>
      call('storage.delete', {
        key,
        ...toScopedStateParams(options),
      }),
    listStorage: (prefix, options) =>
      call('storage.list', {
        ...(prefix ? { prefix } : {}),
        ...toScopedStateParams(options),
      }),
    getState: (key, options) =>
      call('state.get', {
        key,
        ...toScopedStateParams(options),
      }),
    setState: (key, value, options) =>
      call('state.set', {
        key,
        value,
        ...toScopedStateParams(options),
      }),
    deleteState: (key, options) =>
      call('state.delete', {
        key,
        ...toScopedStateParams(options),
      }),
    listState: (prefix, options) =>
      call('state.list', {
        ...(prefix ? { prefix } : {}),
        ...toScopedStateParams(options),
      }),
    getConfig: (key) =>
      call('config.get', key ? { key } : {}),
    getUser: () => call('user.get', {}),
    setConversationTitle: (title) =>
      call('conversation.title.set', {
        title,
      }),
    generate: (params) =>
      callHost<PluginLlmGenerateResult>('llm.generate', buildPluginGenerateParams(params)),
    runSubagent: (params) =>
      callHost<PluginSubagentRunResult>('subagent.run', buildPluginRunSubagentParams(params)),
    startSubagentTask: (params) =>
      callHost<PluginSubagentTaskSummary>(
        'subagent.task.start',
        buildPluginStartSubagentTaskParams(params),
      ),
    listSubagentTasks: () =>
      callHost<PluginSubagentTaskSummary[]>('subagent.task.list'),
    getSubagentTask: (taskId) =>
      callHost<PluginSubagentTaskDetail>('subagent.task.get', {
        taskId,
      }),
    generateText: (params) =>
      call('llm.generate-text', buildPluginGenerateTextParams(params)),
  };
}

export function buildPluginMessageSendParams(
  input: PluginMessageSendParams,
): JsonObject {
  return {
    ...(input.target ? { target: toHostJsonValue(input.target) } : {}),
    ...(typeof input.content === 'string' ? { content: input.content } : {}),
    ...(input.parts ? { parts: toHostJsonValue(input.parts) } : {}),
    ...(typeof input.provider === 'string' ? { provider: input.provider } : {}),
    ...(typeof input.model === 'string' ? { model: input.model } : {}),
  };
}

export function buildPluginConversationSessionStartParams(
  input: PluginConversationSessionStartParams,
): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.captureHistory === 'boolean'
      ? { captureHistory: input.captureHistory }
      : {}),
    ...(typeof input.metadata !== 'undefined' ? { metadata: input.metadata } : {}),
  };
}

export function buildPluginConversationSessionKeepParams(
  input: PluginConversationSessionKeepParams,
): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.resetTimeout === 'boolean'
      ? { resetTimeout: input.resetTimeout }
      : {}),
  };
}

export function buildPluginRegisterCronParams(
  descriptor: PluginCronDescriptor,
): JsonObject {
  return {
    name: descriptor.name,
    cron: descriptor.cron,
    ...(descriptor.description ? { description: descriptor.description } : {}),
    ...(typeof descriptor.enabled === 'boolean' ? { enabled: descriptor.enabled } : {}),
    ...(typeof descriptor.data !== 'undefined' ? { data: descriptor.data } : {}),
  };
}

export function buildPluginCreateAutomationParams(input: {
  name: string;
  trigger: TriggerConfig;
  actions: ActionConfig[];
}): JsonObject {
  return {
    name: input.name,
    trigger: toHostJsonValue(input.trigger),
    actions: toHostJsonValue(input.actions),
  };
}

export function buildPluginGenerateParams(
  input: PluginLlmGenerateParams,
): JsonObject {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
  };
}

export function buildPluginRunSubagentParams(
  input: PluginSubagentRunParams,
): JsonObject {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(typeof input.maxSteps === 'number' ? { maxSteps: input.maxSteps } : {}),
  };
}

export function buildPluginStartSubagentTaskParams(
  input: PluginSubagentTaskStartParams,
): JsonObject {
  return {
    messages: toHostJsonValue(input.messages),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(typeof input.maxSteps === 'number' ? { maxSteps: input.maxSteps } : {}),
    ...(input.writeBack ? { writeBack: toHostJsonValue(input.writeBack) } : {}),
  };
}

export function buildPluginGenerateTextParams(
  input: PluginGenerateTextParams,
): JsonObject {
  return {
    prompt: input.prompt,
    ...(input.system ? { system: input.system } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  };
}

/**
 * 将 Host API 参数归一化为 JSON，并跳过显式 undefined 字段。
 * @param value 原始值
 * @returns 适合 Host API 的 JSON 值
 */
export function toHostJsonValue(value: unknown): JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const item of value) {
      if (typeof item === 'undefined') {
        continue;
      }
      result.push(toHostJsonValue(item));
    }
    return result;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isPlainObject(value)) {
    const result: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'undefined') {
        continue;
      }
      result[key] = toHostJsonValue(entry);
    }
    return result;
  }

  return String(value);
}

export function toScopedStateParams(
  options?: PluginScopedStateOptions,
): JsonObject {
  return options?.scope
    ? {
        scope: options.scope,
      }
    : {};
}

/**
 * 判断值是否为普通对象。
 * @param value 待判断值
 * @returns 是否为普通对象
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * 复制一条消息快照。
 * @param message 原始消息快照
 * @returns 深拷贝后的消息快照
 */
function cloneMessageHookInfo(message: PluginMessageHookInfo): PluginMessageHookInfo {
  return cloneJsonValue(message);
}

/**
 * 复制一条会话等待态快照。
 * @param session 原始会话等待态
 * @returns 深拷贝后的会话等待态
 */
function cloneConversationSessionInfo(
  session: PluginConversationSessionInfo,
): PluginConversationSessionInfo {
  return cloneJsonValue(session);
}

/**
 * 复制一条 Hook 描述。
 * @param hook 原始 Hook 描述
 * @returns 深拷贝后的 Hook 描述
 */
function cloneHookDescriptor(hook: PluginHookDescriptor): PluginHookDescriptor {
  return {
    name: hook.name,
    ...(hook.description ? { description: hook.description } : {}),
    ...(typeof hook.priority === 'number' ? { priority: hook.priority } : {}),
    ...(hook.filter ? { filter: cloneHookFilterDescriptor(hook.filter) } : {}),
  };
}

/**
 * 复制一条命令描述。
 * @param command 原始命令描述
 * @returns 深拷贝后的命令描述
 */
function cloneCommandDescriptor(command: PluginCommandDescriptor): PluginCommandDescriptor {
  return {
    kind: command.kind,
    canonicalCommand: command.canonicalCommand,
    path: [...command.path],
    aliases: [...command.aliases],
    variants: [...command.variants],
    ...(command.description ? { description: command.description } : {}),
    ...(typeof command.priority === 'number' ? { priority: command.priority } : {}),
  };
}

/**
 * 复制 Hook 过滤描述。
 * @param filter 原始过滤描述
 * @returns 深拷贝后的过滤描述
 */
function cloneHookFilterDescriptor(
  filter: NonNullable<PluginHookDescriptor['filter']>,
): NonNullable<PluginHookDescriptor['filter']> {
  return {
    ...(filter.message ? { message: cloneMessageFilter(filter.message) } : {}),
  };
}

/**
 * 复制消息过滤描述。
 * @param filter 原始消息过滤
 * @returns 深拷贝后的消息过滤
 */
function cloneMessageFilter(
  filter?: PluginHookMessageFilter,
): PluginHookMessageFilter | undefined {
  if (!filter) {
    return undefined;
  }

  return {
    ...(filter.commands ? { commands: [...filter.commands] } : {}),
    ...(filter.regex
      ? {
          regex: typeof filter.regex === 'string'
            ? filter.regex
            : {
                pattern: filter.regex.pattern,
                ...(filter.regex.flags ? { flags: filter.regex.flags } : {}),
              },
        }
      : {}),
    ...(filter.messageKinds ? { messageKinds: [...filter.messageKinds] } : {}),
  };
}

/**
 * 归一化消息监听优先级。
 * @param priority 原始优先级
 * @returns 归一化后的整数优先级
 */
function normalizePriority(priority?: number): number {
  if (typeof priority !== 'number' || !Number.isFinite(priority)) {
    return 0;
  }

  return Math.trunc(priority);
}

/**
 * 计算一个消息过滤器的大致特异性。
 * @param filter 消息过滤器
 * @returns 特异性分值，越大越具体
 */
function computeFilterSpecificity(filter?: PluginHookMessageFilter): number {
  if (!filter) {
    return 0;
  }

  const commandSpecificity = Math.max(
    0,
    ...(filter.commands ?? []).map((command) =>
      command.trim().replace(/^\//, '').split(/\s+/).filter(Boolean).length),
  );
  const regexSpecificity = filter.regex ? 1 : 0;
  const kindSpecificity = filter.messageKinds?.length ? 1 : 0;
  return commandSpecificity + regexSpecificity + kindSpecificity;
}

/**
 * 判断消息过滤器是否为空。
 * @param filter 消息过滤器
 * @returns 是否为空过滤器
 */
function isEmptyMessageFilter(filter: PluginHookMessageFilter): boolean {
  return (!filter.commands || filter.commands.length === 0)
    && !filter.regex
    && (!filter.messageKinds || filter.messageKinds.length === 0);
}

/**
 * 判断一个过滤器是否只声明了某一种过滤键。
 * @param filter 消息过滤器
 * @param key 目标过滤键
 * @returns 是否只声明了该过滤键
 */
function hasOnlyMessageFilterKey(
  filter: PluginHookMessageFilter,
  key: keyof PluginHookMessageFilter,
): boolean {
  const activeKeys = [
    filter.commands?.length ? 'commands' : null,
    filter.regex ? 'regex' : null,
    filter.messageKinds?.length ? 'messageKinds' : null,
  ].filter((item): item is keyof PluginHookMessageFilter => Boolean(item));

  return activeKeys.length === 1 && activeKeys[0] === key;
}

/**
 * 判断当前消息是否命中过滤条件。
 * @param payload 当前消息载荷
 * @param filter 过滤条件
 * @returns 是否命中
 */
function matchesMessageFilter(
  payload: MessageReceivedHookPayload,
  filter?: PluginHookMessageFilter,
): boolean {
  if (!filter || isEmptyMessageFilter(filter)) {
    return true;
  }

  const messageText = getMessageReceivedText(payload);
  const messageKind = detectMessageKind(payload);

  if (
    filter.commands
    && filter.commands.length > 0
    && !filter.commands.some((command) => matchesMessageCommand(messageText, command))
  ) {
    return false;
  }

  if (filter.regex) {
    const regex = typeof filter.regex === 'string'
      ? new RegExp(filter.regex)
      : new RegExp(filter.regex.pattern, filter.regex.flags);
    if (!regex.test(messageText)) {
      return false;
    }
  }

  if (
    filter.messageKinds
    && filter.messageKinds.length > 0
    && !filter.messageKinds.includes(messageKind)
  ) {
    return false;
  }

  return true;
}

/**
 * 从消息载荷中提取可匹配的纯文本。
 * @param payload 当前消息载荷
 * @returns 归一化后的消息文本
 */
function getMessageReceivedText(payload: MessageReceivedHookPayload): string {
  if (typeof payload.message.content === 'string') {
    return payload.message.content;
  }

  return payload.message.parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

/**
 * 判断一条消息的模态类型。
 * @param payload 当前消息载荷
 * @returns 当前消息类型
 */
function detectMessageKind(payload: MessageReceivedHookPayload): PluginMessageKind {
  const hasText = typeof payload.message.content === 'string'
    ? payload.message.content.trim().length > 0
    : payload.message.parts.some((part) => part.type === 'text' && part.text.trim().length > 0);
  const hasImage = payload.message.parts.some((part) => part.type === 'image');

  if (hasText && hasImage) {
    return 'mixed';
  }
  if (hasImage) {
    return 'image';
  }
  return 'text';
}

/**
 * 判断一条消息是否命中了某个命令。
 * @param messageText 当前消息文本
 * @param command 命令路径
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
 * 匹配某个已注册命令在当前消息中的具体命中信息。
 * @param payload 当前消息载荷
 * @param command 已注册命令
 * @returns 命中信息；未命中时返回 null
 */
function matchRegisteredCommand(
  payload: MessageReceivedHookPayload,
  command: InternalCommandRegistration,
): { command: string; rawArgs: string; args: string[] } | null {
  const messageText = getMessageReceivedText(payload).trimStart();

  for (const variant of command.variants) {
    if (command.exactMatchOnly) {
      if (messageText.trim() !== variant) {
        continue;
      }
      return {
        command: variant,
        rawArgs: '',
        args: [],
      };
    }

    if (!matchesMessageCommand(messageText, variant)) {
      continue;
    }

    const rawArgs = messageText.slice(variant.length).trim();
    return {
      command: variant,
      rawArgs,
      args: rawArgs ? rawArgs.split(/\s+/).filter(Boolean) : [],
    };
  }

  return null;
}

/**
 * 归一化 SDK 级消息监听器的返回值。
 * @param result 原始返回值
 * @returns 统一 Hook 结果；未返回时为 null
 */
function normalizeMessageListenerResult(
  result: PluginMessageHandlerResult,
): MessageReceivedHookResult | null {
  if (result === null || result === undefined) {
    return null;
  }
  if (
    isJsonObjectValue(result)
    && 'action' in result
    && typeof result.action === 'string'
  ) {
    return readMessageListenerHookResult(result);
  }
  if (typeof result === 'string') {
    return {
      action: 'short-circuit',
      assistantContent: result,
    };
  }
  if (typeof result === 'object' && result !== null && 'content' in result) {
    return {
      action: 'short-circuit',
      assistantContent: typeof result.content === 'string' ? result.content : '',
      ...(Array.isArray(result.parts) ? { assistantParts: result.parts } : {}),
    };
  }

  throw new Error('SDK message handler 必须返回 string、{ content } 或标准 Hook 结果');
}

function readMessageListenerHookResult(
  value: Record<string, unknown>,
): MessageReceivedHookResult {
  switch (value.action) {
    case 'pass':
      return {
        action: 'pass',
      };
    case 'mutate': {
      const result: MessageReceivedHookResult = {
        action: 'mutate',
      };

      if ('providerId' in value) {
        if (value.providerId !== undefined && typeof value.providerId !== 'string') {
          throw new Error('Invalid hook action "mutate": providerId');
        }
        if (typeof value.providerId === 'string') {
          result.providerId = value.providerId;
        }
      }
      if ('modelId' in value) {
        if (value.modelId !== undefined && typeof value.modelId !== 'string') {
          throw new Error('Invalid hook action "mutate": modelId');
        }
        if (typeof value.modelId === 'string') {
          result.modelId = value.modelId;
        }
      }
      if ('content' in value) {
        if (value.content !== null && value.content !== undefined && typeof value.content !== 'string') {
          throw new Error('Invalid hook action "mutate": content');
        }
        result.content = value.content ?? null;
      }
      if ('parts' in value) {
        if (value.parts !== null && value.parts !== undefined && !isChatMessagePartArray(value.parts)) {
          throw new Error('Invalid hook action "mutate": parts');
        }
        result.parts = value.parts ?? null;
      }
      if ('modelMessages' in value) {
        if (
          value.modelMessages !== undefined
          && !isPluginLlmMessageArray(value.modelMessages)
        ) {
          throw new Error('Invalid hook action "mutate": modelMessages');
        }
        if (value.modelMessages !== undefined) {
          result.modelMessages = value.modelMessages;
        }
      }
      return result;
    }
    case 'short-circuit': {
      if (typeof value.assistantContent !== 'string') {
        throw new Error('Invalid hook action "short-circuit": assistantContent');
      }

      const result: MessageReceivedHookResult = {
        action: 'short-circuit',
        assistantContent: value.assistantContent,
      };

      if ('assistantParts' in value) {
        if (
          value.assistantParts !== null
          && value.assistantParts !== undefined
          && !isChatMessagePartArray(value.assistantParts)
        ) {
          throw new Error('Invalid hook action "short-circuit": assistantParts');
        }
        result.assistantParts = value.assistantParts ?? null;
      }
      if ('providerId' in value) {
        if (value.providerId !== undefined && typeof value.providerId !== 'string') {
          throw new Error('Invalid hook action "short-circuit": providerId');
        }
        if (typeof value.providerId === 'string') {
          result.providerId = value.providerId;
        }
      }
      if ('modelId' in value) {
        if (value.modelId !== undefined && typeof value.modelId !== 'string') {
          throw new Error('Invalid hook action "short-circuit": modelId');
        }
        if (typeof value.modelId === 'string') {
          result.modelId = value.modelId;
        }
      }
      if ('reason' in value) {
        if (value.reason !== undefined && typeof value.reason !== 'string') {
          throw new Error('Invalid hook action "short-circuit": reason');
        }
        if (typeof value.reason === 'string') {
          result.reason = value.reason;
        }
      }

      return result;
    }
    default:
      throw new Error(`Invalid hook action: ${value.action}`);
  }
}

/**
 * 归一化裸 `onHook("message:received")` 的返回值。
 * @param result 原始 Hook 返回值
 * @returns 宿主可接受的 JSON 值
 */
function normalizeRawMessageHookResult(
  result: JsonValue | null | undefined,
): JsonValue | null {
  if (result === null || result === undefined) {
    return {
      action: 'pass',
    };
  }
  if (
    typeof result === 'object'
    && result !== null
    && 'action' in result
    && typeof result.action === 'string'
  ) {
    return result;
  }
  if (typeof result === 'string') {
    return {
      action: 'short-circuit',
      assistantContent: result,
    };
  }
  if (typeof result === 'object' && result !== null && 'content' in result) {
    return {
      action: 'short-circuit',
      assistantContent: typeof result.content === 'string' ? result.content : '',
      ...(Array.isArray(result.parts) ? { assistantParts: result.parts } : {}),
    };
  }

  return result;
}

/**
 * 将一条 mutate 结果应用到当前消息载荷。
 * @param payload 当前消息载荷
 * @param mutation mutate 结果
 * @returns 新的消息载荷
 */
function applyMessageReceivedMutation(
  payload: MessageReceivedHookPayload,
  mutation: Extract<MessageReceivedHookResult, { action: 'mutate' }>,
): MessageReceivedHookPayload {
  const nextPayload = cloneJsonValue(payload);

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
    nextPayload.message.parts = mutation.parts ?? [];
  }
  if ('modelMessages' in mutation && Array.isArray(mutation.modelMessages)) {
    nextPayload.modelMessages = cloneJsonValue(mutation.modelMessages);
  }

  return nextPayload;
}

/**
 * 把当前载荷相对原始载荷的差异收敛成一个 mutate 结果。
 * @param original 原始载荷
 * @param current 当前载荷
 * @returns mutate 或 pass 结果
 */
function buildMessageReceivedMutationResult(
  original: MessageReceivedHookPayload,
  current: MessageReceivedHookPayload,
): MessageReceivedHookResult {
  const mutation: Extract<MessageReceivedHookResult, { action: 'mutate' }> = {
    action: 'mutate',
  };
  let changed = false;

  if (current.providerId !== original.providerId) {
    mutation.providerId = current.providerId;
    changed = true;
  }
  if (current.modelId !== original.modelId) {
    mutation.modelId = current.modelId;
    changed = true;
  }
  if (current.message.content !== original.message.content) {
    mutation.content = current.message.content;
    changed = true;
  }
  if (!isJsonEqual(current.message.parts, original.message.parts)) {
    mutation.parts = cloneJsonValue(current.message.parts);
    changed = true;
  }
  if (!isJsonEqual(current.modelMessages, original.modelMessages)) {
    mutation.modelMessages = cloneJsonValue(current.modelMessages);
    changed = true;
  }

  return changed ? mutation : { action: 'pass' };
}

/**
 * 判断两个 JSON 兼容值是否语义相等。
 * @param left 左值
 * @param right 右值
 * @returns 是否相等
 */
function isJsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * 对字符串数组去重并保留首次出现顺序。
 * @param values 原始字符串数组
 * @returns 去重后的数组
 */
function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * 归一化插件 Route 路径。
 * @param path 原始路径
 * @returns 去掉首尾斜杠后的路径
 */
function normalizeRoutePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * 归一化 Route 响应，补默认状态码。
 * @param response 插件返回的 Route 响应
 * @returns 标准化后的 Route 响应
 */
function normalizeRouteResponse(response: PluginRouteResponse): PluginRouteResponse {
  return {
    status: response.status || 200,
    headers: response.headers,
    body: response.body,
  };
}
