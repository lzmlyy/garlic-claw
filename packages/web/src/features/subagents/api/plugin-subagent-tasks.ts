import { get } from '@/api/http'
import type {
  PluginSubagentTaskDetail,
  PluginSubagentTaskOverview,
} from '@garlic-claw/shared'

export function listPluginSubagentTaskOverview() {
  return get<PluginSubagentTaskOverview>('/plugin-subagent-tasks/overview')
}

export function getPluginSubagentTask(taskId: string) {
  return get<PluginSubagentTaskDetail>(`/plugin-subagent-tasks/${taskId}`)
}
