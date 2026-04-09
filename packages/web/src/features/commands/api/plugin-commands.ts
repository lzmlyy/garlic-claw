import { get } from '@/api/http'
import type { PluginCommandOverview } from '@garlic-claw/shared'

export function listPluginCommandOverview() {
  return get<PluginCommandOverview>('/plugin-commands/overview')
}
