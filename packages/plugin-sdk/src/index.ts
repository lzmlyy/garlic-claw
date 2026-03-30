import {
  type ActionConfig,
  type AutomationEventDispatchInfo,
  type AuthPayload,
  type AutomationInfo,
  type ChatMessagePart,
  type DeviceType,
  type ExecuteErrorPayload,
  type ExecutePayload,
  type ExecuteResultPayload,
  type HostCallPayload,
  type HostResultPayload,
  type JsonObject,
  type JsonValue,
  type MessageReceivedHookPayload,
  type MessageReceivedHookResult,
  type PluginCallContext,
  type PluginEventLevel,
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
  type PluginSelfInfo,
  type PluginSubagentRunParams,
  type PluginSubagentRunResult,
  type RegisterPayload,
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
  /** 旧版能力列表输入；会被自动转换为 manifest.tools */
  capabilities?: PluginCapability[];
  /** 新版 manifest 输入 */
  manifest?: PluginManifestInput;
  /** 断开时自动重连（默认：true） */
  autoReconnect?: boolean;
  /** 重连间隔（毫秒，默认：5000） */
  reconnectInterval?: number;
  /** 心跳间隔（毫秒，默认：20000） */
  heartbeatInterval?: number;
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
   * @returns JSON 值
   */
  getStorage(key: string): Promise<JsonValue>;

  /**
   * 写入插件持久化存储。
   * @param key 存储键
   * @param value JSON 值
   * @returns 写入结果
   */
  setStorage(key: string, value: JsonValue): Promise<JsonValue>;

  /**
   * 删除插件持久化存储中的一个键。
   * @param key 存储键
   * @returns 是否删除成功
   */
  deleteStorage(key: string): Promise<JsonValue>;

  /**
   * 列出插件持久化存储。
   * @param prefix 可选前缀
   * @returns 键值对列表
   */
  listStorage(prefix?: string): Promise<JsonValue>;

  /**
   * 读取插件自身状态。
   * @param key 状态键
   * @returns 状态值
   */
  getState(key: string): Promise<JsonValue>;

  /**
   * 写入插件自身状态。
   * @param key 状态键
   * @param value JSON 值
   * @returns 写入后的状态值
   */
  setState(key: string, value: JsonValue): Promise<JsonValue>;

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
   * 发起一次宿主侧文本生成。
   * @param params 提示词与可选模型参数
   * @returns 文本生成结果
   */
  generateText(params: {
    prompt: string;
    system?: string;
    providerId?: string;
    modelId?: string;
    variant?: string;
    maxOutputTokens?: number;
    providerOptions?: JsonObject;
    headers?: Record<string, string>;
  }): Promise<JsonValue>;
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
export interface PluginExecutionContext {
  /** 当前调用上下文。 */
  callContext: PluginCallContext;
  /** Host API 门面。 */
  host: PluginHostFacade;
}

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
  private readonly options: Required<Omit<PluginClientOptions, 'manifest'>> & {
    manifest: PluginManifestInput;
  };

  constructor(options: PluginClientOptions) {
    this.options = {
      autoReconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 20000,
      capabilities: [],
      manifest: {},
      ...options,
    };
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
        this.resolveHostCall(
          msg.requestId,
          (msg.payload as HostResultPayload).data,
        );
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
    const payload = msg.payload as ExecutePayload;
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
    const payload = msg.payload as {
      hookName: PluginHookName;
      context: PluginCallContext;
      payload: JsonValue;
    };
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
          payload.payload as unknown as MessageReceivedHookPayload,
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
    const payload = msg.payload as {
      request: PluginRouteRequest;
      context: PluginCallContext;
    };
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

    return {
      callContext: context,
      host: {
        call: (method, params) => this.sendHostCall(method, params, context),
        conversationSession,
        getCurrentProvider: () =>
          this.sendHostCall(
            'provider.current.get',
            {},
            context,
          ) as unknown as Promise<PluginProviderCurrentInfo>,
        listProviders: () =>
          this.sendHostCall(
            'provider.list',
            {},
            context,
          ) as unknown as Promise<PluginProviderSummary[]>,
        getProvider: (providerId) =>
          this.sendHostCall(
            'provider.get',
            { providerId },
            context,
          ) as unknown as Promise<PluginProviderSummary>,
        getProviderModel: (providerId, modelId) =>
          this.sendHostCall(
            'provider.model.get',
            { providerId, modelId },
            context,
          ) as unknown as Promise<PluginProviderModelSummary>,
        searchMemories: (query, limit = 10) =>
          this.sendHostCall('memory.search', { query, limit }, context),
        getConversation: () =>
          this.sendHostCall('conversation.get', {}, context),
        getCurrentMessageTarget: () =>
          this.sendHostCall(
            'message.target.current.get',
            {},
            context,
          ) as unknown as Promise<PluginMessageTargetInfo | null>,
        sendMessage: ({
          target,
          content,
          parts,
          provider,
          model,
        }) => {
          const params: JsonObject = {};
          if (target) {
            params.target = target as unknown as JsonValue;
          }
          if (typeof content === 'string') {
            params.content = content;
          }
          if (parts) {
            params.parts = parts as unknown as JsonValue;
          }
          if (typeof provider === 'string') {
            params.provider = provider;
          }
          if (typeof model === 'string') {
            params.model = model;
          }

          return this.sendHostCall(
            'message.send',
            params,
            context,
          ) as unknown as Promise<PluginMessageSendInfo>;
        },
        startConversationSession: (input) => conversationSession.start(input),
        getConversationSession: () => conversationSession.get(),
        keepConversationSession: (input) => conversationSession.keep(input),
        finishConversationSession: () => conversationSession.finish(),
        listKnowledgeBaseEntries: (limit) =>
          this.sendHostCall(
            'kb.list',
            typeof limit === 'number' ? { limit } : {},
            context,
          ) as unknown as Promise<PluginKbEntrySummary[]>,
        searchKnowledgeBase: (query, limit = 5) =>
          this.sendHostCall(
            'kb.search',
            { query, limit },
            context,
          ) as unknown as Promise<PluginKbEntryDetail[]>,
        getKnowledgeBaseEntry: (entryId) =>
          this.sendHostCall(
            'kb.get',
            { entryId },
            context,
          ) as unknown as Promise<PluginKbEntryDetail>,
        getCurrentPersona: () =>
          this.sendHostCall(
            'persona.current.get',
            {},
            context,
          ) as unknown as Promise<PluginPersonaCurrentInfo>,
        listPersonas: () =>
          this.sendHostCall(
            'persona.list',
            {},
            context,
          ) as unknown as Promise<PluginPersonaSummary[]>,
        getPersona: (personaId) =>
          this.sendHostCall(
            'persona.get',
            { personaId },
            context,
          ) as unknown as Promise<PluginPersonaSummary>,
        activatePersona: (personaId) =>
          this.sendHostCall(
            'persona.activate',
            { personaId },
            context,
          ) as unknown as Promise<PluginPersonaCurrentInfo>,
        registerCron: (descriptor) =>
          this.sendHostCall(
            'cron.register',
            {
              name: descriptor.name,
              cron: descriptor.cron,
              ...(descriptor.description ? { description: descriptor.description } : {}),
              ...(typeof descriptor.enabled === 'boolean' ? { enabled: descriptor.enabled } : {}),
              ...(Object.prototype.hasOwnProperty.call(descriptor, 'data')
                ? { data: descriptor.data as JsonValue }
                : {}),
            },
            context,
          ) as unknown as Promise<PluginCronJobSummary>,
        listCrons: () =>
          this.sendHostCall('cron.list', {}, context) as unknown as Promise<PluginCronJobSummary[]>,
        deleteCron: (jobId) =>
          this.sendHostCall(
            'cron.delete',
            {
              jobId,
            },
            context,
          ) as unknown as Promise<boolean>,
        createAutomation: ({ name, trigger, actions }) =>
          this.sendHostCall(
            'automation.create',
            {
              name,
              trigger: trigger as never,
              actions: actions as never,
            },
            context,
          ) as unknown as Promise<AutomationInfo>,
        listAutomations: () =>
          this.sendHostCall(
            'automation.list',
            {},
            context,
          ) as unknown as Promise<AutomationInfo[]>,
        toggleAutomation: (automationId) =>
          this.sendHostCall(
            'automation.toggle',
            { automationId },
            context,
          ) as unknown as Promise<{ id: string; enabled: boolean } | null>,
        runAutomation: (automationId) =>
          this.sendHostCall(
            'automation.run',
            { automationId },
            context,
          ) as unknown as Promise<{ status: string; results: JsonValue[] } | null>,
        emitAutomationEvent: (event) =>
          this.sendHostCall(
            'automation.event.emit',
            { event },
            context,
          ) as unknown as Promise<AutomationEventDispatchInfo>,
        getPluginSelf: () =>
          this.sendHostCall('plugin.self.get', {}, context) as unknown as Promise<PluginSelfInfo>,
        writeLog: ({ level, message, type, metadata }) =>
          this.sendHostCall(
            'log.write',
            {
              level,
              message,
              ...(type ? { type } : {}),
              ...(metadata ? { metadata } : {}),
            },
            context,
          ) as unknown as Promise<boolean>,
        saveMemory: ({ content, category, keywords }) =>
          this.sendHostCall(
            'memory.save',
            {
              content,
              ...(category ? { category } : {}),
              ...(keywords ? { keywords } : {}),
            },
            context,
          ),
        listConversationMessages: () =>
          this.sendHostCall('conversation.messages.list', {}, context),
        getStorage: (key) =>
          this.sendHostCall('storage.get', { key }, context),
        setStorage: (key, value) =>
          this.sendHostCall('storage.set', { key, value }, context),
        deleteStorage: (key) =>
          this.sendHostCall('storage.delete', { key }, context),
        listStorage: (prefix) =>
          this.sendHostCall('storage.list', prefix ? { prefix } : {}, context),
        getState: (key) => this.sendHostCall('state.get', { key }, context),
        setState: (key, value) =>
          this.sendHostCall('state.set', { key, value }, context),
        getConfig: (key) =>
          this.sendHostCall('config.get', key ? { key } : {}, context),
        getUser: () =>
          this.sendHostCall('user.get', {}, context),
        setConversationTitle: (title) =>
          this.sendHostCall(
            'conversation.title.set',
            { title },
            context,
          ),
        generate: ({
          providerId,
          modelId,
          system,
          messages,
          variant,
          providerOptions,
          headers,
          maxOutputTokens,
        }) =>
          this.sendHostCall(
            'llm.generate',
            {
              ...(providerId ? { providerId } : {}),
              ...(modelId ? { modelId } : {}),
              ...(system ? { system } : {}),
              messages: messages as never,
              ...(variant ? { variant } : {}),
              ...(providerOptions ? { providerOptions } : {}),
              ...(headers ? { headers } : {}),
              ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
            },
            context,
          ) as unknown as Promise<PluginLlmGenerateResult>,
        runSubagent: ({
          providerId,
          modelId,
          system,
          messages,
          toolNames,
          variant,
          providerOptions,
          headers,
          maxOutputTokens,
          maxSteps,
        }) =>
          this.sendHostCall(
            'subagent.run',
            {
              ...(providerId ? { providerId } : {}),
              ...(modelId ? { modelId } : {}),
              ...(system ? { system } : {}),
              messages: messages as never,
              ...(toolNames ? { toolNames } : {}),
              ...(variant ? { variant } : {}),
              ...(providerOptions ? { providerOptions } : {}),
              ...(headers ? { headers } : {}),
              ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
              ...(typeof maxSteps === 'number' ? { maxSteps } : {}),
            },
            context,
          ) as unknown as Promise<PluginSubagentRunResult>,
        generateText: ({
          prompt,
          system,
          providerId,
          modelId,
          variant,
          maxOutputTokens,
          providerOptions,
          headers,
        }) =>
          this.sendHostCall(
            'llm.generate-text',
            {
              prompt,
              ...(system ? { system } : {}),
              ...(providerId ? { providerId } : {}),
              ...(modelId ? { modelId } : {}),
              ...(variant ? { variant } : {}),
              ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
              ...(providerOptions ? { providerOptions } : {}),
              ...(headers ? { headers } : {}),
            },
            context,
          ),
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
        return sessionWaiterResult as unknown as JsonValue;
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
        return normalizedResult as unknown as JsonValue;
      }

      currentPayload = applyMessageReceivedMutation(currentPayload, normalizedResult);
      hasMutation = true;
    }

    if (hasMutation) {
      return buildMessageReceivedMutationResult(
        originalPayload,
        currentPayload,
      ) as unknown as JsonValue;
    }

    const fallbackHandler = this.hookHandlers.get('message:received');
    if (!fallbackHandler) {
      return {
        action: 'pass',
      };
    }

    const rawResult = await fallbackHandler(
      cloneJsonValue(payload) as unknown as JsonValue,
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
    const sendHostCall = this.sendHostCall.bind(this);

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

      const session = await sendHostCall(
        'conversation.session.start',
        params,
        context,
      ) as unknown as PluginConversationSessionInfo;
      setSession(session);
      return cloneConversationSessionInfo(session);
    };
    const getSession = async (): Promise<PluginConversationSessionInfo | null> => {
      const previousConversationId = currentSession?.conversationId ?? context.conversationId;
      const session = await sendHostCall(
        'conversation.session.get',
        {},
        context,
      ) as unknown as PluginConversationSessionInfo | null;
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

      const session = await sendHostCall(
        'conversation.session.keep',
        params,
        context,
      ) as unknown as PluginConversationSessionInfo | null;
      setSession(session);
      if (!session) {
        clearLocalWaiter(previousConversationId);
      }
      return session ? cloneConversationSessionInfo(session) : null;
    };
    const finishSession = async (): Promise<boolean> => {
      const previousConversationId = currentSession?.conversationId ?? context.conversationId;
      const finished = await sendHostCall(
        'conversation.session.finish',
        {},
        context,
      ) as unknown as boolean;
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
   * 解析当前插件应发送的 manifest。
   * @returns 完整 manifest
   */
  private resolveManifest(): PluginManifest {
    const hooks = this.resolveHookDescriptors();

    return {
      id: this.options.pluginName,
      name: this.options.manifest.name ?? this.options.pluginName,
      version: this.options.manifest.version ?? '0.0.0',
      runtime: 'remote',
      description: this.options.manifest.description,
      permissions: this.options.manifest.permissions ?? [],
      tools: this.options.manifest.tools ?? this.options.capabilities,
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
  return JSON.parse(JSON.stringify(value)) as T;
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
    typeof result === 'object'
    && result !== null
    && 'action' in result
    && typeof result.action === 'string'
  ) {
    return result as MessageReceivedHookResult;
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
