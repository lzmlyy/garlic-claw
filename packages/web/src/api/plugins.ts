import { request } from './base'
import type {
  PluginActionName,
  PluginActionResult,
  PluginConfigSnapshot,
  PluginCronJobSummary,
  PluginEventRecord,
  PluginHealthSnapshot,
  PluginInfo,
  PluginScopeSettings,
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

export function runPluginAction(name: string, action: PluginActionName) {
  return request<PluginActionResult>(
    `/plugins/${encodeURIComponent(name)}/actions/${action}`,
    {
      method: 'POST',
    },
  )
}
