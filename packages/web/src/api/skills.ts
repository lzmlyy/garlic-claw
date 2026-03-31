import type {
  ConversationSkillState,
  SkillDetail,
  UpdateConversationSkillsPayload,
  UpdateSkillGovernancePayload,
} from '@garlic-claw/shared'
import { request } from './base'

export function listSkills() {
  return request<SkillDetail[]>('/skills')
}

export function refreshSkills() {
  return request<SkillDetail[]>('/skills/refresh', {
    method: 'POST',
  })
}

export function updateSkillGovernance(
  skillId: string,
  payload: UpdateSkillGovernancePayload,
) {
  return request<SkillDetail>(`/skills/${encodeURIComponent(skillId)}/governance`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getConversationSkills(conversationId: string) {
  return request<ConversationSkillState>(`/chat/conversations/${conversationId}/skills`)
}

export function updateConversationSkills(
  conversationId: string,
  payload: UpdateConversationSkillsPayload,
) {
  return request<ConversationSkillState>(`/chat/conversations/${conversationId}/skills`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
