import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AiModelConfig,
  AiProviderCatalogItem,
  AiProviderConfig,
  AiProviderConnectionTestResult,
  AiProviderSummary,
  DiscoveredAiModel,
  VisionFallbackConfig,
} from '@garlic-claw/shared'
import { useProviderSettings } from '@/features/ai-settings/composables/use-provider-settings'
import * as providerData from '@/features/ai-settings/composables/provider-settings.data'

vi.mock('@/features/ai-settings/composables/provider-settings.data', () => ({
  loadProviderSettingsBaseData: vi.fn(),
  loadProviderSelectionData: vi.fn(),
  loadProviderModelOptions: vi.fn(),
  saveProviderConfig: vi.fn(),
  deleteProviderConfig: vi.fn(),
  addProviderModel: vi.fn(),
  importDiscoveredProviderModels: vi.fn(),
  deleteProviderModel: vi.fn(),
  saveProviderModelContextLength: vi.fn(),
  saveProviderDefaultModel: vi.fn(),
  saveProviderModelCapabilities: vi.fn(),
  discoverProviderModels: vi.fn(),
  testProviderConnection: vi.fn(),
  saveVisionFallbackConfig: vi.fn(),
  saveHostModelRouting: vi.fn(),
  formatConnectionSuccess: vi.fn(() => 'ok'),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

function createProviderSummary(id: string, name = id): AiProviderSummary {
  return {
    id,
    name,
    mode: 'catalog',
    driver: 'openai',
    defaultModel: `${id}-default`,
    baseUrl: 'https://example.com/v1',
    modelCount: 1,
    available: true,
  }
}

function createProviderConfig(id: string, name = id): AiProviderConfig {
  return {
    id,
    name,
    mode: 'catalog',
    driver: 'openai',
    defaultModel: `${id}-default`,
    baseUrl: 'https://example.com/v1',
    models: [`${id}-model`],
  }
}

function createModel(id: string, providerId: string): AiModelConfig {
  return {
    id,
    providerId,
    name: id,
    capabilities: {
      reasoning: false,
      toolCall: false,
      input: {
        text: true,
        image: false,
      },
      output: {
        text: true,
        image: false,
      },
    },
    api: {
      id,
      url: 'https://example.com/v1/chat/completions',
      npm: '@example/sdk',
    },
    contextLength: 128 * 1024,
  }
}

function createDiscoveredModel(id: string): DiscoveredAiModel {
  return {
    id,
    name: id,
  }
}

function createConnectionResult(providerId: string): AiProviderConnectionTestResult {
  return {
    ok: true,
    providerId,
    modelId: `${providerId}-default`,
    text: 'ok',
  }
}

function createSelectionData(providerId: string) {
  return {
    provider: createProviderConfig(providerId, providerId === 'provider-a' ? 'Provider A' : 'Provider B'),
    models: [createModel(`${providerId}-model`, providerId)],
  }
}

async function mountProviderSettingsHarness() {
  let state!: ReturnType<typeof useProviderSettings>
  const Harness = defineComponent({
    setup() {
      state = useProviderSettings()
      return () => null
    },
  })

  mount(Harness)
  await flushPromises()
  return state
}

describe('useProviderSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the latest selected provider detail when an older selection resolves later', async () => {
    let resolveFirst!: (value: {
      provider: AiProviderConfig
      models: AiModelConfig[]
    }) => void
    const firstSelection = new Promise<{
      provider: AiProviderConfig
      models: AiModelConfig[]
    }>((resolve) => {
      resolveFirst = resolve
    })
    const providers = [
      createProviderSummary('provider-a', 'Provider A'),
      createProviderSummary('provider-b', 'Provider B'),
    ]
    const catalog: AiProviderCatalogItem[] = []
    const visionConfig: VisionFallbackConfig = { enabled: false }

    vi.mocked(providerData.loadProviderSettingsBaseData).mockResolvedValue({
      catalog,
      providers,
      visionConfig,
      hostModelRoutingConfig: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
    })
    vi.mocked(providerData.loadProviderSelectionData)
      .mockImplementationOnce(() => firstSelection)
      .mockResolvedValueOnce({
        provider: createProviderConfig('provider-b', 'Provider B'),
        models: [createModel('provider-b-model', 'provider-b')],
      })
    vi.mocked(providerData.loadProviderModelOptions).mockResolvedValue({
      visionOptions: [],
      hostModelRoutingOptions: [],
      modelsByProviderId: {},
    })

    const state = await mountProviderSettingsHarness()

    await state.selectProvider('provider-b')
    await flushPromises()

    expect(state.selectedProviderId.value).toBe('provider-b')
    expect(state.selectedProvider.value?.id).toBe('provider-b')
    expect(state.selectedModels.value.map((item) => item.id)).toEqual([
      'provider-b-model',
    ])

    resolveFirst({
      provider: createProviderConfig('provider-a', 'Provider A'),
      models: [createModel('provider-a-model', 'provider-a')],
    })
    await flushPromises()

    expect(state.selectedProviderId.value).toBe('provider-b')
    expect(state.selectedProvider.value?.id).toBe('provider-b')
    expect(state.selectedModels.value.map((item) => item.id)).toEqual([
      'provider-b-model',
    ])
  })

  it('ignores discovered models from the previous provider after switching selection', async () => {
    let resolveDiscovery!: (value: DiscoveredAiModel[]) => void
    const discoveryRequest = new Promise<DiscoveredAiModel[]>((resolve) => {
      resolveDiscovery = resolve
    })

    vi.mocked(providerData.loadProviderSettingsBaseData).mockResolvedValue({
      catalog: [],
      providers: [
        createProviderSummary('provider-a', 'Provider A'),
        createProviderSummary('provider-b', 'Provider B'),
      ],
      visionConfig: { enabled: false },
      hostModelRoutingConfig: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
    })
    vi.mocked(providerData.loadProviderSelectionData).mockImplementation(
      async (providerId: string) => createSelectionData(providerId),
    )
    vi.mocked(providerData.loadProviderModelOptions).mockResolvedValue({
      visionOptions: [],
      hostModelRoutingOptions: [],
      modelsByProviderId: {},
    })
    vi.mocked(providerData.discoverProviderModels).mockReturnValueOnce(discoveryRequest)

    const state = await mountProviderSettingsHarness()

    const pendingDiscovery = state.openDiscoveryDialog()
    await flushPromises()
    await state.selectProvider('provider-b')
    await flushPromises()

    resolveDiscovery([createDiscoveredModel('provider-a-remote-model')])
    await pendingDiscovery
    await flushPromises()

    expect(state.selectedProviderId.value).toBe('provider-b')
    expect(state.showDiscoveryDialog.value).toBe(false)
    expect(state.discoveredModels.value).toEqual([])
  })

  it('ignores test-connection results from the previous provider after switching selection', async () => {
    let resolveConnection!: (value: AiProviderConnectionTestResult) => void
    const connectionRequest = new Promise<AiProviderConnectionTestResult>((resolve) => {
      resolveConnection = resolve
    })

    vi.mocked(providerData.loadProviderSettingsBaseData).mockResolvedValue({
      catalog: [],
      providers: [
        createProviderSummary('provider-a', 'Provider A'),
        createProviderSummary('provider-b', 'Provider B'),
      ],
      visionConfig: { enabled: false },
      hostModelRoutingConfig: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
    })
    vi.mocked(providerData.loadProviderSelectionData).mockImplementation(
      async (providerId: string) => createSelectionData(providerId),
    )
    vi.mocked(providerData.loadProviderModelOptions).mockResolvedValue({
      visionOptions: [],
      hostModelRoutingOptions: [],
      modelsByProviderId: {},
    })
    vi.mocked(providerData.testProviderConnection).mockReturnValueOnce(connectionRequest)

    const state = await mountProviderSettingsHarness()

    const pendingConnectionTest = state.testProviderConnection()
    await flushPromises()
    await state.selectProvider('provider-b')
    await flushPromises()

    resolveConnection(createConnectionResult('provider-a'))
    await pendingConnectionTest
    await flushPromises()

    expect(state.selectedProviderId.value).toBe('provider-b')
    expect(state.connectionResult.value).toBeNull()
  })

  it('saves host model routing config and updates local state', async () => {
    vi.mocked(providerData.loadProviderSettingsBaseData).mockResolvedValue({
      catalog: [],
      providers: [createProviderSummary('provider-a', 'Provider A')],
      visionConfig: { enabled: false },
      hostModelRoutingConfig: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
    })
    vi.mocked(providerData.loadProviderSelectionData).mockResolvedValue(
      createSelectionData('provider-a'),
    )
    vi.mocked(providerData.loadProviderModelOptions).mockResolvedValue({
      visionOptions: [],
      hostModelRoutingOptions: [],
      modelsByProviderId: {},
    })
    vi.mocked(providerData.saveHostModelRouting).mockResolvedValue({
      fallbackChatModels: [
        {
          providerId: 'provider-a',
          modelId: 'provider-a-model',
        },
      ],
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'provider-a',
          modelId: 'provider-a-model',
        },
      },
    })

    const state = await mountProviderSettingsHarness()
    await state.saveHostModelRoutingConfig({
      fallbackChatModels: [
        {
          providerId: 'provider-a',
          modelId: 'provider-a-model',
        },
      ],
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'provider-a',
          modelId: 'provider-a-model',
        },
      },
    })

    expect(providerData.saveHostModelRouting).toHaveBeenCalledWith({
      fallbackChatModels: [
        {
          providerId: 'provider-a',
          modelId: 'provider-a-model',
        },
      ],
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'provider-a',
          modelId: 'provider-a-model',
        },
      },
    })
    expect(state.hostModelRoutingConfig.value.utilityModelRoles.conversationTitle?.modelId)
      .toBe('provider-a-model')
  })

  it('updates the selected provider default model locally without reloading provider detail', async () => {
    vi.mocked(providerData.loadProviderSettingsBaseData).mockResolvedValue({
      catalog: [],
      providers: [createProviderSummary('provider-a', 'Provider A')],
      visionConfig: { enabled: false },
      hostModelRoutingConfig: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
    })
    vi.mocked(providerData.loadProviderSelectionData).mockResolvedValue(
      createSelectionData('provider-a'),
    )
    vi.mocked(providerData.loadProviderModelOptions).mockResolvedValue({
      visionOptions: [],
      hostModelRoutingOptions: [],
      modelsByProviderId: {},
    })
    vi.mocked(providerData.saveProviderDefaultModel).mockResolvedValue({
      ...createProviderConfig('provider-a', 'Provider A'),
      defaultModel: 'provider-a-model',
      models: ['provider-a-model'],
    })

    const state = await mountProviderSettingsHarness()
    await state.setDefaultModel('provider-a-model')

    expect(providerData.saveProviderDefaultModel).toHaveBeenCalledWith(
      'provider-a',
      'provider-a-model',
    )
    expect(providerData.loadProviderSelectionData).toHaveBeenCalledTimes(1)
    expect(state.selectedProvider.value?.defaultModel).toBe('provider-a-model')
    expect(state.providers.value[0]?.defaultModel).toBe('provider-a-model')
  })

  it('keeps the current provider detail visible while the same provider reloads', async () => {
    let resolveReload!: (value: ReturnType<typeof createSelectionData>) => void
    const pendingReload = new Promise<ReturnType<typeof createSelectionData>>((resolve) => {
      resolveReload = resolve
    })

    vi.mocked(providerData.loadProviderSettingsBaseData).mockResolvedValue({
      catalog: [],
      providers: [createProviderSummary('provider-a', 'Provider A')],
      visionConfig: { enabled: false },
      hostModelRoutingConfig: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
    })
    vi.mocked(providerData.loadProviderSelectionData)
      .mockResolvedValueOnce(createSelectionData('provider-a'))
      .mockImplementationOnce(() => pendingReload)
    vi.mocked(providerData.loadProviderModelOptions).mockResolvedValue({
      visionOptions: [],
      hostModelRoutingOptions: [],
      modelsByProviderId: {
        'provider-a': [createModel('provider-a-model', 'provider-a')],
      },
    })
    vi.mocked(providerData.addProviderModel).mockResolvedValue(
      createModel('provider-a-extra-model', 'provider-a'),
    )

    const state = await mountProviderSettingsHarness()
    const pendingAdd = state.addModel({ modelId: 'provider-a-extra-model' })
    await flushPromises()

    expect(state.selectedProvider.value?.id).toBe('provider-a')
    expect(state.selectedModels.value.map((item) => item.id)).toEqual([
      'provider-a-model',
    ])

    resolveReload({
      provider: createProviderConfig('provider-a', 'Provider A'),
      models: [
        createModel('provider-a-model', 'provider-a'),
        createModel('provider-a-extra-model', 'provider-a'),
      ],
    })
    await pendingAdd
    await flushPromises()

    expect(state.selectedModels.value.map((item) => item.id)).toEqual([
      'provider-a-model',
      'provider-a-extra-model',
    ])
  })

  it('saves context length through the formal model API and then reloads the selected provider', async () => {
    const initialSelection = createSelectionData('provider-a')
    const reloadedSelection = {
      ...initialSelection,
      models: [
        {
          ...initialSelection.models[0],
          contextLength: 65_536,
        },
      ],
    }

    vi.mocked(providerData.loadProviderSettingsBaseData).mockResolvedValue({
      catalog: [],
      providers: [createProviderSummary('provider-a', 'Provider A')],
      visionConfig: { enabled: false },
      hostModelRoutingConfig: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
    })
    vi.mocked(providerData.loadProviderSelectionData)
      .mockResolvedValueOnce(initialSelection)
      .mockResolvedValueOnce(reloadedSelection)
    vi.mocked(providerData.loadProviderModelOptions)
      .mockResolvedValueOnce({
        visionOptions: [],
        hostModelRoutingOptions: [],
        modelsByProviderId: {
          'provider-a': initialSelection.models,
        },
      })
      .mockResolvedValueOnce({
        visionOptions: [],
        hostModelRoutingOptions: [],
        modelsByProviderId: {
          'provider-a': reloadedSelection.models,
        },
      })
    vi.mocked(providerData.saveProviderModelContextLength).mockResolvedValue(
      reloadedSelection.models[0],
    )

    const state = await mountProviderSettingsHarness()
    await state.updateContextLength({
      modelId: 'provider-a-model',
      contextLength: 65_536,
    })

    expect(providerData.saveProviderModelContextLength).toHaveBeenCalledWith(
      'provider-a',
      'provider-a-model',
      65_536,
    )
    expect(providerData.loadProviderSelectionData).toHaveBeenCalledTimes(2)
    expect(providerData.loadProviderSelectionData).toHaveBeenNthCalledWith(2, 'provider-a')
    expect(state.selectedModels.value[0]?.contextLength).toBe(65_536)
  })

  it('reuses cached models from other providers when rebuilding options after selected models change', async () => {
    const providerASelection = createSelectionData('provider-a')
    const updatedProviderASelection = {
      ...providerASelection,
      models: [
        createModel('provider-a-model', 'provider-a'),
        createModel('provider-a-extra-model', 'provider-a'),
      ],
    }

    vi.mocked(providerData.loadProviderSettingsBaseData).mockResolvedValue({
      catalog: [],
      providers: [
        createProviderSummary('provider-a', 'Provider A'),
        createProviderSummary('provider-b', 'Provider B'),
      ],
      visionConfig: { enabled: false },
      hostModelRoutingConfig: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
    })
    vi.mocked(providerData.loadProviderSelectionData)
      .mockResolvedValueOnce(providerASelection)
      .mockResolvedValueOnce(updatedProviderASelection)
    vi.mocked(providerData.loadProviderModelOptions)
      .mockResolvedValueOnce({
        visionOptions: [],
        hostModelRoutingOptions: [],
        modelsByProviderId: {
          'provider-a': providerASelection.models,
          'provider-b': [createModel('provider-b-model', 'provider-b')],
        },
      })
      .mockResolvedValueOnce({
        visionOptions: [],
        hostModelRoutingOptions: [],
        modelsByProviderId: {
          'provider-a': updatedProviderASelection.models,
          'provider-b': [createModel('provider-b-model', 'provider-b')],
        },
      })
    vi.mocked(providerData.addProviderModel).mockResolvedValue(
      createModel('provider-a-extra-model', 'provider-a'),
    )

    const state = await mountProviderSettingsHarness()
    await state.addModel({ modelId: 'provider-a-extra-model' })

    expect(providerData.loadProviderModelOptions).toHaveBeenNthCalledWith(2, {
      providers: [
        createProviderSummary('provider-a', 'Provider A'),
        createProviderSummary('provider-b', 'Provider B'),
      ],
      preloadedModelsByProviderId: {
        'provider-a': updatedProviderASelection.models,
        'provider-b': [createModel('provider-b-model', 'provider-b')],
      },
    })
  })

  it('reselects the saved provider during refresh without an extra detail request', async () => {
    const visionConfig: VisionFallbackConfig = { enabled: false }

    vi.mocked(providerData.loadProviderSettingsBaseData)
      .mockResolvedValueOnce({
        catalog: [],
        providers: [createProviderSummary('provider-a', 'Provider A')],
        visionConfig,
        hostModelRoutingConfig: {
          fallbackChatModels: [],
          utilityModelRoles: {},
        },
      })
      .mockResolvedValueOnce({
        catalog: [],
        providers: [
          createProviderSummary('provider-a', 'Provider A'),
          createProviderSummary('provider-b', 'Provider B'),
        ],
        visionConfig,
        hostModelRoutingConfig: {
          fallbackChatModels: [],
          utilityModelRoles: {},
        },
      })
    vi.mocked(providerData.loadProviderSelectionData)
      .mockResolvedValueOnce(createSelectionData('provider-a'))
      .mockResolvedValueOnce(createSelectionData('provider-b'))
    vi.mocked(providerData.loadProviderModelOptions).mockResolvedValue({
      visionOptions: [],
      hostModelRoutingOptions: [],
      modelsByProviderId: {},
    })
    vi.mocked(providerData.saveProviderConfig).mockResolvedValue(undefined)

    const state = await mountProviderSettingsHarness()
    await state.saveProvider(createProviderConfig('provider-b', 'Provider B'))
    await flushPromises()

    expect(providerData.saveProviderConfig).toHaveBeenCalledWith(
      createProviderConfig('provider-b', 'Provider B'),
    )
    expect(providerData.loadProviderSelectionData).toHaveBeenCalledTimes(2)
    expect(providerData.loadProviderSelectionData).toHaveBeenNthCalledWith(1, 'provider-a')
    expect(providerData.loadProviderSelectionData).toHaveBeenNthCalledWith(2, 'provider-b')
    expect(state.selectedProviderId.value).toBe('provider-b')
    expect(state.selectedProvider.value?.id).toBe('provider-b')
  })
})
