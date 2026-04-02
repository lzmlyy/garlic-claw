import type {
  PluginEventLevel,
  PluginEventListResult,
  JsonObject,
  JsonValue,
  PluginConfigSchema,
  PluginConfigSnapshot,
  PluginHealthSnapshot,
  PluginManifest,
  PluginScopeSettings,
  PluginSelfInfo,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPluginEventFindManyInput,
  buildPluginEventListResult,
  buildPluginHealthSnapshot,
  createPluginEvent,
  normalizePluginEventOptions,
  resolvePluginEventCursor,
  type ListPluginEventOptions,
} from './plugin-event.helpers';
import { PluginEventWriteService } from './plugin-event-write.service';
import {
  buildPluginGovernanceSnapshot,
} from './plugin-governance.helpers';
import {
  parsePluginScope,
} from './plugin-persistence.helpers';
import { preparePluginConfigUpdate } from './plugin-config-write.helpers';
import { preparePluginScopeUpdate } from './plugin-scope-write.helpers';
import {
  buildPluginHeartbeatMutation,
  buildPluginLifecycleEvent,
  buildPluginOfflineMutation,
  buildPluginOnlineMutation,
} from './plugin-lifecycle.helpers';
import {
  buildPluginRegistrationEvent,
  buildPluginRegistrationUpsertData,
} from './plugin-register.helpers';
import {
  buildPluginConfigSnapshot,
  buildPluginSelfInfo,
  buildResolvedPluginConfig,
} from './plugin-record-view.helpers';
import { PluginStorageService } from './plugin-storage.service';

/**
 * 运行时可直接消费的插件治理快照。
 */
export interface PluginGovernanceSnapshot {
  configSchema: PluginConfigSchema | null;
  resolvedConfig: JsonObject;
  scope: PluginScopeSettings;
}

/**
 * 记录插件事件时使用的输入参数。
 */
interface PluginEventInput {
  /** 事件类型。 */
  type: string;
  /** 人类可读消息。 */
  message: string;
  /** 可选附加上下文。 */
  metadata?: JsonObject;
}

/**
 * 插件持久化服务。
 *
 * NOTE: 当前保持单文件，因为 plugin 主记录、storage、event、config、scope 写路径仍共享同一个 Prisma 持久化边界；
 * 已持续把视图组装和规则样板外提到 helper，但暂不把同一批治理写路径拆成多 provider 以免把事务语义打散。
 *
 * 输入:
 * - 插件 manifest 与在线状态
 * - 插件配置与作用域更新请求
 *
 * 输出:
 * - 插件列表
 * - 持久化后的配置/作用域快照
 *
 * 预期行为:
 * - 统一持久化插件 manifest 邻接元数据
 * - 为 runtime 暴露可缓存的治理快照
 * - 校验插件配置与作用域规则
 */
@Injectable()
export class PluginService {
  private readonly logger = new Logger(PluginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pluginEventWriteService: PluginEventWriteService,
    private readonly pluginStorageService: PluginStorageService,
  ) {}

