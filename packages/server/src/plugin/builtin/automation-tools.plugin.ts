import {
  AUTOMATION_TOOLS_MANIFEST_TOOLS,
  createAutomationCreatedResult,
  createAutomationEventDispatchResult,
  createAutomationListResult,
  createAutomationRunResult,
  createAutomationToggleResult,
  readPluginCreateAutomationParams,
  readRequiredStringParam,
} from '@garlic-claw/plugin-sdk';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建自动化工具插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备自动化创建、事件触发、列表、切换与执行能力的内建插件定义
 *
 * 预期行为:
 * - 聊天链路通过统一插件运行时暴露自动化工具
 * - 内建插件继续只通过 Host API 调用宿主自动化服务
 */
export function createAutomationToolsPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.automation-tools',
      name: '自动化工具',
      version: '1.0.0',
      runtime: 'builtin',
      description: '提供自动化创建、事件触发、启停和执行能力的内建插件。',
      permissions: ['automation:read', 'automation:write'],
      tools: AUTOMATION_TOOLS_MANIFEST_TOOLS,
      hooks: [],
    },
    tools: {
      /**
       * 创建一条自动化规则。
       * @param params 工具输入参数
       * @param context 插件执行上下文
       * @returns 与现有聊天工具兼容的创建结果
       */
      create_automation: async (
        params: JsonObject,
        context,
      ): Promise<JsonValue> => {
        const automation = await context.host.createAutomation(
          readPluginCreateAutomationParams(params),
        );

        return createAutomationCreatedResult(automation);
      },

      /**
       * 列出当前用户的自动化规则。
       * @param _params 当前未使用的工具参数
       * @param context 插件执行上下文
       * @returns 兼容现有聊天工具的自动化摘要列表
       */
      list_automations: async (
        _params: JsonObject,
        context,
      ): Promise<JsonValue> => {
        const automations = await context.host.listAutomations();

        return createAutomationListResult(automations);
      },

      /**
       * 发出一个自动化事件。
       * @param params 工具输入参数
       * @param context 插件执行上下文
       * @returns 命中的自动化 ID 摘要
       */
      emit_automation_event: async (
        params: JsonObject,
        context,
      ): Promise<JsonValue> =>
        createAutomationEventDispatchResult(
          await context.host.emitAutomationEvent(readRequiredStringParam(params, 'event')),
        ),

      /**
       * 切换一条自动化规则的启用状态。
       * @param params 工具输入参数
       * @param context 插件执行上下文
       * @returns 切换结果；未命中时返回错误对象
       */
      toggle_automation: async (
        params: JsonObject,
        context,
      ): Promise<JsonValue> => {
        const result = await context.host.toggleAutomation(
          readRequiredStringParam(params, 'automationId'),
        );

        return createAutomationToggleResult(result);
      },

      /**
       * 立即执行一条自动化规则。
       * @param params 工具输入参数
       * @param context 插件执行上下文
       * @returns 执行结果；未命中时返回错误对象
       */
      run_automation: async (
        params: JsonObject,
        context,
      ): Promise<JsonValue> => {
        const result = await context.host.runAutomation(
          readRequiredStringParam(params, 'automationId'),
        );

        return createAutomationRunResult(result);
      },
    },
  };
}
