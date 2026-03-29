import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AiModelConfig,
  AiProviderConfig,
  AiProviderConnectionTestResult,
  AiProviderSummary,
  DiscoveredAiModel,
  OfficialProviderCatalogItem,
  VisionFallbackConfig,
} from '@garlic-claw/shared'
import { useProviderSettings } from './use-provider-settings'
import * as providerData from './provider-settings.data'
import * as api from '../api'

vi.mock('./provider-settings.data', () => ({
  loadProviderSettingsBaseData: vi.fn(),
  loadProviderSelectionData: vi.fn(),
  loadVisionModelOptions: vi.fn(),
  saveProviderConfig: vi.fn(),
  importDiscoveredProviderModels: vi.fn(),
  formatConnectionSuccess: vi.fn(() => 'ok'),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

vi.mock('../api', () => ({
  deleteAiProvider: vi.fn(),
  upsertAiModel: vi.fn(),
  discoverAiProviderModels: vi.fn(),
  deleteAiModel: vi.fn(),
  setAiProviderDefaultModel: vi.fn(),
  updateAiModelCapabilities: vi.fn(),
  testAiProviderConnection: vi.fn(),
  updateVisionFallbackConfig: vi.fn(),
}))

function createProviderSummary(id: string, name = id): AiProviderSummary {
  return {
    id,
    name,
    mode: 'official',
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
    mode: 'official',
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
    const catalog: OfficialProviderCatalogItem[] = []
    const visionConfig: VisionFallbackConfig = { enabled: false }

    vi.mocked(providerData.loadProviderSettingsBaseData).mockResolvedValue({
      catalog,
      providers,
      visionConfig,
    })
    vi.mocked(providerData.loadProviderSelectionData)
      .mockImplementationOnce(() => firstSelection)
      .mockResolvedValueOnce({
        provider: createProviderConfig('provider-b', 'Provider B'),
        models: [createModel('provider-b-model', 'provider-b')],
      })
    vi.mocked(providerData.loadVisionModelOptions).mockResolvedValue([])

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
    })
    vi.mocked(providerData.loadProviderSelectionData).mockImplementation(
      async (providerId: string) => createSelectionData(providerId),
    )
    vi.mocked(providerData.loadVisionModelOptions).mockResolvedValue([])
    vi.mocked(api.discoverAiProviderModels).mockReturnValueOnce(discoveryRequest)

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
    })
    vi.mocked(providerData.loadProviderSelectionData).mockImplementation(
      async (providerId: string) => createSelectionData(providerId),
    )
    vi.mocked(providerData.loadVisionModelOptions).mockResolvedValue([])
    vi.mocked(api.testAiProviderConnection).mockReturnValueOnce(connectionRequest)

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
})
