import { request } from './base'
import type { AutomationInfo, JsonValue } from '@garlic-claw/shared'

export function listAutomations() {
  return request<AutomationInfo[]>('/automations')
}

export function createAutomation(data: {
  name: string
  trigger: { type: string; cron?: string }
  actions: { type: string; plugin?: string; capability?: string; params?: Record<string, JsonValue> }[]
}) {
  return request<AutomationInfo>('/automations', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function toggleAutomation(id: string) {
  return request<{ id: string; enabled: boolean }>(`/automations/${id}/toggle`, {
    method: 'PATCH',
  })
}

export function runAutomation(id: string) {
  return request<{ status: string; results: JsonValue[] }>(`/automations/${id}/run`, {
    method: 'POST',
  })
}

export function deleteAutomation(id: string) {
  return request(`/automations/${id}`, { method: 'DELETE' })
}

export function getAutomationLogs(id: string) {
  return request<{ id: string; status: string; result: string | null; createdAt: string }[]>(
    `/automations/${id}/logs`,
  )
}
