import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadVisionModelOptions } from './provider-settings.data'
import * as api from '../api'

vi.mock('../api', () => ({
  listAiModels: vi.fn(),
}))

function createProvider(id: string, available = true) {
  return {
    id,
    name: id,
    mode: 'official' as const,
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
  }
}

describe('loadVisionModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps image-capable options from healthy providers when one provider fails', async () => {
    vi.mocked(api.listAiModels).mockImplementation(async (providerId: string) => {
      if (providerId === 'broken-provider') {
        throw new Error('provider offline')
      }

      return [
        createModel('healthy-provider', 'vision-model', true),
        createModel('healthy-provider', 'text-model', false),
      ]
    })

    const options = await loadVisionModelOptions([
      createProvider('broken-provider'),
      createProvider('healthy-provider'),
    ])

    expect(options).toEqual([
      {
        providerId: 'healthy-provider',
        providerName: 'healthy-provider',
        modelId: 'vision-model',
        label: 'healthy-provider / vision-model',
      },
    ])
  })
})
