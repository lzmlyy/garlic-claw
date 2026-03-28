import { request, requestWithMetadata } from './base'
import type {
  JsonValue,
  PluginActionName,
  PluginActionResult,
  PluginConfigSnapshot,
  PluginCronJobSummary,
  PluginEventRecord,
  PluginHealthSnapshot,
  PluginInfo,
  PluginRouteMethod,
  PluginScopeSettings,
  PluginStorageEntry,
} from '@garlic-claw/shared'

export function listPlugins() {
  return request<PluginInfo[]>('/plugins')
}

export function deletePlugin(name: string) {
  return request(`/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export function getPluginConfig(name: string) {
  return request<PluginConfigSnapshot>(`/plugins/${encodeURIComponent(name)}/config`)
}

export function updatePluginConfig(
  name: string,
  values: PluginConfigSnapshot['values'],
) {
  return request<PluginConfigSnapshot>(`/plugins/${encodeURIComponent(name)}/config`, {
    method: 'PUT',
    body: JSON.stringify({ values }),
  })
}

export function getPluginScope(name: string) {
  return request<PluginScopeSettings>(`/plugins/${encodeURIComponent(name)}/scopes`)
}

export function updatePluginScope(name: string, scope: PluginScopeSettings) {
  return request<PluginScopeSettings>(`/plugins/${encodeURIComponent(name)}/scopes`, {
    method: 'PUT',
    body: JSON.stringify(scope),
  })
}

export function getPluginHealth(name: string) {
  return request<PluginHealthSnapshot>(`/plugins/${encodeURIComponent(name)}/health`)
}

export function listPluginEvents(name: string, limit = 50) {
  return request<PluginEventRecord[]>(
    `/plugins/${encodeURIComponent(name)}/events?limit=${limit}`,
  )
}

export function getPluginCrons(name: string) {
  return request<PluginCronJobSummary[]>(`/plugins/${encodeURIComponent(name)}/crons`)
}

export function deletePluginCron(name: string, jobId: string) {
  return request<boolean>(
    `/plugins/${encodeURIComponent(name)}/crons/${encodeURIComponent(jobId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function listPluginStorage(name: string, prefix?: string) {
  const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
  return request<PluginStorageEntry[]>(
    `/plugins/${encodeURIComponent(name)}/storage${query}`,
  )
}

export function setPluginStorage(
  name: string,
  key: string,
  value: PluginStorageEntry['value'],
) {
  return request<PluginStorageEntry>(`/plugins/${encodeURIComponent(name)}/storage`, {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
  })
}

export function deletePluginStorage(name: string, key: string) {
  return request<boolean>(
    `/plugins/${encodeURIComponent(name)}/storage?key=${encodeURIComponent(key)}`,
    {
      method: 'DELETE',
    },
  )
}

export function runPluginAction(name: string, action: PluginActionName) {
  return request<PluginActionResult>(
    `/plugins/${encodeURIComponent(name)}/actions/${action}`,
    {
      method: 'POST',
    },
  )
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
  const requestOptions: RequestInit = {
    method,
  }

  if (method !== 'GET' && method !== 'DELETE' && options.body !== undefined) {
    requestOptions.body = JSON.stringify(options.body)
  }

  return requestWithMetadata<JsonValue>(
    `/plugin-routes/${encodeURIComponent(pluginName)}/${normalizedPath}${querySuffix}`,
    requestOptions,
  )
}
