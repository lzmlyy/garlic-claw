const BASE = '/api'

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('accessToken')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${url}`, { ...options, headers })

  if (res.status === 401) {
    // 尝试刷新令牌
    const refreshed = await tryRefresh()
    if (refreshed) {
      headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`
      const retry = await fetch(`${BASE}${url}`, { ...options, headers })
      if (!retry.ok) throw new ApiError(retry.status, await retry.text())
      return retry.json()
    }
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    window.location.href = '/login'
    throw new ApiError(401, '未授权')
  }

  if (!res.ok) {
    const body = await res.text()
    throw new ApiError(res.status, body)
  }

  return res.json()
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return false
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json()
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    return true
  } catch {
    return false
  }
}

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API Error ${status}: ${body}`)
  }
}

// Auth
export function login(username: string, password: string) {
  return request<{ accessToken: string; refreshToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function register(username: string, email: string, password: string) {
  return request<{ accessToken: string; refreshToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  })
}

export function getMe() {
  return request<{ id: string; username: string; email: string; role: string }>('/users/me')
}

// Chat
export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  _count?: { messages: number }
}

export interface Message {
  id: string
  role: string
  content: string | null
  toolCalls: string | null
  toolResults: string | null
  model: string | null
  createdAt: string
}

export interface ConversationDetail extends Conversation {
  messages: Message[]
}

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
  return request(`/chat/conversations/${id}`, { method: 'DELETE' })
}

export function sendMessageSSE(
  conversationId: string,
  content: string,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
) {
  const token = localStorage.getItem('accessToken')
  return fetch(`${BASE}/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ content }),
    signal,
  }).then(async (res) => {
    if (!res.ok) throw new ApiError(res.status, await res.text())
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()! // keep incomplete line
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') return
          try {
            onEvent(JSON.parse(data))
          } catch { /* 跳过解析错误 */ }
        }
      }
    }
  })
}

export type SSEEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolName: string; input: unknown }
  | { type: 'tool-result'; toolName: string; output: unknown }
  | { type: 'finish' }
  | { type: 'error'; error: string }

// 插件 / 设备
export interface PluginInfo {
  id: string
  name: string
  deviceType: string
  status: string
  capabilities: { name: string; description: string; parameters: Record<string, unknown> }[]
  connected: boolean
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export function listPlugins() {
  return request<PluginInfo[]>('/plugins')
}

export function deletePlugin(name: string) {
  return request(`/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

// 自动化
export interface AutomationInfo {
  id: string
  name: string
  trigger: { type: string; cron?: string; event?: string }
  actions: { type: string; plugin?: string; capability?: string; params?: Record<string, unknown>; message?: string }[]
  enabled: boolean
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
  logs?: { id: string; status: string; result: string | null; createdAt: string }[]
}

export function listAutomations() {
  return request<AutomationInfo[]>('/automations')
}

export function createAutomation(data: {
  name: string
  trigger: { type: string; cron?: string }
  actions: { type: string; plugin?: string; capability?: string; params?: Record<string, unknown> }[]
}) {
  return request<AutomationInfo>('/automations', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function toggleAutomation(id: string) {
  return request<{ id: string; enabled: boolean }>(`/automations/${id}/toggle`, {
    method: 'PATCH',
  })
}

export function runAutomation(id: string) {
  return request<{ status: string; results: unknown[] }>(`/automations/${id}/run`, {
    method: 'POST',
  })
}

export function deleteAutomation(id: string) {
  return request(`/automations/${id}`, { method: 'DELETE' })
}

export function getAutomationLogs(id: string) {
  return request<{ id: string; status: string; result: string | null; createdAt: string }[]>(
    `/automations/${id}/logs`,
  )
}
