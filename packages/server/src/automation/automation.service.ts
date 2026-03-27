import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ActionConfig, TriggerConfig } from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import { PluginGateway } from '../plugin/plugin.gateway';
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
    private pluginGateway: PluginGateway,
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
  ) {
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
    return automation;
  }

  async findAllByUser(userId: string) {
    const automations = await this.prisma.automation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        logs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    return automations.map((a) => ({
      ...a,
      trigger: JSON.parse(a.trigger),
      actions: JSON.parse(a.actions),
    }));
  }

  async findById(id: string) {
    const automation = await this.prisma.automation.findUnique({
      where: { id },
      include: {
        logs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!automation) {
      return null
    }
    return {
      ...automation,
      trigger: JSON.parse(automation.trigger) as TriggerConfig,
      actions: JSON.parse(automation.actions) as ActionConfig[],
    }
  }

  async toggle(id: string, userId: string) {
    const automation = await this.prisma.automation.findFirst({
      where: { id, userId },
    })
    if (!automation) {
      return null
    }

    const updated = await this.prisma.automation.update({
      where: { id },
      data: { enabled: !automation.enabled },
    })

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

  async executeAutomation(automationId: string) {
    const automation = await this.findById(automationId)
    if (!automation || !automation.enabled) {
      return
    }

    const results: JsonValue[] = [];
    let status = 'success';

    for (const action of automation.actions) {
      try {
        if (action.type === 'device_command' && action.plugin && action.capability) {
          const result = await this.pluginGateway.executeCommand(
            action.plugin,
            action.capability,
            action.params || {},
          )
          results.push({ action: action.type, plugin: action.plugin, capability: action.capability, result })
        }
        // ai_message 类型由注入 ChatService 处理，此处留空
      } catch (err) {
        status = 'error';
        results.push({
          action: action.type,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // 记录执行日志
    await this.prisma.automationLog.create({
      data: {
        automationId,
        status,
        result: JSON.stringify(results),
      },
    })

    // 更新 lastRunAt
    await this.prisma.automation.update({
      where: { id: automationId },
      data: { lastRunAt: new Date() },
    })

    this.logger.log(
      `自动化 "${automation.name}" 已执行：${status}`,
    )

    return { status, results }
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
}
