import fs from 'node:fs';
import path from 'node:path';
import type { ActionConfig, AutomationEventDispatchInfo, AutomationLogInfo, JsonObject, JsonValue, TriggerConfig, ToolSourceKind } from '@garlic-claw/shared';
import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { SINGLE_USER_ID } from '../../auth/single-user-auth';
import { createServerLogger } from '../../../core/logging/server-logger';
import { createServerTestArtifactPath, resolveServerStatePath } from '../../../core/runtime/server-workspace-paths';
import { ConversationStoreService } from '../../runtime/host/conversation-store.service';
import { asJsonValue, cloneJsonValue, readJsonObject, readPositiveInteger, readRequiredString } from '../../runtime/host/host-input.codec';
import { AutomationExecutionService } from './automation-execution.service';

export interface PersistedAutomationRecord {
  actions: ActionConfig[];
  cronRunConversationIds?: string[];
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

export interface RuntimeAutomationRecord extends PersistedAutomationRecord {
  executionConversationId?: string;
}
interface AutomationPersistenceFile { automations: Record<string, RuntimeAutomationRecord[]>; sequence: number; }
interface AutomationStateSnapshot { automations: Map<string, RuntimeAutomationRecord[]>; migrated: boolean; sequence: number; }
export type AutomationRunContext = { automationId: string; conversationId?: string; source: 'automation'; userId: string };
type AutomationRunSource = 'cron' | 'event' | 'manual';
interface CronChildConversationTarget {
  maxHistoryConversations: number;
  parentConversationId: string;
}
type AutomationConversationTargetWithCronMode = ActionConfig['target'] & {
  conversationMode?: 'existing' | 'cron_child';
  maxHistoryConversations?: number;
};
const DEFAULT_CRON_HISTORY_CONVERSATIONS = 10;

@Injectable()
export class AutomationService implements OnModuleDestroy, OnModuleInit {
  private readonly automations = new Map<string, RuntimeAutomationRecord[]>();
  private readonly cronJobs = new Map<string, ReturnType<typeof setTimeout>>();
  private automationSequence = 0;
  private readonly logger = createServerLogger(AutomationService.name);
  private readonly storagePath = resolveAutomationStoragePath();

  constructor(
    private readonly automationExecutionService: AutomationExecutionService,
    private readonly conversationStore?: ConversationStoreService,
  ) {
    const restored = readAutomationState(this.storagePath);
    this.automationSequence = restored.sequence;
    for (const [userId, records] of restored.automations.entries()) { this.automations.set(userId, records); }
    if (restored.migrated) { this.persist(); }
  }

  onModuleInit(): void { for (const automation of readAllAutomations(this.automations)) {if (automation.enabled) {this.syncCronJob(automation.id, automation.trigger, true);}} }
  onModuleDestroy(): void { for (const timer of this.cronJobs.values()) {clearTimeout(timer);} this.cronJobs.clear(); }

  create(userId: string, params: JsonObject): JsonValue {
    const record = createAutomationRecord(userId, params, ++this.automationSequence);
    this.automations.set(userId, [...readUserAutomations(this.automations, userId), record]);
    this.syncCronJob(record.id, record.trigger, true); this.persist();
    return serializeAutomationRecord(record);
  }

  update(userId: string, automationId: string, params: JsonObject): JsonValue {
    const automation = this.requireAutomation(userId, automationId);
    automation.actions = readAutomationActions(params);
    automation.name = readRequiredString(params, 'name');
    automation.trigger = readAutomationTrigger(params);
    automation.updatedAt = new Date().toISOString();
    this.syncCronJob(automation.id, automation.trigger, automation.enabled);
    this.persist();
    return serializeAutomationRecord(automation);
  }

  async emitEvent(userId: string, event: string): Promise<AutomationEventDispatchInfo> {
    const matchedAutomationIds: string[] = [];
    for (const automation of readEventAutomations(readUserAutomations(this.automations, userId), event)) {
      matchedAutomationIds.push(automation.id);
      try {
        await this.runRecord(automation, 'event');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`自动化 ${automation.id} 执行失败，但事件广播继续: ${message}`);
      }
    }
    return { event, matchedAutomationIds };
  }

