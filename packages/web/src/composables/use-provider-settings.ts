import { onMounted, ref } from 'vue'
import type {
  AiModelConfig,
  AiProviderConfig,
  AiProviderSummary,
  DiscoveredAiModel,
  OfficialProviderCatalogItem,
  VisionFallbackConfig,
} from '@garlic-claw/shared'
import * as api from '../api'
import {
  formatConnectionSuccess,
  importDiscoveredProviderModels,
  loadProviderSelectionData,
  loadProviderSettingsBaseData,
  loadVisionModelOptions,
  saveProviderConfig,
  toErrorMessage,
  type ProviderConnectionResult,
  type VisionModelOption,
} from './provider-settings.data'

/**
 * ProviderSettings 页面的状态与行为。
 * 输入:
 * - 无，由页面直接调用
 * 输出:
 * - provider / model / vision fallback 所需的响应式状态和操作函数
 * 预期行为:
 * - 页面只负责渲染
 * - 所有数据拉取、选择与保存逻辑统一收口到此 composable
 */
export function useProviderSettings() {
  const loadingProviders = ref(false)
  const savingVision = ref(false)
  const discoveringModels = ref(false)
  const testingConnection = ref(false)
  const error = ref<string | null>(null)
  const catalog = ref<OfficialProviderCatalogItem[]>([])
  const providers = ref<AiProviderSummary[]>([])
  const selectedProviderId = ref<string | null>(null)
  const selectedProvider = ref<AiProviderConfig | null>(null)
  const selectedModels = ref<AiModelConfig[]>([])
  const visionConfig = ref<VisionFallbackConfig>({ enabled: false })
  const visionOptions = ref<VisionModelOption[]>([])
  const showProviderDialog = ref(false)
  const showDiscoveryDialog = ref(false)
  const editingProvider = ref<AiProviderConfig | null>(null)
  const discoveredModels = ref<DiscoveredAiModel[]>([])
  const connectionResult = ref<ProviderConnectionResult | null>(null)

  onMounted(() => {
    void refreshAll()
  })

  async function refreshAll() {
    loadingProviders.value = true
    error.value = null
    try {
      const baseData = await loadProviderSettingsBaseData()
      catalog.value = baseData.catalog
      providers.value = baseData.providers
      visionConfig.value = baseData.visionConfig
      await selectFallbackProvider()
      await refreshVisionOptions()
    } catch (caughtError) {
      error.value = toErrorMessage(
        caughtError instanceof Error ? caughtError : undefined,
        '加载失败',
      )
    } finally {
      loadingProviders.value = false
    }
  }

  /**
   * 根据当前选择或首个可用 provider 同步右侧详情。
   */
  async function selectFallbackProvider() {
    const current = providers.value.find(
      (provider) => provider.id === selectedProviderId.value,
    )
    const next = current ?? providers.value[0]

    if (!next) {
      selectedProviderId.value = null
      selectedProvider.value = null
      selectedModels.value = []
      return
    }

    await selectProvider(next.id)
  }

  async function selectProvider(providerId: string) {
    selectedProviderId.value = providerId
    const selectionData = await loadProviderSelectionData(providerId)
    selectedProvider.value = selectionData.provider
    selectedModels.value = selectionData.models
    connectionResult.value = null
  }

  function openCreateDialog() {
    editingProvider.value = null
    showProviderDialog.value = true
  }

  function openEditDialog() {
    if (!selectedProvider.value) {
      return
    }
    editingProvider.value = selectedProvider.value
    showProviderDialog.value = true
  }

  async function saveProvider(provider: AiProviderConfig) {
    showProviderDialog.value = false
    await saveProviderConfig(provider)
    await refreshAll()
    await selectProvider(provider.id)
  }

  async function deleteSelectedProvider() {
    if (!selectedProvider.value) {
      return
    }
    await api.deleteAiProvider(selectedProvider.value.id)
    await refreshAll()
  }

  async function addModel(payload: { modelId: string; name?: string }) {
    if (!selectedProvider.value) {
      return
    }
    await api.upsertAiModel(selectedProvider.value.id, payload.modelId, {
      name: payload.name,
    })
    await selectProvider(selectedProvider.value.id)
    await refreshVisionOptions()
  }

  /**
   * 拉取远程模型列表并打开选择弹窗。
   */
  async function openDiscoveryDialog() {
    if (!selectedProvider.value) {
      return
    }

    discoveringModels.value = true
    connectionResult.value = null
    try {
      discoveredModels.value = await api.discoverAiProviderModels(
        selectedProvider.value.id,
      )
      showDiscoveryDialog.value = true
    } catch (caughtError) {
      connectionResult.value = {
        kind: 'error',
        text: toErrorMessage(
          caughtError instanceof Error ? caughtError : undefined,
          '拉取模型失败',
        ),
      }
    } finally {
      discoveringModels.value = false
    }
  }

  /**
   * 将用户勾选的已拉取模型批量导入当前 provider。
   * @param modelIds 选中的模型 ID 列表
   */
  async function importDiscoveredModels(modelIds: string[]) {
    if (!selectedProvider.value) {
      return
    }

    const providerId = selectedProvider.value.id
    showDiscoveryDialog.value = false
    await importDiscoveredProviderModels(
      providerId,
      discoveredModels.value,
      modelIds,
    )
    await selectProvider(providerId)
    await refreshVisionOptions()
  }

  async function deleteModel(modelId: string) {
    if (!selectedProvider.value) {
      return
    }
    await api.deleteAiModel(selectedProvider.value.id, modelId)
    await selectProvider(selectedProvider.value.id)
    await refreshVisionOptions()
  }

  async function setDefaultModel(modelId: string) {
    if (!selectedProvider.value) {
      return
    }
    await api.setAiProviderDefaultModel(selectedProvider.value.id, modelId)
    await selectProvider(selectedProvider.value.id)
  }

  /**
   * 更新模型能力，并同步刷新视觉模型候选列表。
   * @param payload 模型能力更新内容
   */
  async function updateCapabilities(payload: {
    modelId: string
    capabilities: AiModelConfig['capabilities']
  }) {
    if (!selectedProvider.value) {
      return
    }

    await api.updateAiModelCapabilities(
      selectedProvider.value.id,
      payload.modelId,
      payload.capabilities,
    )
    await selectProvider(selectedProvider.value.id)
    await refreshVisionOptions()
  }

  /**
   * 发起 provider 测试连接请求，并格式化结果文本。
   */
  async function testProviderConnection() {
    if (!selectedProvider.value) {
      return
    }

    testingConnection.value = true
    connectionResult.value = null
    try {
      const result = await api.testAiProviderConnection(selectedProvider.value.id, {
        modelId: selectedProvider.value.defaultModel,
      })
      connectionResult.value = {
        kind: 'success',
        text: formatConnectionSuccess(result),
      }
    } catch (caughtError) {
      connectionResult.value = {
        kind: 'error',
        text: toErrorMessage(
          caughtError instanceof Error ? caughtError : undefined,
          '测试连接失败',
        ),
      }
    } finally {
      testingConnection.value = false
    }
  }

  async function saveVisionConfig(config: VisionFallbackConfig) {
    savingVision.value = true
    try {
      visionConfig.value = await api.updateVisionFallbackConfig(config)
    } finally {
      savingVision.value = false
    }
  }

  /**
   * 重新构建 Vision Fallback 可选模型列表。
   */
  async function refreshVisionOptions() {
    visionOptions.value = await loadVisionModelOptions(providers.value)
  }

  return {
    loadingProviders,
    savingVision,
    discoveringModels,
    testingConnection,
    error,
    catalog,
    providers,
    selectedProviderId,
    selectedProvider,
    selectedModels,
    visionConfig,
    visionOptions,
    showProviderDialog,
    showDiscoveryDialog,
    editingProvider,
    discoveredModels,
    connectionResult,
    refreshAll,
    selectProvider,
    openCreateDialog,
    openEditDialog,
    saveProvider,
    deleteSelectedProvider,
    addModel,
    openDiscoveryDialog,
    importDiscoveredModels,
    deleteModel,
    setDefaultModel,
    updateCapabilities,
    testProviderConnection,
    saveVisionConfig,
  }
}
