import { request } from './base'
import type { PluginInfo } from '@garlic-claw/shared'

export function listPlugins() {
  return request<PluginInfo[]>('/plugins')
}

export function deletePlugin(name: string) {
  return request(`/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' })
}
