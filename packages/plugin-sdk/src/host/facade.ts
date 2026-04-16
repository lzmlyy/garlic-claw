import type { ActionConfig, AutomationEventDispatchInfo, AutomationInfo, HostCallPayload, JsonObject, JsonValue, PluginCronDescriptor, PluginCronJobSummary, PluginEventLevel, PluginEventListResult, PluginEventQuery, PluginKbEntryDetail, PluginKbEntrySummary, PluginMessageSendInfo, PluginMessageSendParams, PluginMessageTargetInfo, PluginPersonaCurrentInfo, PluginPersonaSummary, PluginProviderCurrentInfo, PluginProviderModelSummary, PluginProviderSummary, PluginScopedStateScope, PluginSelfInfo, PluginSubagentTaskDetail, PluginSubagentTaskStartParams, PluginSubagentTaskSummary, PluginConversationSessionInfo, PluginConversationSessionKeepParams, PluginConversationSessionStartParams, PluginMessageHookInfo, PluginLlmGenerateParams, PluginLlmGenerateResult, PluginSubagentRunParams, PluginSubagentRunResult, TriggerConfig } from "@garlic-claw/shared";
import { buildPluginConversationSessionKeepParams, buildPluginConversationSessionStartParams, buildPluginCreateAutomationParams, buildPluginGenerateParams, buildPluginGenerateTextParams, buildPluginMessageSendParams, buildPluginRegisterCronParams, buildPluginRunSubagentParams, buildPluginStartSubagentTaskParams, toScopedStateParams } from "./facade-payload.helpers";
import { toHostJsonValue } from "./host-json-value.codec";
export interface PluginScopedStateOptions { scope?: PluginScopedStateScope; }
export interface PluginGenerateTextParams { prompt: string; system?: string; providerId?: string; modelId?: string; variant?: string; maxOutputTokens?: number; providerOptions?: JsonObject; headers?: Record<string, string>; }
type ScopedJsonReader = (key: string, options?: PluginScopedStateOptions) => Promise<JsonValue>;
type ScopedJsonWriter = (key: string, value: JsonValue, options?: PluginScopedStateOptions) => Promise<JsonValue>;
type ScopedJsonLister = (prefix?: string, options?: PluginScopedStateOptions) => Promise<JsonValue>;
type ConversationSessionMethods = { start(input: PluginConversationSessionStartParams): Promise<PluginConversationSessionInfo>; get(): Promise<PluginConversationSessionInfo | null>; keep(input: PluginConversationSessionKeepParams): Promise<PluginConversationSessionInfo | null>; finish(): Promise<boolean>; };
type AutomationCreateInput = { name: string; trigger: TriggerConfig; actions: ActionConfig[] };
type AutomationToggleResult = { id: string; enabled: boolean } | null;
type AutomationRunResult = { status: string; results: JsonValue[] } | null;
type PluginLogWriteInput = { level: PluginEventLevel; message: string; type?: string; metadata?: JsonObject };
type PluginMemorySaveInput = { content: string; category?: string; keywords?: string };
export interface PluginHostFacade {
  call(method: HostCallPayload["method"], params: JsonObject): Promise<JsonValue>;
  getCurrentProvider(): Promise<PluginProviderCurrentInfo>;
  listProviders(): Promise<PluginProviderSummary[]>;
  getProvider(providerId: string): Promise<PluginProviderSummary>;
  getProviderModel(providerId: string, modelId: string): Promise<PluginProviderModelSummary>;
  getConversation(): Promise<JsonValue>;
  getCurrentMessageTarget(): Promise<PluginMessageTargetInfo | null>;
  sendMessage(input: PluginMessageSendParams): Promise<PluginMessageSendInfo>;
  conversationSession: PluginConversationSessionController;
  startConversationSession(input: PluginConversationSessionStartParams): Promise<PluginConversationSessionInfo>;
  getConversationSession(): Promise<PluginConversationSessionInfo | null>;
  keepConversationSession(input: PluginConversationSessionKeepParams): Promise<PluginConversationSessionInfo | null>;
  finishConversationSession(): Promise<boolean>;
  listKnowledgeBaseEntries(limit?: number): Promise<PluginKbEntrySummary[]>;
  searchKnowledgeBase(query: string, limit?: number): Promise<PluginKbEntryDetail[]>;
  getKnowledgeBaseEntry(entryId: string): Promise<PluginKbEntryDetail>;
  getCurrentPersona(): Promise<PluginPersonaCurrentInfo>;
  listPersonas(): Promise<PluginPersonaSummary[]>;
  getPersona(personaId: string): Promise<PluginPersonaSummary>;
  activatePersona(personaId: string): Promise<PluginPersonaCurrentInfo>;
  registerCron(descriptor: PluginCronDescriptor): Promise<PluginCronJobSummary>;
  listCrons(): Promise<PluginCronJobSummary[]>;
  deleteCron(jobId: string): Promise<boolean>;
  createAutomation(input: AutomationCreateInput): Promise<AutomationInfo>;
  listAutomations(): Promise<AutomationInfo[]>;
  toggleAutomation(automationId: string): Promise<AutomationToggleResult>;
  runAutomation(automationId: string): Promise<AutomationRunResult>;
  emitAutomationEvent(event: string): Promise<AutomationEventDispatchInfo>;
  getPluginSelf(): Promise<PluginSelfInfo>;
  listLogs(query?: PluginEventQuery): Promise<PluginEventListResult>;
  writeLog(input: PluginLogWriteInput): Promise<boolean>;
  searchMemories(query: string, limit?: number): Promise<JsonValue>;
  saveMemory(params: PluginMemorySaveInput): Promise<JsonValue>;
  listConversationMessages(): Promise<JsonValue>;
  getStorage: ScopedJsonReader;
  setStorage: ScopedJsonWriter;
  deleteStorage: ScopedJsonReader;
  listStorage: ScopedJsonLister;
  getState: ScopedJsonReader;
  setState: ScopedJsonWriter;
  deleteState: ScopedJsonReader;
  listState: ScopedJsonLister;
  getConfig(key?: string): Promise<JsonValue>;
  getUser(): Promise<JsonValue>;
  setConversationTitle(title: string): Promise<JsonValue>;
  generate(params: PluginLlmGenerateParams): Promise<PluginLlmGenerateResult>;
  runSubagent(params: PluginSubagentRunParams): Promise<PluginSubagentRunResult>;
  startSubagentTask(params: PluginSubagentTaskStartParams): Promise<PluginSubagentTaskSummary>;
  listSubagentTasks(): Promise<PluginSubagentTaskSummary[]>;
  getSubagentTask(taskId: string): Promise<PluginSubagentTaskDetail>;
  generateText(params: PluginGenerateTextParams): Promise<JsonValue>;
}
export type PluginHostFacadeMethods = Omit<PluginHostFacade, "conversationSession">;
export interface PluginHostFacadeFactoryInput {
  call: PluginHostFacade["call"];
  callHost<T>(method: HostCallPayload["method"], params?: JsonObject): Promise<T>;
  conversationSessionController?: ConversationSessionMethods;
}
export interface PluginConversationSessionController { readonly conversationId: string | null; readonly session: PluginConversationSessionInfo | null; readonly timeoutMs: number | null; readonly startedAt: string | null; readonly expiresAt: string | null; readonly lastMatchedAt: string | null; readonly captureHistory: boolean; readonly historyMessages: PluginMessageHookInfo[]; readonly metadata: JsonValue | undefined; start(input: PluginConversationSessionStartParams): Promise<PluginConversationSessionInfo>; get(): Promise<PluginConversationSessionInfo | null>; sync(): Promise<PluginConversationSessionInfo | null>; keep(input: PluginConversationSessionKeepParams): Promise<PluginConversationSessionInfo | null>; finish(): Promise<boolean>; }
export { toHostJsonValue } from "./host-json-value.codec";
export function createPluginHostFacade(input: PluginHostFacadeFactoryInput): PluginHostFacadeMethods {
  const { call, callHost, conversationSessionController } = input;
  const callHostNoArgs = <T>(method: HostCallPayload["method"]) => () => callHost<T>(method);
  const callHostByKey = <T>(method: HostCallPayload["method"], key: string) => (value: string) => callHost<T>(method, { [key]: value } as JsonObject);
  const callScopedKey = (method: HostCallPayload["method"]) => (key: string, options?: PluginScopedStateOptions) => call(method, { key, ...toScopedStateParams(options) });
  const callScopedKeyValue = (method: HostCallPayload["method"]) => (key: string, value: JsonValue, options?: PluginScopedStateOptions) => call(method, { key, value, ...toScopedStateParams(options) });
  const callScopedList = (method: HostCallPayload["method"]) => (prefix?: string, options?: PluginScopedStateOptions) => call(method, { ...(prefix ? { prefix } : {}), ...toScopedStateParams(options) });
  return {
    call,
    getCurrentProvider: callHostNoArgs<PluginProviderCurrentInfo>("provider.current.get"),
    listProviders: callHostNoArgs<PluginProviderSummary[]>("provider.list"),
    getProvider: callHostByKey<PluginProviderSummary>("provider.get", "providerId"),
    getProviderModel: (providerId, modelId) => callHost<PluginProviderModelSummary>("provider.model.get", { providerId, modelId }),
    getConversation: () => call("conversation.get", {}),
    getCurrentMessageTarget: callHostNoArgs<PluginMessageTargetInfo | null>("message.target.current.get"),
    sendMessage: (params) => callHost<PluginMessageSendInfo>("message.send", buildPluginMessageSendParams(params)),
    startConversationSession: (params) => (conversationSessionController ? conversationSessionController.start(params) : callHost<PluginConversationSessionInfo>("conversation.session.start", buildPluginConversationSessionStartParams(params))),
    getConversationSession: () => (conversationSessionController ? conversationSessionController.get() : callHost<PluginConversationSessionInfo | null>("conversation.session.get")),
    keepConversationSession: (params) => (conversationSessionController ? conversationSessionController.keep(params) : callHost<PluginConversationSessionInfo | null>("conversation.session.keep", buildPluginConversationSessionKeepParams(params))),
    finishConversationSession: () => (conversationSessionController ? conversationSessionController.finish() : callHost<boolean>("conversation.session.finish")),
    listKnowledgeBaseEntries: (limit) => callHost<PluginKbEntrySummary[]>("kb.list", typeof limit === "number" ? { limit } : {}),
    searchKnowledgeBase: (query, limit = 5) => callHost<PluginKbEntryDetail[]>("kb.search", { query, limit }),
    getKnowledgeBaseEntry: callHostByKey<PluginKbEntryDetail>("kb.get", "entryId"),
    getCurrentPersona: callHostNoArgs<PluginPersonaCurrentInfo>("persona.current.get"),
    listPersonas: callHostNoArgs<PluginPersonaSummary[]>("persona.list"),
    getPersona: callHostByKey<PluginPersonaSummary>("persona.get", "personaId"),
    activatePersona: callHostByKey<PluginPersonaCurrentInfo>("persona.activate", "personaId"),
    registerCron: (descriptor) => callHost<PluginCronJobSummary>("cron.register", buildPluginRegisterCronParams(descriptor)),
    listCrons: callHostNoArgs<PluginCronJobSummary[]>("cron.list"),
    deleteCron: callHostByKey<boolean>("cron.delete", "jobId"),
    createAutomation: (inputParams) => callHost<AutomationInfo>("automation.create", buildPluginCreateAutomationParams(inputParams)),
    listAutomations: callHostNoArgs<AutomationInfo[]>("automation.list"),
    toggleAutomation: callHostByKey<{ id: string; enabled: boolean } | null>("automation.toggle", "automationId"),
    runAutomation: callHostByKey<{ status: string; results: JsonValue[] } | null>("automation.run", "automationId"),
    emitAutomationEvent: (event) => callHost<AutomationEventDispatchInfo>("automation.event.emit", { event }),
    getPluginSelf: callHostNoArgs<PluginSelfInfo>("plugin.self.get"),
    listLogs: (query = {}) => callHost<PluginEventListResult>("log.list", { ...(toHostJsonValue(query) as JsonObject) }),
    writeLog: ({ level, message, type, metadata }) =>
      callHost<boolean>("log.write", {
        level,
        message,
        ...(type ? { type } : {}),
        ...(metadata ? { metadata: toHostJsonValue(metadata) } : {}),
      }),
    searchMemories: (query, limit = 10) => call("memory.search", { query, limit }),
    saveMemory: ({ content, category, keywords }) => call("memory.save", { content, ...(category ? { category } : {}), ...(keywords ? { keywords } : {}) }),
    listConversationMessages: () => call("conversation.messages.list", {}),
    getStorage: callScopedKey("storage.get"),
    setStorage: callScopedKeyValue("storage.set"),
    deleteStorage: callScopedKey("storage.delete"),
    listStorage: callScopedList("storage.list"),
    getState: callScopedKey("state.get"),
    setState: callScopedKeyValue("state.set"),
    deleteState: callScopedKey("state.delete"),
    listState: callScopedList("state.list"),
    getConfig: (key) => call("config.get", key ? { key } : {}),
    getUser: () => call("user.get", {}),
    setConversationTitle: (title) => call("conversation.title.set", { title }),
    generate: (params) => callHost<PluginLlmGenerateResult>("llm.generate", buildPluginGenerateParams(params)),
    runSubagent: (params) => callHost<PluginSubagentRunResult>("subagent.run", buildPluginRunSubagentParams(params)),
    startSubagentTask: (params) => callHost<PluginSubagentTaskSummary>("subagent.task.start", buildPluginStartSubagentTaskParams(params)),
    listSubagentTasks: callHostNoArgs<PluginSubagentTaskSummary[]>("subagent.task.list"),
    getSubagentTask: callHostByKey<PluginSubagentTaskDetail>("subagent.task.get", "taskId"),
    generateText: (params) => call("llm.generate-text", buildPluginGenerateTextParams(params)),
  };
}
