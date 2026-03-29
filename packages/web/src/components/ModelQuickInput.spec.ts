import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ModelQuickInput from './ModelQuickInput.vue'
import * as api from '../api'

vi.mock('../api', () => ({
  listAiProviders: vi.fn(),
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

describe('ModelQuickInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps suggestions from healthy providers when one provider model list fails', async () => {
    vi.mocked(api.listAiProviders).mockResolvedValue([
      createProvider('broken-provider'),
      createProvider('healthy-provider'),
    ])
    vi.mocked(api.listAiModels).mockImplementation(async (providerId: string) => {
      if (providerId === 'broken-provider') {
        throw new Error('provider offline')
      }

      return [createModel('healthy-provider', 'healthy-model')]
    })

    const wrapper = mount(ModelQuickInput, {
      props: {
        placeholder: '选择 provider/model',
      },
    })

    await flushPromises()
    await wrapper.find('input').trigger('focus')
    await flushPromises()

    expect(wrapper.text()).toContain('healthy-provider')
    expect(wrapper.text()).toContain('healthy-model')
  })

  it('falls back to an empty suggestion list when provider loading fails', async () => {
    vi.mocked(api.listAiProviders).mockRejectedValue(new Error('providers unavailable'))

    const wrapper = mount(ModelQuickInput)

    await flushPromises()
    await wrapper.find('input').trigger('focus')
    await flushPromises()

    expect(wrapper.findAll('.suggestion-item')).toHaveLength(0)
  })
})
