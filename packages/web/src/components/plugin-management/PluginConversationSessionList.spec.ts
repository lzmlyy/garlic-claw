import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PluginConversationSessionInfo } from '@garlic-claw/shared'
import PluginConversationSessionList from './PluginConversationSessionList.vue'

describe('PluginConversationSessionList', () => {
  it('renders active session details and emits finish for the selected conversation', async () => {
    const sessions: PluginConversationSessionInfo[] = [
      {
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 45000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:00:45.000Z',
        lastMatchedAt: '2026-03-28T12:00:10.000Z',
        captureHistory: true,
        historyMessages: [
          {
            role: 'user',
            content: '成语接龙',
            parts: [
              {
                type: 'text',
                text: '成语接龙',
              },
            ],
          },
        ],
        metadata: {
          flow: 'idiom',
        },
      },
    ]

    const wrapper = mount(PluginConversationSessionList, {
      props: {
        sessions,
        finishingConversationId: null,
      },
    })

    expect(wrapper.text()).toContain('当前插件有 1 个活动会话等待态')
    expect(wrapper.text()).toContain('conversation-1')
    expect(wrapper.text()).toContain('成语接龙')
    expect(wrapper.text()).toContain('"flow": "idiom"')

    await wrapper.get('[data-test="session-finish-button"]').trigger('click')

    expect(wrapper.emitted('finish')).toEqual([
      ['conversation-1'],
    ])
  })

  it('renders a clearer empty state when there are no active sessions', () => {
    const wrapper = mount(PluginConversationSessionList, {
      props: {
        sessions: [],
        finishingConversationId: null,
      },
    })

    expect(wrapper.text()).toContain('当前插件没有活动中的会话等待态。')
  })
})
