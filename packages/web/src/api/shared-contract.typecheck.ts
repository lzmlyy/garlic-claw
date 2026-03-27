import type {
  ActionConfig,
  AiModelCapabilities,
  AiModelConfig,
  AiProviderConfig,
  AiProviderConnectionTestResult,
  AiProviderSummary,
  AutomationInfo,
  ChatMessagePart,
  ChatMessageStatus,
  Conversation,
  ConversationDetail,
  DiscoveredAiModel,
  Message,
  OfficialProviderCatalogItem,
  PluginInfo,
  RetryMessagePayload,
  SendMessagePayload,
  SSEEvent,
  TriggerConfig,
  UpdateMessagePayload,
  VisionFallbackConfig,
} from '@garlic-claw/shared'

/**
 * 共享契约编译期检查。
 *
 * 输入:
 * - `@garlic-claw/shared` 暴露的公共类型
 *
 * 输出:
 * - 一组最小示例值，强制 `web` 依赖共享类型而不是本地重复声明
 *
 * 预期行为:
 * - shared 未导出这些契约时，`vue-tsc` 必须先报错
 * - 迁移完成后，该文件持续充当公共导出回归保护
 */

const chatPart: ChatMessagePart = { type: 'text', text: 'hello' }
const chatStatus: ChatMessageStatus = 'completed'

const modelCapabilities: AiModelCapabilities = {
  reasoning: true,
  toolCall: true,
  input: { text: true, image: true },
  output: { text: true, image: false },
}

const providerSummary: AiProviderSummary = {
  id: 'openai',
  name: 'OpenAI',
  mode: 'official',
  driver: 'openai',
  defaultModel: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
  modelCount: 1,
  available: true,
}

const providerConfig: AiProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  mode: 'official',
  driver: 'openai',
  defaultModel: 'gpt-4o-mini',
  models: ['gpt-4o-mini'],
}

const modelConfig: AiModelConfig = {
  id: 'gpt-4o-mini',
  providerId: 'openai',
  name: 'GPT-4o mini',
  capabilities: modelCapabilities,
  api: {
    id: 'gpt-4o-mini',
    url: 'https://api.openai.com/v1',
    npm: '@ai-sdk/openai',
  },
  status: 'active',
}

const visionConfig: VisionFallbackConfig = {
  enabled: true,
  providerId: 'nvidia',
  modelId: 'qwen/qwen3.5-122b-a10b',
  prompt: '请描述图片',
  maxDescriptionLength: 0,
}

const discoveredModel: DiscoveredAiModel = {
  id: 'gpt-4o-mini',
  name: 'GPT-4o mini',
}

const connectionResult: AiProviderConnectionTestResult = {
  ok: true,
  providerId: 'openai',
  modelId: 'gpt-4o-mini',
  text: 'ok',
}

const pluginInfo: PluginInfo = {
  id: 'plugin-1',
  name: 'plugin-pc',
  deviceType: 'pc',
  status: 'online',
  capabilities: [
    {
      name: 'echo',
      description: 'echo text',
      parameters: {},
    },
  ],
  connected: true,
  lastSeenAt: '2026-03-26T00:00:00.000Z',
  createdAt: '2026-03-26T00:00:00.000Z',
  updatedAt: '2026-03-26T00:00:00.000Z',
}

const catalogItem: OfficialProviderCatalogItem = {
  id: 'openai',
  name: 'OpenAI',
  npm: '@ai-sdk/openai',
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
}

const message: Message = {
  id: 'message-1',
  role: 'assistant',
  content: 'hello',
  partsJson: null,
  toolCalls: null,
  toolResults: null,
  provider: 'openai',
  model: 'gpt-4o-mini',
  status: chatStatus,
  error: null,
  createdAt: '2026-03-26T00:00:00.000Z',
  updatedAt: '2026-03-26T00:00:00.000Z',
}

const conversation: Conversation = {
  id: 'conversation-1',
  title: 'test',
  createdAt: '2026-03-26T00:00:00.000Z',
  updatedAt: '2026-03-26T00:00:00.000Z',
  _count: { messages: 1 },
}

const conversationDetail: ConversationDetail = {
  ...conversation,
  messages: [message],
}

const sendPayload: SendMessagePayload = {
  content: 'hello',
  parts: [chatPart],
  provider: 'openai',
  model: 'gpt-4o-mini',
}

const updatePayload: UpdateMessagePayload = {
  content: 'updated',
  parts: [chatPart],
}

const retryPayload: RetryMessagePayload = {
  provider: 'openai',
  model: 'gpt-4o-mini',
}

const sseEvent: SSEEvent = {
  type: 'message-start',
  userMessage: message,
  assistantMessage: message,
}

const trigger: TriggerConfig = {
  type: 'manual',
}

const action: ActionConfig = {
  type: 'ai_message',
  message: 'hello',
}

const automation: AutomationInfo = {
  id: 'automation-1',
  name: 'test',
  trigger,
  actions: [action],
  enabled: true,
  lastRunAt: null,
  createdAt: '2026-03-26T00:00:00.000Z',
  updatedAt: '2026-03-26T00:00:00.000Z',
  logs: [{ id: 'log-1', status: 'success', result: null, createdAt: '2026-03-26T00:00:00.000Z' }],
}

void [
  providerSummary,
  providerConfig,
  modelConfig,
  visionConfig,
  discoveredModel,
  connectionResult,
  catalogItem,
  pluginInfo,
  conversationDetail,
  sendPayload,
  updatePayload,
  retryPayload,
  sseEvent,
  automation,
]

export {}
