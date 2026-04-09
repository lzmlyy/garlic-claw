import type { Ref } from 'vue'
import { usePluginConfig } from '@/features/plugins/composables/use-plugin-config'
import { usePluginCrons } from '@/features/plugins/composables/use-plugin-crons'
import { usePluginEvents } from '@/features/plugins/composables/use-plugin-events'
import { usePluginList } from '@/features/plugins/composables/use-plugin-list'
import { usePluginStorage } from '@/features/plugins/composables/use-plugin-storage'
import type { PluginSocketContext } from '@/features/plugins/composables/usePluginSocket'
import type { PluginStateContext } from '@/features/plugins/composables/usePluginState'

interface UsePluginApiOptions {
  preferredPluginName?: Ref<string | null>
  state: PluginStateContext
  socket: PluginSocketContext
}

/**
 * 插件管理 API 组合层。
 * 负责装配插件列表与各详情子模块，并通过 socket 完成桥接。
 */
export function usePluginApi(options: UsePluginApiOptions) {
  const pluginList = usePluginList({
    preferredPluginName: options.preferredPluginName,
    detailLoading: options.state.detailLoading,
    error: options.state.error,
    notice: options.state.notice,
    getEventQuery: () => options.socket.getEventQuery(),
    getStoragePrefix: () => options.socket.getStoragePrefix(),
    applyDetailSnapshot: (detail, pluginName) =>
      options.socket.applyDetailSnapshot(detail, pluginName),
    clearDetailState: () => options.socket.clearDetailState(),
  })

  const pluginConfig = usePluginConfig({
    selectedPlugin: pluginList.selectedPlugin,
    error: options.state.error,
    notice: options.state.notice,
    reloadPluginListSilently: pluginList.reloadPluginListSilently,
    refreshSelectedDetails: pluginList.refreshSelectedDetails,
  })
  const pluginEvents = usePluginEvents({
    selectedPlugin: pluginList.selectedPlugin,
    error: options.state.error,
  })
  const pluginStorage = usePluginStorage({
    selectedPlugin: pluginList.selectedPlugin,
    detailLoading: options.state.detailLoading,
    error: options.state.error,
    notice: options.state.notice,
  })
  const pluginCrons = usePluginCrons({
    selectedPlugin: pluginList.selectedPlugin,
    error: options.state.error,
    notice: options.state.notice,
    refreshSelectedDetails: pluginList.refreshSelectedDetails,
  })

  options.socket.setEventQueryGetter(() => pluginEvents.eventQuery.value)
  options.socket.setStoragePrefixGetter(() => pluginStorage.storagePrefix.value)
  options.socket.setDetailSnapshotHandler((detail) => {
    pluginConfig.applyDetailSnapshot(detail)
    pluginCrons.applyDetailSnapshot(detail)
    pluginEvents.applyDetailSnapshot(detail)
    pluginStorage.applyDetailSnapshot(detail)
  })
  options.socket.setClearDetailStateHandler(() => {
    pluginList.clearDetailState()
    pluginConfig.clearDetailState()
    pluginCrons.clearDetailState()
    pluginEvents.clearDetailState()
    pluginStorage.clearDetailState()
  })

  return {
    pluginList,
    pluginConfig,
    pluginEvents,
    pluginStorage,
    pluginCrons,
  }
}

export type PluginApiContext = ReturnType<typeof usePluginApi>
