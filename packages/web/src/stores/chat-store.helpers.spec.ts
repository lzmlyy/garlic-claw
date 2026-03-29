import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveChatModelSelection } from './chat-store.helpers'
import * as api from '../api'

vi.mock('../api', () => ({
  listAiProviders: vi.fn(),
  listAiModels: vi.fn(),
}))

function createProvider(id: string, available = true, defaultModel?: string) {
  return {
    id,
    name: id,
    mode: 'official' as const,
    driver: 'openai',
    defaultModel,
    baseUrl: 'https://example.com/v1',
    modelCount: 1,
    available,
  }
}

function createModel(providerId: string, id: string) {
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

describe('resolveChatModelSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to a healthy provider when the preferred provider model lookup fails', async () => {
    vi.mocked(api.listAiProviders).mockResolvedValue([
      createProvider('broken-provider'),
      createProvider('healthy-provider', true, 'healthy-default'),
    ])
    vi.mocked(api.listAiModels).mockImplementation(async (providerId: string) => {
      if (providerId === 'broken-provider') {
        throw new Error('provider offline')
      }

      return [createModel('healthy-provider', 'healthy-default')]
    })

    const selection = await resolveChatModelSelection({
      providerId: 'broken-provider',
      modelId: 'broken-model',
    })

    expect(selection).toEqual({
      providerId: 'healthy-provider',
      modelId: 'healthy-default',
    })
  })

  it('still resolves the preferred model id from healthy providers when another provider fails', async () => {
    vi.mocked(api.listAiProviders).mockResolvedValue([
      createProvider('broken-provider'),
      createProvider('healthy-provider'),
    ])
    vi.mocked(api.listAiModels).mockImplementation(async (providerId: string) => {
      if (providerId === 'broken-provider') {
        throw new Error('provider offline')
      }

      return [createModel('healthy-provider', 'shared-model')]
    })

    const selection = await resolveChatModelSelection({
      modelId: 'shared-model',
    })

    expect(selection).toEqual({
      providerId: 'healthy-provider',
      modelId: 'shared-model',
    })
  })
})