  /**
   * 注册或刷新一个插件，并返回治理快照。
   * @param name 插件 ID
   * @param deviceType 设备/运行设备类型
   * @param manifest 完整插件清单
   * @returns 可供 runtime 缓存的治理快照
   */
  async registerPlugin(
    name: string,
    deviceType: string,
    manifest: PluginManifest,
  ): Promise<PluginGovernanceSnapshot> {
    const existing = await this.prisma.plugin.findUnique({
      where: { name },
      select: {
        id: true,
      },
    });
    const now = new Date();
    const plugin = await this.prisma.plugin.upsert({
      where: { name },
      ...buildPluginRegistrationUpsertData({
        name,
        deviceType,
        manifest,
        now,
      }),
    });
    const registrationEvent = buildPluginRegistrationEvent({
      existing: Boolean(existing),
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: plugin.id,
      type: registrationEvent.type,
      level: 'info',
      message: registrationEvent.message,
    });
    if (existing) {
      this.logger.log(`插件 "${name}" 已重新接入运行时，包含 ${(manifest.tools ?? []).length} 个能力`);
    } else {
      this.logger.log(`插件 "${name}" 已注册，包含 ${(manifest.tools ?? []).length} 个能力`);
    }
    return buildPluginGovernanceSnapshot({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  /**
   * 读取插件当前的治理快照。
   * @param name 插件 ID
   * @returns 配置 schema、解析后的配置值和作用域规则
   */
  async getGovernanceSnapshot(name: string): Promise<PluginGovernanceSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginGovernanceSnapshot({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  /**
   * 将插件标记为在线。
   * @param name 插件 ID
   * @returns 更新后的数据库记录
   */
  async setOnline(name: string) {
    const now = new Date();
    const updated = await this.prisma.plugin.update({
      where: { name },
      data: buildPluginOnlineMutation(now),
    });
    const lifecycleEvent = buildPluginLifecycleEvent({
      status: 'online',
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: updated.id,
      type: lifecycleEvent.type,
      level: lifecycleEvent.level,
      message: lifecycleEvent.message,
    });
    return updated;
  }

  /**
   * 将插件标记为离线。
   * @param name 插件 ID
   * @returns 更新后的数据库记录
   */
  async setOffline(name: string) {
    const updated = await this.prisma.plugin.update({
      where: { name },
      data: buildPluginOfflineMutation(),
    });
    const lifecycleEvent = buildPluginLifecycleEvent({
      status: 'offline',
    });
    await createPluginEvent({
      prisma: this.prisma,
      pluginId: updated.id,
      type: lifecycleEvent.type,
      level: lifecycleEvent.level,
      message: lifecycleEvent.message,
    });
    return updated;
  }

  /**
   * 刷新插件最近心跳时间。
   * @param name 插件 ID
   * @returns 更新后的数据库记录
   */
  async heartbeat(name: string) {
    const now = new Date();
    return this.prisma.plugin.update({
      where: { name },
      data: buildPluginHeartbeatMutation(now),
    });
  }

  /**
   * 读取所有插件记录。
   * @returns 按名称排序的插件列表
   */
  async findAll() {
    return this.prisma.plugin.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * 读取所有在线插件记录。
   * @returns 在线插件列表
   */
  async findOnline() {
    return this.prisma.plugin.findMany({
      where: { status: 'online' },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * 通过名称读取插件。
   * @param name 插件 ID
   * @returns 数据库记录；不存在时返回 null
   */
  async findByName(name: string) {
    return this.prisma.plugin.findUnique({ where: { name } });
  }

  /**
   * 删除一条插件记录。
   * @param name 插件 ID
   * @returns 删除结果
   */
  async deletePlugin(name: string) {
    const plugin = await this.findByNameOrThrow(name);
    if (plugin.status === 'online') {
      throw new BadRequestException(`插件 ${name} 当前在线，不能直接删除`);
    }

    return this.prisma.plugin.delete({ where: { name } });
  }

  /**
   * 读取插件配置快照。
   * @param name 插件 ID
   * @returns schema 与解析后的配置值
   */
  async getPluginConfig(name: string): Promise<PluginConfigSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginConfigSnapshot({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  /**
   * 读取插件解析后的配置值。
   * @param name 插件 ID
   * @returns 默认值与持久化值合并后的结果
   */
  async getResolvedConfig(name: string): Promise<JsonObject> {
    const plugin = await this.findByNameOrThrow(name);
    return buildResolvedPluginConfig({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  /**
   * 读取插件持久化存储中的单个值。
   * @param name 插件 ID
   * @param key 存储键
   * @returns JSON 值；不存在时返回 null
   */
  async getPluginStorage(name: string, key: string): Promise<JsonValue | null> {
    return this.pluginStorageService.getPluginStorage(name, key);
  }

  /**
   * 写入插件持久化存储。
   * @param name 插件 ID
   * @param key 存储键
   * @param value 待写入的 JSON 值
   * @returns 原样返回写入值
   */
  async setPluginStorage(
    name: string,
    key: string,
    value: JsonValue,
  ): Promise<JsonValue> {
    return this.pluginStorageService.setPluginStorage(name, key, value);
  }

  /**
   * 删除一条插件持久化存储记录。
   * @param name 插件 ID
   * @param key 存储键
   * @returns 是否删除成功
   */
  async deletePluginStorage(name: string, key: string): Promise<boolean> {
    return this.pluginStorageService.deletePluginStorage(name, key);
  }

  /**
   * 列出插件持久化存储。
   * @param name 插件 ID
   * @param prefix 可选键前缀
   * @returns 键值对列表
   */
  async listPluginStorage(
    name: string,
    prefix?: string,
  ): Promise<Array<{ key: string; value: JsonValue }>> {
    return this.pluginStorageService.listPluginStorage(name, prefix);
  }

  /**
   * 读取插件自身摘要。
   * @param name 插件 ID
   * @returns 当前插件的自省信息
   */
  async getPluginSelfInfo(name: string): Promise<PluginSelfInfo> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginSelfInfo({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  /**
   * 更新插件配置。
   * @param name 插件 ID
   * @param values 待保存的配置值
   * @returns 保存后的配置快照
   */
  async updatePluginConfig(
    name: string,
    values: JsonObject,
  ): Promise<PluginConfigSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    const prepared = preparePluginConfigUpdate({
      name,
      plugin,
      values,
      onWarn: (message) => this.logger.warn(message),
    });
    await this.prisma.plugin.update({
      where: { name },
      data: {
        config: prepared.persistedConfigJson,
      },
    });
    return prepared.snapshot;
  }

  /**
   * 读取插件作用域规则。
   * @param name 插件 ID
   * @returns 作用域设置
   */
  async getPluginScope(name: string): Promise<PluginScopeSettings> {
    const plugin = await this.findByNameOrThrow(name);
    return parsePluginScope({
      plugin,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  /**
   * 更新插件作用域规则。
   * @param name 插件 ID
   * @param scope 新的默认启用与会话级覆盖
   * @returns 归一化后的作用域设置
   */
  async updatePluginScope(
    name: string,
    scope: PluginScopeSettings,
  ): Promise<PluginScopeSettings> {
    const plugin = await this.findByNameOrThrow(name);
    const prepared = preparePluginScopeUpdate({
      plugin,
      scope,
    });

    await this.prisma.plugin.update({
      where: { name },
      data: prepared.updateData,
    });
    return prepared.normalizedScope;
  }

  /**
   * 读取插件健康快照。
   * @param name 插件 ID
   * @returns 健康摘要
   */
  async getPluginHealth(name: string): Promise<PluginHealthSnapshot> {
    const plugin = await this.findByNameOrThrow(name);
    return buildPluginHealthSnapshot({
      plugin,
    });
  }

  /**
   * 读取插件事件日志。
   * @param name 插件 ID
   * @param limit 返回数量上限
   * @returns 最近事件列表
   */
  async listPluginEvents(
    name: string,
    options: ListPluginEventOptions = {},
  ): Promise<PluginEventListResult> {
    const plugin = await this.findByNameOrThrow(name);
    const normalized = normalizePluginEventOptions(options);
    const cursorEvent = normalized.cursor
      ? await resolvePluginEventCursor({
        prisma: this.prisma,
        pluginId: plugin.id,
        cursor: normalized.cursor,
      })
      : null;
    const events = await this.prisma.pluginEvent.findMany({
      ...buildPluginEventFindManyInput({
        pluginId: plugin.id,
        options: normalized,
        cursorEvent,
      }),
    });
    return buildPluginEventListResult({
      events,
      limit: normalized.limit,
      onWarn: (message) => this.logger.warn(message),
    });
  }

  /**
   * 记录一条插件主动写入的事件日志。
   * @param name 插件 ID
   * @param input 事件输入
   * @returns 无返回值
   */
  async recordPluginEvent(
    name: string,
    input: PluginEventInput & {
      level: PluginEventLevel;
    },
  ): Promise<void> {
    await this.pluginEventWriteService.recordPluginEvent(name, input);
  }

  /**
   * 记录插件成功事件并更新健康快照。
   * @param name 插件 ID
   * @param input 事件输入
   * @returns 无返回值
   */
  async recordPluginSuccess(
    name: string,
    input: PluginEventInput & {
      checked?: boolean;
      persistEvent?: boolean;
    },
  ): Promise<void> {
    await this.pluginEventWriteService.recordPluginSuccess(name, input);
  }

  /**
   * 记录插件失败事件并更新健康快照。
   * @param name 插件 ID
   * @param input 事件输入
   * @returns 无返回值
   */
  async recordPluginFailure(
    name: string,
    input: PluginEventInput & {
      checked?: boolean;
    },
  ): Promise<void> {
    await this.pluginEventWriteService.recordPluginFailure(name, input);
  }

  /**
   * 记录一次插件健康检查结果。
   * @param name 插件 ID
   * @param input 健康检查结果
   * @returns 无返回值
   */
  async recordHealthCheck(
    name: string,
    input: {
      ok: boolean;
      message: string;
      metadata?: JsonObject;
    },
  ): Promise<void> {
    await this.pluginEventWriteService.recordHealthCheck(name, input);
  }

  /**
   * 读取一条插件记录；不存在时抛出 404。
   * @param name 插件 ID
   * @returns 原始数据库记录
   */
  private async findByNameOrThrow(name: string) {
    const plugin = await this.findByName(name);
    if (!plugin) {
      throw new NotFoundException(`Plugin not found: ${name}`);
    }

    return plugin;
  }
}
