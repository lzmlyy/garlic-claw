import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dbMessageToChat } from '@/features/chat/store/chat-store.helpers'
import { resolveChatModelSelection } from '@/features/chat/modules/chat-model-selection'
import * as aiApi from '@/features/ai-settings/api/ai'

vi.mock('@/features/ai-settings/api/ai', () => ({
  listAiProviders: vi.fn(),
  listAiModels: vi.fn(),
}))

function createProvider(id: string, available = true, defaultModel?: string) {
  return {
    id,
    name: id,
    mode: 'catalog' as const,
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
    contextLength: 128 * 1024,
  }
}

describe('resolveChatModelSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to a healthy provider when the preferred provider model lookup fails', async () => {
    vi.mocked(aiApi.listAiProviders).mockResolvedValue([
      createProvider('broken-provider'),
      createProvider('healthy-provider', true, 'healthy-default'),
    ])
    vi.mocked(aiApi.listAiModels).mockImplementation(async (providerId: string) => {
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
    vi.mocked(aiApi.listAiProviders).mockResolvedValue([
      createProvider('broken-provider'),
      createProvider('healthy-provider'),
    ])
    vi.mocked(aiApi.listAiModels).mockImplementation(async (providerId: string) => {
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

describe('dbMessageToChat', () => {
  it('parses persisted vision fallback metadata from message records', () => {
    const message = dbMessageToChat({
      id: 'message-1',
      role: 'assistant',
      content: '图片总结',
      partsJson: null,
      toolCalls: null,
      toolResults: null,
      provider: 'openai',
      model: 'gpt-4.1',
      status: 'completed',
      error: null,
      metadataJson: JSON.stringify({
        visionFallback: {
          state: 'completed',
          entries: [
            {
              text: '图片里是一只猫。',
              source: 'cache',
            },
          ],
        },
      }),
      createdAt: '2026-03-29T12:00:00.000Z',
      updatedAt: '2026-03-29T12:00:00.000Z',
    })

    expect(message.metadata).toEqual({
      visionFallback: {
        state: 'completed',
        entries: [
          {
            text: '图片里是一只猫。',
            source: 'cache',
          },
        ],
      },
    })
  })

  it('parses persisted custom blocks metadata from message records', () => {
    const message = dbMessageToChat({
      id: 'message-2',
      role: 'assistant',
      content: '最终回复',
      partsJson: null,
      toolCalls: null,
      toolResults: null,
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      status: 'completed',
      error: null,
      metadataJson: JSON.stringify({
        customBlocks: [
          {
            id: 'custom-field:reasoning_content',
            kind: 'text',
            title: 'reasoning_content',
            text: '先检查上下文',
            state: 'done',
            source: {
              providerId: 'deepseek',
              origin: 'ai-sdk.raw',
              key: 'reasoning_content',
            },
          },
        ],
      }),
      createdAt: '2026-03-29T12:00:00.000Z',
      updatedAt: '2026-03-29T12:00:00.000Z',
    })

    expect(message.metadata).toEqual({
      customBlocks: [
        {
          id: 'custom-field:reasoning_content',
          kind: 'text',
          title: 'reasoning_content',
          text: '先检查上下文',
          state: 'done',
          source: {
            providerId: 'deepseek',
            origin: 'ai-sdk.raw',
            key: 'reasoning_content',
          },
        },
      ],
    })
  })
})
