import { get, put } from '@/api/http'
import type { PluginPersonaCurrentInfo, PluginPersonaSummary } from '@garlic-claw/shared'

export function listPersonas() {
  return get<PluginPersonaSummary[]>('/personas')
}

export function getCurrentPersona(conversationId?: string) {
  const query = conversationId
    ? `?conversationId=${encodeURIComponent(conversationId)}`
    : ''
  return get<PluginPersonaCurrentInfo>(`/personas/current${query}`)
}

export function activateConversationPersona(
  conversationId: string,
  personaId: string,
) {
  return put<PluginPersonaCurrentInfo>('/personas/current', {
    conversationId,
    personaId,
  })
}
