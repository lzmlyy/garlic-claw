import { createRequire } from 'node:module';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import type { ProviderOptions } from '../types';
import type {
  CompatibleProviderFormat,
  DiscoveredModel,
  RegisterCustomProviderDto,
} from './custom-provider.types';
import { inferCustomProviderCapabilities } from './custom-provider-model.helpers';

/**
 * 兼容 provider 实例最小形状。
 */
interface CompatibleProviderInstance {
  /** 创建聊天模型。 */
  chat: (modelId: string) => LanguageModel;
}

type CompatibleProviderFactory = (options: {
  apiKey: string;
  baseURL?: string;
  name: string;
}) => CompatibleProviderInstance;

/**
 * 兼容格式元数据。
 */
export interface FormatMetadata {
  /** SDK 包名。 */
  npm: string;
  /** 发现模型时使用的认证头构建器。 */
  buildHeaders: (apiKey: string) => Record<string, string>;
  /** 创建 SDK provider 实例。 */
  createInstance: (
    dto: RegisterCustomProviderDto,
    options: ProviderOptions,
    resolveApiKey: (dto: RegisterCustomProviderDto) => string,
  ) => CompatibleProviderInstance;
}

const createGeminiProvider = createLazyCompatibleProviderFactory(
  '@ai-sdk/google',
  'createGoogleGenerativeAI',
);
const localRequire = createRequire(__filename);

function createLazyCompatibleProviderFactory(
  moduleName: string,
  exportName: string,
): CompatibleProviderFactory {
  return (options) => {
    const loadedModule = loadOptionalModule(moduleName);
    const factory = loadedModule[exportName];
    if (typeof factory !== 'function') {
      throw new Error(
        `兼容 Provider SDK "${moduleName}" 没有导出 "${exportName}"，无法创建 provider。`,
      );
    }

    return (factory as CompatibleProviderFactory)(options);
  };
}

function loadOptionalModule(moduleName: string): Record<string, unknown> {
  try {
    return localRequire(moduleName) as Record<string, unknown>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `缺少兼容 Provider SDK "${moduleName}"。如需启用对应格式，请先安装该依赖。原始错误: ${detail}`,
      {
        cause: error,
      },
    );
  }
}

/**
 * 获取兼容格式元数据。
 *
 * 输入:
 * - 兼容请求格式
 *
 * 输出:
 * - 对应的 SDK 元数据
 *
 * 预期行为:
 * - openai / anthropic / gemini 三种格式统一从这里解析
 * - service 层只做编排，不再维护大段 switch
 */
export function getCompatibleProviderFormatMetadata(
  format: CompatibleProviderFormat,
): FormatMetadata {
  switch (format) {
    case 'anthropic':
      return {
        npm: '@ai-sdk/anthropic',
        buildHeaders: (apiKey: string) => ({
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        }),
        createInstance: (dto, options, resolveApiKey) =>
          createAnthropic({
            apiKey: String(options.apiKey ?? resolveApiKey(dto)),
            baseURL: dto.baseUrl,
            name: dto.id,
          }),
      };
    case 'gemini':
      return {
        npm: '@ai-sdk/google',
        buildHeaders: (apiKey: string) => ({
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        }),
        createInstance: (dto, options, resolveApiKey) =>
          createGeminiProvider({
            apiKey: String(options.apiKey ?? resolveApiKey(dto)),
            baseURL: dto.baseUrl,
            name: dto.id,
          }),
      };
    case 'openai':
    default:
      return {
        npm: '@ai-sdk/openai',
        buildHeaders: (apiKey: string) => ({
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        }),
        createInstance: (dto, options, resolveApiKey) =>
          createOpenAI({
            apiKey: String(options.apiKey ?? resolveApiKey(dto)),
            baseURL: dto.baseUrl,
            name: dto.id,
          }),
      };
  }
}

/**
 * 发现兼容 provider 的模型列表。
 *
 * 输入:
 * - 注册请求
 * - 兼容格式
 * - API key 解析函数
 * - 调试日志回调
 *
 * 输出:
 * - 发现到的模型列表
 *
 * 预期行为:
 * - 优先请求远端 `/models`
 * - 失败时回退到默认模型
 */
export async function discoverCompatibleModels(input: {
  dto: RegisterCustomProviderDto;
  format: CompatibleProviderFormat;
  resolveApiKey: (dto: RegisterCustomProviderDto) => string;
  logDebug: (message: string) => void;
}): Promise<DiscoveredModel[]> {
  const { dto, format, resolveApiKey, logDebug } = input;
  const discovered: DiscoveredModel[] = [];
  const apiKey = resolveApiKey(dto);
  const metadata = getCompatibleProviderFormatMetadata(format);

  try {
    const response = await fetch(`${dto.baseUrl}/models`, {
      method: 'GET',
      headers: metadata.buildHeaders(apiKey),
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        data?: Array<{ id: string; name?: string }>;
      };

      for (const item of payload.data ?? []) {
        discovered.push({
          id: item.id,
          name: item.name ?? item.id,
          capabilities: inferCustomProviderCapabilities(item.id, dto.models),
        });
      }
    }
  } catch (error) {
    logDebug(`模型发现失败，将回退到默认模型: ${String(error)}`);
  }

  if (discovered.length === 0 && dto.defaultModel) {
    discovered.push({
      id: dto.defaultModel,
      name: dto.defaultModel,
      capabilities: inferCustomProviderCapabilities(dto.defaultModel, dto.models),
    });
  }

  return discovered;
}
