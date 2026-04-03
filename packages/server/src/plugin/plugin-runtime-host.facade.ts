import { PLUGIN_HOST_METHOD_PERMISSION_MAP } from '@garlic-claw/shared';
import type {
  HostCallPayload,
  PluginActionName,
  PluginCallContext,
  PluginManifest,
  PluginHostMethod,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { ChatMessageService } from '../chat/chat-message.service';
import { getRuntimeRecordOrThrow } from './plugin-runtime-dispatch.helpers';
import {
  finishConversationSessionForRuntime,
  getConversationSessionInfoForRuntime,
  keepConversationSessionForRuntime,
  startConversationSessionForRuntime,
  type ConversationSessionRecord,
} from './plugin-runtime-session.helpers';
import {
  buildRuntimePluginSelfInfo,
  buildStoredPluginSelfInfo,
} from './plugin-runtime-manifest.helpers';
import {
  readOptionalRuntimeBoolean,
  readOptionalRuntimeChatMessageParts,
  readOptionalRuntimeJsonValue,
  readOptionalRuntimeMessageTarget,
  readOptionalRuntimeString,
  readRuntimeSubagentRequest,
  readRuntimeSubagentTaskStartParams,
  requirePositiveRuntimeNumber,
  requireRuntimeString,
} from './plugin-runtime-input.helpers';
import { resolveCachedRuntimeServiceAsync } from './plugin-runtime-module.helpers';
import { PluginRuntimeAutomationFacade } from './plugin-runtime-automation.facade';
import { PluginHostService } from './plugin-host.service';
import { PluginService } from './plugin.service';

interface RuntimeHostFacadeRecord {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  transport: {
    listSupportedActions?: () => PluginActionName[];
  };
}

@Injectable()
export class PluginRuntimeHostFacade {
  private chatMessageService?: ChatMessageService;
  private subagentTaskService?: {
    startTask: (input: {
      pluginId: string;
      pluginDisplayName?: string;
      runtimeKind: PluginRuntimeKind;
      context: PluginCallContext;
      request: unknown;
      writeBackTarget?: unknown;
    }) => Promise<unknown>;
    listTasksForPlugin: (pluginId: string) => Promise<unknown>;
    getTaskForPlugin: (pluginId: string, taskId: string) => Promise<unknown>;
  };

  constructor(
    private readonly pluginService: PluginService,
    private readonly hostService: PluginHostService,
    private readonly runtimeAutomationFacade: PluginRuntimeAutomationFacade,
    private readonly moduleRef: ModuleRef,
  ) {}

  async call(input: {
    records: Map<string, RuntimeHostFacadeRecord>;
    conversationSessions: Map<string, ConversationSessionRecord>;
    pluginId: string;
    context: PluginCallContext;
    method: HostCallPayload['method'];
    params: JsonObject;
    runSubagentRequest: (input: {
      pluginId: string;
      context: PluginCallContext;
      request: unknown;
    }) => Promise<unknown>;
  }): Promise<JsonValue> {
    const record = input.method === 'plugin.self.get'
      ? input.records.get(input.pluginId)
      : getRuntimeRecordOrThrow(input.records, input.pluginId);
    const requiredPermission = PLUGIN_HOST_METHOD_PERMISSION_MAP[input.method];
    if (
      requiredPermission
      && record
      && !record.manifest.permissions.includes(requiredPermission)
    ) {
      throw new ForbiddenException(
        `插件 ${input.pluginId} 缺少权限 ${requiredPermission}`,
      );
    }

    if (input.method === 'plugin.self.get') {
      if (!record) {
        return toJsonValue(
          buildStoredPluginSelfInfo({
            plugin: await this.pluginService.getPluginSelfInfo(input.pluginId),
          }),
        );
      }

      return toJsonValue(
        buildRuntimePluginSelfInfo({
          manifest: record.manifest,
          runtimeKind: record.runtimeKind,
          supportedActions: record.transport.listSupportedActions?.() ?? ['health-check'],
        }),
      );
    }
    if (input.method === 'subagent.run') {
      return toJsonValue(await input.runSubagentRequest({
        pluginId: input.pluginId,
        context: input.context,
        request: readRuntimeSubagentRequest(input.params, 'subagent.run'),
      }));
    }

    const automationResult = await this.runtimeAutomationFacade.call({
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
      params: input.params,
    });
    if (automationResult.handled) {
      return automationResult.value;
    }
    if (input.method === 'message.target.current.get') {
      return toJsonValue(await (await this.getChatMessageService())
        .getCurrentPluginMessageTarget({
          context: input.context,
        }));
    }
    if (input.method === 'message.send') {
      return toJsonValue(await (await this.getChatMessageService()).sendPluginMessage({
        context: input.context,
        target: readOptionalRuntimeMessageTarget(
          input.params,
          'target',
          'message.send',
        ),
        content: readOptionalRuntimeString(
          input.params,
          'content',
          'message.send',
        ),
        parts: readOptionalRuntimeChatMessageParts(
          input.params,
          'parts',
          'message.send',
        ),
        provider: readOptionalRuntimeString(
          input.params,
          'provider',
          'message.send',
        ),
        model: readOptionalRuntimeString(
          input.params,
          'model',
          'message.send',
        ),
      }));
    }
    if (input.method === 'conversation.session.start') {
      return toJsonValue(startConversationSessionForRuntime({
        sessions: input.conversationSessions,
        pluginId: input.pluginId,
        context: input.context,
        method: 'conversation.session.start',
        timeoutMs: requirePositiveRuntimeNumber(
          input.params,
          'timeoutMs',
          'conversation.session.start',
        ),
        captureHistory: readOptionalRuntimeBoolean(
          input.params,
          'captureHistory',
          'conversation.session.start',
        ) ?? false,
        metadata: readOptionalRuntimeJsonValue(input.params, 'metadata'),
        now: Date.now(),
      }));
    }
    if (input.method === 'conversation.session.get') {
      return toJsonValue(getConversationSessionInfoForRuntime({
        sessions: input.conversationSessions,
        pluginId: input.pluginId,
        context: input.context,
        method: 'conversation.session.get',
        now: Date.now(),
      }));
    }
    if (input.method === 'conversation.session.keep') {
      return toJsonValue(keepConversationSessionForRuntime({
        sessions: input.conversationSessions,
        pluginId: input.pluginId,
        context: input.context,
        method: 'conversation.session.keep',
        timeoutMs: requirePositiveRuntimeNumber(
          input.params,
          'timeoutMs',
          'conversation.session.keep',
        ),
        resetTimeout: readOptionalRuntimeBoolean(
          input.params,
          'resetTimeout',
          'conversation.session.keep',
        ) ?? true,
        now: Date.now(),
      }));
    }
    if (input.method === 'conversation.session.finish') {
      return finishConversationSessionForRuntime({
        sessions: input.conversationSessions,
        pluginId: input.pluginId,
        context: input.context,
        method: 'conversation.session.finish',
      });
    }
    if (input.method === 'subagent.task.start') {
      const record = input.records.get(input.pluginId);
      const taskParams = readRuntimeSubagentTaskStartParams(
        input.params,
        'subagent.task.start',
      );
      return toJsonValue(await (await this.getSubagentTaskService()).startTask({
        pluginId: input.pluginId,
        pluginDisplayName: record?.manifest.name,
        runtimeKind: record?.runtimeKind ?? 'builtin',
        context: input.context,
        request: taskParams.request,
        ...(taskParams.writeBackTarget
          ? { writeBackTarget: taskParams.writeBackTarget }
          : {}),
      }));
    }
    if (input.method === 'subagent.task.list') {
      return toJsonValue(
        await (await this.getSubagentTaskService()).listTasksForPlugin(input.pluginId),
      );
    }
    if (input.method === 'subagent.task.get') {
      return toJsonValue(await (await this.getSubagentTaskService()).getTaskForPlugin(
        input.pluginId,
        requireRuntimeString(input.params, 'taskId', 'subagent.task.get'),
      ));
    }

    return this.hostService.call({
      pluginId: input.pluginId,
      context: input.context,
      method: input.method,
      params: input.params,
    });
  }
  private async getChatMessageService(): Promise<ChatMessageService> {
    return resolveCachedRuntimeServiceAsync({
      current: this.chatMessageService,
      resolve: async () =>
        this.moduleRef.get(ChatMessageService, {
          strict: false,
        }),
      cache: (value) => {
        this.chatMessageService = value;
      },
      notFoundMessage: 'ChatMessageService is not available',
    });
  }

  private async getSubagentTaskService() {
    return resolveCachedRuntimeServiceAsync({
      current: this.subagentTaskService,
      resolve: async () =>
        this.moduleRef.get<typeof this.subagentTaskService>(
          'PLUGIN_SUBAGENT_TASK_SERVICE',
          {
            strict: false,
          },
        ),
      cache: (value) => {
        this.subagentTaskService = value;
      },
      notFoundMessage: 'PluginSubagentTaskService is not available',
    });
  }
}
