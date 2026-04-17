import { defineComponent, nextTick, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as chatViewData from '@/features/chat/composables/chat-view.data'
import { useChatView } from '@/features/chat/composables/use-chat-view'

vi.mock('@/features/chat/composables/chat-view.data', () => ({
  loadModelCapabilities: vi.fn(),
  loadVisionFallbackEnabled: vi.fn(),
  loadConversationHostServices: vi.fn(),
  saveConversationHostServices: vi.fn(),
  loadConversationSkillState: vi.fn(),
  saveConversationSkills: vi.fn(),
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
    currentConversationId: 'conversation-1' as string | null,
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
    vi.mocked(chatViewData.loadVisionFallbackEnabled).mockResolvedValue(false)
    vi.mocked(chatViewData.loadConversationHostServices).mockResolvedValue({
      sessionEnabled: true,
      llmEnabled: true,
      ttsEnabled: true,
    })
    vi.mocked(chatViewData.loadConversationSkillState).mockResolvedValue({
      activeSkillIds: [],
      activeSkills: [],
    })
    vi.mocked(chatViewData.saveConversationHostServices).mockResolvedValue({
      sessionEnabled: true,
      llmEnabled: true,
      ttsEnabled: true,
    })
    vi.mocked(chatViewData.saveConversationSkills).mockResolvedValue({
      activeSkillIds: [],
      activeSkills: [],
    })
    vi.mocked(chatViewData.loadModelCapabilities).mockResolvedValue(
      createModelConfig(false, 'text-only-model').capabilities,
    )
  })

  it('shows a fallback notice when pending images target a text-only model', async () => {
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
    let resolveFirst!: (value: ReturnType<typeof createModelConfig>['capabilities'] | null) => void
    const firstRequest = new Promise<ReturnType<typeof createModelConfig>['capabilities'] | null>((resolve) => {
      resolveFirst = resolve
    })

    vi.mocked(chatViewData.loadModelCapabilities)
      .mockImplementationOnce(() => firstRequest)
      .mockResolvedValueOnce(createModelConfig(true, 'image-model').capabilities)

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

    state.handleModelChange({
      providerId: 'demo-provider',
      modelId: 'image-model',
    })
    await flushPromises()

    expect(state.selectedCapabilities.value?.input.image).toBe(true)

    resolveFirst(createModelConfig(false, 'text-only-model').capabilities)
    await flushPromises()

    expect(state.selectedCapabilities.value?.input.image).toBe(true)
  })

  it('marks the optimistic assistant as transcribing when vision fallback will be used', async () => {
    vi.mocked(chatViewData.loadVisionFallbackEnabled).mockResolvedValue(true)

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

  it('disables sending when the current conversation has llm auto reply turned off', async () => {
    vi.mocked(chatViewData.loadConversationHostServices).mockResolvedValue({
      sessionEnabled: true,
      llmEnabled: false,
      ttsEnabled: true,
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

    state.inputText.value = '你好'
    await nextTick()
    await state.send()

    expect(state.canSend.value).toBe(false)
    expect(chat.sendMessage).not.toHaveBeenCalled()
  })

  it('updates llm service state for the current conversation', async () => {
    vi.mocked(chatViewData.loadModelCapabilities).mockResolvedValue(
      createModelConfig(true, 'image-model').capabilities,
    )
    vi.mocked(chatViewData.saveConversationHostServices).mockResolvedValue({
      sessionEnabled: true,
      llmEnabled: false,
      ttsEnabled: true,
    })

    const chat = createChatStub({
      selectedModel: 'image-model',
    })
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()
    await state.setConversationLlmEnabled(false)

    expect(chatViewData.saveConversationHostServices).toHaveBeenCalledWith(
      'conversation-1',
      {
        llmEnabled: false,
      },
    )
    expect(state.conversationHostServices.value?.llmEnabled).toBe(false)
  })

  it('loads and removes active skills for the current conversation', async () => {
    vi.mocked(chatViewData.loadModelCapabilities).mockResolvedValue(
      createModelConfig(true, 'image-model').capabilities,
    )
    vi.mocked(chatViewData.loadConversationSkillState).mockResolvedValue({
      activeSkillIds: ['project/planner'],
      activeSkills: [
        {
          id: 'project/planner',
          name: '规划执行',
          description: '先拆任务，再逐步执行。',
          tags: ['planning'],
          sourceKind: 'project',
          entryPath: 'planner/SKILL.md',
          promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
          toolPolicy: {
            allow: ['kb.search'],
            deny: [],
          },
          governance: {
            trustLevel: 'asset-read',
          },
        },
      ],
    })
    vi.mocked(chatViewData.saveConversationSkills).mockResolvedValue({
      activeSkillIds: [],
      activeSkills: [],
    })

    const chat = createChatStub({
      selectedModel: 'image-model',
    })
    let state!: ReturnType<typeof useChatView>
    const Harness = defineComponent({
      setup() {
        state = useChatView(chat as never)
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()
    await state.removeConversationSkill('project/planner')

    expect(state.conversationSkillState.value?.activeSkillIds).toEqual([])
    expect(chatViewData.saveConversationSkills).toHaveBeenCalledWith('conversation-1', [])
  })
})
