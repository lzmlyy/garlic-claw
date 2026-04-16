import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ActionConfig,
  AutomationEventDispatchInfo,
  AutomationInfo,
  AutomationLogInfo,
  JsonObject,
  JsonValue,
  TriggerConfig,
} from '@garlic-claw/shared';
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { asJsonValue, cloneJsonValue, readJsonObject, readRequiredString } from '../../runtime/host/runtime-host-values';
import { AutomationExecutionService } from './automation-execution.service';

export interface RuntimeAutomationRecord extends AutomationInfo, PersistedAutomationRecord {
  logs: AutomationLogInfo[];
  userId: string;
}

interface CronEntry {
  automationId: string;
  timer: ReturnType<typeof setInterval>;
}

export interface PersistedAutomationRecord {
  actions: ActionConfig[];
  createdAt: string;
  enabled: boolean;
  id: string;
  lastRunAt: string | null;
  logs: AutomationLogInfo[];
  name: string;
  trigger: TriggerConfig;
  updatedAt: string;
  userId: string;
}

interface AutomationPersistenceFile {
  automations: Record<string, PersistedAutomationRecord[]>;
  sequence: number;
}

export type AutomationRunContext = {
  automationId: string;
  source: 'automation';
  userId: string;
};

@Injectable()
export class AutomationService implements OnModuleDestroy, OnModuleInit {
  private readonly automations = new Map<string, RuntimeAutomationRecord[]>();
  private readonly cronJobs = new Map<string, CronEntry>();
  private automationSequence = 0;
  private readonly logger = new Logger(AutomationService.name);
  private readonly storagePath = resolveAutomationStoragePath();

  constructor(
    private readonly automationExecutionService: AutomationExecutionService,
  ) {
    const restored = this.loadPersistedState();
    this.automationSequence = restored.sequence;
    for (const [userId, records] of restored.automations.entries()) {
      this.automations.set(userId, records.map((record) => ({ ...record })));
    }
  }

  onModuleInit() {
    this.restoreCronJobs(
      [...this.automations.values()]
        .flat()
        .filter((automation) => automation.enabled)
        .map((automation) => ({ automationId: automation.id, trigger: automation.trigger })),
      this.readSchedulerInput(),
    );
  }

  onModuleDestroy() {
    this.destroyCronJobs();
  }

  create(userId: string, params: JsonObject): JsonValue {
    const now = new Date().toISOString();
    const record: RuntimeAutomationRecord = {
      actions: readAutomationActions(params),
      createdAt: now,
      enabled: true,
      id: `automation-${++this.automationSequence}`,
      lastRunAt: null,
      logs: [],
      name: readRequiredString(params, 'name'),
      trigger: readAutomationTrigger(params),
      updatedAt: now,
      userId,
    };
    this.automations.set(userId, [...(this.automations.get(userId) ?? []), record]);
    this.syncCronJob(record.id, record.trigger, true, this.readSchedulerInput());
    this.persist();
    return this.serializeAutomation(record);
  }

  async emitEvent(userId: string, event: string): Promise<AutomationEventDispatchInfo> {
    const matchedAutomationIds: string[] = [];
    for (const automation of this.automations.get(userId) ?? []) {
      if (!automation.enabled || automation.trigger.type !== 'event' || automation.trigger.event !== event) {continue;}
      await this.runRecord(automation);
      matchedAutomationIds.push(automation.id);
    }
    return { event, matchedAutomationIds };
  }

  listByUser(userId: string): JsonValue {
    return (this.automations.get(userId) ?? []).sort((left, right) => left.id.localeCompare(right.id)).map((automation) => this.serializeAutomation(automation));
  }

  remove(userId: string, automationId: string): JsonValue {
    const records = this.automations.get(userId) ?? [];
    const nextRecords = records.filter((entry) => entry.id !== automationId);
    if (nextRecords.length === records.length) {throw new NotFoundException(`Automation not found: ${automationId}`);}
    this.automations.set(userId, nextRecords);
    this.removeCronJob(automationId);
    this.persist();
    return { count: 1 };
  }

  getById(userId: string, automationId: string): JsonValue {
    return this.serializeAutomation(this.requireAutomation(userId, automationId));
  }

