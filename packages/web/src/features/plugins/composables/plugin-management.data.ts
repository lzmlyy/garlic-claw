import type {
  AiProviderSummary,
  PluginActionName,
  PluginConfigSnapshot,
  PluginConversationSessionInfo,
  PluginEventListResult,
  PluginEventQuery,
  PluginHealthSnapshot,
  PluginInfo,
  PluginLlmPreference,
  PluginScopeSettings,
  PluginStorageEntry,
  PluginCronJobSummary,
} from '@garlic-claw/shared'
import {
  listAiModels,
  listAiProviders,
} from '@/features/ai-settings/api/ai'
import {
  deletePlugin,
  deletePluginCron,
  deletePluginStorage,
  finishPluginConversationSession,
  getPluginConfig,
  getPluginCrons,
  getPluginHealth,
  getPluginLlmPreference,
  getPluginScope,
  listPluginConversationSessions,
  listPluginEvents,
  listPlugins,
  type PluginLlmRouteOption,
  listPluginStorage,
  runPluginAction,
  setPluginStorage,
  updatePluginConfig,
  updatePluginLlmPreference,
  updatePluginScope,
} from '@/features/plugins/api/plugins'
import { getErrorMessage } from '@/utils/error'

export type { PluginLlmRouteOption } from '@/features/plugins/api/plugins'

export interface PluginDetailSnapshot {
  configSnapshot: PluginConfigSnapshot
  conversationSessions: PluginConversationSessionInfo[]
  cronJobs: PluginCronJobSummary[]
  scopeSettings: PluginScopeSettings
  healthSnapshot: PluginHealthSnapshot
  llmPreference: PluginLlmPreference
  llmProviders: AiProviderSummary[]
  llmOptions: PluginLlmRouteOption[]
  eventResult: PluginEventListResult
  storageEntries: PluginStorageEntry[]
}

export function loadPlugins(): Promise<PluginInfo[]> {
  return listPlugins()
}

/**
 * 统一读取插件详情页右侧所需的数据。
 * @param pluginName 插件名
 * @param eventQuery 当前事件查询
 * @param storagePrefix 当前 KV 前缀
 * @returns 详情页数据快照
 */
export async function loadPluginDetailSnapshot(
  pluginName: string,
  eventQuery: PluginEventQuery,
  storagePrefix: string,
): Promise<PluginDetailSnapshot> {
  const [
    configSnapshot,
    conversationSessions,
    cronJobs,
    scopeSettings,
    healthSnapshot,
    llmPreference,
    llmRouteSnapshot,
    eventResult,
    storageEntries,
  ] = await Promise.all([
    getPluginConfig(pluginName),
    listPluginConversationSessions(pluginName),
    getPluginCrons(pluginName),
    getPluginScope(pluginName),
    getPluginHealth(pluginName),
    getPluginLlmPreference(pluginName),
    loadPluginLlmRouteSnapshot(),
    listPluginEvents(pluginName, eventQuery),
    listPluginStorage(pluginName, storagePrefix || undefined),
  ])

  return {
    configSnapshot,
    conversationSessions,
    cronJobs,
    scopeSettings,
    healthSnapshot,
    llmPreference,
    llmProviders: llmRouteSnapshot.providers,
    llmOptions: llmRouteSnapshot.options,
    eventResult,
    storageEntries,
  }
}

export function loadPluginEvents(
  pluginName: string,
  query: PluginEventQuery,
): Promise<PluginEventListResult> {
  return listPluginEvents(pluginName, normalizeEventQuery(query))
}

export function loadPluginStorage(
  pluginName: string,
  prefix: string,
): Promise<PluginStorageEntry[]> {
  return listPluginStorage(pluginName, prefix || undefined)
}

export function savePluginConfig(
  pluginName: string,
  values: PluginConfigSnapshot['values'],
) {
  return updatePluginConfig(pluginName, values)
}

export function savePluginLlmPreference(
  pluginName: string,
  preference: PluginLlmPreference,
) {
  return updatePluginLlmPreference(pluginName, preference)
}

export function savePluginStorageEntry(
  pluginName: string,
  entry: PluginStorageEntry,
) {
  return setPluginStorage(pluginName, entry.key, entry.value)
}

export function deletePluginStorageEntry(
  pluginName: string,
  key: string,
) {
  return deletePluginStorage(pluginName, key)
}

export function deletePluginCronJob(pluginName: string, jobId: string) {
  return deletePluginCron(pluginName, jobId)
}

export function finishPluginConversation(
  pluginName: string,
  conversationId: string,
) {
  return finishPluginConversationSession(pluginName, conversationId)
}

export function savePluginScope(
  pluginName: string,
  conversations: PluginScopeSettings['conversations'],
) {
  return updatePluginScope(pluginName, conversations)
}

export function runPluginActionRequest(
  pluginName: string,
  action: PluginActionName,
) {
  return runPluginAction(pluginName, action)
}

export function deletePluginRecord(pluginName: string) {
  return deletePlugin(pluginName)
}

/**
 * 归一化事件日志查询条件。
 * @param query 原始查询
 * @returns 归一化后的查询对象
 */
export function normalizeEventQuery(query: PluginEventQuery): PluginEventQuery {
  return {
    limit: Math.min(200, Math.max(1, query.limit ?? 50)),
    ...(query.level ? { level: query.level } : {}),
    ...(query.type?.trim() ? { type: query.type.trim() } : {}),
    ...(query.keyword?.trim() ? { keyword: query.keyword.trim() } : {}),
  }
}

/**
 * 以事件 ID 去重并保持原顺序。
 * @param events 事件列表
 * @returns 去重后的列表
 */
export function dedupeEventLogs(events: PluginEventListResult['items']) {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (seen.has(event.id)) {
      return false
    }
    seen.add(event.id)
    return true
  })
}

/**
 * 把未知错误收敛为用户可读文本。
 * @param error 捕获到的异常
 * @param fallback 默认兜底文本
 * @returns 可展示的错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}

async function loadPluginLlmRouteSnapshot(): Promise<{
  providers: AiProviderSummary[]
  options: PluginLlmRouteOption[]
}> {
  const providers = await listAiProviders()
  const modelGroups = await Promise.all(
    providers.map(async (provider) => ({
      models: await listAiModels(provider.id),
      provider,
    })),
  )

  return {
    providers,
    options: modelGroups.flatMap(({ models, provider }) =>
      models.map((model) => ({
        providerId: provider.id,
        modelId: model.id,
        label: `${provider.name} · ${model.name || model.id}`,
      })),
    ),
  }
}
