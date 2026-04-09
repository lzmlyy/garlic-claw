import { get, post, put } from '@/api/http'
import type {
  PluginActionName,
  ToolInfo,
  ToolOverview,
  ToolSourceActionResult,
  ToolSourceInfo,
  ToolSourceKind,
} from '@garlic-claw/shared'

export function listToolOverview() {
  return get<ToolOverview>('/tools/overview')
}

export function updateToolSourceEnabled(
  kind: ToolSourceKind,
  sourceId: string,
  enabled: boolean,
) {
  return put<ToolSourceInfo>(
    `/tools/sources/${kind}/${encodeURIComponent(sourceId)}/enabled`,
    { enabled },
  )
}

export function updateToolEnabled(toolId: string, enabled: boolean) {
  return put<ToolInfo>(`/tools/${encodeURIComponent(toolId)}/enabled`, { enabled })
}

export function runToolSourceAction(
  kind: ToolSourceKind,
  sourceId: string,
  action: PluginActionName,
) {
  return post<ToolSourceActionResult>(
    `/tools/sources/${kind}/${encodeURIComponent(sourceId)}/actions/${action}`,
  )
}
