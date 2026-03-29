import { defineComponent, nextTick, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useChatView } from './use-chat-view'
import * as api from '../api'

vi.mock('../api', () => ({
  listAiModels: vi.fn(),
  getVisionFallbackConfig: vi.fn(),
}))

function createModelConfig(inputImage: boolean, id = inputImage ? 'image-model' : 'text-only-model') {
  return {
    id,
    providerId: 'demo-provider',
    name: inputImage ? 'Vision Model' : 'Text Only',
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

function createChatStub(overrides: Partial<Record<string, unknown>> = {}) {
  return reactive({
    messages: [],
    streaming: false,
    retryableMessageId: null,
    selectedProvider: 'demo-provider' as string | null,
    selectedModel: 'text-only-model' as string | null,
    setModelSelection(selection: { provider: string | null; model: string | null }) {
      this.selectedProvider = selection.provider
      this.selectedModel = selection.model
    },
    sendMessage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    retryMessage: vi.fn(),
    ...overrides,
  })
}

describe('useChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getVisionFallbackConfig).mockResolvedValue({
      enabled: false,
    })
  })

  it('shows a fallback notice when pending images target a text-only model', async () => {
    vi.mocked(api.listAiModels).mockResolvedValue([
      createModelConfig(false, 'text-only-model'),
    ])

    const chat = createChatStub()
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    state.pendingImages.value.push({
      id: 'image-1',
      name: 'demo.png',
      image: 'data:image/png;base64,Zm9v',
      mimeType: 'image/png',
    })
    await nextTick()

    expect(state.uploadNotices.value).toContainEqual(
      expect.objectContaining({
        type: 'info',
        text: expect.stringContaining('当前模型不支持图片输入'),
      }),
    )
    expect(state.uploadNotices.value).toContainEqual(
      expect.objectContaining({
        type: 'info',
        text: expect.stringContaining('Vision Fallback'),
      }),
    )
  })

  it('keeps the latest model capabilities when an older request resolves later', async () => {
    let resolveFirst!: (value: ReturnType<typeof createModelConfig>[]) => void
    const firstRequest = new Promise<ReturnType<typeof createModelConfig>[]>((resolve) => {
      resolveFirst = resolve
    })

    vi.mocked(api.listAiModels)
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValueOnce([createModelConfig(true, 'image-model')])

    const chat = createChatStub()
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await nextTick()

    await state.handleModelChange({
      providerId: 'demo-provider',
      modelId: 'image-model',
    })
    await flushPromises()

    expect(state.selectedCapabilities.value?.input.image).toBe(true)

    resolveFirst([createModelConfig(false, 'text-only-model')])
    await flushPromises()

    expect(state.selectedCapabilities.value?.input.image).toBe(true)
  })

  it('marks the optimistic assistant as transcribing when vision fallback will be used', async () => {
    vi.mocked(api.listAiModels).mockResolvedValue([
      createModelConfig(false, 'text-only-model'),
    ])
    vi.mocked(api.getVisionFallbackConfig).mockResolvedValue({
      enabled: true,
      providerId: 'vision-provider',
      modelId: 'vision-model',
    })

    const chat = createChatStub()
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    state.pendingImages.value.push({
      id: 'image-1',
      name: 'demo.png',
      image: 'data:image/png;base64,Zm9v',
      mimeType: 'image/png',
    })
    await nextTick()

    await state.send()

    expect(chat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        optimisticAssistantMetadata: {
          visionFallback: {
            state: 'transcribing',
            entries: [],
          },
        },
      }),
    )
  })
})
