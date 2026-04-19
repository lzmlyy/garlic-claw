import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type {
  AiModelConfig,
  AiProviderConfig,
  AiProviderCatalogItem,
} from '@garlic-claw/shared'
import AiProviderModelsPanel from '@/features/ai-settings/components/AiProviderModelsPanel.vue'
import { coreProviderCatalogFixture } from './provider-test.fixtures'

const catalog: AiProviderCatalogItem[] = [
  coreProviderCatalogFixture[0],
]

function createProvider(): AiProviderConfig {
  return {
    id: 'ds2api',
    name: 's2api',
    mode: 'protocol',
    driver: 'openai',
    baseUrl: 'https://example.com/v1',
    defaultModel: 'deepseek-chat',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-chat-search',
      'deepseek-reasoner-search',
      'deepseek-coder',
      'deepseek-vl',
      'deepseek-long',
    ],
  }
}

function createModel(id: string, reasoning = false): AiModelConfig {
  return {
    id,
    providerId: 'ds2api',
    name: id,
    capabilities: {
      reasoning,
      toolCall: true,
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

describe('AiProviderModelsPanel', () => {
  it('filters and paginates provider models', async () => {
    const wrapper = mount(AiProviderModelsPanel, {
      props: {
        provider: createProvider(),
        catalog,
        models: [
          createModel('deepseek-chat'),
          createModel('deepseek-reasoner', true),
          createModel('deepseek-chat-search'),
          createModel('deepseek-reasoner-search', true),
          createModel('deepseek-coder'),
          createModel('deepseek-vl'),
          createModel('deepseek-long'),
        ],
        discoveringModels: false,
        testingConnection: false,
        connectionResult: null,
      },
      global: {
        stubs: {
          AiModelCapabilityToggles: {
            template: '<div class="capability-toggles-stub" />',
          },
        },
      },
    })

    expect(wrapper.findAll('.model-item')).toHaveLength(3)
    expect(wrapper.text()).toContain('匹配 7 / 7')
    expect(wrapper.text()).toContain('第 1 / 3 页')

    await wrapper.get('[data-test="provider-models-next-page"]').trigger('click')

    expect(wrapper.text()).toContain('第 2 / 3 页')
    expect(wrapper.find('.model-item strong').text()).toBe('deepseek-reasoner-search')

    await wrapper.get('[data-test="provider-models-search"]').setValue('reasoner-search')

    expect(wrapper.text()).toContain('匹配 1 / 7')
    expect(wrapper.text()).toContain('第 1 / 1 页')
    expect(wrapper.findAll('.model-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('deepseek-reasoner-search')
    expect(wrapper.text()).toContain('协议接入')
    expect(wrapper.text()).toContain('OpenAI 协议接入')
  })

  it('emits context length updates for a model', async () => {
    const wrapper = mount(AiProviderModelsPanel, {
      props: {
        provider: createProvider(),
        catalog,
        models: [createModel('deepseek-chat')],
        discoveringModels: false,
        testingConnection: false,
        connectionResult: null,
      },
      global: {
        stubs: {
          AiModelCapabilityToggles: {
            template: '<div class="capability-toggles-stub" />',
          },
        },
      },
    })

    const input = wrapper.get('.context-length-field input')
    await input.setValue('65536')
    await wrapper.get('.context-length-row .ghost-button').trigger('click')

    expect(wrapper.emitted('update-context-length')).toEqual([
      [
        {
          modelId: 'deepseek-chat',
          contextLength: 65536,
        },
      ],
    ])
  })
})
