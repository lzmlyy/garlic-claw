import { delete as del, get, post, put } from '@/api/http'
import type {
  PluginPersonaCurrentInfo,
  PluginPersonaDeleteResult,
  PluginPersonaDetail,
  PluginPersonaSummary,
  PluginPersonaUpdateInput,
  PluginPersonaUpsertInput,
} from '@garlic-claw/shared'

export function listPersonas() {
  return get<PluginPersonaSummary[]>('/personas')
}

export function getPersona(personaId: string) {
  return get<PluginPersonaDetail>(`/personas/${encodeURIComponent(personaId)}`)
}

export function createPersona(input: PluginPersonaUpsertInput) {
  return post<PluginPersonaDetail>('/personas', input)
}

export function updatePersona(personaId: string, input: PluginPersonaUpdateInput) {
  return put<PluginPersonaDetail>(`/personas/${encodeURIComponent(personaId)}`, input)
}

export function deletePersona(personaId: string) {
  return del<PluginPersonaDeleteResult>(`/personas/${encodeURIComponent(personaId)}`)
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
