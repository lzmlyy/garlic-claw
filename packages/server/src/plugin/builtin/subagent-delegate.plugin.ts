import {
  createSubagentRunSummary,
  normalizePositiveInteger,
  parseCommaSeparatedNames,
  readBooleanFlag,
  readRequiredTextValue,
  sanitizeOptionalText,
} from '@garlic-claw/plugin-sdk';
import { toJsonValue } from '../../common/utils/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 子代理委托插件配置。
 */
interface SubagentDelegatePluginConfig {
  /** 目标 provider ID。 */
  targetProviderId?: string;
  /** 目标 model ID。 */
  targetModelId?: string;
  /** 允许子代理使用的工具名列表，逗号分隔。 */
  allowedToolNames?: string;
  /** 子代理最大工具调用步数。 */
  maxSteps?: number;
}

/**
 * 创建子代理委托插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `delegate_summary` 工具的内建插件定义
 *
 * 预期行为:
 * - 只通过统一 Host API 发起一次受控的宿主侧子代理调用
 * - 允许通过配置指定 provider/model/工具白名单
 * - 返回子代理执行摘要，而不是暴露宿主内部对象
 */
export function createSubagentDelegatePlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.subagent-delegate',
      name: '子代理委派',
      version: '1.0.0',
      runtime: 'builtin',
      description: '将当前任务委派给宿主子代理执行的内建插件。',
      permissions: ['config:read', 'conversation:write', 'subagent:run'],
      tools: [
        {
          name: 'delegate_summary',
          description: '将当前任务委托给宿主子代理做简短总结',
          parameters: {
            prompt: {
              type: 'string',
              description: '要交给子代理处理的提示词',
              required: true,
            },
          },
        },
        {
          name: 'delegate_summary_background',
          description: '将当前任务委托给宿主子代理后台执行，并可在完成后回写当前会话',
          parameters: {
            prompt: {
              type: 'string',
              description: '要交给后台子代理处理的提示词',
              required: true,
            },
            writeBack: {
              type: 'boolean',
              description: '完成后是否回写到当前会话；默认在存在会话上下文时开启',
            },
          },
        },
      ],
      config: {
        fields: [
          {
            key: 'targetProviderId',
            type: 'string',
            description: '子代理默认使用的 provider ID',
          },
          {
            key: 'targetModelId',
            type: 'string',
            description: '子代理默认使用的 model ID',
          },
          {
            key: 'allowedToolNames',
            type: 'string',
            description: '允许子代理使用的工具名列表，使用英文逗号分隔',
          },
          {
            key: 'maxSteps',
            type: 'number',
            description: '子代理最多允许多少轮工具调用',
            defaultValue: 4,
          },
        ],
      },
    },
    tools: {
      /**
       * 发起一次受控的宿主侧子代理总结。
       * @param params 工具参数
       * @param context 插件执行上下文
       * @returns 子代理执行摘要
       */
      delegate_summary: async (params, context) => {
        const prompt = readRequiredTextValue(params.prompt, 'delegate_summary 的 prompt');
        const config = (await context.host.getConfig()) as SubagentDelegatePluginConfig;
        const result = await context.host.runSubagent({
          ...(sanitizeOptionalText(config.targetProviderId)
            ? { providerId: sanitizeOptionalText(config.targetProviderId) }
            : {}),
          ...(sanitizeOptionalText(config.targetModelId)
            ? { modelId: sanitizeOptionalText(config.targetModelId) }
            : {}),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
          ...(parseCommaSeparatedNames(config.allowedToolNames)
            ? { toolNames: parseCommaSeparatedNames(config.allowedToolNames) as string[] }
            : {}),
          maxSteps: normalizePositiveInteger(config.maxSteps, 4),
        });

        return createSubagentRunSummary(result);
      },
      /**
       * 发起一次受控的宿主侧后台子代理总结。
       * @param params 工具参数
       * @param context 插件执行上下文
       * @returns 已排队的后台任务摘要
       */
      delegate_summary_background: async (params, context) => {
        const prompt = readRequiredTextValue(params.prompt, 'delegate_summary 的 prompt');
        const config = (await context.host.getConfig()) as SubagentDelegatePluginConfig;
        const shouldWriteBack = readBooleanFlag(
          params.writeBack,
          Boolean(context.callContext.conversationId),
        );
        const task = await context.host.startSubagentTask({
          ...(sanitizeOptionalText(config.targetProviderId)
            ? { providerId: sanitizeOptionalText(config.targetProviderId) }
            : {}),
          ...(sanitizeOptionalText(config.targetModelId)
            ? { modelId: sanitizeOptionalText(config.targetModelId) }
            : {}),
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
          ...(parseCommaSeparatedNames(config.allowedToolNames)
            ? { toolNames: parseCommaSeparatedNames(config.allowedToolNames) as string[] }
            : {}),
          maxSteps: normalizePositiveInteger(config.maxSteps, 4),
          ...(shouldWriteBack && context.callContext.conversationId
            ? {
                writeBack: {
                  target: {
                    type: 'conversation' as const,
                    id: context.callContext.conversationId,
                  },
                },
              }
            : {}),
        });

        return toJsonValue(task);
      },
    },
  };
}