  listByUser(userId: string): JsonValue { return readUserAutomations(this.automations, userId).map((automation) => serializeAutomationRecord(automation)); }
  getById(userId: string, automationId: string): JsonValue { return serializeAutomationRecord(this.requireAutomation(userId, automationId)); }
  getLogs(userId: string, automationId: string): JsonValue { return this.requireAutomation(userId, automationId).logs.map((log) => asJsonValue(log)); }
  async run(userId: string, automationId: string): Promise<JsonValue> { return this.runRecord(this.requireAutomation(userId, automationId), 'manual'); }

  toggle(userId: string, automationId: string): JsonValue {
    const automation = this.requireAutomation(userId, automationId);
    automation.enabled = !automation.enabled;
    automation.updatedAt = new Date().toISOString();
    this.syncCronJob(automation.id, automation.trigger, automation.enabled);
    this.persist();
    return { enabled: automation.enabled, id: automation.id };
  }

  remove(userId: string, automationId: string): JsonValue {
    const records = readUserAutomations(this.automations, userId);
    const nextRecords = records.filter((record) => record.id !== automationId);
    if (nextRecords.length === records.length) { throw new NotFoundException(`Automation not found: ${automationId}`); }
    this.automations.set(userId, nextRecords);
    this.removeCronJob(automationId); this.persist();
    return { count: 1 };
  }

  private requireAutomation(userId: string, automationId: string): RuntimeAutomationRecord {
    const automation = readUserAutomations(this.automations, userId).find((record) => record.id === automationId);
    if (!automation) { throw new NotFoundException(`Automation not found: ${automationId}`); }
    return automation;
  }

  private async runRecord(automation: RuntimeAutomationRecord, runSource: AutomationRunSource): Promise<JsonValue> {
    const startedAt = new Date().toISOString();
    automation.lastRunAt = startedAt;
    automation.updatedAt = startedAt;
    try {
      const executionAutomation = await this.prepareExecutionAutomation(automation, runSource, startedAt);
      const result = await this.automationExecutionService.executeAutomation(executionAutomation);
      automation.logs.unshift(createAutomationLog(automation, startedAt, result));
      this.persist();
      return result;
    } catch (error) {
      this.recordRunFailure(automation, startedAt, error);
      throw error;
    }
  }

  private async prepareExecutionAutomation(
    automation: RuntimeAutomationRecord,
    runSource: AutomationRunSource,
    startedAt: string,
  ): Promise<RuntimeAutomationRecord> {
    if (runSource !== 'cron') {
      return automation;
    }
    const cronChildTarget = readCronChildConversationTarget(automation.actions);
    if (!cronChildTarget) {
      return automation;
    }
    if (!this.conversationStore) {
      throw new Error('ConversationStoreService is not available');
    }
    this.conversationStore.requireConversation(cronChildTarget.parentConversationId, automation.userId);
    const childConversation = this.conversationStore.createConversation({
      parentId: cronChildTarget.parentConversationId,
      title: createAutomationRunConversationTitle(automation.name, startedAt),
      userId: automation.userId,
    }) as { id: string };
    automation.cronRunConversationIds = await this.pruneCronRunConversationHistory(
      automation,
      childConversation.id,
      cronChildTarget.maxHistoryConversations,
    );
    return {
      ...automation,
      actions: automation.actions.map((action) => rewriteCronChildConversationAction(action, childConversation.id)),
      executionConversationId: childConversation.id,
    };
  }

