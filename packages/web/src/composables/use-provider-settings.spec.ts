import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AiModelConfig,
  AiProviderConfig,
  AiProviderSummary,
  OfficialProviderCatalogItem,
  VisionFallbackConfig,
} from '@garlic-claw/shared'
import { useProviderSettings } from './use-provider-settings'
import * as providerData from './provider-settings.data'

vi.mock('./provider-settings.data', () => ({
  loadProviderSettingsBaseData: vi.fn(),
  loadProviderSelectionData: vi.fn(),
  loadVisionModelOptions: vi.fn(),
  saveProviderConfig: vi.fn(),
  importDiscoveredProviderModels: vi.fn(),
  formatConnectionSuccess: vi.fn(() => 'ok'),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
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

    let state!: ReturnType<typeof useProviderSettings>
    const Harness = defineComponent({
      setup() {
        state = useProviderSettings()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

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
})