  getLogs(userId: string, automationId: string): JsonValue {
    return this.requireAutomation(userId, automationId).logs.map((log) => asJsonValue(log));
  }

  async run(userId: string, automationId: string): Promise<JsonValue> {
    return this.runRecord(this.requireAutomation(userId, automationId));
  }

  toggle(userId: string, automationId: string): JsonValue {
    const automation = this.requireAutomation(userId, automationId);
    automation.enabled = !automation.enabled;
    automation.updatedAt = new Date().toISOString();
    this.syncCronJob(automation.id, automation.trigger, automation.enabled, this.readSchedulerInput());
    this.persist();
    return { enabled: automation.enabled, id: automation.id };
  }

  private requireAutomation(userId: string, automationId: string): RuntimeAutomationRecord {
    const automation = (this.automations.get(userId) ?? []).find((entry) => entry.id === automationId);
    if (automation) {return automation;}
    throw new NotFoundException(`Automation not found: ${automationId}`);
  }

  private async runRecord(automation: RuntimeAutomationRecord): Promise<JsonValue> {
    automation.lastRunAt = new Date().toISOString();
    automation.updatedAt = automation.lastRunAt;
    const result = await this.automationExecutionService.executeAutomation(automation);
    automation.logs.unshift({
      id: `automation-log-${automation.id}-${automation.logs.length + 1}`,
      status: readAutomationRunStatus(result),
      result: JSON.stringify(result),
      createdAt: automation.lastRunAt,
    });
    this.persist();
    return result;
  }

  private async runAnyUserAutomation(automationId: string): Promise<JsonValue | null> {
    for (const records of this.automations.values()) {
      const automation = records.find((entry) => entry.id === automationId);
      if (automation) {return this.runRecord(automation);}
    }
    return null;
  }

  private serializeAutomation(automation: RuntimeAutomationRecord): JsonValue {
    const { userId: _userId, ...rest } = automation;
    return asJsonValue(rest);
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify({
      automations: Object.fromEntries([...this.automations.entries()].map(([userId, records]) => [userId, cloneJsonValue(records)])),
      sequence: this.automationSequence,
    }, null, 2), 'utf-8');
  }

  private restoreCronJobs(entries: Array<{ automationId: string; trigger: TriggerConfig }>, input: {
    runAutomation: (automationId: string) => Promise<JsonValue | null>;
    logError: (message: string) => void;
    logInfo: (message: string) => void;
    logWarn: (message: string) => void;
  }): number {
    let scheduled = 0;
    for (const entry of entries) {
      if (this.syncCronJob(entry.automationId, entry.trigger, true, input)) {
        scheduled += 1;
      }
    }
    return scheduled;
  }

  private readSchedulerInput() {
    return {
      runAutomation: (automationId: string) => this.runAnyUserAutomation(automationId),
      logInfo: (message: string) => this.logger.log(message),
      logWarn: (message: string) => this.logger.warn(message),
      logError: (message: string) => this.logger.error(message),
    };
  }

  private syncCronJob(
    automationId: string,
    trigger: TriggerConfig,
    enabled: boolean,
    input: {
      runAutomation: (automationId: string) => Promise<JsonValue | null>;
      logError: (message: string) => void;
      logInfo: (message: string) => void;
      logWarn: (message: string) => void;
    },
  ): boolean {
    if (!enabled || trigger.type !== 'cron' || !trigger.cron) {
      this.removeCronJob(automationId);
      return false;
    }
    this.removeCronJob(automationId);
    const intervalMs = readCronInterval(trigger.cron);
    if (!intervalMs) {
      input.logWarn(`自动化 ${automationId} 的 cron 表达式无效：${trigger.cron}`);
      return false;
    }
    const timer = setInterval(() => {
      input.runAutomation(automationId).catch((error: Error) => {
        input.logError(`自动化 ${automationId} 的 cron 执行失败：${error.message}`);
      });
    }, intervalMs);
    this.cronJobs.set(automationId, { automationId, timer });
    input.logInfo(`已为自动化 ${automationId} 计划 cron：每 ${trigger.cron}`);
    return true;
  }

  private removeCronJob(automationId: string): void {
    const entry = this.cronJobs.get(automationId);
    if (!entry) {return;}
    clearInterval(entry.timer);
    this.cronJobs.delete(automationId);
  }

  private destroyCronJobs(): void {
    for (const entry of this.cronJobs.values()) {
      clearInterval(entry.timer);
    }
    this.cronJobs.clear();
  }

  private loadPersistedState(): { automations: Map<string, PersistedAutomationRecord[]>; sequence: number } {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {
        return { automations: new Map<string, PersistedAutomationRecord[]>(), sequence: 0 };
      }
      const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as Partial<AutomationPersistenceFile>;
      return {
        automations: new Map(Object.entries(parsed.automations ?? {}).map(([userId, records]) => [userId, cloneJsonValue(records)])),
        sequence: typeof parsed.sequence === 'number' ? parsed.sequence : 0,
      };
    } catch {
      return { automations: new Map<string, PersistedAutomationRecord[]>(), sequence: 0 };
    }
  }
}