  private async pruneCronRunConversationHistory(
    automation: RuntimeAutomationRecord,
    nextConversationId: string,
    maxHistoryConversations: number,
  ): Promise<string[]> {
    const existingConversationIds = [];
    for (const conversationId of automation.cronRunConversationIds ?? []) {
      if (conversationId === nextConversationId) {
        continue;
      }
      try {
        this.conversationStore?.requireConversation(conversationId, automation.userId);
        existingConversationIds.push(conversationId);
      } catch {
        // 用户手动删掉旧会话时，自动从历史索引里移除。
      }
    }
    const nextConversationIds = [...existingConversationIds, nextConversationId];
    const overflowCount = Math.max(0, nextConversationIds.length - maxHistoryConversations);
    const deletedConversationIds = nextConversationIds.slice(0, overflowCount);
    const keptConversationIds = nextConversationIds.slice(overflowCount);
    for (const conversationId of deletedConversationIds) {
      try {
        await this.conversationStore?.deleteConversation(conversationId, automation.userId);
      } catch {
        // 历史裁剪以尽力清理为主，不把已删除或清理失败放大成运行失败。
      }
    }
    return keptConversationIds;
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify({ automations: Object.fromEntries([...this.automations.entries()].map(([userId, records]) => [userId, cloneJsonValue(records)])), sequence: this.automationSequence } satisfies AutomationPersistenceFile, null, 2), 'utf-8');
  }

  private syncCronJob(automationId: string, trigger: TriggerConfig, enabled: boolean): boolean {
    if (!enabled || trigger.type !== 'cron' || !trigger.cron) { this.removeCronJob(automationId); return false; }
    this.removeCronJob(automationId);
    const nextDelay = readCronNextDelay(trigger.cron, new Date());
    if (nextDelay === null) { this.logger.warn(`自动化 ${automationId} 的 cron 表达式无效：${trigger.cron}`); return false; }
    const timer = setTimeout(() => {
      void this.runCronAutomation(automationId).catch((error: Error) => {
        this.logger.error(`自动化 ${automationId} 的 cron 执行失败：${error.message}`);
      });
    }, nextDelay);
    timer.unref?.();
    this.cronJobs.set(automationId, timer);
    this.logger.info(`已为自动化 ${automationId} 计划 cron：${trigger.cron}`);
    return true;
  }

  private removeCronJob(automationId: string): void {
    const timer = this.cronJobs.get(automationId);
    if (timer) { clearTimeout(timer); }
    this.cronJobs.delete(automationId);
  }

  private async runCronAutomation(automationId: string): Promise<void> {
    const automation = readAllAutomations(this.automations).find((record) => record.id === automationId);
    if (!automation || !automation.enabled || automation.trigger.type !== 'cron' || !automation.trigger.cron) {
      this.removeCronJob(automationId);
      return;
    }
    try {
      await this.runRecord(automation, 'cron');
    } finally {
      this.syncCronJob(automationId, automation.trigger, automation.enabled);
    }
  }

  private recordRunFailure(automation: RuntimeAutomationRecord, startedAt: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    automation.updatedAt = new Date().toISOString();
    automation.logs.unshift(createAutomationLog(automation, startedAt, {
      results: [{
        action: 'automation',
        error: message,
      }],
      status: 'error',
    }));
    this.persist();
  }
}

function createAutomationRecord(userId: string, params: JsonObject, sequence: number): RuntimeAutomationRecord {
  const now = new Date().toISOString();
  return { actions: readAutomationActions(params), createdAt: now, cronRunConversationIds: [], enabled: true, id: `automation-${sequence}`, lastRunAt: null, logs: [], name: readRequiredString(params, 'name'), trigger: readAutomationTrigger(params), updatedAt: now, userId };
}

function createAutomationLog(automation: RuntimeAutomationRecord, createdAt: string, result: JsonValue): AutomationLogInfo {
  return { id: `automation-log-${automation.id}-${automation.logs.length + 1}`, status: readAutomationRunStatus(result), result: JSON.stringify(result), createdAt };
}

function serializeAutomationRecord(automation: RuntimeAutomationRecord): JsonValue {
  const { cronRunConversationIds: _cronRunConversationIds, executionConversationId: _executionConversationId, userId: _userId, ...rest } = automation;
  return asJsonValue(rest);
}

