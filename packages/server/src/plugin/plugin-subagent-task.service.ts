import type {
  PluginCallContext,
  PluginMessageTargetInfo,
  PluginMessageTargetRef,
  PluginRuntimeKind,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  PluginSubagentTaskDetail,
  PluginSubagentTaskOverview,
  PluginSubagentTaskSummary,
  PluginSubagentTaskWriteBackStatus,
} from '@garlic-claw/shared';
import {
  readPluginMessageSendSummary,
  serializePluginSubagentTaskDetail,
  serializePluginSubagentTaskSummary,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { JsonValue } from '../common/types/json-value';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '@garlic-claw/shared';

export interface StartPluginSubagentTaskInput {
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  context: PluginCallContext;
  request: PluginSubagentRequest;
  writeBackTarget?: PluginMessageTargetRef | null;
}

function cloneTaskValue<T>(value: T): T {
  return structuredClone(value);
}

function serializeTaskValue(value: unknown): string {
  return JSON.stringify(cloneTaskValue(value));
}

function getTaskErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

@Injectable()
export class PluginSubagentTaskService {
  private pluginRuntimePromise?: Promise<{
    executeSubagentRequest: (input: {
      pluginId: string;
      context: PluginCallContext;
      request: PluginSubagentRequest;
    }) => Promise<PluginSubagentRunResult>;
    callHost: (input: {
      pluginId: string;
      context: PluginCallContext;
      method: 'message.send';
      params: {
        target: {
          type: PluginMessageTargetRef['type'];
          id: string;
        };
        content: string;
        provider?: string;
        model?: string;
      };
    }) => Promise<JsonValue>;
  }>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async startTask(input: StartPluginSubagentTaskInput): Promise<PluginSubagentTaskSummary> {
    const requestedAt = new Date();
    const scheduledContext = cloneTaskValue(input.context);
    const scheduledRequest = cloneTaskValue(input.request);
    const scheduledWriteBackTarget = input.writeBackTarget
      ? cloneTaskValue(input.writeBackTarget)
      : null;
    const record = await this.prisma.pluginSubagentTask.create({
      data: {
        id: uuidv7(),
        pluginId: input.pluginId,
        pluginDisplayName: input.pluginDisplayName ?? null,
        runtimeKind: input.runtimeKind,
        userId: input.context.userId ?? null,
        conversationId: input.context.conversationId ?? null,
        status: 'queued',
        requestJson: serializeTaskValue(input.request),
        contextJson: serializeTaskValue(input.context),
        providerId: input.request.providerId ?? null,
        modelId: input.request.modelId ?? null,
        writeBackTargetJson: input.writeBackTarget
          ? serializeTaskValue(input.writeBackTarget)
          : null,
        writeBackStatus: input.writeBackTarget ? 'pending' : 'skipped',
        requestedAt,
      },
    });

    setTimeout(() => {
      void this.runTask({
        taskId: record.id,
        pluginId: input.pluginId,
        context: scheduledContext,
        request: scheduledRequest,
        writeBackTarget: scheduledWriteBackTarget,
      });
    }, 0);

    return serializePluginSubagentTaskSummary(record);
  }

  async listOverview(): Promise<PluginSubagentTaskOverview> {
    const records = await this.prisma.pluginSubagentTask.findMany({
      orderBy: [
        {
          requestedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
    });

    return {
      tasks: records.map((record) => serializePluginSubagentTaskSummary(record)),
    };
  }

  async listTasksForPlugin(pluginId: string): Promise<PluginSubagentTaskSummary[]> {
    const overview = await this.listOverview();
    return overview.tasks.filter(
      (task: PluginSubagentTaskSummary) => task.pluginId === pluginId,
    );
  }

  async getTaskOrThrow(taskId: string): Promise<PluginSubagentTaskDetail> {
    const record = await this.prisma.pluginSubagentTask.findUnique({
      where: {
        id: taskId,
      },
    });
    if (!record) {
      throw new NotFoundException(`Plugin subagent task not found: ${taskId}`);
    }

    return serializePluginSubagentTaskDetail(record);
  }

  async getTaskForPlugin(pluginId: string, taskId: string): Promise<PluginSubagentTaskDetail> {
    const task = await this.getTaskOrThrow(taskId);
    if (task.pluginId !== pluginId) {
      throw new NotFoundException(`Plugin subagent task not found: ${taskId}`);
    }

    return task;
  }

  private async runTask(input: {
    taskId: string;
    pluginId: string;
    context: PluginCallContext;
    request: PluginSubagentRequest;
    writeBackTarget: PluginMessageTargetRef | null;
  }): Promise<void> {
    const pluginRuntime = await this.getPluginRuntime();
    await this.prisma.pluginSubagentTask.update({
      where: {
        id: input.taskId,
      },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });

    try {
      const result = await pluginRuntime.executeSubagentRequest({
        pluginId: input.pluginId,
        context: input.context,
        request: input.request,
      });
      const writeBack = await this.writeBackResultIfNeeded({
        pluginId: input.pluginId,
        context: input.context,
        target: input.writeBackTarget,
        result,
      });
      const resolvedWriteBackTarget = writeBack.target ?? input.writeBackTarget;

      await this.prisma.pluginSubagentTask.update({
        where: {
          id: input.taskId,
        },
        data: {
          status: 'completed',
          resultJson: serializeTaskValue(result),
          error: null,
          providerId: result.providerId,
          modelId: result.modelId,
          writeBackTargetJson: resolvedWriteBackTarget
            ? serializeTaskValue(resolvedWriteBackTarget)
            : null,
          writeBackStatus: writeBack.status,
          writeBackError: writeBack.error ?? null,
          writeBackMessageId: writeBack.messageId ?? null,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.pluginSubagentTask.update({
        where: {
          id: input.taskId,
        },
        data: {
          status: 'error',
          error: getTaskErrorMessage(error, '后台子代理任务执行失败'),
          writeBackStatus: 'skipped',
          writeBackError: null,
          finishedAt: new Date(),
        },
      });
    }
  }

  private async writeBackResultIfNeeded(input: {
    pluginId: string;
    context: PluginCallContext;
    target: PluginMessageTargetRef | null;
    result: PluginSubagentRunResult;
  }): Promise<{
    status: PluginSubagentTaskWriteBackStatus;
    target?: PluginMessageTargetInfo | null;
    messageId?: string | null;
    error?: string | null;
  }> {
    if (!input.target) {
      return {
        status: 'skipped',
      };
    }

    try {
      const pluginRuntime = await this.getPluginRuntime();
      const sent = readPluginMessageSendSummary(await pluginRuntime.callHost({
        pluginId: input.pluginId,
        context: input.context,
        method: 'message.send',
        params: {
          target: {
            type: input.target.type,
            id: input.target.id,
          },
          content: input.result.text,
          provider: input.result.providerId,
          model: input.result.modelId,
        },
      }));

      return {
        status: 'sent',
        target: sent.target,
        messageId: sent.id,
        error: null,
      };
    } catch (error) {
      return {
        status: 'failed',
        target: input.target,
        messageId: null,
        error: getTaskErrorMessage(error, '后台子代理结果回写失败'),
      };
    }
  }

  private async getPluginRuntime() {
    if (this.pluginRuntimePromise) {
      return this.pluginRuntimePromise;
    }

    this.pluginRuntimePromise = (async () => {
      const { PluginRuntimeService } = await import('./plugin-runtime.service');
      const resolved = this.moduleRef.get<{
        executeSubagentRequest: (input: {
          pluginId: string;
          context: PluginCallContext;
          request: PluginSubagentRequest;
        }) => Promise<PluginSubagentRunResult>;
        callHost: (input: {
          pluginId: string;
          context: PluginCallContext;
          method: 'message.send';
          params: {
            target: {
              type: PluginMessageTargetRef['type'];
              id: string;
            };
            content: string;
            provider?: string;
            model?: string;
          };
        }) => Promise<JsonValue>;
      }>(PluginRuntimeService, {
        strict: false,
      });
      if (!resolved) {
        throw new NotFoundException('PluginRuntimeService is not available');
      }

      return resolved;
    })();

    return this.pluginRuntimePromise;
  }
}
