import { delete as del, get, patch, post, put } from '@/shared/api/http'
import type { ActionConfig, AutomationInfo, AutomationLogInfo, JsonValue, TriggerConfig } from '@garlic-claw/shared'

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

export function updateAutomation(id: string, data: {
  name: string
  trigger: TriggerConfig
  actions: ActionConfig[]
}) {
  return put<AutomationInfo>(`/automations/${id}`, data)
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
  return get<AutomationLogInfo[]>(
    `/automations/${id}/logs`,
  )
}
