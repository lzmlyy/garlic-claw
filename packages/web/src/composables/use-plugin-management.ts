import { computed, onMounted, ref, shallowRef } from 'vue'
import type {
  PluginActionName,
  PluginConfigSnapshot,
  PluginCronJobSummary,
  PluginEventRecord,
  PluginHealthSnapshot,
  PluginInfo,
  PluginScopeSettings,
} from '@garlic-claw/shared'
import * as api from '../api'

/**
 * 插件管理页的状态与行为收口。
 * 输入:
 * - 无，由页面直接调用
 * 输出:
 * - 插件列表、详情、治理动作与保存操作所需的响应式状态和函数
 * 预期行为:
 * - 页面只负责渲染
 * - 所有插件管理数据拉取与保存逻辑集中到此 composable
 */
export function usePluginManagement() {
  const loading = ref(false)
  const detailLoading = ref(false)
  const savingConfig = ref(false)
  const savingScope = ref(false)
  const runningAction = ref<PluginActionName | null>(null)
  const deleting = ref(false)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  const plugins = shallowRef<PluginInfo[]>([])
  const selectedPluginName = ref<string | null>(null)
  const configSnapshot = shallowRef<PluginConfigSnapshot | null>(null)
  const cronJobs = shallowRef<PluginCronJobSummary[]>([])
  const scopeSettings = shallowRef<PluginScopeSettings | null>(null)
  const healthSnapshot = shallowRef<PluginHealthSnapshot | null>(null)
  const eventLogs = shallowRef<PluginEventRecord[]>([])

  const selectedPlugin = computed<PluginInfo | null>(() => {
    const found = plugins.value.find(
      (plugin) => plugin.name === selectedPluginName.value,
    )
    return found ?? null
  })

  const canDeleteSelected = computed<boolean>(() => {
    if (!selectedPlugin.value) {
      return false
    }

    return !selectedPlugin.value.connected && selectedPlugin.value.status !== 'online'
  })

  onMounted(() => {
    void refreshAll()
  })

  /**
   * 刷新插件列表，并尽量保持当前选中项。
   */
  async function refreshAll() {
    loading.value = true
    error.value = null
    try {
      const nextPlugins = await api.listPlugins()
      plugins.value = nextPlugins
      const fallback = nextPlugins.find(
        (plugin) => plugin.name === selectedPluginName.value,
      ) ?? nextPlugins[0] ?? null
      selectedPluginName.value = fallback?.name ?? null

      if (fallback) {
        await refreshSelectedDetails(fallback.name)
      } else {
        clearDetails()
      }
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '加载插件失败')
    } finally {
      loading.value = false
    }
  }

  /**
   * 切换当前选中的插件，并刷新右侧详情。
   * @param pluginName 插件 ID
   */
  async function selectPlugin(pluginName: string) {
    selectedPluginName.value = pluginName
    await refreshSelectedDetails(pluginName)
  }

  /**
   * 仅刷新当前选中插件的详情区域。
   * @param pluginName 可选插件 ID；缺省时使用当前选中项
   */
  async function refreshSelectedDetails(pluginName = selectedPluginName.value ?? undefined) {
    if (!pluginName) {
      clearDetails()
      return
    }

    detailLoading.value = true
    error.value = null
    try {
      const [config, jobs, scope, health, events] = await Promise.all([
        api.getPluginConfig(pluginName),
        api.getPluginCrons(pluginName),
        api.getPluginScope(pluginName),
        api.getPluginHealth(pluginName),
        api.listPluginEvents(pluginName),
      ])
      configSnapshot.value = config
      cronJobs.value = jobs
      scopeSettings.value = scope
      healthSnapshot.value = health
      eventLogs.value = events
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '加载插件详情失败')
    } finally {
      detailLoading.value = false
    }
  }

  /**
   * 保存当前插件配置，并刷新列表与详情。
   * @param values 新配置值
   */
  async function saveConfig(values: PluginConfigSnapshot['values']) {
    if (!selectedPlugin.value) {
      return
    }

    savingConfig.value = true
    error.value = null
    notice.value = null
    try {
      configSnapshot.value = await api.updatePluginConfig(selectedPlugin.value.name, values)
      notice.value = '插件配置已保存'
      await reloadPluginListSilently()
      await refreshSelectedDetails(selectedPlugin.value.name)
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '保存插件配置失败')
    } finally {
      savingConfig.value = false
    }
  }

  /**
   * 保存当前插件作用域设置，并刷新列表与详情。
   * @param scope 新作用域设置
   */
  async function saveScope(scope: PluginScopeSettings) {
    if (!selectedPlugin.value) {
      return
    }

    savingScope.value = true
    error.value = null
    notice.value = null
    try {
      scopeSettings.value = await api.updatePluginScope(selectedPlugin.value.name, scope)
      notice.value = '插件作用域已保存'
      await reloadPluginListSilently()
      await refreshSelectedDetails(selectedPlugin.value.name)
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '保存插件作用域失败')
    } finally {
      savingScope.value = false
    }
  }

  /**
   * 触发当前插件治理动作。
   * @param action 动作名称
   */
  async function runAction(action: PluginActionName) {
    if (!selectedPlugin.value) {
      return
    }

    runningAction.value = action
    error.value = null
    notice.value = null
    try {
      const result = await api.runPluginAction(selectedPlugin.value.name, action)
      notice.value = result.message
      await reloadPluginListSilently()
      await refreshSelectedDetails(selectedPlugin.value.name)
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '执行插件动作失败')
    } finally {
      runningAction.value = null
    }
  }

  /**
   * 删除当前选中的离线插件记录。
   */
  async function deleteSelectedPlugin() {
    if (!selectedPlugin.value || !canDeleteSelected.value) {
      return
    }
    if (!window.confirm(`确认删除插件记录 ${selectedPlugin.value.name} 吗？`)) {
      return
    }

    deleting.value = true
    error.value = null
    notice.value = null
    try {
      const currentName = selectedPlugin.value.name
      await api.deletePlugin(currentName)
      notice.value = '插件记录已删除'
      await refreshAll()
      if (selectedPluginName.value === currentName) {
        selectedPluginName.value = plugins.value[0]?.name ?? null
      }
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '删除插件记录失败')
    } finally {
      deleting.value = false
    }
  }

  /**
   * 清空右侧详情区域。
   */
  function clearDetails() {
    configSnapshot.value = null
    cronJobs.value = []
    scopeSettings.value = null
    healthSnapshot.value = null
    eventLogs.value = []
  }

  /**
   * 静默刷新插件列表，不覆盖当前错误提示。
   */
  async function reloadPluginListSilently() {
    const nextPlugins = await api.listPlugins()
    plugins.value = nextPlugins
  }

  return {
    loading,
    detailLoading,
    savingConfig,
    savingScope,
    runningAction,
    deleting,
    error,
    notice,
    plugins,
    selectedPluginName,
    selectedPlugin,
    configSnapshot,
    cronJobs,
    scopeSettings,
    healthSnapshot,
    eventLogs,
    canDeleteSelected,
    refreshAll,
    selectPlugin,
    refreshSelectedDetails,
    saveConfig,
    saveScope,
    runAction,
    deleteSelectedPlugin,
  }
}

/**
 * 把未知错误收敛为用户可读文本。
 * @param error 捕获到的异常
 * @param fallback 默认兜底文本
 * @returns 可展示的错误文本
 */
function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}
