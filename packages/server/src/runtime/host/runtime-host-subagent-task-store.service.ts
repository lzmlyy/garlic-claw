import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  PluginCallContext,
  PluginSubagentRequest,
  PluginSubagentTaskDetail,
  PluginSubagentTaskOverview,
  PluginSubagentTaskSummary,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { cloneJsonValue } from './runtime-host-values';

export type RuntimeSubagentTaskRecord = PluginSubagentTaskDetail & {
  writeBackConversationRevision?: string;
};

@Injectable()
export class RuntimeHostSubagentTaskStoreService {
  private readonly tasks: Map<string, RuntimeSubagentTaskRecord[]>;
  private readonly storagePath = process.env.GARLIC_CLAW_SUBAGENT_TASKS_PATH
    ?? path.join(process.cwd(), 'tmp', 'subagent-tasks.server.json');
  private taskSequence = 0;

  constructor() {
    this.tasks = this.loadTasks();
  }

  getTask(pluginId: string, taskId: string): PluginSubagentTaskDetail {
    return cloneJsonValue(this.requireTask(taskId, pluginId));
  }

  getTaskOrThrow(taskId: string): PluginSubagentTaskDetail {
    return cloneJsonValue(this.requireTask(taskId));
  }

  readTask(taskId: string, pluginId?: string): RuntimeSubagentTaskRecord {
    return cloneJsonValue(this.requireTask(taskId, pluginId)) as RuntimeSubagentTaskRecord;
  }

  listOverview(): PluginSubagentTaskOverview {
    return { tasks: this.summarizeTasks(this.listTaskRecords(), false) };
  }

  listTasks(pluginId: string): PluginSubagentTaskSummary[] {
    return this.summarizeTasks(this.listTaskRecords(pluginId), true);
  }

  summarizeTask(task: RuntimeSubagentTaskRecord): PluginSubagentTaskSummary {
    return summarizeTask(task);
  }

  listPendingTasks(pluginId?: string): RuntimeSubagentTaskRecord[] {
    return this.listTaskRecords(pluginId)
      .filter((task) => task.status === 'queued' || task.status === 'running')
      .map((task) => cloneJsonValue(task) as RuntimeSubagentTaskRecord);
  }

  createTask(input: {
    context: PluginCallContext;
    conversationRevision?: string;
    pluginDisplayName: string | undefined;
    pluginId: string;
    request: PluginSubagentRequest;
    requestPreview: string;
    writeBackTarget: PluginSubagentTaskSummary['writeBackTarget'] | null;
  }): RuntimeSubagentTaskRecord {
    const now = new Date().toISOString();
    const task: RuntimeSubagentTaskRecord = {
      context: cloneJsonValue(input.context),
      finishedAt: null,
      id: `subagent-task-${++this.taskSequence}`,
      modelId: input.request.modelId,
      pluginDisplayName: input.pluginDisplayName,
      pluginId: input.pluginId,
      providerId: input.request.providerId,
      request: input.request,
      requestPreview: input.requestPreview,
      requestedAt: now,
      result: null,
      resultPreview: undefined,
      runtimeKind: 'builtin',
      startedAt: null,
      status: 'queued',
      writeBackError: undefined,
      writeBackMessageId: undefined,
      writeBackStatus: input.writeBackTarget ? 'pending' : 'skipped',
      writeBackTarget: input.writeBackTarget ?? undefined,
      ...(input.conversationRevision ? { writeBackConversationRevision: input.conversationRevision } : {}),
      ...(input.context.conversationId ? { conversationId: input.context.conversationId } : {}),
      ...(input.context.userId ? { userId: input.context.userId } : {}),
    };
    const records = this.tasks.get(input.pluginId) ?? [];
    records.push(task);
    this.tasks.set(input.pluginId, records);
    this.saveTasks();
    return cloneJsonValue(task) as RuntimeSubagentTaskRecord;
  }

  updateTask(
    pluginId: string,
    taskId: string,
    mutate: (task: RuntimeSubagentTaskRecord, now: string) => void,
  ): void {
    const now = new Date().toISOString();
    mutate(this.requireTask(taskId, pluginId), now);
    this.saveTasks();
  }

  private listTaskRecords(pluginId?: string): RuntimeSubagentTaskRecord[] {
    return pluginId ? (this.tasks.get(pluginId) ?? []) : [...this.tasks.values()].flat();
  }

  private summarizeTasks(tasks: RuntimeSubagentTaskRecord[], ascending: boolean): PluginSubagentTaskSummary[] {
    const direction = ascending ? 1 : -1;
    return tasks.slice().sort((left, right) => direction * left.requestedAt.localeCompare(right.requestedAt)).map(summarizeTask);
  }

  private loadTasks(): Map<string, RuntimeSubagentTaskRecord[]> {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      if (!fs.existsSync(this.storagePath)) {return new Map<string, RuntimeSubagentTaskRecord[]>();}
      const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as {
        taskSequence?: number;
        tasks?: Record<string, RuntimeSubagentTaskRecord[]>;
      };
      this.taskSequence = typeof parsed.taskSequence === 'number' ? parsed.taskSequence : 0;
      return new Map<string, RuntimeSubagentTaskRecord[]>(Object.entries(parsed.tasks ?? {}));
    } catch {
      return new Map<string, RuntimeSubagentTaskRecord[]>();
    }
  }

  private requireTask(taskId: string, pluginId?: string): RuntimeSubagentTaskRecord {
    const task = this.listTaskRecords(pluginId).find((entry) => entry.id === taskId);
    if (task) {return task;}
    throw new NotFoundException(`Subagent task not found: ${taskId}`);
  }

  private saveTasks(): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(
      this.storagePath,
      JSON.stringify({ taskSequence: this.taskSequence, tasks: Object.fromEntries(this.tasks) }, null, 2),
      'utf-8',
    );
  }
}

function summarizeTask(task: RuntimeSubagentTaskRecord): PluginSubagentTaskSummary {
  const { context: _context, request: _request, result: _result, ...summary } = cloneJsonValue(task);
  return summary;
}
