import { delete as del, get, post, put } from '@/api/http'
import type {
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
} from '@garlic-claw/shared'

export function listMcpServers() {
  return get<McpConfigSnapshot>('/mcp/servers')
}

export function createMcpServer(input: McpServerConfig) {
  return post<McpServerConfig>('/mcp/servers', input)
}

export function updateMcpServer(currentName: string, input: McpServerConfig) {
  return put<McpServerConfig>(`/mcp/servers/${encodeURIComponent(currentName)}`, input)
}

export function deleteMcpServer(name: string) {
  return del<McpServerDeleteResult>(`/mcp/servers/${encodeURIComponent(name)}`)
}
