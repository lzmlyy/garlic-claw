import type {
  CompatibleProviderDriver,
  OfficialProviderCatalogItem,
} from '@garlic-claw/shared';

/**
 * 官方 provider 目录
 *
 * 输入:
 * - core 协议族与供应商 preset 的静态元数据
 *
 * 输出:
 * - 后端管理 API 和运行时注册共用的 provider 目录
 *
 * 预期行为:
 * - 目录显式区分 core 协议族和供应商 preset
 * - 兼容 provider 只保留 openai / anthropic / gemini 三种请求格式
 */
export type {
  CompatibleProviderDriver,
  OfficialProviderCatalogItem,
  OfficialProviderDriver,
} from '@garlic-claw/shared';

/**
 * core 协议族目录。
 */
export const CORE_PROVIDER_CATALOG: OfficialProviderCatalogItem[] = [
  {
    id: 'openai',
    kind: 'core',
    name: 'OpenAI',
    npm: '@ai-sdk/openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'anthropic',
    kind: 'core',
    name: 'Anthropic',
    npm: '@ai-sdk/anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'gemini',
    kind: 'core',
    name: 'Google Gemini',
    npm: '@ai-sdk/google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-pro',
  },
];

/**
 * 供应商 preset 目录。
 */
export const PROVIDER_PRESET_CATALOG: OfficialProviderCatalogItem[] = [
  {
    id: 'groq',
    kind: 'preset',
    name: 'Groq',
    npm: '@ai-sdk/groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
  },
  {
    id: 'xai',
    kind: 'preset',
    name: 'xAI',
    npm: '@ai-sdk/xai',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2-1212',
  },
  {
    id: 'mistral',
    kind: 'preset',
    name: 'Mistral',
    npm: '@ai-sdk/mistral',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
  },
  {
    id: 'cohere',
    kind: 'preset',
    name: 'Cohere',
    npm: '@ai-sdk/cohere',
    defaultBaseUrl: 'https://api.cohere.ai/v1',
    defaultModel: 'command-r-plus',
  },
  {
    id: 'cerebras',
    kind: 'preset',
    name: 'Cerebras',
    npm: '@ai-sdk/cerebras',
    defaultBaseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama3.1-70b',
  },
  {
    id: 'deepinfra',
    kind: 'preset',
    name: 'DeepInfra',
    npm: '@ai-sdk/deepinfra',
    defaultBaseUrl: 'https://api.deepinfra.com/v1/openai',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
  },
  {
    id: 'togetherai',
    kind: 'preset',
    name: 'Together AI',
    npm: '@ai-sdk/togetherai',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
  {
    id: 'perplexity',
    kind: 'preset',
    name: 'Perplexity',
    npm: '@ai-sdk/perplexity',
    defaultBaseUrl: 'https://api.perplexity.ai',
    defaultModel: 'sonar-pro',
  },
  {
    id: 'gateway',
    kind: 'preset',
    name: 'Vercel AI Gateway',
    npm: '@ai-sdk/gateway',
    defaultBaseUrl: 'https://gateway.ai.vercel.com/v1',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'vercel',
    kind: 'preset',
    name: 'Vercel AI',
    npm: '@ai-sdk/vercel',
    defaultBaseUrl: 'https://api.vercel.ai',
    defaultModel: 'gpt-4o',
  },
  {
    id: 'openrouter',
    kind: 'preset',
    name: 'OpenRouter',
    npm: '@openrouter/ai-sdk-provider',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
  },
];

/**
 * 对外暴露的 provider 目录。
 */
export const OFFICIAL_PROVIDER_CATALOG: OfficialProviderCatalogItem[] = [
  ...CORE_PROVIDER_CATALOG,
  ...PROVIDER_PRESET_CATALOG,
];

/**
 * 允许的兼容 provider 驱动。
 */
export const COMPATIBLE_PROVIDER_DRIVERS: CompatibleProviderDriver[] = [
  'openai',
  'anthropic',
  'gemini',
];
const COMPATIBLE_PROVIDER_DRIVER_SET = new Set<string>(COMPATIBLE_PROVIDER_DRIVERS);

/**
 * 判断给定 driver 是否属于兼容 provider 驱动。
 */
export function isCompatibleProviderDriver(
  driver: string,
): driver is CompatibleProviderDriver {
  return COMPATIBLE_PROVIDER_DRIVER_SET.has(driver);
}

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
