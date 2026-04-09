import type {
  PluginCommandConflict,
  PluginCommandInfo,
} from '@garlic-claw/shared'
import { listPluginCommandOverview } from '@/features/commands/api/plugin-commands'
import { getErrorMessage } from '@/utils/error'

export interface PluginCommandOverviewData {
  commands: PluginCommandInfo[]
  conflicts: PluginCommandConflict[]
}

/**
 * 读取插件命令治理总览。
 * @returns 命令与冲突总览
 */
export function loadPluginCommandOverview(): Promise<PluginCommandOverviewData> {
  return listPluginCommandOverview()
}

/**
 * 统一转换命令治理页错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
