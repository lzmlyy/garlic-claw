import { delete as del, get, post, put, requestWithMetadata } from '@/api/http'
import type {
  JsonValue,
  PluginActionName,
  PluginActionResult,
  PluginConfigSnapshot,
  PluginConversationSessionInfo,
  PluginCronJobSummary,
  PluginEventListResult,
  PluginEventQuery,
  PluginHealthSnapshot,
  PluginInfo,
  PluginRouteMethod,
  PluginScopeSettings,
  PluginStorageEntry,
} from '@garlic-claw/shared'

export function listPlugins() {
  return get<PluginInfo[]>('/plugins')
}

export function deletePlugin(name: string) {
  return del(`/plugins/${encodeURIComponent(name)}`)
}

export function getPluginConfig(name: string) {
  return get<PluginConfigSnapshot>(`/plugins/${encodeURIComponent(name)}/config`)
}

export function updatePluginConfig(
  name: string,
  values: PluginConfigSnapshot['values'],
) {
  return put<PluginConfigSnapshot>(`/plugins/${encodeURIComponent(name)}/config`, {
    values,
  })
}

export function getPluginScope(name: string) {
  return get<PluginScopeSettings>(`/plugins/${encodeURIComponent(name)}/scopes`)
}

export function updatePluginScope(
  name: string,
  conversations: PluginScopeSettings['conversations'],
) {
  return put<PluginScopeSettings>(`/plugins/${encodeURIComponent(name)}/scopes`, {
    conversations,
  })
}

export function getPluginHealth(name: string) {
  return get<PluginHealthSnapshot>(`/plugins/${encodeURIComponent(name)}/health`)
}

export function listPluginEvents(
  name: string,
  query: PluginEventQuery = {},
) {
  const search = new URLSearchParams()
  if (query.limit !== undefined) {
    search.set('limit', String(query.limit))
  }
  if (query.level) {
    search.set('level', query.level)
  }
  if (query.type?.trim()) {
    search.set('type', query.type.trim())
  }
  if (query.keyword?.trim()) {
    search.set('keyword', query.keyword.trim())
  }
  if (query.cursor?.trim()) {
    search.set('cursor', query.cursor.trim())
  }

  const querySuffix = search.size > 0 ? `?${search.toString()}` : ''
  return get<PluginEventListResult>(
    `/plugins/${encodeURIComponent(name)}/events${querySuffix}`,
  )
}

export function getPluginCrons(name: string) {
  return get<PluginCronJobSummary[]>(`/plugins/${encodeURIComponent(name)}/crons`)
}

export function deletePluginCron(name: string, jobId: string) {
  return del<boolean>(
    `/plugins/${encodeURIComponent(name)}/crons/${encodeURIComponent(jobId)}`,
  )
}

export function listPluginConversationSessions(name: string) {
  return get<PluginConversationSessionInfo[]>(
    `/plugins/${encodeURIComponent(name)}/sessions`,
  )
}

export function finishPluginConversationSession(
  name: string,
  conversationId: string,
) {
  return del<boolean>(
    `/plugins/${encodeURIComponent(name)}/sessions/${encodeURIComponent(conversationId)}`,
  )
}

export function listPluginStorage(name: string, prefix?: string) {
  const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
  return get<PluginStorageEntry[]>(
    `/plugins/${encodeURIComponent(name)}/storage${query}`,
  )
}

export function setPluginStorage(
  name: string,
  key: string,
  value: PluginStorageEntry['value'],
) {
  return put<PluginStorageEntry>(`/plugins/${encodeURIComponent(name)}/storage`, {
    key,
    value,
  })
}

export function deletePluginStorage(name: string, key: string) {
  return del<boolean>(
    `/plugins/${encodeURIComponent(name)}/storage?key=${encodeURIComponent(key)}`,
  )
}

export function runPluginAction(name: string, action: PluginActionName) {
  return post<PluginActionResult>(`/plugins/${encodeURIComponent(name)}/actions/${action}`)
}

export function invokePluginRoute(
  pluginName: string,
  routePath: string,
  method: PluginRouteMethod,
  options: {
    query?: string
    body?: JsonValue | null
  } = {},
) {
  const normalizedPath = routePath.trim().replace(/^\/+|\/+$/g, '')
  const normalizedQuery = options.query?.trim().replace(/^\?/, '') ?? ''
  const querySuffix = normalizedQuery ? `?${normalizedQuery}` : ''
  const requestOptions = {
    method,
    ...(method !== 'GET' && method !== 'DELETE' && options.body !== undefined
      ? { body: options.body }
      : {}),
  }

  return requestWithMetadata<JsonValue>(
    `/plugin-routes/${encodeURIComponent(pluginName)}/${normalizedPath}${querySuffix}`,
    requestOptions,
  )
}
