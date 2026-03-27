import type {
  ChatAfterModelHookPayload,
  ChatBeforeModelHookPayload,
  ChatBeforeModelHookResult,
  HostCallPayload,
  PluginCallContext,
  PluginCronDescriptor,
  PluginCronJobSummary,
  PluginHookName,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginManifest,
  PluginProviderCurrentInfo,
  PluginProviderModelSummary,
  PluginProviderSummary,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginSelfInfo,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { PluginTransport } from '../plugin-runtime.service';

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
   * 读取当前插件自身摘要。
   * @returns 插件摘要
   */
  getPluginSelf(): Promise<PluginSelfInfo>;

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
   * 按前缀列出插件持久化存储。
   * @param prefix 可选前缀
   * @returns 键值对列表
   */
  listStorage(prefix?: string): Promise<JsonValue>;

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
   * 创建一个绑定到当前插件与调用上下文的 Host API 门面。
   * @param context 调用上下文
   * @returns 带便捷方法的 Host API 门面
   */
  private createHostFacade(
    context: PluginCallContext,
  ): BuiltinPluginHostFacade {
    return {
      call: (method, params) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method,
          params,
        }),
      getCurrentProvider: () =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'provider.current.get',
          params: {},
        }) as unknown as Promise<PluginProviderCurrentInfo>,
      listProviders: () =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'provider.list',
          params: {},
        }) as unknown as Promise<PluginProviderSummary[]>,
      getProvider: (providerId) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'provider.get',
          params: {
            providerId,
          },
        }) as unknown as Promise<PluginProviderSummary>,
      getProviderModel: (providerId, modelId) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'provider.model.get',
          params: {
            providerId,
            modelId,
          },
        }) as unknown as Promise<PluginProviderModelSummary>,
      searchMemories: (query, limit = 10) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'memory.search',
          params: {
            query,
            limit,
          },
        }),
      getConversation: () =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'conversation.get',
          params: {},
        }),
      registerCron: (descriptor) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'cron.register',
          params: {
            name: descriptor.name,
            cron: descriptor.cron,
            ...(descriptor.description ? { description: descriptor.description } : {}),
            ...(typeof descriptor.enabled === 'boolean' ? { enabled: descriptor.enabled } : {}),
            ...(Object.prototype.hasOwnProperty.call(descriptor, 'data')
              ? { data: descriptor.data as JsonValue }
              : {}),
          },
        }) as unknown as Promise<PluginCronJobSummary>,
      listCrons: () =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'cron.list',
          params: {},
        }) as unknown as Promise<PluginCronJobSummary[]>,
      deleteCron: (jobId) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'cron.delete',
          params: {
            jobId,
          },
        }) as unknown as Promise<boolean>,
      getPluginSelf: () =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'plugin.self.get',
          params: {},
        }) as unknown as Promise<PluginSelfInfo>,
      listConversationMessages: () =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'conversation.messages.list',
          params: {},
        }),
      getStorage: (key) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'storage.get',
          params: {
            key,
          },
        }),
      setStorage: (key, value) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'storage.set',
          params: {
            key,
            value,
          },
        }),
      deleteStorage: (key) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'storage.delete',
          params: {
            key,
          },
        }),
      listStorage: (prefix) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'storage.list',
          params: prefix ? { prefix } : {},
        }),
      saveMemory: ({ content, category, keywords }) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'memory.save',
          params: {
            content,
            ...(category ? { category } : {}),
            ...(keywords ? { keywords } : {}),
          },
        }),
      getConfig: (key) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'config.get',
          params: key ? { key } : {},
        }),
      getUser: () =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'user.get',
          params: {},
        }),
      setConversationTitle: (title) =>
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'conversation.title.set',
          params: {
            title,
          },
        }),
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
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'llm.generate',
          params: {
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
            ...(system ? { system } : {}),
            messages: messages as never,
            ...(variant ? { variant } : {}),
            ...(providerOptions ? { providerOptions } : {}),
            ...(headers ? { headers } : {}),
            ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
          },
        }) as unknown as Promise<PluginLlmGenerateResult>,
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
        this.hostService.call({
          pluginId: this.definition.manifest.id,
          context,
          method: 'llm.generate-text',
          params: {
            prompt,
            ...(system ? { system } : {}),
            ...(providerId ? { providerId } : {}),
            ...(modelId ? { modelId } : {}),
            ...(variant ? { variant } : {}),
            ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
            ...(providerOptions ? { providerOptions } : {}),
            ...(headers ? { headers } : {}),
          },
        }),
    };
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
  return payload as unknown as ChatBeforeModelHookPayload;
}

/**
 * 将 JSON 负载收敛为聊天模型后 Hook 载荷。
 * @param payload 原始 JSON 负载
 * @returns 结构化 Hook 输入
 */
export function asChatAfterModelPayload(
  payload: JsonValue,
): ChatAfterModelHookPayload {
  return payload as unknown as ChatAfterModelHookPayload;
}

/**
 * 构造聊天模型前 Hook 返回值。
 * @param appendSystemPrompt 要追加的系统提示词
 * @returns Hook 返回值对象
 */
export function createChatBeforeModelHookResult(
  appendSystemPrompt: string,
): ChatBeforeModelHookResult {
  return {
    appendSystemPrompt,
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
