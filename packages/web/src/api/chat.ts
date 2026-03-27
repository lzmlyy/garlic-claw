import { ApiError, getApiBase, request } from './base'
import type {
  Conversation,
  ConversationDetail,
  Message,
  RetryMessagePayload,
  SSEEvent,
  SendMessagePayload,
  UpdateMessagePayload,
} from '@garlic-claw/shared'

export function listConversations() {
  return request<Conversation[]>('/chat/conversations')
}

export function createConversation(title?: string) {
  return request<Conversation>('/chat/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function getConversation(id: string) {
  return request<ConversationDetail>(`/chat/conversations/${id}`)
}

export function deleteConversation(id: string) {
  return request<{ message: string }>(`/chat/conversations/${id}`, { method: 'DELETE' })
}

export function updateConversationMessage(
  conversationId: string,
  messageId: string,
  payload: UpdateMessagePayload,
) {
  return request<Message>(`/chat/conversations/${conversationId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteConversationMessage(conversationId: string, messageId: string) {
  return request<{ success: boolean }>(
    `/chat/conversations/${conversationId}/messages/${messageId}`,
    { method: 'DELETE' },
  )
}

export function stopConversationMessage(conversationId: string, messageId: string) {
  return request<Message>(`/chat/conversations/${conversationId}/messages/${messageId}/stop`, {
    method: 'POST',
  })
}

/**
 * 发送 SSE 聊天请求，并持续把事件推给调用方。
 * @param conversationId 对话 ID
 * @param payload 聊天载荷
 * @param onEvent 事件回调
 * @param signal 可选中止信号
 */
export async function sendMessageSSE(
  conversationId: string,
  payload: SendMessagePayload,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
) {
  const response = await createSseRequest(
    `/chat/conversations/${conversationId}/messages`,
    payload,
    signal,
  )

  await consumeSseResponse(response, onEvent)
}

/**
 * 原地重试指定消息，并持续把事件推给调用方。
 * @param conversationId 对话 ID
 * @param messageId assistant 消息 ID
 * @param payload 可选的 provider/model 覆盖
 * @param onEvent 事件回调
 * @param signal 可选中止信号
 */
export async function retryMessageSSE(
  conversationId: string,
  messageId: string,
  payload: RetryMessagePayload,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
) {
  const response = await createSseRequest(
    `/chat/conversations/${conversationId}/messages/${messageId}/retry`,
    payload,
    signal,
  )

  await consumeSseResponse(response, onEvent)
}

/**
 * 创建一条 SSE 请求。
 * @param path API 路径
 * @param payload 请求体
 * @param signal 可选中止信号
 * @returns 原始 fetch 响应
 */
async function createSseRequest(
  path: string,
  payload: SendMessagePayload | RetryMessagePayload,
  signal?: AbortSignal,
) {
  const token = localStorage.getItem('accessToken')
  const response = await fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok) {
    throw new ApiError(response.status, await response.text())
  }

  return response
}

/**
 * 消费 SSE 响应流并转发事件。
 * @param response fetch 响应
 * @param onEvent 事件回调
 */
async function consumeSseResponse(
  response: Response,
  onEvent: (event: SSEEvent) => void,
) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new ApiError(500, 'SSE 响应体为空')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue
      }

      const data = line.slice(6).trim()
      if (data === '[DONE]') {
        return
      }

      try {
        onEvent(JSON.parse(data) as SSEEvent)
      } catch {
        // SSE 中混入无效 JSON 时直接跳过，避免打断流
      }
    }
  }
}
