import type {
  ConversationSkillState,
  SkillDetail,
  UpdateConversationSkillsPayload,
  UpdateSkillGovernancePayload,
} from '@garlic-claw/shared'
import { get, post, put } from '@/api/http'

export function listSkills() {
  return get<SkillDetail[]>('/skills')
}

export function refreshSkills() {
  return post<SkillDetail[]>('/skills/refresh')
}

export function updateSkillGovernance(
  skillId: string,
  payload: UpdateSkillGovernancePayload,
) {
  return put<SkillDetail>(`/skills/${encodeURIComponent(skillId)}/governance`, payload)
}

export function getConversationSkills(conversationId: string) {
  return get<ConversationSkillState>(`/chat/conversations/${conversationId}/skills`)
}

export function updateConversationSkills(
  conversationId: string,
  payload: UpdateConversationSkillsPayload,
) {
  return put<ConversationSkillState>(`/chat/conversations/${conversationId}/skills`, payload)
}
