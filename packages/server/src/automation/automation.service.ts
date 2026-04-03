import {
  Inject,
  Injectable,
  Logger,
  forwardRef,
  OnModuleDestroy,
} from '@nestjs/common';
import type {
  ActionConfig,
  AutomationActionTargetRef,
  AutomationEventDispatchInfo,
  AutomationInfo,
  TriggerConfig,
} from '@garlic-claw/shared';
import { ChatMessageService } from '../chat/chat-message.service';
import type { JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { PrismaService } from '../prisma/prisma.service';

interface CronEntry {
  automationId: string;
  timer: ReturnType<typeof setInterval>;
}

@Injectable()
export class AutomationService implements OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private readonly cronJobs = new Map<string, CronEntry>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly chatMessageService: ChatMessageService,
  ) {}

  async restoreCronJobsOnStartup() {
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

    return automations.map((a: (typeof automations)[number]) => ({
      ...this.toAutomationInfo(a),
      logs: a.logs.map((log: (typeof a.logs)[number]) => ({
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
      logs: automation.logs.map((log: (typeof automation.logs)[number]) => ({
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

  /**
   * 发出一个自动化事件，并执行当前用户下所有匹配该事件名的启用自动化。
   * @param event 事件名
   * @param userId 事件所属用户
   * @returns 命中的自动化 ID 摘要
   */
  async emitEvent(event: string, userId: string): Promise<AutomationEventDispatchInfo> {
    const automations = await this.prisma.automation.findMany({
      where: {
        userId,
        enabled: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    const matchedAutomationIds: string[] = [];

    for (const automation of automations) {
      const trigger = JSON.parse(automation.trigger) as TriggerConfig;
      if (trigger.type !== 'event' || trigger.event !== event) {
        continue;
      }

      matchedAutomationIds.push(automation.id);
      await this.executeAutomation(automation.id, userId);
    }

    return {
      event,
      matchedAutomationIds,
    };
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
    const hookContext = {
      source: 'automation' as const,
      userId: automationRecord.userId,
      automationId,
    };
    const beforeRunResult = await this.pluginRuntime.runAutomationBeforeRunHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        automation,
        actions: automation.actions,
      },
    });

    const results: JsonValue[] = [];
    let status = 'success';
    if (beforeRunResult.action === 'short-circuit') {
      status = beforeRunResult.status;
      results.push(...beforeRunResult.results);
    } else {
      for (const action of beforeRunResult.payload.actions) {
        try {
          if (action.type === 'device_command' && action.plugin && action.capability) {
            const result = await this.pluginRuntime.executeTool({
              pluginId: action.plugin,
              toolName: action.capability,
              params: action.params || {},
              context: hookContext,
            });
            results.push({
              action: action.type,
              plugin: action.plugin,
              capability: action.capability,
              result,
            });
            continue;
          }
          if (action.type === 'ai_message') {
            const result = await this.executeAiMessageAction(action, hookContext);
            results.push(toJsonValue({
              action: action.type,
              target: result.target,
              result,
            }));
          }
        } catch (err) {
          status = 'error';
          results.push({
            action: action.type,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    const afterRunPayload = await this.pluginRuntime.runAutomationAfterRunHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        automation,
        status,
        results,
      },
    });
    status = afterRunPayload.status;

    // 记录执行日志
    await this.prisma.automationLog.create({
      data: {
        automationId,
        status,
        result: JSON.stringify(afterRunPayload.results),
      },
    });

    // 更新 lastRunAt
    await this.prisma.automation.update({
      where: { id: automationId },
      data: { lastRunAt: new Date() },
    });

    this.logger.log(`自动化 "${automationRecord.name}" 已执行：${status}`);

    return {
      status,
      results: afterRunPayload.results,
    };
  }

  /**
   * 执行一条 `ai_message` 自动化动作。
   * @param action 当前动作
   * @param context 自动化运行上下文
   * @returns 统一消息发送结果
   */
  private executeAiMessageAction(
    action: ActionConfig,
    context: {
      source: 'automation';
      userId: string;
      automationId: string;
    },
  ) {
    const message = action.message?.trim();
    if (!message) {
      throw new Error('ai_message 动作缺少 message');
    }

    return this.chatMessageService.sendPluginMessage({
      context,
      target: this.requireAiMessageTarget(action.target),
      content: message,
    });
  }

  /**
   * 读取 `ai_message` 的目标；当前只支持 conversation。
   * @param target 原始动作目标
   * @returns 可写入的消息目标
   */
  private requireAiMessageTarget(
    target?: AutomationActionTargetRef,
  ): AutomationActionTargetRef {
    if (!target) {
      throw new Error('ai_message 动作缺少 target');
    }

    return target;
  }

  // --- Cron 计划 ---

  private async loadCronJobs() {
    const automations = await this.prisma.automation.findMany({
      where: { enabled: true },
    });

    let scheduled = 0;
    for (const automation of automations) {
      const trigger = JSON.parse(automation.trigger) as TriggerConfig;
      if (trigger.type === 'cron' && trigger.cron) {
        this.scheduleCron(automation.id, trigger.cron);
        scheduled += 1;
      }
    }

    if (scheduled > 0) {
      this.logger.log(`已加载 ${scheduled} 个 cron 自动化`);
    }
  }

  private scheduleCron(automationId: string, cronExpr: string) {
    this.unscheduleCron(automationId);

    // 解析简单的时间间隔表达式：支持 "30s"、"5m"、"1h"
    const intervalMs = this.parseCronInterval(cronExpr);
    if (!intervalMs) {
      this.logger.warn(`自动化 ${automationId} 的 cron 表达式无效：${cronExpr}`);
      return;
    }

    const timer = setInterval(() => {
      this.executeAutomation(automationId).catch((error: Error) => {
        this.logger.error(`自动化 ${automationId} 的 cron 执行失败：${error.message}`);
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
   * - "30s" -> 30000
   * - "5m" -> 300000
   * - "1h" -> 3600000
   * 无效则返回 null。最小值 10 秒。
   */
  private parseCronInterval(expr: string): number | null {
    const match = expr.trim().match(/^(\d+)\s*(s|m|h)$/i);
    if (!match) {
      return null;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    let milliseconds: number;
    switch (unit) {
      case 's':
        milliseconds = value * 1000;
        break;
      case 'm':
        milliseconds = value * 60 * 1000;
        break;
      case 'h':
        milliseconds = value * 60 * 60 * 1000;
        break;
      default:
        return null;
    }

    return milliseconds >= 10000 ? milliseconds : null;
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
