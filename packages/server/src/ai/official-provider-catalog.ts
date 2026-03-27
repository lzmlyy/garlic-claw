import type {
  CompatibleProviderDriver,
  OfficialProviderCatalogItem,
} from '@garlic-claw/shared';

/**
 * 官方 provider 目录
 *
 * 输入:
 * - 官方 provider 的静态元数据
 *
 * 输出:
 * - 后端管理 API 和运行时注册共用的 provider 目录
 *
 * 预期行为:
 * - 官方 provider 可以有很多
 * - 兼容 provider 只保留 openai / anthropic / gemini 三种请求格式
 */
export type {
  CompatibleProviderDriver,
  OfficialProviderCatalogItem,
  OfficialProviderDriver,
} from '@garlic-claw/shared';

/**
 * 官方 provider 目录。
 */
export const OFFICIAL_PROVIDER_CATALOG: OfficialProviderCatalogItem[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    npm: '@ai-sdk/openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    npm: '@ai-sdk/anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    npm: '@ai-sdk/google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-pro',
  },
  {
    id: 'groq',
    name: 'Groq',
    npm: '@ai-sdk/groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'xai',
    name: 'xAI',
    npm: '@ai-sdk/xai',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2-1212',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    npm: '@ai-sdk/mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    npm: '@ai-sdk/cohere',
    defaultBaseUrl: 'https://api.cohere.ai/v1',
    defaultModel: 'command-r-plus',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    npm: '@ai-sdk/cerebras',
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama3.1-70b',
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    npm: '@ai-sdk/deepinfra',
    defaultBaseUrl: 'https://api.deepinfra.com/v1/openai',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
  },
  {
    id: 'togetherai',
    name: 'Together AI',
    npm: '@ai-sdk/togetherai',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    npm: '@ai-sdk/perplexity',
    defaultBaseUrl: 'https://api.perplexity.ai',
    defaultModel: 'sonar-pro',
  },
  {
    id: 'gateway',
    name: 'Vercel AI Gateway',
    npm: '@ai-sdk/gateway',
    defaultBaseUrl: 'https://gateway.ai.vercel.com/v1',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'vercel',
    name: 'Vercel AI',
    npm: '@ai-sdk/vercel',
    defaultBaseUrl: 'https://api.vercel.ai',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    npm: '@openrouter/ai-sdk-provider',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
  },
];

/**
 * 允许的兼容 provider 驱动。
 */
export const COMPATIBLE_PROVIDER_DRIVERS: CompatibleProviderDriver[] = [
  'openai',
  'anthropic',
  'gemini',
];

/**
 * 查找官方 provider 元数据。
 * @param driver 官方 provider ID
 * @returns 对应元数据，未找到时返回 null
 */
export function getOfficialProviderCatalogItem(
  driver: string,
): OfficialProviderCatalogItem | null {
  return OFFICIAL_PROVIDER_CATALOG.find((item) => item.id === driver) ?? null;
}