function readAutomationState(storagePath: string): AutomationStateSnapshot {
  try {
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    if (!fs.existsSync(storagePath)) {return { automations: new Map<string, RuntimeAutomationRecord[]>(), migrated: false, sequence: 0 };}
    const parsed = JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as Partial<AutomationPersistenceFile>;
    const persistedAutomations = parsed.automations ?? {};
    const currentRecords = cloneJsonValue(persistedAutomations[SINGLE_USER_ID] ?? []).filter((record: RuntimeAutomationRecord) => record.userId === SINGLE_USER_ID);
    const persistedCurrent = persistedAutomations[SINGLE_USER_ID] ?? [];
    return {
      automations: new Map(currentRecords.length > 0 ? [[SINGLE_USER_ID, currentRecords]] : []),
      migrated: Object.keys(persistedAutomations).length > (currentRecords.length > 0 ? 1 : 0) || currentRecords.length !== persistedCurrent.length,
      sequence: typeof parsed.sequence === 'number' ? parsed.sequence : 0,
    };
  } catch {
    return { automations: new Map<string, RuntimeAutomationRecord[]>(), migrated: false, sequence: 0 };
  }
}

function readAllAutomations(automations: Map<string, RuntimeAutomationRecord[]>): RuntimeAutomationRecord[] { return [...automations.values()].flat(); }
function readUserAutomations(automations: Map<string, RuntimeAutomationRecord[]>, userId: string): RuntimeAutomationRecord[] { return automations.get(userId) ?? []; }
function readEventAutomations(records: RuntimeAutomationRecord[], event: string): RuntimeAutomationRecord[] { return records.filter((record) => record.enabled && record.trigger.type === 'event' && record.trigger.event === event); }

function readAutomationActions(params: JsonObject): ActionConfig[] {
  if (!Array.isArray(params.actions)) { throw new BadRequestException('actions 必须是数组'); }
  return params.actions.map((entry, index) => readAutomationAction(entry, index));
}

function readAutomationTrigger(params: JsonObject): TriggerConfig {
  const trigger = readJsonObject(params.trigger);
  if (!trigger) {throw new BadRequestException('trigger 不能为空');}
  if (trigger.type !== 'cron' && trigger.type !== 'event' && trigger.type !== 'manual') {throw new BadRequestException('trigger.type 不合法');}
  return { type: trigger.type, ...(typeof trigger.cron === 'string' ? { cron: trigger.cron } : {}), ...(typeof trigger.event === 'string' ? { event: trigger.event } : {}) };
}

function readAutomationAction(value: JsonValue, index: number): ActionConfig {
  const action = readJsonObject(value);
  if (!action) { throw new BadRequestException(`actions[${index}] 必须是对象`); }
  if (action.type !== 'device_command' && action.type !== 'ai_message') { throw new BadRequestException(`actions[${index}].type 不合法`); }
  if (action.type === 'device_command') {
    const params = action.params === undefined ? undefined : readJsonObject(action.params);
    const capability = typeof action.capability === 'string' && action.capability.trim().length > 0 ? action.capability : null;
    const plugin = typeof action.plugin === 'string' && action.plugin.trim().length > 0 ? action.plugin : null;
    const sourceId = typeof action.sourceId === 'string' && action.sourceId.trim().length > 0 ? action.sourceId.trim() : null;
    const sourceKind = readAutomationToolSourceKind(action.sourceKind);
    if (action.params !== undefined && !params) { throw new BadRequestException(`actions[${index}].params 必须是对象`); }
    if (!capability || (!plugin && !(sourceKind && sourceId))) { throw new BadRequestException(`actions[${index}].type 缺少必填字段`); }
    return { capability, ...(params ? { params } : {}), ...(plugin ? { plugin } : {}), ...(sourceId ? { sourceId } : {}), ...(sourceKind ? { sourceKind } : {}), type: action.type };
  }
  const target = action.target ? readJsonObject(action.target) : null;
  if (action.target && (!target || target.type !== 'conversation' || typeof target.id !== 'string')) {
    throw new BadRequestException(`actions[${index}].target 不合法`);
  }
  const conversationMode = readAutomationConversationMode(target, index);
  const maxHistoryConversations = target ? readPositiveInteger(target, 'maxHistoryConversations') : null;
  return {
    ...(typeof action.message === 'string' ? { message: action.message } : {}),
    ...(target && typeof target.id === 'string' ? {
      target: {
        id: target.id,
        ...(conversationMode ? { conversationMode } : {}),
        ...(maxHistoryConversations ? { maxHistoryConversations } : {}),
        type: 'conversation' as const,
      },
    } : {}),
    type: action.type,
  };
}

