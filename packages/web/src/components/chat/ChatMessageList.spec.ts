import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ChatMessageList from './ChatMessageList.vue'

describe('ChatMessageList', () => {
  it('renders vision fallback chips and collapsible transcription details only when present', () => {
    const wrapper = mount(ChatMessageList, {
      props: {
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

    const plainAssistant = wrapper.find('[data-message-id="assistant-3"]')
    expect(plainAssistant.text()).not.toContain('图像转述')
  })
})
