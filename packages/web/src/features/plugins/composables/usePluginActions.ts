import type { PluginApiContext } from '@/features/plugins/composables/usePluginApi'
import type { PluginStateContext } from '@/features/plugins/composables/usePluginState'

interface UsePluginActionsOptions {
  state: PluginStateContext
  api: PluginApiContext
}

/**
 * 插件管理 facade 输出层。
 * 负责保持 usePluginManagement 的对外 API 兼容。
 */
export function usePluginActions(options: UsePluginActionsOptions) {
  const { state, api } = options
  const { pluginList, pluginConfig, pluginEvents, pluginStorage, pluginCrons } = api

  return {
    loading: pluginList.loading,
    detailLoading: state.detailLoading,
    savingConfig: pluginConfig.savingConfig,
    savingStorage: pluginStorage.savingStorage,
    savingScope: pluginConfig.savingScope,
    eventLoading: pluginEvents.eventLoading,
    runningAction: pluginList.runningAction,
    deletingCronJobId: pluginCrons.deletingCronJobId,
    finishingConversationId: pluginList.finishingConversationId,
    deletingStorageKey: pluginStorage.deletingStorageKey,
    deleting: pluginList.deleting,
    error: state.error,
    appError: state.appError,
    notice: state.notice,
    plugins: pluginList.plugins,
    selectedPluginName: pluginList.selectedPluginName,
    selectedPlugin: pluginList.selectedPlugin,
    configSnapshot: pluginConfig.configSnapshot,
    conversationSessions: pluginList.conversationSessions,
    cronJobs: pluginCrons.cronJobs,
    scopeSettings: pluginConfig.scopeSettings,
    healthSnapshot: pluginList.healthSnapshot,
    eventLogs: pluginEvents.eventLogs,
    eventQuery: pluginEvents.eventQuery,
    eventNextCursor: pluginEvents.eventNextCursor,
    storageEntries: pluginStorage.storageEntries,
    storagePrefix: pluginStorage.storagePrefix,
    canDeleteSelected: pluginList.canDeleteSelected,
    refreshAll: pluginList.refreshAll,
    selectPlugin: pluginList.selectPlugin,
    refreshSelectedDetails: pluginList.refreshSelectedDetails,
    refreshPluginEvents: pluginEvents.refreshPluginEvents,
    loadMorePluginEvents: pluginEvents.loadMorePluginEvents,
    refreshPluginStorage: pluginStorage.refreshPluginStorage,
    deleteCronJob: pluginCrons.deleteCronJob,
    finishConversationSession: pluginList.finishConversationSession,
    saveConfig: pluginConfig.saveConfig,
    saveStorageEntry: pluginStorage.saveStorageEntry,
    saveScope: pluginConfig.saveScope,
    runAction: pluginList.runAction,
    deleteStorageEntry: pluginStorage.deleteStorageEntry,
    deleteSelectedPlugin: pluginList.deleteSelectedPlugin,
  }
}
