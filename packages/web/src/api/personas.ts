import { request } from './base'
import type { PluginPersonaCurrentInfo, PluginPersonaSummary } from '@garlic-claw/shared'

export function listPersonas() {
  return request<PluginPersonaSummary[]>('/personas')
}

export function getCurrentPersona(conversationId?: string) {
  const query = conversationId
    ? `?conversationId=${encodeURIComponent(conversationId)}`
    : ''
  return request<PluginPersonaCurrentInfo>(`/personas/current${query}`)
}

export function activateConversationPersona(
  conversationId: string,
  personaId: string,
) {
  return request<PluginPersonaCurrentInfo>('/personas/current', {
    method: 'PUT',
    body: JSON.stringify({
      conversationId,
      personaId,
    }),
  })
}
