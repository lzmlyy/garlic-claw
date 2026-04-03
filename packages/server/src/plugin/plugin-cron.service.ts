import type {
  PluginCronDescriptor,
  PluginCronJobSummary,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import type { JsonValue } from '../common/types/json-value';
import { PrismaService } from '../prisma/prisma.service';
import {
  normalizePluginCronJobRecord,
  parsePluginCronInterval,
  serializePluginCronJob,
} from './plugin-cron.helpers';
import { PluginCronSchedulerService } from './plugin-cron-scheduler.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: PluginCronSchedulerService,
  ) {}

  /**
   * 模块销毁时清理全部定时器。
   * @returns 无返回值
   */
  onModuleDestroy(): void {
    this.scheduler.onModuleDestroy();
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
    await this.scheduler.reschedulePluginJobs(pluginId);
  }

  /**
   * 插件卸载时取消该插件的全部定时器。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  onPluginUnregistered(pluginId: string): void {
    this.scheduler.unschedulePlugin(pluginId);
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
    if (!parsePluginCronInterval(input.cron)) {
      throw new BadRequestException('cron.register 的 cron 表达式无效');
    }
    const mutation = buildPluginCronMutationData(input);

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
        source: 'host',
        ...mutation,
      },
      update: mutation,
    });

    const normalized = normalizePluginCronJobRecord(record);
    this.scheduler.syncJob(normalized);

    return serializePluginCronJob(normalized, (message) => this.logger.warn(message));
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

    return records.map((record) =>
      serializePluginCronJob(normalizePluginCronJobRecord(record), (message) => this.logger.warn(message)));
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

    const normalized = normalizePluginCronJobRecord(record);
    if (normalized.source !== 'host') {
      throw new BadRequestException('manifest cron 不能通过 cron.delete 删除');
    }

    this.scheduler.unscheduleJob(normalized.id);
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
    })).map((record) => normalizePluginCronJobRecord(record));
    const desiredNames = new Set(manifestCrons.map((cron) => cron.name));
    const removed = existing.filter((record) => !desiredNames.has(record.name));

    if (removed.length > 0) {
      for (const record of removed) {
        this.scheduler.unscheduleJob(record.id);
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
      const mutation = buildPluginCronMutationData(descriptor);
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
          source: 'manifest',
          ...mutation,
        },
        update: mutation,
      });
    }
  }

}

function buildPluginCronMutationData(input: {
  cron: string;
  description?: string;
  enabled?: boolean;
  data?: JsonValue;
}) {
  return {
    cron: input.cron,
    description: input.description ?? null,
    enabled: input.enabled ?? true,
    dataJson: input.data === undefined ? null : JSON.stringify(input.data),
  };
}
