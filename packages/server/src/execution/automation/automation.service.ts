import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ActionConfig, AutomationEventDispatchInfo, AutomationLogInfo, JsonObject, JsonValue, TriggerConfig } from '@garlic-claw/shared';
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SINGLE_USER_ID } from '../../auth/single-user-auth';
import { asJsonValue, cloneJsonValue, readJsonObject, readRequiredString } from '../../runtime/host/runtime-host-values';
import { AutomationExecutionService } from './automation-execution.service';

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
export interface RuntimeAutomationRecord extends PersistedAutomationRecord {}
interface AutomationPersistenceFile { automations: Record<string, RuntimeAutomationRecord[]>; sequence: number; }

export type AutomationRunContext = { automationId: string; source: 'automation'; userId: string; };

@Injectable()
export class AutomationService implements OnModuleDestroy, OnModuleInit {
  private readonly automations = new Map<string, RuntimeAutomationRecord[]>();
  private readonly cronJobs = new Map<string, ReturnType<typeof setInterval>>();
  private automationSequence = 0;
  private readonly logger = new Logger(AutomationService.name);
  private readonly storagePath = resolveAutomationStoragePath();

  constructor(private readonly automationExecutionService: AutomationExecutionService) {
    const restored = this.loadPersistedState();
    this.automationSequence = restored.sequence;
    for (const [userId, records] of restored.automations.entries()) {this.automations.set(userId, records.map((record) => ({ ...record })));}
    if (restored.migrated) {this.persist();}
  }

  onModuleInit() { for (const automation of [...this.automations.values()].flat()) {if (automation.enabled) {this.syncCronJob(automation.id, automation.trigger, true);}} }

  onModuleDestroy() { this.destroyCronJobs(); }

