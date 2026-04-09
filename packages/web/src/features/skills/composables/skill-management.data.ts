import type {
  ConversationSkillState,
  SkillDetail,
  UpdateSkillGovernancePayload,
} from '@garlic-claw/shared'
import {
  getConversationSkills,
  listSkills,
  refreshSkills,
  updateConversationSkills,
  updateSkillGovernance,
} from '@/features/skills/api/skills'
import { getErrorMessage } from '@/utils/error'

const EMPTY_CONVERSATION_SKILL_STATE: ConversationSkillState = {
  activeSkillIds: [],
  activeSkills: [],
}

/**
 * 读取 skill 列表。
 * @returns 当前技能目录
 */
export function loadSkillCatalog(): Promise<SkillDetail[]> {
  return listSkills()
}

/**
 * 刷新 skill 目录。
 * @returns 刷新后的技能列表
 */
export function refreshSkillCatalog(): Promise<SkillDetail[]> {
  return refreshSkills()
}

/**
 * 保存 skill 治理配置。
 * @param skillId skill ID
 * @param patch 局部治理配置
 * @returns 更新后的 skill
 */
export function saveSkillGovernance(
  skillId: string,
  patch: UpdateSkillGovernancePayload,
): Promise<SkillDetail> {
  return updateSkillGovernance(skillId, patch)
}

/**
 * 读取会话级 skill 状态。
 * @param conversationId 会话 ID
 * @returns 当前会话 skill 状态
 */
export async function loadConversationSkillState(
  conversationId: string,
): Promise<ConversationSkillState> {
  try {
    return await getConversationSkills(conversationId)
  } catch {
    return EMPTY_CONVERSATION_SKILL_STATE
  }
}

/**
 * 保存会话级 skill 激活列表。
 * @param conversationId 会话 ID
 * @param activeSkillIds 激活中的 skill ID 列表
 * @returns 保存后的会话 skill 状态
 */
export function saveConversationSkills(
  conversationId: string,
  activeSkillIds: string[],
): Promise<ConversationSkillState> {
  return updateConversationSkills(conversationId, {
    activeSkillIds,
  })
}

/**
 * 统一转换 skill 管理页错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
