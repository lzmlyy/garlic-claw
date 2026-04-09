import type { PluginSubagentTaskSummary } from '@garlic-claw/shared'
import { listPluginSubagentTaskOverview } from '@/features/subagents/api/plugin-subagent-tasks'
import { getErrorMessage } from '@/utils/error'

export interface PluginSubagentTaskOverviewData {
  tasks: PluginSubagentTaskSummary[]
}

/**
 * 读取后台子代理任务总览。
 * @returns 子代理任务列表
 */
export function loadPluginSubagentTaskOverview(): Promise<PluginSubagentTaskOverviewData> {
  return listPluginSubagentTaskOverview()
}

/**
 * 统一转换后台子代理任务页错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
