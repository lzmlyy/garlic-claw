import type {
  PluginCronDescriptor,
  PluginCronJobSummary,
  PluginCronSource,
  PluginCronTickPayload,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { PrismaService } from '../prisma/prisma.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginService } from './plugin.service';

/**
 * 已计划的 cron job 条目。
 */
interface ScheduledCronEntry {
  /** 插件 ID。 */
  pluginId: string;
  /** 当前 job 快照。 */
  job: PluginCronJobRecord;
  /** 定时器句柄。 */
  timer: ReturnType<typeof setInterval>;
}

/**
 * plugin cron job 的最小记录形状。
 */
interface PluginCronJobRecord {
  id: string;
  pluginName: string;
  name: string;
  cron: string;
  description: string | null;
  source: string;
  enabled: boolean;
  dataJson: string | null;
  lastRunAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 运行时调度输入。
 */
interface PluginCronRegistrationInput {
  name: string;
  cron: string;
  description?: string;
  enabled?: boolean;
  data?: JsonValue;
}

/**
 * 插件 cron 调度服务。
 *
 * 输入:
 * - 插件注册/卸载事件
 * - 插件通过 Host API 注册、查询、删除 cron 的请求
 *
 * 输出:
 * - 持久化的 cron job 列表
 * - 按统一 Hook 语义触发的 `cron:tick`
 *
 * 预期行为:
 * - builtin / remote 共用同一套 cron 存储与调度语义
 * - cron 触发时继续走统一 runtime Hook 调用，而不是直连宿主对象
 * - 插件离线时及时取消调度，重连后恢复
 */
@Injectable()
export class PluginCronService implements OnModuleDestroy {
  private readonly logger = new Logger(PluginCronService.name);
  private readonly jobs = new Map<string, ScheduledCronEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pluginService: PluginService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * 模块销毁时清理全部定时器。
   * @returns 无返回值
   */
  onModuleDestroy(): void {
    for (const entry of this.jobs.values()) {
      clearInterval(entry.timer);
    }
    this.jobs.clear();
  }

  /**
   * 插件注册后同步 manifest cron，并恢复该插件的全部启用 job。
   * @param pluginId 插件 ID
   * @param manifestCrons manifest 中声明的 cron 列表
   * @returns 无返回值
   */
  async onPluginRegistered(
    pluginId: string,
    manifestCrons: PluginCronDescriptor[],
  ): Promise<void> {
    await this.syncManifestCrons(pluginId, manifestCrons);
    await this.schedulePluginJobs(pluginId);
  }

  /**
   * 插件卸载时取消该插件的全部定时器。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  onPluginUnregistered(pluginId: string): void {
    this.unschedulePlugin(pluginId);
  }

  /**
   * 注册或更新一个插件私有 host cron job。
   * @param pluginId 插件 ID
   * @param input cron 描述
   * @returns 持久化后的 job 摘要
   */
  async registerCron(
    pluginId: string,
    input: PluginCronRegistrationInput,
  ): Promise<PluginCronJobSummary> {
    this.assertCronExpression(input.cron, 'cron.register');

    const record = await this.prisma.pluginCronJob.upsert({
      where: {
        pluginName_name_source: {
          pluginName: pluginId,
          name: input.name,
          source: 'host',
        },
      },
      create: {
        pluginName: pluginId,
        name: input.name,
        cron: input.cron,
        description: input.description ?? null,
        source: 'host',
        enabled: input.enabled ?? true,
        dataJson: input.data === undefined ? null : JSON.stringify(input.data),
      },
      update: {
        cron: input.cron,
        description: input.description ?? null,
        enabled: input.enabled ?? true,
        dataJson: input.data === undefined ? null : JSON.stringify(input.data),
      },
    });

    const normalized = this.normalizeRecord(record);
    if (normalized.enabled) {
      this.scheduleJob(normalized);
    } else {
      this.unscheduleJob(normalized.id);
    }

    return this.serializeJob(normalized);
  }

  /**
   * 列出指定插件的全部 cron job。
   * @param pluginId 插件 ID
   * @returns job 摘要列表
   */
  async listCronJobs(pluginId: string): Promise<PluginCronJobSummary[]> {
    const records = await this.prisma.pluginCronJob.findMany({
      where: {
        pluginName: pluginId,
      },
      orderBy: [
        {
          source: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });

    return records.map((record) => this.serializeJob(this.normalizeRecord(record)));
  }

  /**
   * 删除一个 host 来源的 cron job。
   * @param pluginId 插件 ID
   * @param jobId job ID
   * @returns 是否删除成功
   */
  async deleteCron(pluginId: string, jobId: string): Promise<boolean> {
    const record = await this.prisma.pluginCronJob.findFirst({
      where: {
        id: jobId,
        pluginName: pluginId,
      },
    });
    if (!record) {
      return false;
    }

    const normalized = this.normalizeRecord(record);
    if (normalized.source !== 'host') {
      throw new BadRequestException('manifest cron 不能通过 cron.delete 删除');
    }

    this.unscheduleJob(normalized.id);
    await this.prisma.pluginCronJob.delete({
      where: {
        id: jobId,
      },
    });
    return true;
  }

  /**
   * 将 manifest 声明与持久化状态同步。
   * @param pluginId 插件 ID
   * @param manifestCrons manifest 中声明的 cron 列表
   * @returns 无返回值
   */
  private async syncManifestCrons(
    pluginId: string,
    manifestCrons: PluginCronDescriptor[],
  ): Promise<void> {
    const existing = (await this.prisma.pluginCronJob.findMany({
      where: {
        pluginName: pluginId,
        source: 'manifest',
      },
    })).map((record) => this.normalizeRecord(record));
    const desiredNames = new Set(manifestCrons.map((cron) => cron.name));
    const removed = existing.filter((record) => !desiredNames.has(record.name));

    if (removed.length > 0) {
      for (const record of removed) {
        this.unscheduleJob(record.id);
      }
      await this.prisma.pluginCronJob.deleteMany({
        where: {
          pluginName: pluginId,
          source: 'manifest',
          name: {
            in: removed.map((record) => record.name),
          },
        },
      });
    }

    for (const descriptor of manifestCrons) {
      await this.prisma.pluginCronJob.upsert({
        where: {
          pluginName_name_source: {
            pluginName: pluginId,
            name: descriptor.name,
            source: 'manifest',
          },
        },
        create: {
          pluginName: pluginId,
          name: descriptor.name,
          cron: descriptor.cron,
          description: descriptor.description ?? null,
          source: 'manifest',
          enabled: descriptor.enabled ?? true,
          dataJson: descriptor.data === undefined
            ? null
            : JSON.stringify(descriptor.data),
        },
        update: {
          cron: descriptor.cron,
          description: descriptor.description ?? null,
          enabled: descriptor.enabled ?? true,
          dataJson: descriptor.data === undefined
            ? null
            : JSON.stringify(descriptor.data),
        },
      });
    }
  }

  /**
   * 为一个插件恢复全部启用的 cron job 调度。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  private async schedulePluginJobs(pluginId: string): Promise<void> {
    this.unschedulePlugin(pluginId);

    const records = await this.prisma.pluginCronJob.findMany({
      where: {
        pluginName: pluginId,
        enabled: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    for (const record of records) {
      this.scheduleJob(this.normalizeRecord(record));
    }
  }

  /**
   * 为单个 cron job 建立调度。
   * @param job job 记录
   * @returns 无返回值
   */
  private scheduleJob(job: PluginCronJobRecord): void {
    this.unscheduleJob(job.id);

    const intervalMs = this.parseCronInterval(job.cron);
    if (!intervalMs) {
      this.logger.warn(`插件 ${job.pluginName} 的 cron 表达式无效：${job.cron}`);
      return;
    }

    const entry: ScheduledCronEntry = {
      pluginId: job.pluginName,
      job,
      timer: setInterval(() => {
        const currentEntry = this.jobs.get(job.id);
        if (!currentEntry) {
          return;
        }

        void this.executeJob(currentEntry).catch((error: unknown) => {
          this.logger.error(
            `插件 ${job.pluginName} 的 cron ${job.name} 执行失败：${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }, intervalMs),
    };

    this.jobs.set(job.id, entry);
  }

  /**
   * 取消指定插件的全部调度。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  private unschedulePlugin(pluginId: string): void {
    for (const [jobId, entry] of this.jobs.entries()) {
      if (entry.pluginId === pluginId) {
        this.unscheduleJob(jobId);
      }
    }
  }

  /**
   * 取消单个 job 的调度。
   * @param jobId job ID
   * @returns 无返回值
   */
  private unscheduleJob(jobId: string): void {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return;
    }

    clearInterval(entry.timer);
    this.jobs.delete(jobId);
  }

  /**
   * 执行一次 cron tick。
   * @param entry 已调度的 job 条目
   * @returns 更新后的 job 记录
   */
  private async executeJob(entry: ScheduledCronEntry): Promise<void> {
    const now = new Date();
    const payload: PluginCronTickPayload = {
      job: this.serializeJob(entry.job),
      tickedAt: now.toISOString(),
    };

    try {
      await this.getRuntime().invokePluginHook({
        pluginId: entry.job.pluginName,
        hookName: 'cron:tick',
        context: {
          source: 'cron',
          cronJobId: entry.job.id,
          metadata: {
            cronName: entry.job.name,
            cronSource: entry.job.source,
          },
        },
        payload: toJsonValue(payload),
        recordFailure: false,
      });

      const updated = await this.prisma.pluginCronJob.update({
        where: {
          id: entry.job.id,
        },
        data: {
          lastRunAt: now,
          lastError: null,
          lastErrorAt: null,
        },
      });
      entry.job = this.normalizeRecord(updated);
      await this.pluginService.recordPluginSuccess(entry.job.pluginName, {
        type: 'cron:tick',
        message: `Cron job "${entry.job.name}" executed`,
        metadata: {
          jobId: entry.job.id,
          jobName: entry.job.name,
          source: entry.job.source,
        },
        persistEvent: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const updated = await this.prisma.pluginCronJob.update({
        where: {
          id: entry.job.id,
        },
        data: {
          lastRunAt: now,
          lastError: message,
          lastErrorAt: now,
        },
      });
      entry.job = this.normalizeRecord(updated);
      await this.pluginService.recordPluginFailure(entry.job.pluginName, {
        type: 'cron:error',
        message,
        metadata: {
          jobId: entry.job.id,
          jobName: entry.job.name,
          source: entry.job.source,
        },
      });
    }
  }

  /**
   * 从 ModuleRef 惰性读取 runtime，避免构造期循环依赖。
   * @returns 统一插件 runtime
   */
  private getRuntime(): PluginRuntimeService {
    return this.moduleRef.get(PluginRuntimeService, {
      strict: false,
    });
  }

  /**
   * 校验 host 注册使用的 cron 表达式是否合法。
   * @param cronExpr cron 表达式
   * @param method 当前方法名
   * @returns 无返回值；非法时抛错
   */
  private assertCronExpression(cronExpr: string, method: string): void {
    if (this.parseCronInterval(cronExpr)) {
      return;
    }

    throw new BadRequestException(`${method} 的 cron 表达式无效`);
  }

  /**
   * 将数据库记录收敛为内部强类型对象。
   * @param record 原始数据库记录
   * @returns 归一化后的 job 记录
   */
  private normalizeRecord(record: Record<string, unknown>): PluginCronJobRecord {
    return {
      id: String(record.id),
      pluginName: String(record.pluginName),
      name: String(record.name),
      cron: String(record.cron),
      description: typeof record.description === 'string' ? record.description : null,
      source: String(record.source),
      enabled: Boolean(record.enabled),
      dataJson: typeof record.dataJson === 'string' ? record.dataJson : null,
      lastRunAt: record.lastRunAt instanceof Date ? record.lastRunAt : null,
      lastError: typeof record.lastError === 'string' ? record.lastError : null,
      lastErrorAt: record.lastErrorAt instanceof Date ? record.lastErrorAt : null,
      createdAt: record.createdAt instanceof Date
        ? record.createdAt
        : new Date(),
      updatedAt: record.updatedAt instanceof Date
        ? record.updatedAt
        : new Date(),
    };
  }

  /**
   * 将内部记录序列化为共享 job 摘要。
   * @param record 内部 job 记录
   * @returns 面向外部的 job 摘要
   */
  private serializeJob(record: PluginCronJobRecord): PluginCronJobSummary {
    return {
      id: record.id,
      pluginId: record.pluginName,
      name: record.name,
      cron: record.cron,
      description: record.description ?? undefined,
      source: this.parseCronSource(record.source),
      enabled: record.enabled,
      data: this.parseData(record.dataJson),
      lastRunAt: record.lastRunAt?.toISOString() ?? null,
      lastError: record.lastError,
      lastErrorAt: record.lastErrorAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * 解析 job 附加数据。
   * @param raw 原始 JSON 字符串
   * @returns JSON 值；无值时返回 undefined
   */
  private parseData(raw: string | null): JsonValue | undefined {
    if (!raw) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return isJsonValue(parsed) ? parsed : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`插件 cron data JSON 无效，已回退为空值: ${message}`);
      return undefined;
    }
  }

  /**
   * 解析 cron 来源枚举。
   * @param raw 原始来源
   * @returns 归一化后的来源
   */
  private parseCronSource(raw: string): PluginCronSource {
    return raw === 'host' ? 'host' : 'manifest';
  }

  /**
   * 解析简单时间间隔表达式。
   * @param expr 原始表达式
   * @returns 间隔毫秒数；无效时返回 null
   */
  private parseCronInterval(expr: string): number | null {
    const match = expr.trim().match(/^(\d+)\s*(s|m|h)$/i);
    if (!match) {
      return null;
    }

    const value = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const factor = unit === 'h'
      ? 60 * 60 * 1000
      : unit === 'm'
        ? 60 * 1000
        : 1000;
    const interval = value * factor;

    return interval >= 10000 ? interval : null;
  }
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
    return value.every((entry) => isJsonValue(entry));
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}
