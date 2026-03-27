import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ActionConfig, AutomationInfo, TriggerConfig } from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';

interface CronEntry {
  automationId: string;
  timer: ReturnType<typeof setInterval>;
}

@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private cronJobs = new Map<string, CronEntry>();

  constructor(
    private prisma: PrismaService,
    private pluginRuntime: PluginRuntimeService,
  ) {}

  async onModuleInit() {
    await this.loadCronJobs();
  }

  onModuleDestroy() {
    for (const [, entry] of this.cronJobs) {
      clearInterval(entry.timer);
    }
    this.cronJobs.clear();
  }

  // --- CRUD ---

  async create(
    userId: string,
    name: string,
    trigger: TriggerConfig,
    actions: ActionConfig[],
  ): Promise<AutomationInfo> {
    const automation = await this.prisma.automation.create({
      data: {
        userId,
        name,
        trigger: JSON.stringify(trigger),
        actions: JSON.stringify(actions),
      },
    });

    if (trigger.type === 'cron' && trigger.cron) {
      this.scheduleCron(automation.id, trigger.cron);
    }

    this.logger.log(`自动化 "${name}" 已创建 (${trigger.type})`);
    return this.toAutomationInfo(automation);
  }

  async findAllByUser(userId: string): Promise<AutomationInfo[]> {
    const automations = await this.prisma.automation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        logs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    return automations.map((a) => ({
      ...this.toAutomationInfo(a),
      logs: a.logs.map((log) => ({
        id: log.id,
        status: log.status,
        result: log.result,
        createdAt: log.createdAt.toISOString(),
      })),
    }));
  }

  async findById(id: string, userId?: string): Promise<AutomationInfo | null> {
    const automation = userId
      ? await this.prisma.automation.findFirst({
          where: { id, userId },
          include: {
            logs: { orderBy: { createdAt: 'desc' }, take: 20 },
          },
        })
      : await this.prisma.automation.findUnique({
          where: { id },
          include: {
            logs: { orderBy: { createdAt: 'desc' }, take: 20 },
          },
        });
    if (!automation) {
      return null;
    }
    return {
      ...this.toAutomationInfo(automation),
      logs: automation.logs.map((log) => ({
        id: log.id,
        status: log.status,
        result: log.result,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  async toggle(id: string, userId: string) {
    const automation = await this.prisma.automation.findFirst({
      where: { id, userId },
    });
    if (!automation) {
      return null;
    }

    const updated = await this.prisma.automation.update({
      where: { id },
      data: { enabled: !automation.enabled },
    });

    const trigger = JSON.parse(automation.trigger) as TriggerConfig;
    if (trigger.type === 'cron') {
      if (updated.enabled && trigger.cron) {
        this.scheduleCron(id, trigger.cron);
      } else {
        this.unscheduleCron(id);
      }
    }

    return updated;
  }

  async remove(id: string, userId: string) {
    this.unscheduleCron(id);
    return this.prisma.automation.deleteMany({ where: { id, userId } });
  }

  // --- 执行 ---

  async executeAutomation(automationId: string, userId?: string) {
    const automationRecord = userId
      ? await this.prisma.automation.findFirst({
          where: { id: automationId, userId },
        })
      : await this.prisma.automation.findUnique({
          where: { id: automationId },
        });
    if (!automationRecord || !automationRecord.enabled) {
      return null;
    }
    const automation = this.toAutomationInfo(automationRecord);

    const results: JsonValue[] = [];
    let status = 'success';

    for (const action of automation.actions) {
      try {
        if (action.type === 'device_command' && action.plugin && action.capability) {
          const result = await this.pluginRuntime.executeTool({
            pluginId: action.plugin,
            toolName: action.capability,
            params: action.params || {},
            context: {
              source: 'automation',
              userId: automationRecord.userId,
              automationId,
            },
          });
          results.push({
            action: action.type,
            plugin: action.plugin,
            capability: action.capability,
            result,
          });
        }
        // ai_message 类型由注入 ChatService 处理，此处留空
      } catch (err) {
        status = 'error';
        results.push({
          action: action.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 记录执行日志
    await this.prisma.automationLog.create({
      data: {
        automationId,
        status,
        result: JSON.stringify(results),
      },
    });

    // 更新 lastRunAt
    await this.prisma.automation.update({
      where: { id: automationId },
      data: { lastRunAt: new Date() },
    });

    this.logger.log(
      `自动化 "${automationRecord.name}" 已执行：${status}`,
    );

    return { status, results };
  }

  // --- Cron 计划 ---

  private async loadCronJobs() {
    const automations = await this.prisma.automation.findMany({
      where: { enabled: true },
    });

    let scheduled = 0;
    for (const a of automations) {
      const trigger = JSON.parse(a.trigger) as TriggerConfig;
      if (trigger.type === 'cron' && trigger.cron) {
        this.scheduleCron(a.id, trigger.cron);
        scheduled++;
      }
    }

    if (scheduled > 0) {
      this.logger.log(`已加载 ${scheduled} 个 cron 自动化`);
    }
  }

  private scheduleCron(automationId: string, cronExpr: string) {
    this.unscheduleCron(automationId);

    // 解析简单的时间间隔表达式：支持 "every Xm"、"every Xh" 或原始毫秒值
    const intervalMs = this.parseCronInterval(cronExpr);
    if (!intervalMs) {
      this.logger.warn(`自动化 ${automationId} 的 cron 表达式无效：${cronExpr}`);
      return;
    }

    const timer = setInterval(() => {
      this.executeAutomation(automationId).catch((err) => {
        this.logger.error(`自动化 ${automationId} 的 cron 执行失败：${err.message}`);
      });
    }, intervalMs);

    this.cronJobs.set(automationId, { automationId, timer });
    this.logger.log(`已为自动化 ${automationId} 计划 cron：每 ${cronExpr}`);
  }

  private unscheduleCron(automationId: string) {
    const entry = this.cronJobs.get(automationId);
    if (entry) {
      clearInterval(entry.timer);
      this.cronJobs.delete(automationId);
    }
  }

  /**
   * 解析简单的时间间隔表达式：
   * - "30s" → 30000
   * - "5m" → 300000
   * - "1h" → 3600000
   * - "30m" → 1800000
   * 无效则返回 null。最小值 10 秒。
   */
  private parseCronInterval(expr: string): number | null {
    const match = expr.trim().match(/^(\d+)\s*(s|m|h)$/i)
    if (!match) {
      return null
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    let ms: number;
    switch (unit) {
      case 's':
        ms = value * 1000;
        break;
      case 'm':
        ms = value * 60 * 1000;
        break;
      case 'h':
        ms = value * 60 * 60 * 1000;
        break;
      default:
        return null
    }

    // 最小 10 秒以防止滥用
    return ms >= 10000 ? ms : null;
  }

  /** 获取特定自动化的日志 */
  async getLogs(automationId: string, limit = 20) {
    return this.prisma.automationLog.findMany({
      where: { automationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * 将数据库记录转换为共享自动化摘要。
   * @param automation Prisma 自动化记录
   * @returns 面向 API/插件的自动化摘要
   */
  private toAutomationInfo(automation: {
    id: string;
    name: string;
    trigger: string;
    actions: string;
    enabled: boolean;
    lastRunAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): AutomationInfo {
    return {
      id: automation.id,
      name: automation.name,
      trigger: JSON.parse(automation.trigger) as TriggerConfig,
      actions: JSON.parse(automation.actions) as ActionConfig[],
      enabled: automation.enabled,
      lastRunAt: automation.lastRunAt?.toISOString() ?? null,
      createdAt: automation.createdAt.toISOString(),
      updatedAt: automation.updatedAt.toISOString(),
    };
  }
}
