import { delete as del, get, patch, post } from '@/api/http'
import type { ActionConfig, AutomationInfo, JsonValue, TriggerConfig } from '@garlic-claw/shared'

export function listAutomations() {
  return get<AutomationInfo[]>('/automations')
}

export function createAutomation(data: {
  name: string
  trigger: TriggerConfig
  actions: ActionConfig[]
}) {
  return post<AutomationInfo>('/automations', data)
}

export function toggleAutomation(id: string) {
  return patch<{ id: string; enabled: boolean }>(`/automations/${id}/toggle`)
}

export function runAutomation(id: string) {
  return post<{ status: string; results: JsonValue[] }>(`/automations/${id}/run`)
}

export function deleteAutomation(id: string) {
  return del(`/automations/${id}`)
}

export function getAutomationLogs(id: string) {
  return get<{ id: string; status: string; result: string | null; createdAt: string }[]>(
    `/automations/${id}/logs`,
  )
}
