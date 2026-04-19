import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatMessageList from '@/features/chat/components/ChatMessageList.vue'

describe('ChatMessageList', () => {
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
})
