import type { Ref } from 'vue'
import { usePluginActions } from '@/features/plugins/composables/usePluginActions'
import { usePluginApi } from '@/features/plugins/composables/usePluginApi'
import { usePluginSocket } from '@/features/plugins/composables/usePluginSocket'
import { usePluginState } from '@/features/plugins/composables/usePluginState'

/**
 * 插件管理兼容模块。
 * 负责组合细粒度 composable，并维持旧的 usePluginManagement API。
 */
export function createPluginManagementModule(options?: {
  preferredPluginName?: Ref<string | null>
}) {
  const state = usePluginState()
  const socket = usePluginSocket({
    limit: 50,
  })
  const api = usePluginApi({
    preferredPluginName: options?.preferredPluginName,
    state,
    socket,
  })
  return usePluginActions({
    state,
    api,
  })
}
