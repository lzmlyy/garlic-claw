import type {
  ChatMessagePart,
  HostCallPayload,
  PluginCallContext,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginLlmMessage,
  PluginProviderCurrentInfo,
  PluginProviderModelSummary,
  PluginProviderSummary,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { AiManagementService } from '../ai/ai-management.service';
import { AiProviderService } from '../ai/ai-provider.service';
import { ModelRegistryService } from '../ai/registry/model-registry.service';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { deserializeMessageParts } from '../chat/message-parts';
import { toJsonValue } from '../common/utils/json-value';
import { MemoryService } from '../memory/memory.service';
import { PrismaService } from '../prisma/prisma.service';
import { PluginStateService } from './plugin-state.service';
import { PluginService } from './plugin.service';

/**
 * 插件 Host API 服务。
 *
 * 输入:
 * - 插件 ID
 * - 调用上下文
 * - Host API 方法名与参数
 *
 * 输出:
 * - JSON 可序列化的 Host API 返回值
 *
 * 预期行为:
 * - 统一校验插件调用上下文
 * - 将宿主能力通过单一入口暴露给内建/远程插件
 * - 不直接把 Nest service 实例暴露给插件
 */
@Injectable()
export class PluginHostService {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly prisma: PrismaService,
    private readonly stateService: PluginStateService,
    private readonly pluginService: PluginService,
    private readonly aiModelExecution: AiModelExecutionService,
    private readonly aiProviderService: AiProviderService,
    private readonly aiManagementService: AiManagementService,
    private readonly modelRegistryService: ModelRegistryService,
  ) {}

  /**
   * 执行一次 Host API 调用。
   * @param input 插件 ID、上下文和方法参数
   * @returns JSON 可序列化的调用结果
   */
  async call(input: {
    pluginId: string;
    context: PluginCallContext;
    method: HostCallPayload['method'];
    params: JsonObject;
  }): Promise<JsonValue> {
    switch (input.method) {
      case 'config.get':
        return this.getConfig(input.pluginId, input.params);
      case 'conversation.get':
        return this.getConversation(input.context, input.params);
      case 'provider.current.get':
        return this.getCurrentProvider(input.context);
      case 'provider.get':
        return this.getProvider(input.params);
      case 'provider.list':
        return this.listProviders();
      case 'provider.model.get':
        return this.getProviderModel(input.params);
      case 'memory.search':
        return this.searchMemories(input.context, input.params);
      case 'memory.save':
        return this.saveMemory(input.context, input.params);
      case 'conversation.title.set':
        return this.setConversationTitle(input.context, input.params);
      case 'llm.generate':
        return this.generate(input.params);
      case 'llm.generate-text':
        return this.generateText(input.params);
      case 'plugin.self.get':
        return this.getPluginSelf(input.pluginId);
      case 'storage.delete':
        return this.deleteStorage(input.pluginId, input.params);
      case 'storage.get':
        return this.getStorage(input.pluginId, input.params);
      case 'storage.list':
        return this.listStorage(input.pluginId, input.params);
      case 'storage.set':
        return this.setStorage(input.pluginId, input.params);
      case 'state.get':
        return this.getState(input.pluginId, input.params);
      case 'state.set':
        return this.setState(input.pluginId, input.params);
      case 'user.get':
        return this.getUser(input.context);
      case 'conversation.messages.list':
        return this.listConversationMessages(input.context);
      default:
        throw new BadRequestException(`不支持的 Host API 方法: ${input.method}`);
    }
  }

  /**
   * 读取插件解析后的配置。
   * @param pluginId 插件 ID
   * @param params 可选 key 查询参数
   * @returns 配置对象或单个配置值
   */
  private async getConfig(
    pluginId: string,
    params: JsonObject,
  ): Promise<JsonValue> {
    const config = await this.pluginService.getResolvedConfig(pluginId);
    const key = this.readString(params, 'key');
    if (!key) {
      return config;
    }

    return (config[key] as JsonValue | undefined) ?? null;
  }

  /**
   * 读取当前会话摘要。
   * @param context 插件调用上下文
   * @param _params 当前未使用的参数对象
   * @returns 当前会话摘要
   */
  private async getConversation(
    context: PluginCallContext,
    _params: JsonObject,
  ): Promise<JsonValue> {
    const conversation = await this.requireConversationRecord(
      context,
      'conversation.get',
    );

    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  /**
   * 读取当前调用可见的 provider/model 上下文。
   * @param context 插件调用上下文
   * @returns 当前 provider/model 摘要
   */
  private getCurrentProvider(context: PluginCallContext): JsonValue {
    if (context.activeProviderId && context.activeModelId) {
      const result: PluginProviderCurrentInfo = {
        source: 'context',
        providerId: context.activeProviderId,
        modelId: context.activeModelId,
      };

      return toJsonValue(result);
    }

    const modelConfig = this.aiProviderService.getModelConfig();
    const result: PluginProviderCurrentInfo = {
      source: 'default',
      providerId: String(modelConfig.providerId),
      modelId: String(modelConfig.id),
    };

    return toJsonValue(result);
  }

  /**
   * 列出宿主当前可用的 provider 安全摘要。
   * @returns provider 摘要列表
   */
  private listProviders(): JsonValue {
    return toJsonValue(
      this.aiManagementService
        .listProviders()
        .map((provider) => this.toProviderSummary(provider)),
    );
  }

  /**
   * 读取单个 provider 的安全摘要。
   * @param params 查询参数
   * @returns provider 摘要
   */
  private getProvider(params: JsonObject): JsonValue {
    const providerId = this.requireString(params, 'providerId');
    return toJsonValue(this.findProviderSummaryOrThrow(providerId));
  }

  /**
   * 读取单个模型的安全摘要。
   * @param params 查询参数
   * @returns 模型摘要
   */
  private getProviderModel(params: JsonObject): JsonValue {
    const providerId = this.requireString(params, 'providerId');
    const modelId = this.requireString(params, 'modelId');
    const model =
      this.modelRegistryService.getModel(providerId, modelId)
      ?? this.aiManagementService
        .listModels(providerId)
        .find((item) => String(item.id) === modelId);
    if (!model) {
      throw new NotFoundException(
        `Model "${modelId}" not found for provider "${providerId}"`,
      );
    }

    return toJsonValue(this.toProviderModelSummary(model));
  }

  /**
   * 使用当前用户上下文搜索记忆。
   * @param context 插件调用上下文
   * @param params 搜索参数
   * @returns 命中的记忆摘要列表
   */
  private async searchMemories(
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const userId = this.requireUserId(context, 'memory.search');
    const query = this.requireString(params, 'query');
    const limit = this.readNumber(params, 'limit') ?? 10;
    const memories = await this.memoryService.searchMemories(userId, query, limit);

    return memories.map((memory) => ({
      id: memory.id,
      content: memory.content,
      category: memory.category,
      createdAt: memory.createdAt.toISOString(),
    }));
  }

  /**
   * 使用当前用户上下文保存记忆。
   * @param context 插件调用上下文
   * @param params 保存参数
   * @returns 新记忆的最小摘要
   */
  private async saveMemory(
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const userId = this.requireUserId(context, 'memory.save');
    const content = this.requireString(params, 'content');
    const category = this.readString(params, 'category') ?? 'general';
    const keywords = this.readString(params, 'keywords');
    const memory = await this.memoryService.saveMemory(
      userId,
      content,
      category,
      keywords ?? undefined,
    );

    return {
      id: memory.id,
      content: memory.content,
      category: memory.category,
      createdAt: memory.createdAt.toISOString(),
    };
  }

  /**
   * 更新当前会话标题。
   * @param context 插件调用上下文
   * @param params 标题更新参数
   * @returns 更新后的会话摘要
   */
  private async setConversationTitle(
    context: PluginCallContext,
    params: JsonObject,
  ): Promise<JsonValue> {
    const conversation = await this.requireConversationRecord(
      context,
      'conversation.title.set',
    );
    const title = this.requireString(params, 'title').trim();
    if (!title) {
      throw new BadRequestException('title 不能为空');
    }

    const updated = await this.prisma.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        title,
      },
    });

    return {
      id: updated.id,
      title: updated.title,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * 通过宿主统一入口执行一次文本生成。
   * @param params 模型选择与提示词参数
   * @returns 生成结果摘要
   */
  private async generateText(params: JsonObject): Promise<JsonValue> {
    const prompt = this.requireString(params, 'prompt');
    const result = await this.generateCore({
      providerId: this.readString(params, 'providerId') ?? undefined,
      modelId: this.readString(params, 'modelId') ?? undefined,
      system: this.readString(params, 'system') ?? undefined,
      variant: this.readString(params, 'variant') ?? undefined,
      providerOptions: this.readObject(params, 'providerOptions') ?? undefined,
      headers: this.readStringRecord(params, 'headers') ?? undefined,
      maxOutputTokens: this.readNumber(params, 'maxOutputTokens') ?? undefined,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    return {
      providerId: result.providerId,
      modelId: result.modelId,
      text: result.text,
    };
  }

  /**
   * 通过宿主统一入口执行一次结构化生成。
   * @param params 模型选择与消息参数
   * @returns 生成结果摘要
   */
  private async generate(params: JsonObject): Promise<JsonValue> {
    return toJsonValue(await this.generateCore({
      providerId: this.readString(params, 'providerId') ?? undefined,
      modelId: this.readString(params, 'modelId') ?? undefined,
      system: this.readString(params, 'system') ?? undefined,
      variant: this.readString(params, 'variant') ?? undefined,
      providerOptions: this.readObject(params, 'providerOptions') ?? undefined,
      headers: this.readStringRecord(params, 'headers') ?? undefined,
      maxOutputTokens: this.readNumber(params, 'maxOutputTokens') ?? undefined,
      messages: this.readLlmMessages(params),
    }));
  }

  /**
   * 读取当前插件自身信息。
   * @param pluginId 插件 ID
   * @returns 插件自身摘要
   */
  private async getPluginSelf(pluginId: string): Promise<JsonValue> {
    return toJsonValue(await this.pluginService.getPluginSelfInfo(pluginId));
  }

  /**
   * 读取插件持久化存储中的单个值。
   * @param pluginId 插件 ID
   * @param params 查询参数
   * @returns 命中的 JSON 值；不存在时返回 null
   */
  private async getStorage(
    pluginId: string,
    params: JsonObject,
  ): Promise<JsonValue> {
    const key = this.requireString(params, 'key');
    return this.pluginService.getPluginStorage(pluginId, key);
  }

  /**
   * 写入插件持久化存储。
   * @param pluginId 插件 ID
   * @param params 写入参数
   * @returns 写入后的 JSON 值
   */
  private async setStorage(
    pluginId: string,
    params: JsonObject,
  ): Promise<JsonValue> {
    const key = this.requireString(params, 'key');
    if (!Object.prototype.hasOwnProperty.call(params, 'value')) {
      throw new BadRequestException('storage.set 缺少 value');
    }

    return this.pluginService.setPluginStorage(
      pluginId,
      key,
      params.value as JsonValue,
    );
  }

  /**
   * 删除插件持久化存储中的一个键。
   * @param pluginId 插件 ID
   * @param params 删除参数
   * @returns 是否删除成功
   */
  private async deleteStorage(
    pluginId: string,
    params: JsonObject,
  ): Promise<JsonValue> {
    const key = this.requireString(params, 'key');
    return this.pluginService.deletePluginStorage(pluginId, key);
  }

  /**
   * 列出插件持久化存储。
   * @param pluginId 插件 ID
   * @param params 查询参数
   * @returns 键值对列表
   */
  private async listStorage(
    pluginId: string,
    params: JsonObject,
  ): Promise<JsonValue> {
    const prefix = this.readString(params, 'prefix') ?? undefined;
    return this.pluginService.listPluginStorage(pluginId, prefix);
  }

  /**
   * 读取插件自己的运行时状态。
   * @param pluginId 插件 ID
   * @param params 查询参数
   * @returns 状态值；不存在时返回 null
   */
  private getState(pluginId: string, params: JsonObject): JsonValue {
    const key = this.requireString(params, 'key');
    return this.stateService.get(pluginId, key);
  }

  /**
   * 写入插件自己的运行时状态。
   * @param pluginId 插件 ID
   * @param params 写入参数
   * @returns 写入后的状态值
   */
  private setState(pluginId: string, params: JsonObject): JsonValue {
    const key = this.requireString(params, 'key');
    if (!Object.prototype.hasOwnProperty.call(params, 'value')) {
      throw new BadRequestException('state.set 缺少 value');
    }

    return this.stateService.set(pluginId, key, params.value as JsonValue);
  }

  /**
   * 读取当前用户摘要。
   * @param context 插件调用上下文
   * @returns 用户摘要
   */
  private async getUser(context: PluginCallContext): Promise<JsonValue> {
    const userId = this.requireUserId(context, 'user.get');
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  /**
   * 读取当前对话的消息列表。
   * @param context 插件调用上下文
   * @returns 对话消息摘要列表
   */
  private async listConversationMessages(
    context: PluginCallContext,
  ): Promise<JsonValue> {
    const conversationId = this.requireConversationId(
      context,
      'conversation.messages.list',
    );
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        role: true,
        content: true,
        partsJson: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return toJsonValue(
      messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        parts: deserializeMessageParts(message.partsJson),
        status: message.status,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
      })),
    );
  }

  /**
   * 执行一次统一的结构化 LLM 生成。
   * @param params 已解析的生成参数
   * @returns 统一的生成结果
   */
  private async generateCore(
    params: PluginLlmGenerateParams,
  ): Promise<PluginLlmGenerateResult> {
    const executed = await this.aiModelExecution.generateText({
      ...(params.providerId ? { providerId: params.providerId } : {}),
      ...(params.modelId ? { modelId: params.modelId } : {}),
      ...(params.system ? { system: params.system } : {}),
      ...(params.variant ? { variant: params.variant } : {}),
      ...(params.providerOptions ? { providerOptions: params.providerOptions } : {}),
      ...(params.headers ? { headers: params.headers } : {}),
      ...(typeof params.maxOutputTokens === 'number'
        ? { maxOutputTokens: params.maxOutputTokens }
        : {}),
      sdkMessages: params.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })) as never,
    });

    return {
      providerId: String(executed.modelConfig.providerId),
      modelId: String(executed.modelConfig.id),
      text: executed.result.text,
      message: {
        role: 'assistant',
        content: executed.result.text,
      },
      ...(executed.result.finishReason !== undefined
        ? { finishReason: String(executed.result.finishReason) }
        : {}),
      ...(executed.result.usage !== undefined
        ? { usage: toJsonValue(executed.result.usage as never) }
        : {}),
    };
  }

  /**
   * 读取当前上下文对应的会话记录，并在有 userId 时校验所有权。
   * @param context 插件调用上下文
   * @param method 当前 Host API 方法名
   * @returns 当前会话记录
   */
  private async requireConversationRecord(
    context: PluginCallContext,
    method: string,
  ): Promise<{
    id: string;
    title: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const conversationId = this.requireConversationId(context, method);
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        id: true,
        title: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }
    if (context.userId && conversation.userId !== context.userId) {
      throw new ForbiddenException(`${method} 无权访问当前会话`);
    }

    return conversation;
  }

  /**
   * 查找一个 provider 安全摘要；不存在时抛错。
   * @param providerId provider ID
   * @returns provider 摘要
   */
  private findProviderSummaryOrThrow(providerId: string): PluginProviderSummary {
    const provider = this.aiManagementService
      .listProviders()
      .find((item) => item.id === providerId);
    if (provider) {
      return this.toProviderSummary(provider);
    }

    this.aiManagementService.getProvider(providerId);
    throw new NotFoundException(`Provider "${providerId}" not found`);
  }

  /**
   * 将管理端 provider 摘要裁剪成插件可见字段。
   * @param provider 原始 provider 摘要
   * @returns 安全 provider 摘要
   */
  private toProviderSummary(
    provider: {
      id: string;
      name: string;
      mode: 'official' | 'compatible';
      driver: string;
      defaultModel?: string;
      available: boolean;
    },
  ): PluginProviderSummary {
    return {
      id: provider.id,
      name: provider.name,
      mode: provider.mode,
      driver: provider.driver,
      defaultModel: provider.defaultModel,
      available: provider.available,
    };
  }

  /**
   * 将模型配置裁剪成插件可见字段。
   * @param model 原始模型配置
   * @returns 安全模型摘要
   */
  private toProviderModelSummary(
    model: {
      id: string;
      providerId: string;
      name: string;
      capabilities: PluginProviderModelSummary['capabilities'];
      status?: PluginProviderModelSummary['status'];
    },
  ): PluginProviderModelSummary {
    return {
      id: model.id,
      providerId: model.providerId,
      name: model.name,
      capabilities: model.capabilities,
      status: model.status,
    };
  }

  /**
   * 从上下文中读取 userId。
   * @param context 插件调用上下文
   * @param method 当前 Host API 方法名
   * @returns userId
   */
  private requireUserId(context: PluginCallContext, method: string): string {
    if (!context.userId) {
      throw new BadRequestException(`${method} 需要 userId 上下文`);
    }

    return context.userId;
  }

  /**
   * 从上下文中读取 conversationId。
   * @param context 插件调用上下文
   * @param method 当前 Host API 方法名
   * @returns conversationId
   */
  private requireConversationId(
    context: PluginCallContext,
    method: string,
  ): string {
    if (!context.conversationId) {
      throw new BadRequestException(`${method} 需要 conversationId 上下文`);
    }

    return context.conversationId;
  }

  /**
   * 从参数中读取统一结构化消息数组。
   * @param params 参数对象
   * @returns 已校验的消息数组
   */
  private readLlmMessages(params: JsonObject): PluginLlmMessage[] {
    const value = params.messages;
    if (!Array.isArray(value)) {
      throw new BadRequestException('messages 必须是数组');
    }

    return value.map((item, index) => this.readLlmMessage(item, index));
  }

  /**
   * 读取单条结构化消息。
   * @param value 原始消息值
   * @param index 当前消息索引
   * @returns 已校验的消息
   */
  private readLlmMessage(value: JsonValue, index: number): PluginLlmMessage {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`messages[${index}] 必须是对象`);
    }

    const message = value as JsonObject;
    if (
      message.role !== 'user'
      && message.role !== 'assistant'
      && message.role !== 'system'
      && message.role !== 'tool'
    ) {
      throw new BadRequestException(
        `messages[${index}].role 必须是 user/assistant/system/tool`,
      );
    }

    return {
      role: message.role,
      content: this.readLlmMessageContent(
        message.content as JsonValue,
        `messages[${index}].content`,
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
  ): string | ChatMessagePart[] {
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
   * 读取单个聊天消息 part。
   * @param value 原始 part
   * @param label 当前字段标签
   * @returns 已校验的消息 part
   */
  private readChatMessagePart(value: JsonValue, label: string): ChatMessagePart {
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
   * 从参数对象读取字符串字段。
   * @param params 参数对象
   * @param key 字段名
   * @returns 字段值；不存在时返回 null
   */
  private readString(params: JsonObject, key: string): string | null {
    const value = params[key];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`${key} 必须是字符串`);
    }

    return value;
  }

  /**
   * 从参数对象读取必填字符串字段。
   * @param params 参数对象
   * @param key 字段名
   * @returns 必填字符串值
   */
  private requireString(params: JsonObject, key: string): string {
    const value = this.readString(params, key);
    if (value === null) {
      throw new BadRequestException(`${key} 必填`);
    }

    return value;
  }

  /**
   * 从参数对象读取数字字段。
   * @param params 参数对象
   * @param key 字段名
   * @returns 字段值；不存在时返回 null
   */
  private readNumber(params: JsonObject, key: string): number | null {
    const value = params[key];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'number') {
      throw new BadRequestException(`${key} 必须是数字`);
    }

    return value;
  }

  /**
   * 从参数对象读取 JSON 对象字段。
   * @param params 参数对象
   * @param key 字段名
   * @returns 字段值；不存在时返回 null
   */
  private readObject(params: JsonObject, key: string): JsonObject | null {
    const value = params[key];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`${key} 必须是对象`);
    }

    return value as JsonObject;
  }

  /**
   * 从参数对象读取字符串字典字段。
   * @param params 参数对象
   * @param key 字段名
   * @returns 字段值；不存在时返回 null
   */
  private readStringRecord(
    params: JsonObject,
    key: string,
  ): Record<string, string> | null {
    const value = this.readObject(params, key);
    if (!value) {
      return null;
    }

    const record: Record<string, string> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (typeof entryValue !== 'string') {
        throw new BadRequestException(`${key}.${entryKey} 必须是字符串`);
      }
      record[entryKey] = entryValue;
    }

    return record;
  }
}
