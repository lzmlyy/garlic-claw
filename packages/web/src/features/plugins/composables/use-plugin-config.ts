import { ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import type {
  AiProviderSummary,
  PluginConfigSnapshot,
  PluginInfo,
  PluginLlmPreference,
  PluginScopeSettings,
} from '@garlic-claw/shared'
import type { PluginDetailSnapshot } from '@/features/plugins/composables/plugin-management.data'
import {
  savePluginConfig as savePluginConfigRequest,
  savePluginLlmPreference as savePluginLlmPreferenceRequest,
  savePluginScope as savePluginScopeRequest,
  type PluginLlmRouteOption,
  toErrorMessage,
} from '@/features/plugins/composables/plugin-management.data'

export interface UsePluginConfigOptions {
  selectedPlugin: ComputedRef<PluginInfo | null>
  error: Ref<string | null>
  notice: Ref<string | null>
  reloadPluginListSilently: () => Promise<void>
  refreshSelectedDetails: (pluginName?: string) => Promise<void>
}

export function usePluginConfig(options: UsePluginConfigOptions) {
  const savingConfig = ref(false)
  const savingLlmPreference = ref(false)
  const savingScope = ref(false)
  const configSnapshot = shallowRef<PluginConfigSnapshot | null>(null)
  const llmPreference = shallowRef<PluginLlmPreference | null>(null)
  const llmProviders = shallowRef<AiProviderSummary[]>([])
  const llmOptions = shallowRef<PluginLlmRouteOption[]>([])
  const scopeSettings = shallowRef<PluginScopeSettings | null>(null)

  function applyDetailSnapshot(detail: PluginDetailSnapshot) {
    configSnapshot.value = detail.configSnapshot
    llmPreference.value = detail.llmPreference
    llmProviders.value = detail.llmProviders
    llmOptions.value = detail.llmOptions
    scopeSettings.value = detail.scopeSettings
  }

  function clearDetailState() {
    configSnapshot.value = null
    llmPreference.value = null
    llmProviders.value = []
    llmOptions.value = []
    scopeSettings.value = null
  }

  async function saveConfig(values: PluginConfigSnapshot['values']) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingConfig.value = true
    options.error.value = null
    options.notice.value = null
    try {
      configSnapshot.value = await savePluginConfigRequest(pluginName, values)
      options.notice.value = '插件配置已保存'
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件配置失败')
    } finally {
      savingConfig.value = false
    }
  }

  async function saveLlmPreference(preference: PluginLlmPreference) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingLlmPreference.value = true
    options.error.value = null
    options.notice.value = null
    try {
      llmPreference.value = await savePluginLlmPreferenceRequest(pluginName, preference)
      options.notice.value = '插件模型策略已保存'
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件模型策略失败')
    } finally {
      savingLlmPreference.value = false
    }
  }

  async function saveScope(conversations: PluginScopeSettings['conversations']) {
    if (!options.selectedPlugin.value) {
      return
    }

    const pluginName = options.selectedPlugin.value.name
    savingScope.value = true
    options.error.value = null
    options.notice.value = null
    try {
      scopeSettings.value = await savePluginScopeRequest(pluginName, conversations)
      options.notice.value = '插件作用域已保存'
      await options.reloadPluginListSilently()
      await options.refreshSelectedDetails(pluginName)
    } catch (caughtError) {
      options.error.value = toErrorMessage(caughtError, '保存插件作用域失败')
    } finally {
      savingScope.value = false
    }
  }

  return {
    savingConfig,
    savingLlmPreference,
    savingScope,
    configSnapshot,
    llmPreference,
    llmProviders,
    llmOptions,
    scopeSettings,
    applyDetailSnapshot,
    clearDetailState,
    saveConfig,
    saveLlmPreference,
    saveScope,
  }
}
