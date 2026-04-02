import type {
  PluginCronTickPayload,
} from '@garlic-claw/shared';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { toJsonValue } from '../common/utils/json-value';
import { PrismaService } from '../prisma/prisma.service';
import {
  normalizePluginCronJobRecord,
  parsePluginCronInterval,
  serializePluginCronJob,
  type PluginCronJobRecord,
} from './plugin-cron.helpers';
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

@Injectable()
export class PluginCronSchedulerService {
  private readonly logger = new Logger(PluginCronSchedulerService.name);
  private readonly jobs = new Map<string, ScheduledCronEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pluginService: PluginService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleDestroy(): void {
    for (const entry of this.jobs.values()) {
      clearInterval(entry.timer);
    }
    this.jobs.clear();
  }

  async reschedulePluginJobs(pluginId: string): Promise<void> {
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
      this.syncJob(normalizePluginCronJobRecord(record));
    }
  }

  syncJob(job: PluginCronJobRecord): void {
    if (job.enabled) {
      this.scheduleJob(job);
      return;
    }

    this.unscheduleJob(job.id);
  }

  unschedulePlugin(pluginId: string): void {
    for (const [jobId, entry] of this.jobs.entries()) {
      if (entry.pluginId === pluginId) {
        this.unscheduleJob(jobId);
      }
    }
  }

  unscheduleJob(jobId: string): void {
    const entry = this.jobs.get(jobId);
    if (!entry) {
      return;
    }

    clearInterval(entry.timer);
    this.jobs.delete(jobId);
  }

  private scheduleJob(job: PluginCronJobRecord): void {
    this.unscheduleJob(job.id);

    const intervalMs = parsePluginCronInterval(job.cron);
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

  private async executeJob(entry: ScheduledCronEntry): Promise<void> {
    const now = new Date();
    const payload: PluginCronTickPayload = {
      job: serializePluginCronJob(entry.job, (message) => this.logger.warn(message)),
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
      entry.job = normalizePluginCronJobRecord(updated);
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
      entry.job = normalizePluginCronJobRecord(updated);
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
}
