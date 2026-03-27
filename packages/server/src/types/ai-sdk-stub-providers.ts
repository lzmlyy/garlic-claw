import type { JsonValue } from '../common/types/json-value';
import type { LanguageModel } from './ai-sdk-stub-core';

/**
 * 通用 SDK 配置。
 */
export interface SdkConfig {
  /** API Key。 */
  apiKey?: string;
  /** 基础 URL。 */
  baseURL?: string;
  /** 自定义 fetch。 */
  fetch?: typeof fetch;
  /** 自定义请求头。 */
  headers?: Record<string, string>;
  /** 兼容 provider 标识。 */
  name?: string;
}

/**
 * 三家官方 SDK 实例最小契约。
 */
export interface SdkInstance {
  /** 直接调用返回模型。 */
  (modelId: string): LanguageModel;
  /** 聊天模型工厂。 */
  chat: (modelId: string) => LanguageModel;
}

/**
 * OpenAI 配置。
 */
export interface OpenAIConfig extends SdkConfig {}

/**
 * OpenAI SDK 实例。
 */
export interface OpenAIInstance extends SdkInstance {}

/**
 * Anthropic 配置。
 */
export interface AnthropicConfig extends SdkConfig {}

/**
 * Anthropic SDK 实例。
 */
export interface AnthropicInstance extends SdkInstance {}

/**
 * Google 配置。
 */
export interface GoogleConfig extends SdkConfig {}

/**
 * Google SDK 实例。
 */
export interface GoogleInstance extends SdkInstance {}

/**
 * Groq SDK 实例。
 */
export interface GroqInstance extends SdkInstance {}

/**
 * xAI SDK 实例。
 */
export interface XaiInstance extends SdkInstance {}

/**
 * Mistral SDK 实例。
 */
export interface MistralInstance extends SdkInstance {}

/**
 * Cohere SDK 实例。
 */
export interface CohereInstance extends SdkInstance {}

/**
 * Cerebras SDK 实例。
 */
export interface CerebrasInstance extends SdkInstance {}

/**
 * DeepInfra SDK 实例。
 */
export interface DeepInfraInstance extends SdkInstance {}

/**
 * Together AI SDK 实例。
 */
export interface TogetherAIInstance extends SdkInstance {}

/**
 * Perplexity SDK 实例。
 */
export interface PerplexityInstance extends SdkInstance {}

/**
 * Gateway SDK 实例。
 */
export interface GatewayInstance extends SdkInstance {}

/**
 * Vercel SDK 实例。
 */
export interface VercelInstance extends SdkInstance {}

/**
 * OpenRouter SDK 实例。
 */
export interface OpenRouterInstance extends SdkInstance {}

/**
 * 创建 OpenAI SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createOpenAI(_config: OpenAIConfig): OpenAIInstance {
  throw new Error('createOpenAI is a type-check stub only');
}

/**
 * 创建 Anthropic SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createAnthropic(_config: AnthropicConfig): AnthropicInstance {
  throw new Error('createAnthropic is a type-check stub only');
}

/**
 * 创建 Google Generative AI SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createGoogleGenerativeAI(
  _config: GoogleConfig,
): GoogleInstance {
  throw new Error('createGoogleGenerativeAI is a type-check stub only');
}

/**
 * 创建 Groq SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createGroq(_config: SdkConfig): GroqInstance {
  throw new Error('createGroq is a type-check stub only');
}

/**
 * 创建 xAI SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createXai(_config: SdkConfig): XaiInstance {
  throw new Error('createXai is a type-check stub only');
}

/**
 * 创建 Mistral SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createMistral(_config: SdkConfig): MistralInstance {
  throw new Error('createMistral is a type-check stub only');
}

/**
 * 创建 Cohere SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createCohere(_config: SdkConfig): CohereInstance {
  throw new Error('createCohere is a type-check stub only');
}

/**
 * 创建 Cerebras SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createCerebras(_config: SdkConfig): CerebrasInstance {
  throw new Error('createCerebras is a type-check stub only');
}

/**
 * 创建 DeepInfra SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createDeepInfra(_config: SdkConfig): DeepInfraInstance {
  throw new Error('createDeepInfra is a type-check stub only');
}

/**
 * 创建 Together AI SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createTogetherAI(_config: SdkConfig): TogetherAIInstance {
  throw new Error('createTogetherAI is a type-check stub only');
}

/**
 * 创建 Perplexity SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createPerplexity(_config: SdkConfig): PerplexityInstance {
  throw new Error('createPerplexity is a type-check stub only');
}

/**
 * 创建 Gateway SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createGateway(_config: SdkConfig): GatewayInstance {
  throw new Error('createGateway is a type-check stub only');
}

/**
 * 创建 Vercel SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createVercel(_config: SdkConfig): VercelInstance {
  throw new Error('createVercel is a type-check stub only');
}

/**
 * 创建 OpenRouter SDK 实例。
 * @param config SDK 配置
 * @returns 轻量 SDK 实例
 */
export function createOpenRouter(_config: SdkConfig): OpenRouterInstance {
  throw new Error('createOpenRouter is a type-check stub only');
}

/**
 * 给 provider 边界保留轻量 JsonValue 导出。
 */
export type ProviderJsonValue = JsonValue;