function readAutomationRunStatus(result: JsonValue): string {
  return typeof result === 'object' && result !== null && typeof (result as { status?: unknown }).status === 'string' ? (result as { status: string }).status : 'success';
}

function readAutomationToolSourceKind(value: unknown): ToolSourceKind | null {
  return value === 'internal' || value === 'plugin' || value === 'mcp' || value === 'skill'
    ? value
    : null;
}

function readAutomationConversationMode(target: JsonObject | null, index: number): 'cron_child' | 'existing' | null {
  if (!target || target.conversationMode === undefined) {
    return null;
  }
  if (target.conversationMode === 'existing' || target.conversationMode === 'cron_child') {
    return target.conversationMode;
  }
  throw new BadRequestException(`actions[${index}].target.conversationMode 不合法`);
}

function readCronChildConversationTarget(actions: ActionConfig[]): CronChildConversationTarget | null {
  for (const action of actions) {
    const target = action.target as AutomationConversationTargetWithCronMode | undefined;
    if (action.type !== 'ai_message' || target?.type !== 'conversation' || target.conversationMode !== 'cron_child') {
      continue;
    }
    return {
      maxHistoryConversations: target.maxHistoryConversations ?? DEFAULT_CRON_HISTORY_CONVERSATIONS,
      parentConversationId: target.id,
    };
  }
  return null;
}

function rewriteCronChildConversationAction(action: ActionConfig, conversationId: string): ActionConfig {
  const target = action.target as AutomationConversationTargetWithCronMode | undefined;
  if (action.type !== 'ai_message' || target?.type !== 'conversation' || target.conversationMode !== 'cron_child') {
    return cloneJsonValue(action);
  }
  return {
    ...cloneJsonValue(action),
    target: {
      id: conversationId,
      type: 'conversation',
    },
  };
}

function createAutomationRunConversationTitle(automationName: string, startedAt: string): string {
  return `${automationName} · ${startedAt.slice(0, 16).replace('T', ' ')}`;
}

function readCronNextDelay(expr: string, currentDate: Date): number | null {
  const intervalMs = readIntervalCronDelay(expr);
  if (intervalMs !== null) {
    return intervalMs;
  }
  try {
    const nextDate = CronExpressionParser.parse(expr, { currentDate }).next().toDate();
    return Math.max(nextDate.getTime() - currentDate.getTime(), 1);
  } catch {
    return null;
  }
}

function readIntervalCronDelay(expr: string): number | null {
  const match = expr.trim().match(/^(\d+)\s*(s|m|h)$/i);
  if (!match) { return null; }
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 's') { return value * 1000; }
  const unitMs = unit === 'm' ? 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : null;
  return unitMs ? value * unitMs : null;
}

function resolveAutomationStoragePath(): string {
  if (process.env.GARLIC_CLAW_AUTOMATIONS_PATH) {
    return process.env.GARLIC_CLAW_AUTOMATIONS_PATH;
  }
  if (process.env.JEST_WORKER_ID) {
    return createServerTestArtifactPath({ extension: '.json', prefix: 'automations.server.test', subdirectory: 'server' });
  }
  return resolveServerStatePath('automations.server.json');
}
