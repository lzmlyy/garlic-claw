import type { PluginSubagentRunResult } from '@garlic-claw/shared';
import type { JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';

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
      name: 'Subagent Delegate',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: ['config:read', 'subagent:run'],
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
        const prompt = sanitizePrompt(params.prompt);
        const config = (await context.host.getConfig()) as SubagentDelegatePluginConfig;
        const result = await context.host.runSubagent({
          ...(sanitizeText(config.targetProviderId)
            ? { providerId: sanitizeText(config.targetProviderId) }
            : {}),
          ...(sanitizeText(config.targetModelId)
            ? { modelId: sanitizeText(config.targetModelId) }
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
          ...(parseAllowedToolNames(config.allowedToolNames)
            ? { toolNames: parseAllowedToolNames(config.allowedToolNames) as string[] }
            : {}),
          maxSteps: normalizeMaxSteps(config.maxSteps),
        });

        return toDelegateSummary(result);
      },
    },
  };
}

/**
 * 清洗工具输入中的提示词。
 * @param value 原始提示词
 * @returns 清洗后的提示词
 */
function sanitizePrompt(value: JsonValue): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('delegate_summary 的 prompt 必须是非空字符串');
  }

  return value.trim();
}

/**
 * 清洗配置文本。
 * @param value 原始文本
 * @returns 清洗后的文本
 */
function sanitizeText(value?: string): string {
  return (value ?? '').trim();
}

/**
 * 解析工具白名单配置。
 * @param rawAllowedToolNames 原始逗号分隔字符串
 * @returns 工具名数组；未配置时返回 undefined
 */
function parseAllowedToolNames(rawAllowedToolNames?: string): string[] | undefined {
  const normalized = sanitizeText(rawAllowedToolNames);
  if (!normalized) {
    return undefined;
  }

  const toolNames = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return toolNames.length > 0 ? toolNames : undefined;
}

/**
 * 归一化子代理最大步数。
 * @param value 原始配置值
 * @returns 正整数步数
 */
function normalizeMaxSteps(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 4;
  }

  return Math.max(1, Math.floor(value));
}

/**
 * 裁剪子代理返回结果，避免把冗余字段透给上层工具调用方。
 * @param result 原始子代理结果
 * @returns 简化后的执行摘要
 */
function toDelegateSummary(result: PluginSubagentRunResult) {
  return {
    providerId: result.providerId,
    modelId: result.modelId,
    text: result.text,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
    ...(result.finishReason !== undefined
      ? { finishReason: result.finishReason }
      : {}),
  };
}
