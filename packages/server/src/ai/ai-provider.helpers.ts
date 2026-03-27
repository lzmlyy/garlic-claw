import { createAnthropic } from '@ai-sdk/anthropic';
import { createCerebras } from '@ai-sdk/cerebras';
import { createCohere } from '@ai-sdk/cohere';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { createGateway } from '@ai-sdk/gateway';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { createVercel } from '@ai-sdk/vercel';
import { createXai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import { inferModelCapabilities } from './model-capability-inference';

import type {
  CompatibleProviderDriver,
  OfficialProviderDriver,
} from './official-provider-catalog';
import type { ModelConfig } from './types/provider.types';

/**
 * 模型工厂偏好。
 */
export type ProviderModelFactoryPreference = 'default' | 'chat';

/**
 * 已注册 provider 的运行时信息。
 */
export interface RuntimeProviderRegistration {
  /** provider ID。 */
  id: string;
  /** provider driver。 */
  driver: OfficialProviderDriver | CompatibleProviderDriver;
  /** provider 的语言模型创建函数。 */
  createModel: (modelId: string) => LanguageModel;
  /** 模型工厂偏好。 */
  modelFactoryPreference: ProviderModelFactoryPreference;
  /** provider 默认 base URL。 */
  baseUrl: string;
  /** SDK npm 包名。 */
  npm: string;
  /** provider 默认模型。 */
  defaultModel: string;
}

/**
 * provider SDK 工厂的输入。
 */
interface ProviderSdkOptions {
  /** API Key。 */
  apiKey: string;
  /** Base URL。 */
  baseURL?: string;
  /** provider 名称。 */
  name: string;
}

/**
 * 可调用 provider 工厂。
 */
interface CallableProviderFactory {
  /** 直接按模型 ID 创建模型。 */
  (modelId: string): LanguageModel;
}

/**
 * 带 `chat()` 工厂的 provider。
 */
interface ChatProviderFactory {
  /** 按聊天模型 ID 创建模型。 */
  chat: (modelId: string) => LanguageModel;
}

/**
 * provider 运行时注册输入。
 */
export interface RuntimeProviderInput {
  /** provider ID。 */
  id: string;
  /** provider driver。 */
  driver: OfficialProviderDriver | CompatibleProviderDriver;
  /** API key。 */
  apiKey: string;
  /** provider 基础地址。 */
  baseUrl: string;
  /** 模型工厂偏好。 */
  modelFactoryPreference: ProviderModelFactoryPreference;
  /** 默认模型。 */
  defaultModel: string;
  /** SDK 包名。 */
  npm: string;
}

/**
 * 官方 provider 对应的 SDK 工厂集合。
 */
const OFFICIAL_PROVIDER_FACTORIES: Record<
  OfficialProviderDriver,
  (options: ProviderSdkOptions) => CallableProviderFactory | ChatProviderFactory
> = {
  openai: (options) => createOpenAI(options),
  anthropic: (options) => createAnthropic(options),
  gemini: (options) => createGoogleGenerativeAI(options),
  groq: (options) => createGroq(options),
  xai: (options) => createXai(options),
  mistral: (options) => createMistral(options),
  cohere: (options) => createCohere(options),
  cerebras: (options) => createCerebras(options),
  deepinfra: (options) => createDeepInfra(options),
  togetherai: (options) => createTogetherAI(options),
  perplexity: (options) => createPerplexity(options),
  gateway: (options) => createGateway(options),
  vercel: (options) => createVercel(options),
  openrouter: (options) => createOpenRouter(options),
};

/**
 * 创建运行时 provider 注册信息。
 *
 * 输入:
 * - provider 注册输入
 *
 * 输出:
 * - 运行时可直接使用的 provider 注册对象
 *
 * 预期行为:
 * - 统一创建 SDK provider
 * - 兼容 chat/default 两种模型工厂调用方式
 */
export function buildRuntimeProviderRegistration(
  input: RuntimeProviderInput,
): RuntimeProviderRegistration {
  const factory = OFFICIAL_PROVIDER_FACTORIES[input.driver];
  const provider = factory({
    apiKey: input.apiKey,
    baseURL: input.baseUrl,
    name: input.id,
  });

  return {
    id: input.id,
    driver: input.driver,
    createModel: (modelId) =>
      callProviderModel(provider, modelId, input.modelFactoryPreference),
    modelFactoryPreference: input.modelFactoryPreference,
    baseUrl: input.baseUrl,
    npm: input.npm,
    defaultModel: input.defaultModel,
  };
}

/**
 * 根据 provider SDK 的调用形态创建模型。
 *
 * 输入:
 * - SDK provider 实例
 * - 模型 ID
 * - 工厂偏好
 *
 * 输出:
 * - 可直接交给 AI SDK 使用的语言模型
 *
 * 预期行为:
 * - OpenAI 兼容 chat 路径优先走 `.chat()`
 * - 其他 provider 在 callable/chat 两种形态间自动兼容
 */
export function callProviderModel(
  provider: CallableProviderFactory | ChatProviderFactory,
  modelId: string,
  preferredFactory: ProviderModelFactoryPreference,
): LanguageModel {
  const providerWithChat = provider as Partial<ChatProviderFactory>;
  if (preferredFactory === 'chat' && typeof providerWithChat.chat === 'function') {
    return providerWithChat.chat(modelId);
  }

  if (typeof provider === 'function') {
    return provider(modelId);
  }

  if (typeof providerWithChat.chat === 'function') {
    return providerWithChat.chat(modelId);
  }

  throw new Error(`Provider model factory for "${modelId}" is invalid`);
}

/**
 * 构建统一模型配置。
 *
 * 输入:
 * - 运行时 provider 注册信息
 * - 模型 ID
 *
 * 输出:
 * - 注册表使用的模型配置
 *
 * 预期行为:
 * - 未显式注册时仍能给聊天链路提供稳定模型配置
 * - 能力按模型 ID 推断
 */
export function buildRuntimeModelConfig(
  registration: RuntimeProviderRegistration,
  modelId: string,
): ModelConfig {
  return {
    id: modelId,
    providerId: registration.id,
    name: modelId,
    capabilities: inferModelCapabilities(modelId),
    api: {
      id: modelId,
      url: registration.baseUrl,
      npm: registration.npm,
    },
    status: 'active',
  };
}

/**
 * 获取兼容 provider 对应的 SDK 包名。
 *
 * 输入:
 * - 兼容驱动
 *
 * 输出:
 * - 对应 SDK 包名
 *
 * 预期行为:
 * - 只允许 openai / anthropic / gemini 三种兼容格式
 */
export function getCompatibleProviderNpm(driver: string): string {
  switch (driver) {
    case 'anthropic':
      return '@ai-sdk/anthropic';
    case 'gemini':
      return '@ai-sdk/google';
    case 'openai':
    default:
      return '@ai-sdk/openai';
  }
}
