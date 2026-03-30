import { request } from './base'
import type {
  PluginActionName,
  ToolInfo,
  ToolOverview,
  ToolSourceActionResult,
  ToolSourceInfo,
  ToolSourceKind,
} from '@garlic-claw/shared'

export function listToolOverview() {
  return request<ToolOverview>('/tools/overview')
}

/**
 * 兼容旧调用方；性能敏感路径优先改用 `listToolOverview()`
 * 以避免重复拉取 source/tool 聚合结果。
 */
export function listToolSources() {
  return request<ToolSourceInfo[]>('/tools/sources')
}

/**
 * 兼容旧调用方；性能敏感路径优先改用 `listToolOverview()`
 * 以避免重复拉取 source/tool 聚合结果。
 */
export function listTools() {
  return request<ToolInfo[]>('/tools')
}

export function updateToolSourceEnabled(
  kind: ToolSourceKind,
  sourceId: string,
  enabled: boolean,
) {
  return request<ToolSourceInfo>(
    `/tools/sources/${kind}/${encodeURIComponent(sourceId)}/enabled`,
    {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    },
  )
}

export function updateToolEnabled(toolId: string, enabled: boolean) {
  return request<ToolInfo>(`/tools/${encodeURIComponent(toolId)}/enabled`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export function runToolSourceAction(
  kind: ToolSourceKind,
  sourceId: string,
  action: PluginActionName,
) {
  return request<ToolSourceActionResult>(
    `/tools/sources/${kind}/${encodeURIComponent(sourceId)}/actions/${action}`,
    {
      method: 'POST',
    },
  )
}
