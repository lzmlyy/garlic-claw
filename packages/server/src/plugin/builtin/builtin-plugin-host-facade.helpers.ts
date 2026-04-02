import type {
  AutomationEventDispatchInfo,
  AutomationInfo,
  HostCallPayload,
  PluginConversationSessionInfo,
  PluginCronJobSummary,
  PluginEventListResult,
  PluginKbEntryDetail,
  PluginKbEntrySummary,
  PluginLlmGenerateResult,
  PluginMessageSendInfo,
  PluginMessageTargetInfo,
  PluginPersonaCurrentInfo,
  PluginPersonaSummary,
  PluginProviderCurrentInfo,
  PluginProviderModelSummary,
  PluginProviderSummary,
  PluginSelfInfo,
  PluginSubagentRunResult,
  PluginSubagentTaskDetail,
  PluginSubagentTaskSummary,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import {
  buildBuiltinConversationSessionKeepParams,
  buildBuiltinConversationSessionStartParams,
  buildBuiltinCreateAutomationParams,
  buildBuiltinGenerateParams,
  buildBuiltinGenerateTextParams,
  buildBuiltinMessageSendParams,
  buildBuiltinRegisterCronParams,
  buildBuiltinRunSubagentParams,
  buildBuiltinStartSubagentTaskParams,
  toHostJsonValue,
  toScopedStateParams,
} from './builtin-plugin-host-params.helpers';

type BuiltinHostCall = (
  method: HostCallPayload['method'],
  params: JsonObject,
) => Promise<JsonValue>;

type BuiltinHostQuery = <T>(
  method: HostCallPayload['method'],
  params?: JsonObject,
) => Promise<T>;

export function createBuiltinPluginHostFacade(input: {
  call: BuiltinHostCall;
  callHost: BuiltinHostQuery;
}) {
  const { call, callHost } = input;

  return {
    call,
    getCurrentProvider: () =>
      callHost<PluginProviderCurrentInfo>('provider.current.get'),
    listProviders: () => callHost<PluginProviderSummary[]>('provider.list'),
    getProvider: (providerId: string) =>
      callHost<PluginProviderSummary>('provider.get', {
        providerId,
      }),
    getProviderModel: (providerId: string, modelId: string) =>
      callHost<PluginProviderModelSummary>('provider.model.get', {
        providerId,
        modelId,
      }),
    searchMemories: (query: string, limit = 10) =>
      call('memory.search', {
        query,
        limit,
      }),
    getConversation: () => call('conversation.get', {}),
    getCurrentMessageTarget: () =>
      callHost<PluginMessageTargetInfo | null>('message.target.current.get'),
    sendMessage: (params: Parameters<typeof buildBuiltinMessageSendParams>[0]) =>
      callHost<PluginMessageSendInfo>('message.send', buildBuiltinMessageSendParams(params)),
    startConversationSession: (
      params: Parameters<typeof buildBuiltinConversationSessionStartParams>[0],
    ) =>
      callHost<PluginConversationSessionInfo>(
        'conversation.session.start',
        buildBuiltinConversationSessionStartParams(params),
      ),
    getConversationSession: () =>
      callHost<PluginConversationSessionInfo | null>('conversation.session.get'),
    keepConversationSession: (
      params: Parameters<typeof buildBuiltinConversationSessionKeepParams>[0],
    ) =>
      callHost<PluginConversationSessionInfo | null>(
        'conversation.session.keep',
        buildBuiltinConversationSessionKeepParams(params),
      ),
    finishConversationSession: () =>
      callHost<boolean>('conversation.session.finish'),
    listKnowledgeBaseEntries: (limit?: number) =>
      callHost<PluginKbEntrySummary[]>(
        'kb.list',
        typeof limit === 'number' ? { limit } : {},
      ),
    searchKnowledgeBase: (query: string, limit = 5) =>
      callHost<PluginKbEntryDetail[]>('kb.search', {
        query,
        limit,
      }),
    getKnowledgeBaseEntry: (entryId: string) =>
      callHost<PluginKbEntryDetail>('kb.get', {
        entryId,
      }),
    getCurrentPersona: () =>
      callHost<PluginPersonaCurrentInfo>('persona.current.get'),
    listPersonas: () => callHost<PluginPersonaSummary[]>('persona.list'),
    getPersona: (personaId: string) =>
      callHost<PluginPersonaSummary>('persona.get', {
        personaId,
      }),
    activatePersona: (personaId: string) =>
      callHost<PluginPersonaCurrentInfo>('persona.activate', {
        personaId,
      }),
    registerCron: (descriptor: Parameters<typeof buildBuiltinRegisterCronParams>[0]) =>
      callHost<PluginCronJobSummary>('cron.register', buildBuiltinRegisterCronParams(descriptor)),
    listCrons: () => callHost<PluginCronJobSummary[]>('cron.list'),
    deleteCron: (jobId: string) =>
      callHost<boolean>('cron.delete', {
        jobId,
      }),
    createAutomation: (
      params: Parameters<typeof buildBuiltinCreateAutomationParams>[0],
    ) =>
      callHost<AutomationInfo>(
        'automation.create',
        buildBuiltinCreateAutomationParams(params),
      ),
    listAutomations: () => callHost<AutomationInfo[]>('automation.list'),
    toggleAutomation: (automationId: string) =>
      callHost<{ id: string; enabled: boolean } | null>('automation.toggle', {
        automationId,
      }),
    runAutomation: (automationId: string) =>
      callHost<{ status: string; results: JsonValue[] } | null>('automation.run', {
        automationId,
      }),
    emitAutomationEvent: (event: string) =>
      callHost<AutomationEventDispatchInfo>('automation.event.emit', {
        event,
      }),
    getPluginSelf: () =>
      callHost<PluginSelfInfo>('plugin.self.get'),
    listLogs: (query: Record<string, unknown> = {}) =>
      callHost<PluginEventListResult>('log.list', {
        ...(toHostJsonValue(query) as JsonObject),
      }),
    writeLog: (input: {
      level: PluginEventListResult['items'][number]['level'];
      message: string;
      type?: string;
      metadata?: Record<string, unknown>;
    }) =>
      callHost<boolean>('log.write', {
        level: input.level,
        message: input.message,
        ...(input.type ? { type: input.type } : {}),
        ...(input.metadata
          ? { metadata: toHostJsonValue(input.metadata) }
          : {}),
      }),
    listConversationMessages: () =>
      call('conversation.messages.list', {}),
    getStorage: (key: string, options?: Parameters<typeof toScopedStateParams>[0]) =>
      call('storage.get', {
        key,
        ...toScopedStateParams(options),
      }),
    setStorage: (
      key: string,
      value: JsonValue,
      options?: Parameters<typeof toScopedStateParams>[0],
    ) =>
      call('storage.set', {
        key,
        value,
        ...toScopedStateParams(options),
      }),
    deleteStorage: (key: string, options?: Parameters<typeof toScopedStateParams>[0]) =>
      call('storage.delete', {
        key,
        ...toScopedStateParams(options),
      }),
    listStorage: (prefix?: string, options?: Parameters<typeof toScopedStateParams>[0]) =>
      call('storage.list', {
        ...(prefix ? { prefix } : {}),
        ...toScopedStateParams(options),
      }),
    getState: (key: string, options?: Parameters<typeof toScopedStateParams>[0]) =>
      call('state.get', {
        key,
        ...toScopedStateParams(options),
      }),
    setState: (
      key: string,
      value: JsonValue,
      options?: Parameters<typeof toScopedStateParams>[0],
    ) =>
      call('state.set', {
        key,
        value,
        ...toScopedStateParams(options),
      }),
    deleteState: (key: string, options?: Parameters<typeof toScopedStateParams>[0]) =>
      call('state.delete', {
        key,
        ...toScopedStateParams(options),
      }),
    listState: (prefix?: string, options?: Parameters<typeof toScopedStateParams>[0]) =>
      call('state.list', {
        ...(prefix ? { prefix } : {}),
        ...toScopedStateParams(options),
      }),
    saveMemory: (input: {
      content: string;
      category?: string;
      keywords?: string;
    }) =>
      call('memory.save', {
        content: input.content,
        ...(input.category ? { category: input.category } : {}),
        ...(input.keywords ? { keywords: input.keywords } : {}),
      }),
    getConfig: (key?: string) =>
      call('config.get', key ? { key } : {}),
    getUser: () => call('user.get', {}),
    setConversationTitle: (title: string) =>
      call('conversation.title.set', {
        title,
      }),
    generate: (params: Parameters<typeof buildBuiltinGenerateParams>[0]) =>
      callHost<PluginLlmGenerateResult>('llm.generate', buildBuiltinGenerateParams(params)),
    runSubagent: (params: Parameters<typeof buildBuiltinRunSubagentParams>[0]) =>
      callHost<PluginSubagentRunResult>('subagent.run', buildBuiltinRunSubagentParams(params)),
    startSubagentTask: (
      params: Parameters<typeof buildBuiltinStartSubagentTaskParams>[0],
    ) =>
      callHost<PluginSubagentTaskSummary>(
        'subagent.task.start',
        buildBuiltinStartSubagentTaskParams(params),
      ),
    listSubagentTasks: () =>
      callHost<PluginSubagentTaskSummary[]>('subagent.task.list'),
    getSubagentTask: (taskId: string) =>
      callHost<PluginSubagentTaskDetail>('subagent.task.get', {
        taskId,
      }),
    generateText: (params: Parameters<typeof buildBuiltinGenerateTextParams>[0]) =>
      call('llm.generate-text', buildBuiltinGenerateTextParams(params)),
  };
}
