import {
  type ActionConfig,
  type AuthPayload,
  type AutomationInfo,
  type DeviceType,
  type ExecuteErrorPayload,
  type ExecutePayload,
  type ExecuteResultPayload,
  type HostCallPayload,
  type HostResultPayload,
  type JsonObject,
  type JsonValue,
  type PluginCallContext,
  type PluginKbEntryDetail,
  type PluginKbEntrySummary,
  type PluginCapability,
  type PluginCronDescriptor,
  type PluginCronJobSummary,
  type PluginHookName,
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
   * 读取当前插件自身摘要。
   * @returns 插件摘要
   */
  getPluginSelf(): Promise<PluginSelfInfo>;

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

/**
 * 插件执行上下文。
 */
export interface PluginExecutionContext {
  /** 当前调用上下文。 */
  callContext: PluginCallContext;
  /** Host API 门面。 */
  host: PluginHostFacade;
}

type CommandHandler = (
  params: JsonObject,
  context: PluginExecutionContext,
) => Promise<JsonValue> | JsonValue;

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
  private readonly pendingHostCalls = new Map<string, {
    resolve: (value: JsonValue) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private connected = false;
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

  /** 注册 Route 处理器。 */
  onRoute(path: string, handler: RouteHandler) {
    this.routeHandlers.set(normalizeRoutePath(path), handler);
    return this;
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
    const handler = this.hookHandlers.get(payload.hookName);

    if (!handler) {
      this.send(
        WS_TYPE.PLUGIN,
        WS_ACTION.HOOK_ERROR,
        { error: `未知 Hook：${payload.hookName}` },
        msg.requestId,
      );
      return;
    }

    try {
      const result = await handler(
        payload.payload,
        this.createExecutionContext(payload.context),
      );
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

    return {
      callContext: context,
      host: {
        call: (method, params) => this.sendHostCall(method, params, context),
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
        getPluginSelf: () =>
          this.sendHostCall('plugin.self.get', {}, context) as unknown as Promise<PluginSelfInfo>,
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
    return {
      id: this.options.pluginName,
      name: this.options.manifest.name ?? this.options.pluginName,
      version: this.options.manifest.version ?? '0.0.0',
      runtime: 'remote',
      description: this.options.manifest.description,
      permissions: this.options.manifest.permissions ?? [],
      tools: this.options.manifest.tools ?? this.options.capabilities,
      hooks: this.options.manifest.hooks ?? [],
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
  type PluginRouteDescriptor,
  type PluginRouteRequest,
  type PluginRouteResponse,
} from '@garlic-claw/shared';

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
