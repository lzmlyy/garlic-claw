import type { PluginEventQuery } from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/features/plugins/composables/plugin-management.data'

type DetailSnapshotHandler = (
  detail: PluginDetailSnapshot,
  pluginName: string,
) => void

type ClearDetailStateHandler = () => void
type EventQueryGetter = () => PluginEventQuery
type StoragePrefixGetter = () => string

/**
 * 插件管理内部桥接通道。
 * 负责在列表层与详情子模块之间传递查询与详情同步动作。
 */
export function usePluginSocket(defaultEventQuery: PluginEventQuery = { limit: 50 }) {
  let getCurrentEventQuery: EventQueryGetter = () => defaultEventQuery
  let getCurrentStoragePrefix: StoragePrefixGetter = () => ''
  let applyDetailSnapshot: DetailSnapshotHandler = () => {}
  let clearDetailState: ClearDetailStateHandler = () => {}

  function setEventQueryGetter(getter: EventQueryGetter) {
    getCurrentEventQuery = getter
  }

  function setStoragePrefixGetter(getter: StoragePrefixGetter) {
    getCurrentStoragePrefix = getter
  }

  function setDetailSnapshotHandler(handler: DetailSnapshotHandler) {
    applyDetailSnapshot = handler
  }

  function setClearDetailStateHandler(handler: ClearDetailStateHandler) {
    clearDetailState = handler
  }

  return {
    getEventQuery: () => getCurrentEventQuery(),
    getStoragePrefix: () => getCurrentStoragePrefix(),
    applyDetailSnapshot: (detail: PluginDetailSnapshot, pluginName: string) =>
      applyDetailSnapshot(detail, pluginName),
    clearDetailState: () => clearDetailState(),
    setEventQueryGetter,
    setStoragePrefixGetter,
    setDetailSnapshotHandler,
    setClearDetailStateHandler,
  }
}

export type PluginSocketContext = ReturnType<typeof usePluginSocket>
