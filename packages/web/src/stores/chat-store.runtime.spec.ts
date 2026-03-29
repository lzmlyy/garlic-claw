import { describe, expect, it } from 'vitest'
import type { SSEEvent } from '@garlic-claw/shared'
import { applySseEvent } from './chat-store.runtime'
import type { ChatMessage } from './chat-store.types'

describe('applySseEvent', () => {
  it('overrides the assistant content when a message-patch event arrives', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '原始回复',
        status: 'streaming',
        error: null,
      },
    ]
    const event: SSEEvent = {
      type: 'message-patch',
      messageId: 'assistant-1',
      content: '插件润色后的最终回复',
      parts: [
        {
          type: 'image',
          image: 'https://example.com/final.png',
        },
        {
          type: 'text',
          text: '插件润色后的最终回复',
        },
      ],
    }

    expect(applySseEvent(messages, event, { requestKind: 'send' })).toEqual([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '插件润色后的最终回复',
        parts: [
          {
            type: 'image',
            image: 'https://example.com/final.png',
          },
          {
            type: 'text',
            text: '插件润色后的最终回复',
          },
        ],
        status: 'streaming',
        error: null,
      },
    ])
  })
})
