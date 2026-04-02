import type {
  ActionConfig,
  AutomationEventDispatchInfo,
  AutomationInfo,
  HostCallPayload,
  PluginCallContext,
  PluginEventListResult,
  PluginEventLevel,
  PluginEventQuery,
  PluginKbEntryDetail,
  PluginKbEntrySummary,
  PluginCronDescriptor,
  PluginCronJobSummary,
  PluginConversationSessionInfo,
  PluginConversationSessionKeepParams,
  PluginConversationSessionStartParams,
  PluginHookName,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginManifest,
  PluginMessageSendInfo,
  PluginMessageSendParams,
  PluginMessageTargetInfo,
  PluginPersonaCurrentInfo,
  PluginPersonaSummary,
  PluginProviderCurrentInfo,
  PluginProviderModelSummary,
  PluginProviderSummary,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginSelfInfo,
  PluginSubagentRunParams,
  PluginSubagentRunResult,
  PluginSubagentTaskDetail,
  PluginSubagentTaskStartParams,
  PluginSubagentTaskSummary,
  TriggerConfig,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type {
  BuiltinPluginGenerateTextParams,
  BuiltinPluginScopedStateOptions,
} from './builtin-plugin-host-params.helpers';

/**
 * 内建插件可用的 Host API 调用器。
 */
export interface BuiltinPluginHostCaller {
  /**
   * 执行一次 Host API 调用。
   * @param input 插件 ID、上下文、方法和参数
   * @returns JSON 可序列化结果
   */
  call(input: {
    pluginId: string;
    context: PluginCallContext;
    method: HostCallPayload['method'];
    params: JsonObject;
  }): Promise<JsonValue>;
}

/**
 * 内建插件可选的治理动作处理器。
 */
export interface BuiltinPluginGovernanceHandlers {
  /**
   * 重新装载当前内建插件。
   * @returns 无返回值
   */
  reload?: () => Promise<void> | void;

  /**
   * 请求当前内建插件重连。
   * @returns 无返回值
   */
  reconnect?: () => Promise<void> | void;

  /**
   * 对当前内建插件执行健康检查。
   * @returns 健康检查结果
   */
  checkHealth?: () => Promise<{ ok: boolean }> | { ok: boolean };
}

/**
 * 内建插件的宿主 API 门面。
 */
export interface BuiltinPluginHostFacade {
  call(method: HostCallPayload['method'], params: JsonObject): Promise<JsonValue>;
  getCurrentProvider(): Promise<PluginProviderCurrentInfo>;
  listProviders(): Promise<PluginProviderSummary[]>;
  getProvider(providerId: string): Promise<PluginProviderSummary>;
  getProviderModel(
    providerId: string,
    modelId: string,
  ): Promise<PluginProviderModelSummary>;
  getConversation(): Promise<JsonValue>;
  searchMemories(query: string, limit?: number): Promise<JsonValue>;
  getCurrentMessageTarget(): Promise<PluginMessageTargetInfo | null>;
  sendMessage(input: PluginMessageSendParams): Promise<PluginMessageSendInfo>;
  startConversationSession(
    input: PluginConversationSessionStartParams,
  ): Promise<PluginConversationSessionInfo>;
  getConversationSession(): Promise<PluginConversationSessionInfo | null>;
  keepConversationSession(
    input: PluginConversationSessionKeepParams,
  ): Promise<PluginConversationSessionInfo | null>;
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
  createAutomation(input: {
    name: string;
    trigger: TriggerConfig;
    actions: ActionConfig[];
  }): Promise<AutomationInfo>;
  listAutomations(): Promise<AutomationInfo[]>;
  toggleAutomation(automationId: string): Promise<{ id: string; enabled: boolean } | null>;
  runAutomation(
    automationId: string,
  ): Promise<{ status: string; results: JsonValue[] } | null>;
  emitAutomationEvent(event: string): Promise<AutomationEventDispatchInfo>;
  getPluginSelf(): Promise<PluginSelfInfo>;
  listLogs(query?: PluginEventQuery): Promise<PluginEventListResult>;
  writeLog(input: {
    level: PluginEventLevel;
    message: string;
    type?: string;
    metadata?: JsonObject;
  }): Promise<boolean>;
  listConversationMessages(): Promise<JsonValue>;
  getStorage(key: string, options?: BuiltinPluginScopedStateOptions): Promise<JsonValue>;
  setStorage(
    key: string,
    value: JsonValue,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;
  deleteStorage(
    key: string,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;
  listStorage(
    prefix?: string,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;
  getState(key: string, options?: BuiltinPluginScopedStateOptions): Promise<JsonValue>;
  setState(
    key: string,
    value: JsonValue,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;
  deleteState(
    key: string,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;
  listState(
    prefix?: string,
    options?: BuiltinPluginScopedStateOptions,
  ): Promise<JsonValue>;
  saveMemory(input: {
    content: string;
    category?: string;
    keywords?: string;
  }): Promise<JsonValue>;
  getConfig(key?: string): Promise<JsonValue>;
  getUser(): Promise<JsonValue>;
  setConversationTitle(title: string): Promise<JsonValue>;
  generate(params: PluginLlmGenerateParams): Promise<PluginLlmGenerateResult>;
  runSubagent(params: PluginSubagentRunParams): Promise<PluginSubagentRunResult>;
  startSubagentTask(
    params: PluginSubagentTaskStartParams,
  ): Promise<PluginSubagentTaskSummary>;
  listSubagentTasks(): Promise<PluginSubagentTaskSummary[]>;
  getSubagentTask(taskId: string): Promise<PluginSubagentTaskDetail>;
  generateText(params: BuiltinPluginGenerateTextParams): Promise<JsonValue>;
}

/**
 * 内建插件执行上下文。
 */
export interface BuiltinPluginExecutionContext {
  callContext: PluginCallContext;
  host: BuiltinPluginHostFacade;
}

/**
 * 内建插件工具处理器。
 */
export type BuiltinPluginToolHandler = (
  params: JsonObject,
  context: BuiltinPluginExecutionContext,
) => Promise<JsonValue> | JsonValue;

/**
 * 内建插件 Hook 处理器。
 */
export type BuiltinPluginHookHandler = (
  payload: JsonValue,
  context: BuiltinPluginExecutionContext,
) => Promise<JsonValue | null | undefined> | JsonValue | null | undefined;

/**
 * 内建插件 Route 处理器。
 */
export type BuiltinPluginRouteHandler = (
  request: PluginRouteRequest,
  context: BuiltinPluginExecutionContext,
) => Promise<PluginRouteResponse> | PluginRouteResponse;

/**
 * 内建插件定义。
 */
export interface BuiltinPluginDefinition {
  manifest: PluginManifest;
  tools?: Record<string, BuiltinPluginToolHandler>;
  hooks?: Partial<Record<PluginHookName, BuiltinPluginHookHandler>>;
  routes?: Record<string, BuiltinPluginRouteHandler>;
}
