import {
  asChatBeforeModelPayload,
  PROVIDER_ROUTER_CONFIG_FIELDS,
  readCurrentProviderInfo,
  filterAllowedToolNames,
  parseCommaSeparatedNames,
  readLatestUserTextFromMessages,
  readProviderRouterConfig,
  resolveProviderRouterShortCircuitReply,
  sameToolNames,
  sanitizeOptionalText,
  textIncludesKeyword,
  toHostJsonValue,
} from '@garlic-claw/plugin-sdk';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

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
      name: '模型路由',
      version: '1.0.0',
      runtime: 'builtin',
      description: '按规则切换 provider/model、裁剪工具或直接短路回复的内建插件。',
      permissions: ['config:read', 'provider:read'],
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
          description: '按配置改写当前 provider/model、裁剪工具或直接短路回复',
        },
      ],
      config: {
        fields: PROVIDER_ROUTER_CONFIG_FIELDS,
      },
    },
    hooks: {
      /**
       * 在模型调用前按配置路由 provider/model。
       * @param payload Hook 输入负载
       * @param context 插件执行上下文
       * @returns `pass` / `mutate` / `short-circuit`
       */
      'chat:before-model': async (payload, context) => {
        const hookPayload = asChatBeforeModelPayload(payload);
        const config = readProviderRouterConfig(await context.host.getConfig());
        const currentProvider = readCurrentProviderInfo(
          await context.host.getCurrentProvider(),
        );
        const latestUserText = readLatestUserTextFromMessages(hookPayload.request.messages);

        if (textIncludesKeyword(latestUserText, config.shortCircuitKeyword)) {
          return toHostJsonValue({
            action: 'short-circuit',
            assistantContent: resolveProviderRouterShortCircuitReply(
              config.shortCircuitReply,
            ),
            providerId: currentProvider.providerId ?? hookPayload.request.providerId,
            modelId: currentProvider.modelId ?? hookPayload.request.modelId,
            reason: 'matched-short-circuit-keyword',
          });
        }

        const targetProviderId = sanitizeOptionalText(config.targetProviderId);
        const targetModelId = sanitizeOptionalText(config.targetModelId);
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
        const allowedToolNames = filterAllowedToolNames(
          parseCommaSeparatedNames(config.allowedToolNames),
          currentToolNames,
        );
        const shouldFilterTools = Array.isArray(allowedToolNames)
          && !sameToolNames(allowedToolNames, currentToolNames);

        if (!shouldRoute && !shouldFilterTools) {
          return toHostJsonValue({
            action: 'pass',
          });
        }

        return toHostJsonValue({
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
