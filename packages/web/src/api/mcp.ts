import { request } from './base'
import type {
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
} from '@garlic-claw/shared'

export function listMcpServers() {
  return request<McpConfigSnapshot>('/mcp/servers')
}

export function createMcpServer(input: McpServerConfig) {
  return request<McpServerConfig>('/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateMcpServer(currentName: string, input: McpServerConfig) {
  return request<McpServerConfig>(`/mcp/servers/${encodeURIComponent(currentName)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteMcpServer(name: string) {
  return request<McpServerDeleteResult>(`/mcp/servers/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}
