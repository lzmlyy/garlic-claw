import type {
  PluginPersonaCurrentInfo,
  PluginPersonaDeleteResult,
  PluginPersonaDetail,
  PluginPersonaSummary,
  PluginPersonaUpdateInput,
  PluginPersonaUpsertInput,
} from '@garlic-claw/shared'
import {
  activateConversationPersona as activateConversationPersonaRequest,
  createPersona as createPersonaRequest,
  deletePersona as deletePersonaRequest,
  getPersona as getPersonaRequest,
  getCurrentPersona,
  listPersonas,
  updatePersona as updatePersonaRequest,
} from '@/features/personas/api/personas'
import { getErrorMessage } from '@/utils/error'

/**
 * 读取 Persona 列表。
 * @returns 可用 Persona 列表
 */
export function loadPersonas(): Promise<PluginPersonaSummary[]> {
  return listPersonas()
}

export function loadPersona(personaId: string): Promise<PluginPersonaDetail> {
  return getPersonaRequest(personaId)
}

export function createPersona(
  input: PluginPersonaUpsertInput,
): Promise<PluginPersonaDetail> {
  return createPersonaRequest(input)
}

export function updatePersona(
  personaId: string,
  input: PluginPersonaUpdateInput,
): Promise<PluginPersonaDetail> {
  return updatePersonaRequest(personaId, input)
}

export function deletePersona(
  personaId: string,
): Promise<PluginPersonaDeleteResult> {
  return deletePersonaRequest(personaId)
}

/**
 * 读取当前会话生效的 Persona。
 * @param conversationId 会话 ID，可为空表示默认上下文
 * @returns 当前 Persona 信息
 */
export function loadCurrentPersona(
  conversationId?: string,
): Promise<PluginPersonaCurrentInfo> {
  return getCurrentPersona(conversationId)
}

/**
 * 为当前会话应用 Persona。
 * @param conversationId 会话 ID
 * @param personaId Persona ID
 * @returns 应用后的 Persona 信息
 */
export function activateConversationPersona(
  conversationId: string,
  personaId: string,
): Promise<PluginPersonaCurrentInfo> {
  return activateConversationPersonaRequest(conversationId, personaId)
}

/**
 * 统一转换 Persona 页错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
