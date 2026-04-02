import type {
  PluginCallContext,
  PluginMessageTargetInfo,
  PluginMessageTargetRef,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  PluginSubagentTaskDetail,
  PluginSubagentTaskOverview,
  PluginSubagentTaskSummary,
  PluginSubagentTaskWriteBackStatus,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  cloneJsonValue,
  readPluginMessageSendSummary,
  serializePluginSubagentTaskDetail,
  serializePluginSubagentTaskSummary,
} from './plugin-subagent-task.helpers';
import { PluginRuntimeService } from './plugin-runtime.service';

export interface StartPluginSubagentTaskInput {
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  context: PluginCallContext;
  request: PluginSubagentRequest;
  writeBackTarget?: PluginMessageTargetRef | null;
}

@Injectable()
export class PluginSubagentTaskService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
  ) {}

  async startTask(input: StartPluginSubagentTaskInput): Promise<PluginSubagentTaskSummary> {
    const requestedAt = new Date();
    const record = await this.prisma.pluginSubagentTask.create({
      data: {
        pluginId: input.pluginId,
        pluginDisplayName: input.pluginDisplayName ?? null,
        runtimeKind: input.runtimeKind,
        userId: input.context.userId ?? null,
        conversationId: input.context.conversationId ?? null,
        status: 'queued',
        requestJson: JSON.stringify(cloneJsonValue(input.request)),
        contextJson: JSON.stringify(cloneJsonValue(input.context)),
        providerId: input.request.providerId ?? null,
        modelId: input.request.modelId ?? null,
        writeBackTargetJson: input.writeBackTarget
          ? JSON.stringify(cloneJsonValue(input.writeBackTarget))
          : null,
        writeBackStatus: input.writeBackTarget ? 'pending' : 'skipped',
        requestedAt,
      },
    });

    setTimeout(() => {
      void this.runTask({
        taskId: record.id,
        pluginId: input.pluginId,
        context: cloneJsonValue(input.context),
        request: cloneJsonValue(input.request),
        writeBackTarget: input.writeBackTarget
          ? cloneJsonValue(input.writeBackTarget)
          : null,
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
      const result = await this.pluginRuntime.executeSubagentRequest({
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

      await this.prisma.pluginSubagentTask.update({
        where: {
          id: input.taskId,
        },
        data: {
          status: 'completed',
          resultJson: JSON.stringify(cloneJsonValue(result)),
          error: null,
          providerId: result.providerId,
          modelId: result.modelId,
          writeBackTargetJson: writeBack.target
            ? JSON.stringify(cloneJsonValue(writeBack.target))
            : input.writeBackTarget
              ? JSON.stringify(cloneJsonValue(input.writeBackTarget))
              : null,
          writeBackStatus: writeBack.status,
          writeBackError: writeBack.error,
          writeBackMessageId: writeBack.messageId,
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
          error: toErrorMessage(error, '后台子代理任务执行失败'),
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
      const sent = readPluginMessageSendSummary(await this.pluginRuntime.callHost({
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
        error: toErrorMessage(error, '后台子代理结果回写失败'),
      };
    }
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