function readAutomationActions(params: JsonObject): ActionConfig[] {
  const value = params.actions;
  if (!Array.isArray(value)) {throw new BadRequestException('actions must be an array');}
  return value.map((entry, index) => readAutomationAction(entry, index));
}

function readAutomationTrigger(params: JsonObject): TriggerConfig {
  const trigger = readJsonObject(params.trigger);
  if (!trigger) {throw new BadRequestException('trigger is required');}
  if (trigger.type !== 'cron' && trigger.type !== 'event' && trigger.type !== 'manual') {throw new BadRequestException('trigger.type is invalid');}
  return { type: trigger.type, ...(typeof trigger.cron === 'string' ? { cron: trigger.cron } : {}), ...(typeof trigger.event === 'string' ? { event: trigger.event } : {}) };
}

function readAutomationAction(value: JsonValue, index: number): ActionConfig {
  const action = readJsonObject(value);
  if (!action) {throw new BadRequestException(`actions[${index}] must be an object`);}
  if (action.type !== 'device_command' && action.type !== 'ai_message') {throw new BadRequestException(`actions[${index}].type is invalid`);}

  if (action.type === 'device_command') {
    const params = action.params === undefined ? undefined : readJsonObject(action.params);
    if (action.params !== undefined && !params) {throw new BadRequestException(`actions[${index}].params must be an object`);}
    const capability = typeof action.capability === 'string' && action.capability.trim().length > 0 ? action.capability : null;
    const plugin = typeof action.plugin === 'string' && action.plugin.trim().length > 0 ? action.plugin : null;
    if (!capability || !plugin) {throw new BadRequestException(`actions[${index}].type is missing required fields`);}
    return { capability, ...(params ? { params } : {}), plugin, type: action.type };
  }

  const target = action.target ? readJsonObject(action.target) : null;
  if (action.target && (!target || target.type !== 'conversation' || typeof target.id !== 'string')) {throw new BadRequestException(`actions[${index}].target is invalid`);}
  return { ...(typeof action.message === 'string' ? { message: action.message } : {}), ...(target && typeof target.id === 'string' ? { target: { id: target.id, type: 'conversation' as const } } : {}), type: action.type };
}

function readAutomationRunStatus(result: JsonValue): string {
  return typeof result === 'object'
    && result !== null
    && typeof (result as { status?: unknown }).status === 'string'
    ? (result as { status: string }).status
    : 'success';
}

function readCronInterval(expr: string): number | null {
  const match = expr.trim().match(/^(\d+)\s*(s|m|h)$/i);
  if (!match) {return null;}

  const value = parseInt(match[1], 10);
  switch (match[2].toLowerCase()) {
    case 's':
      return value >= 10 ? value * 1000 : null;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      return null;
  }
}

function resolveAutomationStoragePath(): string {
  if (process.env.GARLIC_CLAW_AUTOMATIONS_PATH) {return process.env.GARLIC_CLAW_AUTOMATIONS_PATH;}
  if (process.env.JEST_WORKER_ID) {
    return path.join(process.cwd(), 'tmp', `automations.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  }
  return path.join(process.cwd(), 'tmp', 'automations.server.json');
}
