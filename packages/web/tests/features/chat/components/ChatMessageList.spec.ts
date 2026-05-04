import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChatMessageList from '@/modules/chat/components/ChatMessageList.vue'

describe('ChatMessageList', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders vision fallback chips and collapsible transcription details only when present', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: '请看图',
            status: 'completed',
            error: null,
            metadata: {
              visionFallback: {
                state: 'completed',
                entries: [
                  {
                    text: '图片里是一只趴着的橘猫。',
                    source: 'generated',
                  },
                ],
              },
            },
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '这是一只橘猫。',
            provider: 'openai',
            model: 'gpt-4.1',
            status: 'completed',
            error: null,
            metadata: {
              visionFallback: {
                state: 'completed',
                entries: [
                  {
                    text: '图片里是一只趴着的橘猫。',
                    source: 'generated',
                  },
                ],
              },
            },
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            content: '',
            provider: 'openai',
            model: 'gpt-4.1',
            status: 'pending',
            error: null,
            metadata: {
              visionFallback: {
                state: 'transcribing',
                entries: [],
              },
            },
          },
          {
            id: 'assistant-3',
            role: 'assistant',
            content: '纯文本回复',
            provider: 'openai',
            model: 'gpt-4.1',
            status: 'completed',
            error: null,
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('图像转述')
    expect(wrapper.text()).toContain('图像转述中')
    expect(wrapper.text()).toContain('查看图像转述')
    expect(wrapper.text()).toContain('图片里是一只趴着的橘猫。')
    expect(wrapper.find('[data-message-id="assistant-1"] .message-role-avatar-image').attributes('src')).toBe('/api/personas/persona.writer/avatar')
    expect(wrapper.find('[data-message-id="user-1"] .message-role-avatar-image').exists()).toBe(false)

    const plainAssistant = wrapper.find('[data-message-id="assistant-3"]')
    expect(plainAssistant.text()).not.toContain('图像转述')
  })

  it('renders assistant custom blocks above the message content and keeps them collapsed by default', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '正式回复',
            provider: 'deepseek',
            model: 'deepseek-reasoner',
            status: 'completed',
            error: null,
            metadata: {
              customBlocks: [
                {
                  id: 'custom-field:reasoning_content',
                  kind: 'text',
                  title: 'Reasoning Content',
                  text: '先检查上下文',
                  state: 'done',
                  source: {
                    providerId: 'deepseek',
                    origin: 'ai-sdk.raw',
                    key: 'reasoning_content',
                  },
                },
              ],
            } as never,
          },
        ],
      },
    })

    const assistant = wrapper.find('[data-message-id="assistant-1"]')
    const details = assistant.find('details.message-custom-block')
    const summary = assistant.find('.message-custom-block-summary')
    const content = assistant.find('.message-content')

    expect(details.exists()).toBe(true)
    expect((details.element as HTMLDetailsElement).open).toBe(false)
    expect(summary.text()).toContain('Reasoning Content')
    expect(summary.text()).toContain('文本')
    expect(assistant.text()).toContain('先检查上下文')
    expect(assistant.html().indexOf('message-custom-blocks')).toBeLessThan(
      assistant.html().indexOf('message-content'),
    )
    expect(content.text()).toContain('正式回复')
  })

  it('renders a lightweight divider for display-only context compaction summaries', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'display-summary',
            role: 'display',
            content: '压缩后的历史摘要',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  type: 'context-compaction',
                  owner: 'conversation.context-governance',
                  version: '1',
                  data: {
                    role: 'summary',
                    trigger: 'manual',
                    coveredCount: 3,
                    providerId: 'openai',
                    modelId: 'gpt-5.4',
                    beforePreview: {
                      estimatedTokens: 1200,
                    },
                    afterPreview: {
                      estimatedTokens: 420,
                    },
                  },
                },
              ],
            } as never,
          },
        ],
      },
    })

    const displayMessage = wrapper.find('[data-message-id="display-summary"]')
    const divider = displayMessage.find('.message-compaction-divider')

    expect(divider.exists()).toBe(true)
    expect(divider.text()).toContain('会话已压缩')
    expect(displayMessage.text()).not.toContain('覆盖 3 条消息')
    expect(displayMessage.text()).not.toContain('Token 估算')
    expect(displayMessage.text()).not.toContain('仅展示，不进入 LLM 上下文')
    expect(displayMessage.text()).toContain('压缩后的历史摘要')
    expect(displayMessage.classes()).toContain('display')
    expect(displayMessage.find('.message-role-avatar-image').exists()).toBe(false)
    expect(displayMessage.find('.retry-text').exists()).toBe(false)
  })

  it('renders persisted display command and result messages with distinct variants', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'display-command',
            role: 'display',
            content: '/compact',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    variant: 'command',
                  },
                  owner: 'conversation.display-message',
                  type: 'display-message',
                  version: '1',
                },
              ],
            } as never,
          },
          {
            id: 'display-result',
            role: 'display',
            content: '已压缩上下文，覆盖 2 条历史消息。',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    variant: 'result',
                  },
                  owner: 'conversation.display-message',
                  type: 'display-message',
                  version: '1',
                },
              ],
            } as never,
          },
        ],
      },
    })

    const commandMessage = wrapper.find('[data-message-id="display-command"]')
    const resultMessage = wrapper.find('[data-message-id="display-result"]')

    expect(commandMessage.text()).toContain('命令')
    expect(commandMessage.classes()).toContain('display-command')
    expect(commandMessage.text()).toContain('/compact')
    expect(resultMessage.text()).toContain('展示')
    expect(resultMessage.classes()).toContain('display-result')
    expect(resultMessage.text()).toContain('已压缩上下文，覆盖 2 条历史消息。')
  })

  it('renders an auto-retry card for assistant messages that are waiting for the next retry attempt', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_777_000_000_000)

    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-retry',
            role: 'assistant',
            content: '',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'pending',
            error: null,
            retryState: {
              attempt: 1,
              message: 'Provider is overloaded',
              next: 1_777_000_003_000,
            },
          } as never,
        ],
      },
    })

    const assistant = wrapper.find('[data-message-id="assistant-retry"]')

    expect(assistant.text()).toContain('自动重试')
    expect(assistant.text()).toContain('Provider is overloaded')
    expect(assistant.text()).toContain('3 秒后')
    expect(assistant.text()).toContain('第 1 次')
    expect(assistant.find('.cursor').exists()).toBe(false)
    expect(assistant.find('.message-error').exists()).toBe(false)
  })

  it('does not render a retry button for temporary assistant placeholders', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'temp-assistant-1',
            role: 'assistant',
            content: '',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'error',
            error: 'network down',
          } as never,
        ],
      },
    })

    const assistant = wrapper.find('[data-message-id="temp-assistant-1"]')

    expect(assistant.exists()).toBe(true)
    expect(assistant.find('.retry-text').exists()).toBe(false)
    expect(assistant.find('.delete-text').exists()).toBe(true)
  })

  it('grays out messages excluded from the current LLM context window without deleting them', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        contextWindowPreview: {
          contextLength: 256,
          enabled: true,
          estimatedTokens: 120,
          excludedMessageIds: ['assistant-1'],
          frontendMessageWindowSize: 200,
          includedMessageIds: ['assistant-2'],
          keepRecentMessages: 2,
          source: 'estimated',
          slidingWindowUsagePercent: 50,
          strategy: 'sliding',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '这条消息已经脱离上下文窗口。',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            content: '这条消息仍在当前上下文窗口内。',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
          },
        ],
      },
    })

    const excludedMessage = wrapper.find('[data-message-id="assistant-1"]')
    const includedMessage = wrapper.find('[data-message-id="assistant-2"]')

    expect(excludedMessage.classes()).toContain('excluded-from-context')
    expect(excludedMessage.text()).toContain('已脱离当前 LLM 上下文')
    expect(excludedMessage.text()).toContain('这条消息已经脱离上下文窗口。')
    expect(includedMessage.classes()).not.toContain('excluded-from-context')
  })

  it('does not render sliding-window exclusion copy for summary compaction history', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        contextWindowPreview: {
          contextLength: 10_000,
          enabled: true,
          estimatedTokens: 580,
          excludedMessageIds: ['assistant-1'],
          frontendMessageWindowSize: 200,
          includedMessageIds: ['summary-1', 'assistant-2'],
          keepRecentMessages: 0,
          source: 'provider',
          slidingWindowUsagePercent: 50,
          strategy: 'summary',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '这条旧消息已经被摘要覆盖。',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
          },
          {
            id: 'summary-1',
            role: 'display',
            content: '压缩摘要',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    coveredCount: 1,
                    role: 'summary',
                  },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            } as never,
          },
        ],
      },
    })

    const excludedMessage = wrapper.find('[data-message-id="assistant-1"]')
    expect(excludedMessage.classes()).not.toContain('excluded-from-context')
    expect(excludedMessage.text()).not.toContain('已脱离当前 LLM 上下文')
  })

  it('recognizes after-response compaction summaries as context compaction annotations', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'summary-after-response',
            role: 'display',
            content: '压缩摘要：最近任务与约束。',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    afterPreview: { estimatedTokens: 420 },
                    beforePreview: { estimatedTokens: 980 },
                    coveredCount: 3,
                    modelId: 'gpt-5.4',
                    providerId: 'openai',
                    role: 'summary',
                    trigger: 'after-response',
                  },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            } as never,
          },
        ],
      },
    })

    const summaryMessage = wrapper.find('[data-message-id="summary-after-response"]')
    expect(summaryMessage.find('.message-compaction-divider').exists()).toBe(true)
    expect(summaryMessage.text()).toContain('会话已压缩')
    expect(summaryMessage.text()).not.toContain('自动触发')
    expect(summaryMessage.text()).not.toContain('openai/gpt-5.4')
    expect(summaryMessage.text()).not.toContain('Token 估算 980 -> 420')
    expect(summaryMessage.text()).toContain('压缩摘要：最近任务与约束。')
  })

  it('renders tool calls and tool results as collapsed timeline blocks before the assistant reply', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-tools',
            role: 'assistant',
            content: '最终答复在工具后面。',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
            toolCalls: [
              {
                toolCallId: 'tool-call-1',
                toolName: 'spawn_subagent',
                input: {
                  name: '资料核对员',
                  prompt: '检查引用来源',
                },
                inputPreview: '{"name":"资料核对员","prompt":"检查引用来源"}',
              },
            ],
            toolResults: [
              {
                toolCallId: 'tool-call-1',
                toolName: 'spawn_subagent',
                output: {
                  conversationId: 'subagent-conversation-1',
                  status: 'completed',
                },
                outputPreview: '{"conversationId":"subagent-conversation-1","status":"completed"}',
              },
            ],
          },
        ],
      },
    })

    const assistant = wrapper.find('[data-message-id="assistant-tools"]')
    const toolEntries = assistant.findAll('details.tool-entry')
    const summaryText = toolEntries.map((entry) => entry.find('summary').text())

    expect(toolEntries).toHaveLength(2)
    expect((toolEntries[0].element as HTMLDetailsElement).open).toBe(false)
    expect((toolEntries[1].element as HTMLDetailsElement).open).toBe(false)
    expect(summaryText[0]).toContain('调用')
    expect(summaryText[0]).toContain('spawn_subagent')
    expect(summaryText[1]).toContain('结果')
    expect(summaryText[1]).toContain('spawn_subagent')
    expect(assistant.text()).toContain('最终答复在工具后面。')
    expect(assistant.html().indexOf('tool-timeline')).toBeLessThan(
      assistant.html().indexOf('message-content'),
    )

    toolEntries[0].element.setAttribute('open', '')
    toolEntries[1].element.setAttribute('open', '')

    expect(assistant.text()).toContain('资料核对员')
    expect(assistant.text()).toContain('conversationId')
    expect(assistant.text()).toContain('subagent-conversation-1')
  })

  it('hides inline usage text and only shows token details in the [i] panel', async () => {
    const wrapper = mount(ChatMessageList, {
      props: {
        assistantPersona: {
          avatar: '/api/personas/persona.writer/avatar',
          name: 'Writer',
        },
        loading: false,
        messages: [
          {
            id: 'assistant-usage-1',
            role: 'assistant',
            content: '第一条回复',
            provider: 'openai',
            model: 'gpt-5.4',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    cachedInputTokens: 64,
                    inputTokens: 320,
                    modelId: 'gpt-5.4',
                    outputTokens: 120,
                    providerId: 'openai',
                    source: 'provider',
                    totalTokens: 440,
                  },
                  owner: 'conversation.model-usage',
                  type: 'model-usage',
                  version: '1',
                },
              ],
            } as never,
          },
          {
            id: 'assistant-usage-2',
            role: 'assistant',
            content: '第二条回复',
            provider: 'openai',
            model: 'gpt-5.4-mini',
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    inputTokens: 180,
                    modelId: 'gpt-5.4-mini',
                    outputTokens: 40,
                    providerId: 'openai',
                    source: 'provider',
                    totalTokens: 220,
                  },
                  owner: 'conversation.model-usage',
                  type: 'model-usage',
                  version: '1',
                },
              ],
            } as never,
          },
          {
            id: 'assistant-usage-3',
            role: 'assistant',
            content: '第三条回复',
            provider: null,
            model: null,
            status: 'completed',
            error: null,
            metadata: {
              annotations: [
                {
                  data: {
                    cachedInputTokens: 7,
                    inputTokens: 42,
                    modelId: 'deepseek-v4-flash',
                    outputTokens: 21,
                    providerId: 'ds2api',
                    source: 'estimated',
                    totalTokens: 63,
                  },
                  owner: 'conversation.model-usage',
                  type: 'model-usage',
                  version: '1',
                },
              ],
            } as never,
          },
        ],
      },
    })

    const firstAssistant = wrapper.find('[data-message-id="assistant-usage-1"]')
    const secondAssistant = wrapper.find('[data-message-id="assistant-usage-2"]')
    const thirdAssistant = wrapper.find('[data-message-id="assistant-usage-3"]')

    expect(firstAssistant.find('.message-usage-inline').exists()).toBe(false)
    expect(secondAssistant.find('.message-usage-inline').exists()).toBe(false)
    expect(thirdAssistant.find('.message-usage-inline').exists()).toBe(false)
    expect(firstAssistant.find('.usage-info-toggle').text()).toBe('[i]')
    expect(thirdAssistant.find('.usage-info-toggle').text()).toBe('[i]')

    await firstAssistant.find('.usage-info-toggle').trigger('click')

    expect(firstAssistant.text()).toContain('输入 token')
    expect(firstAssistant.text()).toContain('320')
    expect(firstAssistant.text()).toContain('总 token')
    expect(firstAssistant.text()).toContain('440')
    expect(firstAssistant.text()).toContain('输出 token')
    expect(firstAssistant.text()).toContain('120')
    expect(firstAssistant.text()).toContain('缓存 token')
    expect(firstAssistant.text()).toContain('64')

    await secondAssistant.find('.usage-info-toggle').trigger('click')

    expect(secondAssistant.text()).toContain('输入 token')
    expect(secondAssistant.text()).toContain('180')
    expect(secondAssistant.text()).toContain('总 token')
    expect(secondAssistant.text()).toContain('220')
    expect(secondAssistant.text()).toContain('输出 token')
    expect(secondAssistant.text()).toContain('40')
    expect(secondAssistant.text()).not.toContain('缓存 token')

    await thirdAssistant.find('.usage-info-toggle').trigger('click')

    expect(thirdAssistant.text()).toContain('输入 token')
    expect(thirdAssistant.text()).toContain('*42')
    expect(thirdAssistant.text()).toContain('总 token')
    expect(thirdAssistant.text()).toContain('*63')
    expect(thirdAssistant.text()).toContain('缓存 token')
    expect(thirdAssistant.text()).toContain('*7')
    expect(thirdAssistant.text()).toContain('输出 token')
    expect(thirdAssistant.text()).toContain('*21')
  })
})
