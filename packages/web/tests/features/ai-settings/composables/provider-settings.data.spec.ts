import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadProviderModelOptions } from '@/features/ai-settings/composables/provider-settings.data'
import * as aiApi from '@/features/ai-settings/api/ai'

vi.mock('@/features/ai-settings/api/ai', () => ({
  listAiModels: vi.fn(),
}))

function createProvider(id: string, available = true) {
  return {
    id,
    name: id,
    mode: 'catalog' as const,
    driver: 'openai',
    defaultModel: `${id}-default`,
    baseUrl: 'https://example.com/v1',
    modelCount: 1,
    available,
  }
}

function createModel(providerId: string, id: string, inputImage: boolean) {
  return {
    id,
    providerId,
    name: id,
    capabilities: {
      reasoning: false,
      toolCall: false,
      input: {
        text: true,
        image: inputImage,
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

describe('loadProviderModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps image-capable options from healthy providers when one provider fails', async () => {
    vi.mocked(aiApi.listAiModels).mockImplementation(async (providerId: string) => {
      if (providerId === 'broken-provider') {
        throw new Error('provider offline')
      }

      return [
        createModel('healthy-provider', 'vision-model', true),
        createModel('healthy-provider', 'text-model', false),
      ]
    })

    const options = await loadProviderModelOptions([
      createProvider('broken-provider'),
      createProvider('healthy-provider'),
    ])

    expect(options.visionOptions).toEqual([
      {
        providerId: 'healthy-provider',
        providerName: 'healthy-provider',
        modelId: 'vision-model',
        label: 'healthy-provider / vision-model',
      },
    ])
    expect(options.hostModelRoutingOptions).toEqual([
      {
        providerId: 'healthy-provider',
        modelId: 'vision-model',
        label: 'healthy-provider / vision-model',
      },
      {
        providerId: 'healthy-provider',
        modelId: 'text-model',
        label: 'healthy-provider / text-model',
      },
    ])
    expect(options.modelsByProviderId).toEqual({
      'broken-provider': [],
      'healthy-provider': [
        createModel('healthy-provider', 'vision-model', true),
        createModel('healthy-provider', 'text-model', false),
      ],
    })
  })

  it('reuses preloaded models for known providers instead of requesting them again', async () => {
    vi.mocked(aiApi.listAiModels).mockResolvedValue([
      createModel('other-provider', 'other-model', false),
    ])

    const options = await loadProviderModelOptions({
      providers: [
        createProvider('selected-provider'),
        createProvider('other-provider'),
      ],
      preloadedModelsByProviderId: {
        'selected-provider': [
          createModel('selected-provider', 'selected-vision-model', true),
        ],
      },
    })

    expect(aiApi.listAiModels).toHaveBeenCalledTimes(1)
    expect(aiApi.listAiModels).toHaveBeenCalledWith('other-provider')
    expect(options.visionOptions).toEqual([
      {
        providerId: 'selected-provider',
        providerName: 'selected-provider',
        modelId: 'selected-vision-model',
        label: 'selected-provider / selected-vision-model',
      },
    ])
    expect(options.hostModelRoutingOptions).toEqual([
      {
        providerId: 'selected-provider',
        modelId: 'selected-vision-model',
        label: 'selected-provider / selected-vision-model',
      },
      {
        providerId: 'other-provider',
        modelId: 'other-model',
        label: 'other-provider / other-model',
      },
    ])
    expect(options.modelsByProviderId).toEqual({
      'selected-provider': [
        createModel('selected-provider', 'selected-vision-model', true),
      ],
      'other-provider': [
        createModel('other-provider', 'other-model', false),
      ],
    })
  })
})