  create(userId: string, params: JsonObject): JsonValue {
    const now = new Date().toISOString();
    const record: RuntimeAutomationRecord = { actions: readAutomationActions(params), createdAt: now, enabled: true, id: `automation-${++this.automationSequence}`, lastRunAt: null, logs: [], name: readRequiredString(params, 'name'), trigger: readAutomationTrigger(params), updatedAt: now, userId };
    this.automations.set(userId, [...(this.automations.get(userId) ?? []), record]);
    this.syncCronJob(record.id, record.trigger, true);
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

  listByUser(userId: string): JsonValue { return this.listUserAutomations(userId).map((automation) => this.serializeAutomation(automation)); }

  remove(userId: string, automationId: string): JsonValue {
    const records = this.listUserAutomations(userId);
    const nextRecords = records.filter((entry) => entry.id !== automationId);
    if (nextRecords.length === records.length) {throw new NotFoundException(`Automation not found: ${automationId}`);}
    this.automations.set(userId, nextRecords);
    this.removeCronJob(automationId);
    this.persist();
    return { count: 1 };
  }

  getById(userId: string, automationId: string): JsonValue { return this.serializeAutomation(this.requireAutomation(userId, automationId)); }

  getLogs(userId: string, automationId: string): JsonValue { return this.requireAutomation(userId, automationId).logs.map((log) => asJsonValue(log)); }

  async run(userId: string, automationId: string): Promise<JsonValue> { return this.runRecord(this.requireAutomation(userId, automationId)); }

  toggle(userId: string, automationId: string): JsonValue {
    const automation = this.requireAutomation(userId, automationId);
    automation.enabled = !automation.enabled;
    automation.updatedAt = new Date().toISOString();
    this.syncCronJob(automation.id, automation.trigger, automation.enabled);
    this.persist();
    return { enabled: automation.enabled, id: automation.id };
  }

  private requireAutomation(userId: string, automationId: string): RuntimeAutomationRecord {
    const automation = this.listUserAutomations(userId).find((entry) => entry.id === automationId);
    if (automation) {return automation;}
    throw new NotFoundException(`Automation not found: ${automationId}`);
  }

  private async runRecord(automation: RuntimeAutomationRecord): Promise<JsonValue> {
    automation.lastRunAt = new Date().toISOString();
    automation.updatedAt = automation.lastRunAt;
    const result = await this.automationExecutionService.executeAutomation(automation);
    automation.logs.unshift({ id: `automation-log-${automation.id}-${automation.logs.length + 1}`, status: readAutomationRunStatus(result), result: JSON.stringify(result), createdAt: automation.lastRunAt });
    this.persist();
    return result;
  }

  private serializeAutomation(automation: RuntimeAutomationRecord): JsonValue { const { userId: _userId, ...rest } = automation; return asJsonValue(rest); }

  private listUserAutomations(userId: string): RuntimeAutomationRecord[] { return (this.automations.get(userId) ?? []).sort((left, right) => left.id.localeCompare(right.id)); }

  private persist(): void { fs.mkdirSync(path.dirname(this.storagePath), { recursive: true }); fs.writeFileSync(this.storagePath, JSON.stringify(serializeAutomationPersistence(this.automations, this.automationSequence), null, 2), 'utf-8'); }

  private syncCronJob(automationId: string, trigger: TriggerConfig, enabled: boolean): boolean {
    if (!enabled || trigger.type !== 'cron' || !trigger.cron) { this.removeCronJob(automationId); return false; }
    this.removeCronJob(automationId);
    const intervalMs = readCronInterval(trigger.cron);
    if (!intervalMs) { this.logger.warn(`自动化 ${automationId} 的 cron 表达式无效：${trigger.cron}`); return false; }
    const timer = setInterval(() => {
      const automation = this.findAutomationById(automationId);
      if (!automation) {return;}
      void this.runRecord(automation).catch((error: Error) => { this.logger.error(`自动化 ${automationId} 的 cron 执行失败：${error.message}`); });
    }, intervalMs);
    this.cronJobs.set(automationId, timer);
    this.logger.log(`已为自动化 ${automationId} 计划 cron：每 ${trigger.cron}`);
    return true;
  }

  private removeCronJob(automationId: string): void {
    const timer = this.cronJobs.get(automationId);
    if (!timer) {return;}
    clearInterval(timer);
    this.cronJobs.delete(automationId);
  }

  private destroyCronJobs(): void {
    for (const timer of this.cronJobs.values()) {clearInterval(timer);}
    this.cronJobs.clear();
  }

  private findAutomationById(automationId: string): RuntimeAutomationRecord | undefined {
    return [...this.automations.values()].flat().find((entry) => entry.id === automationId);
  }

  private loadPersistedState(): { automations: Map<string, RuntimeAutomationRecord[]>; migrated: boolean; sequence: number } {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {return { automations: new Map<string, RuntimeAutomationRecord[]>(), migrated: false, sequence: 0 };}
      const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as Partial<AutomationPersistenceFile>;
      const entries = Object.entries(parsed.automations ?? {});
      const currentRecords = cloneJsonValue((parsed.automations ?? {})[SINGLE_USER_ID] ?? []).filter(
        (record: RuntimeAutomationRecord) => record.userId === SINGLE_USER_ID,
      );
      return {
        automations: new Map(currentRecords.length > 0 ? [[SINGLE_USER_ID, currentRecords]] : []),
        migrated: entries.length > (currentRecords.length > 0 ? 1 : 0)
          || currentRecords.length !== ((parsed.automations ?? {})[SINGLE_USER_ID] ?? []).length,
        sequence: typeof parsed.sequence === 'number' ? parsed.sequence : 0,
      };
    } catch {
      return { automations: new Map<string, RuntimeAutomationRecord[]>(), migrated: false, sequence: 0 };
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
  return typeof result === 'object' && result !== null && typeof (result as { status?: unknown }).status === 'string' ? (result as { status: string }).status : 'success';
}
function serializeAutomationPersistence(automations: Map<string, RuntimeAutomationRecord[]>, sequence: number): AutomationPersistenceFile { return { automations: Object.fromEntries([...automations.entries()].map(([userId, records]) => [userId, cloneJsonValue(records)])), sequence }; }

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
  if (process.env.JEST_WORKER_ID) {return path.join(process.cwd(), 'tmp', `automations.server.test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);}
  return path.join(process.cwd(), 'tmp', 'automations.server.json');
}
