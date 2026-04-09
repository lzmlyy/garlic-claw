import type {
  PluginActionName,
  ToolInfo,
  ToolSourceInfo,
} from '@garlic-claw/shared'
import {
  listToolOverview,
  runToolSourceAction,
  updateToolEnabled,
  updateToolSourceEnabled,
} from '@/features/tools/api/tools'
import { getErrorMessage } from '@/utils/error'

export interface ToolOverviewData {
  sources: ToolSourceInfo[]
  tools: ToolInfo[]
}

/**
 * 拉取工具治理页需要的工具源与工具列表。
 * @returns 工具总览数据
 */
export function loadToolOverview(): Promise<ToolOverviewData> {
  return listToolOverview()
}

/**
 * 保存工具源启用状态。
 * @param kind 工具源类型
 * @param sourceId 工具源 ID
 * @param enabled 是否启用
 */
export function saveToolSourceEnabled(
  kind: ToolSourceInfo['kind'],
  sourceId: string,
  enabled: boolean,
) {
  return updateToolSourceEnabled(kind, sourceId, enabled)
}

/**
 * 保存单个工具启用状态。
 * @param toolId 工具 ID
 * @param enabled 是否启用
 */
export function saveToolEnabled(toolId: string, enabled: boolean) {
  return updateToolEnabled(toolId, enabled)
}

/**
 * 执行工具源治理动作。
 * @param kind 工具源类型
 * @param sourceId 工具源 ID
 * @param action 治理动作
 */
export function runToolSourceActionRequest(
  kind: ToolSourceInfo['kind'],
  sourceId: string,
  action: PluginActionName,
) {
  return runToolSourceAction(kind, sourceId, action)
}

/**
 * 统一转换治理页错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
