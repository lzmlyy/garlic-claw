import type { JsonValue } from '../../common/types/json-value';
import { toJsonValue } from '../../common/utils/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';
import { asChatBeforeModelPayload } from './builtin-plugin.transport';

/**
 * Provider Router 插件配置。
 */
interface ProviderRouterPluginConfig {
  /** 目标 provider ID。 */
  targetProviderId?: string;
  /** 目标 model ID。 */
  targetModelId?: string;
  /** 允许暴露给模型的工具名列表，逗号分隔。 */
  allowedToolNames?: string;
  /** 命中后直接短路回复的关键字。 */
  shortCircuitKeyword?: string;
  /** 短路时写回的 assistant 内容。 */
  shortCircuitReply?: string;
}

/**
 * 当前 provider 上下文摘要。
 */
interface CurrentProviderInfo {
  /** 当前 provider ID。 */
  providerId?: string;
  /** 当前 model ID。 */
  modelId?: string;
}

/**
 * 创建 provider 上下文路由插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `chat:before-model` Hook 的内建插件定义
 *
 * 预期行为:
 * - 只通过统一 Host API 读取 provider 上下文
 * - 按配置切换 provider/model
 * - 按配置裁剪可见工具
 * - 在命中规则时直接短路本轮模型调用
 */
export function createProviderRouterPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.provider-router',
      name: 'Provider Router',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: ['config:read', 'provider:read'],
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
          description: '按配置改写当前 provider/model、裁剪工具或直接短路回复',
        },
      ],
      config: {
        fields: [
          {
            key: 'targetProviderId',
            type: 'string',
            description: '命中路由时切换到的 provider ID',
          },
          {
            key: 'targetModelId',
            type: 'string',
            description: '命中路由时切换到的 model ID',
          },
          {
            key: 'allowedToolNames',
            type: 'string',
            description: '允许暴露给模型的工具名列表，使用英文逗号分隔',
          },
          {
            key: 'shortCircuitKeyword',
            type: 'string',
            description: '当最近一条用户消息包含该关键字时，直接返回 short-circuit',
          },
          {
            key: 'shortCircuitReply',
            type: 'string',
            description: 'short-circuit 时直接写回给 assistant 的文本',
            defaultValue: '本轮请求已由 provider-router 直接处理。',
          },
        ],
      },
    },
    hooks: {
      /**
       * 在模型调用前按配置路由 provider/model。
       * @param payload Hook 输入负载
       * @param context 插件执行上下文
       * @returns `pass` / `mutate` / `short-circuit`
       */
      'chat:before-model': async (payload: JsonValue, context) => {
        const hookPayload = asChatBeforeModelPayload(payload);
        const config = (await context.host.getConfig()) as ProviderRouterPluginConfig;
        const currentProvider = (await context.host.getCurrentProvider()) as CurrentProviderInfo;
        const latestUserText = findLatestUserText(hookPayload.request.messages);

        if (shouldShortCircuit(latestUserText, config.shortCircuitKeyword)) {
          return toJsonValue({
            action: 'short-circuit',
            assistantContent: sanitizeText(config.shortCircuitReply)
              || '本轮请求已由 provider-router 直接处理。',
            providerId: currentProvider.providerId ?? hookPayload.request.providerId,
            modelId: currentProvider.modelId ?? hookPayload.request.modelId,
            reason: 'matched-short-circuit-keyword',
          });
        }

        const targetProviderId = sanitizeText(config.targetProviderId);
        const targetModelId = sanitizeText(config.targetModelId);
        const shouldRoute = Boolean(
          targetProviderId
          && targetModelId
          && (
            targetProviderId !== hookPayload.request.providerId
            || targetModelId !== hookPayload.request.modelId
          ),
        );
        if (shouldRoute) {
          await context.host.getProviderModel(targetProviderId, targetModelId);
        }

        const currentToolNames = hookPayload.request.availableTools.map((tool) => tool.name);
        const allowedToolNames = parseAllowedToolNames(
          config.allowedToolNames,
          currentToolNames,
        );
        const shouldFilterTools = Array.isArray(allowedToolNames)
          && !sameToolNames(allowedToolNames, currentToolNames);

        if (!shouldRoute && !shouldFilterTools) {
          return toJsonValue({
            action: 'pass',
          });
        }

        return toJsonValue({
          action: 'mutate',
          ...(shouldRoute
            ? {
                providerId: targetProviderId,
                modelId: targetModelId,
              }
            : {}),
          ...(shouldFilterTools ? { toolNames: allowedToolNames } : {}),
        });
      },
    },
  };
}

/**
 * 提取最近一条用户纯文本内容。
 * @param messages 当前请求消息列表
 * @returns 最近一条用户消息的纯文本
 */
function findLatestUserText(
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | Array<{ type: string; text?: string }>;
  }>,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }

    if (typeof message.content === 'string') {
      return message.content.trim();
    }

    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    if (text) {
      return text;
    }
  }

  return '';
}

/**
 * 判断本轮是否应直接 short-circuit。
 * @param latestUserText 最近一条用户消息文本
 * @param keyword 配置中的关键字
 * @returns 是否短路
 */
function shouldShortCircuit(latestUserText: string, keyword?: string): boolean {
  const normalizedKeyword = sanitizeText(keyword);
  if (!normalizedKeyword) {
    return false;
  }

  return latestUserText.includes(normalizedKeyword);
}

/**
 * 解析工具白名单配置，并裁剪到当前真实可见工具集合。
 * @param rawAllowedToolNames 原始逗号分隔字符串
 * @param currentToolNames 当前请求可见工具名
 * @returns 工具白名单；未配置时返回 null
 */
function parseAllowedToolNames(
  rawAllowedToolNames: string | undefined,
  currentToolNames: string[],
): string[] | null {
  const normalized = sanitizeText(rawAllowedToolNames);
  if (!normalized) {
    return null;
  }

  const allowed = new Set(
    normalized
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

  return currentToolNames.filter((toolName) => allowed.has(toolName));
}

/**
 * 判断两组工具名是否完全一致。
 * @param left 左侧工具名列表
 * @param right 右侧工具名列表
 * @returns 是否一致
 */
function sameToolNames(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((toolName, index) => toolName === right[index]);
}

/**
 * 清洗配置输入中的文本。
 * @param value 原始文本
 * @returns 清洗后的文本
 */
function sanitizeText(value?: string): string {
  return (value ?? '').trim();
}
