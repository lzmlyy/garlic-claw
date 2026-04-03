import {
  readPluginCreateAutomationParams,
  readRequiredStringParam,
} from '@garlic-claw/plugin-sdk';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import { toJsonValue } from '../../common/utils/json-value';
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
      tools: [
        {
          name: 'create_automation',
          description:
            '创建自动化规则。支持 cron 计划（例如 "5m"、"1h"、"30s"）和设备命令。当用户要求设置重复任务或自动化操作时使用此工具。',
          parameters: {
            name: {
              type: 'string',
              description: '此自动化的描述性名称',
              required: true,
            },
            triggerType: {
              type: 'string',
              description: '触发类型：cron 为计划执行，manual 为手动触发，event 为事件触发',
              required: true,
            },
            cronInterval: {
              type: 'string',
              description: '对于 cron 触发：间隔如 "5m"、"1h"、"30s"',
            },
            eventName: {
              type: 'string',
              description: '对于 event 触发：要监听的事件名',
            },
            actions: {
              type: 'array',
              description: '要执行的动作列表',
              required: true,
            },
          },
        },
        {
          name: 'emit_automation_event',
          description: '发出一个自动化事件，触发当前用户下匹配该事件名的自动化。',
          parameters: {
            event: {
              type: 'string',
              description: '要发出的事件名',
              required: true,
            },
          },
        },
        {
          name: 'list_automations',
          description: '列出当前用户的所有自动化。',
          parameters: {},
        },
        {
          name: 'toggle_automation',
          description: '通过 ID 启用或禁用自动化。',
          parameters: {
            automationId: {
              type: 'string',
              description: '要切换的自动化 ID',
              required: true,
            },
          },
        },
        {
          name: 'run_automation',
          description: '手动触发自动化立即执行。',
          parameters: {
            automationId: {
              type: 'string',
              description: '要运行的自动化 ID',
              required: true,
            },
          },
        },
      ],
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

        return {
          created: true,
          id: automation.id,
          name: automation.name,
        };
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

        return automations.map((automation) => ({
          id: automation.id,
          name: automation.name,
          trigger: toJsonValue(automation.trigger),
          enabled: automation.enabled,
          lastRunAt: automation.lastRunAt,
        }));
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
        toJsonValue(await context.host.emitAutomationEvent(readRequiredStringParam(params, 'event'))),

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

        return result ?? { error: '未找到自动化' };
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

        return result ?? { error: '未找到自动化或已禁用' };
      },
    },
  };
}
