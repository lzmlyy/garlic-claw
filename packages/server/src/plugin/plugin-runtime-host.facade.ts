import type {
  HostCallPayload,
  PluginActionName,
  PluginCallContext,
  PluginManifest,
  PluginHostMethod,
  PluginPermission,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AutomationService } from '../automation/automation.service';
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
  readRuntimeAutomationActions,
  readRuntimeAutomationTrigger,
  readRuntimeSubagentRequest,
  readRuntimeSubagentTaskStartParams,
  requirePositiveRuntimeNumber,
  requireRuntimeString,
  requireRuntimeUserId,
} from './plugin-runtime-input.helpers';
import {
  resolveCachedRuntimeService,
  resolveCachedRuntimeServiceAsync,
} from './plugin-runtime-module.helpers';
import { PluginCronService } from './plugin-cron.service';
import { PluginHostService } from './plugin-host.service';
import { PluginService } from './plugin.service';

interface RuntimeHostFacadeRecord {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  transport: {
    listSupportedActions?: () => PluginActionName[];
  };
}

const HOST_METHOD_PERMISSION_MAP: Record<PluginHostMethod, PluginPermission | null> = {
  'automation.create': 'automation:write',
  'automation.event.emit': 'automation:write',
  'automation.list': 'automation:read',
  'automation.run': 'automation:write',
  'automation.toggle': 'automation:write',
  'config.get': 'config:read',
  'cron.delete': 'cron:write',
  'cron.list': 'cron:read',
  'cron.register': 'cron:write',
  'conversation.get': 'conversation:read',
  'conversation.session.finish': 'conversation:write',
  'conversation.session.get': 'conversation:write',
  'conversation.session.keep': 'conversation:write',
  'conversation.session.start': 'conversation:write',
  'conversation.messages.list': 'conversation:read',
  'conversation.title.set': 'conversation:write',
  'kb.get': 'kb:read',
  'kb.list': 'kb:read',
  'kb.search': 'kb:read',
  'llm.generate': 'llm:generate',
  'llm.generate-text': 'llm:generate',
  'log.list': 'log:read',
  'log.write': 'log:write',
  'message.send': 'conversation:write',
  'message.target.current.get': 'conversation:read',
  'memory.search': 'memory:read',
  'memory.save': 'memory:write',
  'persona.activate': 'persona:write',
  'persona.current.get': 'persona:read',
  'persona.get': 'persona:read',
  'persona.list': 'persona:read',
  'plugin.self.get': null,
  'provider.current.get': 'provider:read',
  'provider.get': 'provider:read',
  'provider.list': 'provider:read',
  'provider.model.get': 'provider:read',
  'storage.delete': 'storage:write',
  'storage.get': 'storage:read',
  'storage.list': 'storage:read',
  'storage.set': 'storage:write',
  'subagent.run': 'subagent:run',
  'subagent.task.get': 'subagent:run',
  'subagent.task.list': 'subagent:run',
  'subagent.task.start': 'subagent:run',
  'state.delete': 'state:write',
  'state.get': 'state:read',
  'state.list': 'state:read',
  'state.set': 'state:write',
  'user.get': 'user:read',
};

@Injectable()
export class PluginRuntimeHostFacade {
  private automationService?: AutomationService;
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
    private readonly cronService: PluginCronService,
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
    const requiredPermission = HOST_METHOD_PERMISSION_MAP[input.method];
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

    if (input.method === 'automation.create') {
      return toJsonValue(
        await this.getAutomationService().create(
          requireRuntimeUserId(input.context, 'automation.create'),
          requireRuntimeString(input.params, 'name', 'automation.create'),
          readRuntimeAutomationTrigger(input.params, 'automation.create'),
          readRuntimeAutomationActions(input.params, 'automation.create'),
        ),
      );
    }
    if (input.method === 'automation.list') {
      return toJsonValue(
        await this.getAutomationService().findAllByUser(
          requireRuntimeUserId(input.context, 'automation.list'),
        ),
      );
    }
    if (input.method === 'automation.event.emit') {
      return toJsonValue(
        await this.getAutomationService().emitEvent(
          requireRuntimeString(input.params, 'event', 'automation.event.emit'),
          requireRuntimeUserId(input.context, 'automation.event.emit'),
        ),
      );
    }
    if (input.method === 'automation.toggle') {
      return toJsonValue(
        await this.getAutomationService().toggle(
          requireRuntimeString(input.params, 'automationId', 'automation.toggle'),
          requireRuntimeUserId(input.context, 'automation.toggle'),
        ),
      );
    }
    if (input.method === 'automation.run') {
      return toJsonValue(
        await this.getAutomationService().executeAutomation(
          requireRuntimeString(input.params, 'automationId', 'automation.run'),
          requireRuntimeUserId(input.context, 'automation.run'),
        ),
      );
    }
    if (input.method === 'cron.register') {
      return toJsonValue(await this.cronService.registerCron(input.pluginId, {
        name: requireRuntimeString(input.params, 'name', 'cron.register'),
        cron: requireRuntimeString(input.params, 'cron', 'cron.register'),
        description: readOptionalRuntimeString(input.params, 'description', 'cron.register'),
        data: readOptionalRuntimeJsonValue(input.params, 'data'),
        enabled: readOptionalRuntimeBoolean(input.params, 'enabled', 'cron.register'),
      }));
    }
    if (input.method === 'cron.list') {
      return toJsonValue(await this.cronService.listCronJobs(input.pluginId));
    }
    if (input.method === 'cron.delete') {
      return this.cronService.deleteCron(
        input.pluginId,
        requireRuntimeString(input.params, 'jobId', 'cron.delete'),
      );
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

  private getAutomationService(): AutomationService {
    return resolveCachedRuntimeService({
      current: this.automationService,
      resolve: () =>
        this.moduleRef.get(AutomationService, {
          strict: false,
        }),
      cache: (value) => {
        this.automationService = value;
      },
      notFoundMessage: 'AutomationService is not available',
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
