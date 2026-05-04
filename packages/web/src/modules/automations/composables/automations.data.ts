import type {
  AutomationInfo,
  AutomationLogInfo,
  Conversation,
} from '@garlic-claw/shared'
import {
  createAutomation,
  deleteAutomation,
  getAutomationLogs,
  listAutomations,
  runAutomation,
  toggleAutomation,
  updateAutomation,
} from '@/modules/automations/api/automations'
import { listConversations } from '@/modules/chat/api/chat'
import { getErrorMessage } from '@/shared/utils/error'

export type CreateAutomationInput = Parameters<typeof createAutomation>[0]
export type UpdateAutomationInput = Parameters<typeof updateAutomation>[1]

/**
 * 读取自动化列表。
 * @returns 自动化列表
 */
export function loadAutomations(): Promise<AutomationInfo[]> {
  return listAutomations()
}

/**
 * 读取指定自动化的执行日志。
 * @param automationId 自动化 ID
 * @returns 自动化日志列表
 */
export function loadAutomationLogs(automationId: string): Promise<AutomationLogInfo[]> {
  return getAutomationLogs(automationId)
}

/**
 * 读取可用会话列表。
 * @returns 会话列表
 */
export function loadAutomationConversations(): Promise<Conversation[]> {
  return listConversations()
}

/**
 * 创建自动化配置。
 * @param input 自动化创建请求
 */
export function createAutomationRecord(input: CreateAutomationInput) {
  return createAutomation(input)
}

/**
 * 更新自动化配置。
 * @param automationId 自动化 ID
 * @param input 自动化更新请求
 */
export function updateAutomationRecord(automationId: string, input: UpdateAutomationInput) {
  return updateAutomation(automationId, input)
}

/**
 * 触发一次自动化执行。
 * @param automationId 自动化 ID
 */
export function runAutomationRequest(automationId: string) {
  return runAutomation(automationId)
}

/**
 * 切换自动化启用状态。
 * @param automationId 自动化 ID
 */
export function toggleAutomationEnabled(automationId: string) {
  return toggleAutomation(automationId)
}

/**
 * 删除自动化。
 * @param automationId 自动化 ID
 */
export function deleteAutomationRecord(automationId: string) {
  return deleteAutomation(automationId)
}

/**
 * 统一转换自动化页错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
