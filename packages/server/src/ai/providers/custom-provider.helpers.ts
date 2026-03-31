import { getCompatibleProviderNpm } from '../ai-provider.helpers';
import type {
  CompatibleProviderFormat,
  DiscoveredModel,
  RegisterCustomProviderDto,
} from './custom-provider.types';
import { inferCustomProviderCapabilities } from './custom-provider-model.helpers';

/**
 * 兼容格式元数据。
 */
export interface FormatMetadata {
  /** SDK 包名。 */
  npm: string;
  /** 发现模型时使用的认证头构建器。 */
  buildHeaders: (apiKey: string) => Record<string, string>;
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
        npm: getCompatibleProviderNpm(format),
        buildHeaders: (apiKey: string) => ({
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        }),
      };
    case 'gemini':
      return {
        npm: getCompatibleProviderNpm(format),
        buildHeaders: (apiKey: string) => ({
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        }),
      };
    case 'openai':
    default:
      return {
        npm: getCompatibleProviderNpm(format),
        buildHeaders: (apiKey: string) => ({
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
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
