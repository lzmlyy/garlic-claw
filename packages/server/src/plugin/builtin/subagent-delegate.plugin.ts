import {
  buildSubagentDelegateRunParams,
  buildSubagentDelegateTaskParams,
  createSubagentRunSummary,
  createSubagentTaskSummaryResult,
  readBooleanFlag,
  readSubagentDelegateConfig,
  readRequiredTextValue,
  SUBAGENT_DELEGATE_CONFIG_FIELDS,
  SUBAGENT_DELEGATE_MANIFEST_TOOLS,
} from '@garlic-claw/plugin-sdk';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

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
      tools: SUBAGENT_DELEGATE_MANIFEST_TOOLS,
      config: {
        fields: SUBAGENT_DELEGATE_CONFIG_FIELDS,
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
        const config = readSubagentDelegateConfig(await context.host.getConfig());
        const result = await context.host.runSubagent(buildSubagentDelegateRunParams({
          config,
          prompt,
        }));

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
        const config = readSubagentDelegateConfig(await context.host.getConfig());
        const shouldWriteBack = readBooleanFlag(
          params.writeBack,
          Boolean(context.callContext.conversationId),
        );
        const task = await context.host.startSubagentTask(buildSubagentDelegateTaskParams({
          config,
          prompt,
          shouldWriteBack,
          conversationId: context.callContext.conversationId,
        }));

        return createSubagentTaskSummaryResult(task);
      },
    },
  };
}
