import type {
  ChatMessagePart,
  JsonValue,
  Message,
  SendMessagePayload,
} from '@garlic-claw/shared'
import * as api from '../api'
import type { ChatMessage, ChatSendInput } from './chat-store.types'

/**
 * 前端聊天页需要的 provider 摘要。
 */
interface ConversationProviderSummary {
  id: string
  available: boolean
  defaultModel?: string
}

/**
 * 反序列化已持久化的消息 parts。
 * @param value 服务端返回的 JSON 字符串
 * @returns 结构化 parts
 */
export function parseParts(value: string | null): ChatMessagePart[] | undefined {
  if (!value) {
    return undefined
  }

  return JSON.parse(value) as ChatMessagePart[]
}

/**
 * 将任意 JSON 载荷序列化为展示字符串。
 * @param value 工具输入或输出
 * @returns 适合 UI 展示的字符串
 */
export function stringifyPayload(value: JsonValue): string {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value)
}

/**
 * 反序列化工具调用列表。
 * @param value 服务端返回的 JSON 字符串
 * @returns UI 可展示的工具调用
 */
export function parseToolCalls(value: string | null): ChatMessage['toolCalls'] {
  if (!value) {
    return undefined
  }

  return (JSON.parse(value) as Array<{ toolName: string; input: JsonValue }>).map((item) => ({
    toolName: item.toolName,
    input: stringifyPayload(item.input),
  }))
}

/**
 * 反序列化工具结果列表。
 * @param value 服务端返回的 JSON 字符串
 * @returns UI 可展示的工具结果
 */
export function parseToolResults(value: string | null): ChatMessage['toolResults'] {
  if (!value) {
    return undefined
  }

  return (JSON.parse(value) as Array<{ toolName: string; output: JsonValue }>).map((item) => ({
    toolName: item.toolName,
    output: stringifyPayload(item.output),
  }))
}

/**
 * 将数据库消息映射为前端消息。
 * @param message 服务端消息
 * @returns 前端可消费的消息
 */
export function dbMessageToChat(message: Message): ChatMessage {
  return {
    id: message.id,
    role: message.role as ChatMessage['role'],
    content: message.content || '',
    parts: parseParts(message.partsJson),
    toolCalls: parseToolCalls(message.toolCalls),
    toolResults: parseToolResults(message.toolResults),
    provider: message.provider,
    model: message.model,
    status: message.status,
    error: message.error,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }
}

/**
 * 规范化聊天输入。
 * @param input 原始输入
 * @returns 可直接发送给后端的载荷
 */
export function normalizeSendInput(input: ChatSendInput): SendMessagePayload {
  const trimmedContent = input.content?.trim()
  const normalizedParts = input.parts?.filter((part) =>
    part.type === 'text' ? part.text.trim().length > 0 : Boolean(part.image),
  )

  if (normalizedParts && normalizedParts.length > 0) {
    return {
      content: trimmedContent,
      parts: normalizedParts,
      provider: input.provider ?? undefined,
      model: input.model ?? undefined,
    }
  }

  return {
    content: trimmedContent,
    provider: input.provider ?? undefined,
    model: input.model ?? undefined,
  }
}

/**
 * 读取当前对话最近一次 assistant 使用的 provider/model。
 * @param messages 已加载的对话消息
 * @returns 最近一次 assistant 的 provider/model
 */
export function findLatestAssistantSelection(messages: ChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && message.model) {
      return {
        providerId: message.provider ?? null,
        modelId: message.model,
      }
    }
  }

  return {
    providerId: null,
    modelId: null,
  }
}

/**
 * 找出当前对话中仍在生成的 assistant 消息。
 * @param messages 对话消息列表
 * @returns 活跃消息 ID；不存在时返回 null
 */
export function findActiveAssistantMessageId(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (
      message.role === 'assistant' &&
      (message.status === 'pending' || message.status === 'streaming')
    ) {
      return message.id ?? null
    }
  }

  return null
}

/**
 * 解析聊天页应显示的 provider/model 选择。
 * @param preferred 优先命中的 provider/model
 * @returns 当前聊天应使用的 provider/model；找不到时返回 null
 */
export async function resolveChatModelSelection(preferred: {
  providerId?: string | null
  modelId?: string | null
}): Promise<{ providerId: string; modelId: string } | null> {
  const providers = (await api.listAiProviders()).filter((provider) => provider.available)

  if (preferred.providerId && preferred.modelId) {
    const direct = providers.find((provider) => provider.id === preferred.providerId)
    if (direct) {
      const models = await api.listAiModels(direct.id)
      if (models.some((model) => model.id === preferred.modelId)) {
        return {
          providerId: preferred.providerId,
          modelId: preferred.modelId,
        }
      }
    }
  }

  if (preferred.modelId) {
    const matchedProviders = await findProvidersByModelId(providers, preferred.modelId)
    if (matchedProviders.length === 1) {
      return {
        providerId: matchedProviders[0].id,
        modelId: preferred.modelId,
      }
    }
  }

  for (const provider of providers) {
    if (provider.defaultModel) {
      return {
        providerId: provider.id,
        modelId: provider.defaultModel,
      }
    }

    const models = await api.listAiModels(provider.id)
    if (models[0]) {
      return {
        providerId: provider.id,
        modelId: models[0].id,
      }
    }
  }

  return null
}

/**
 * 在所有可用 provider 中查找包含指定模型 ID 的候选 provider。
 * @param providers 可用 provider 摘要列表
 * @param modelId 目标模型 ID
 * @returns 命中的 provider 列表
 */
async function findProvidersByModelId(
  providers: ConversationProviderSummary[],
  modelId: string,
): Promise<ConversationProviderSummary[]> {
  const results = await Promise.all(
    providers.map(async (provider) => {
      if (provider.defaultModel === modelId) {
        return provider
      }

      const models = await api.listAiModels(provider.id)
      return models.some((model) => model.id === modelId) ? provider : null
    }),
  )

  return results.filter(
    (provider): provider is ConversationProviderSummary => provider !== null,
  )
}
