import type {
  ActionConfig,
  TriggerConfig,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import { toJsonValue } from '../../common/utils/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';

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
      name: 'Automation Tools',
      version: '1.0.0',
      runtime: 'builtin',
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
        const triggerType = readTriggerType(params);
        const automation = await context.host.createAutomation({
          name: readRequiredString(params, 'name'),
           trigger: {
             type: triggerType,
              ...(triggerType === 'cron'
                ? {
                    cron: readRequiredString(params, 'cronInterval'),
                  }
                : triggerType === 'event'
                  ? {
                      event: readRequiredString(params, 'eventName'),
                    }
                  : {}),
            },
            actions: readAutomationActions(params),
          });

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
          trigger: automation.trigger as unknown as JsonValue,
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
        toJsonValue(await context.host.emitAutomationEvent(readRequiredString(params, 'event'))),

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
          readRequiredString(params, 'automationId'),
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
          readRequiredString(params, 'automationId'),
        );

        return result ?? { error: '未找到自动化或已禁用' };
      },
    },
  };
}

/**
 * 读取必填字符串参数。
 * @param params JSON 参数对象
 * @param key 字段名
 * @returns 对应字符串值
 */
function readRequiredString(params: JsonObject, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} 必填`);
  }

  return value;
}

/**
 * 读取可选字符串参数。
 * @param params JSON 参数对象
 * @param key 字段名
 * @returns 字符串值；缺失时返回 null
 */
function readOptionalString(params: JsonObject, key: string): string | null {
  const value = params[key];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${key} 必须是字符串`);
  }

  return value;
}

/**
 * 读取可选对象参数。
 * @param params JSON 参数对象
 * @param key 字段名
 * @returns 对应对象；缺失时返回 undefined
 */
function readOptionalObject(
  params: JsonObject,
  key: string,
): JsonObject | undefined {
  const value = params[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${key} 必须是对象`);
  }

  return value as JsonObject;
}

/**
 * 读取触发类型。
 * @param params JSON 参数对象
 * @returns 合法的自动化触发类型
 */
function readTriggerType(params: JsonObject): TriggerConfig['type'] {
  const triggerType = readRequiredString(params, 'triggerType');
  if (
    triggerType !== 'cron'
    && triggerType !== 'manual'
    && triggerType !== 'event'
  ) {
    throw new Error('triggerType 必须是 cron/manual/event');
  }

  return triggerType;
}

/**
 * 读取自动化动作列表。
 * @param params JSON 参数对象
 * @returns 已校验的动作数组
 */
function readAutomationActions(params: JsonObject): ActionConfig[] {
  const value = params.actions;
  if (!Array.isArray(value)) {
    throw new Error('actions 必须是数组');
  }

  return value.map((action, index) => readAutomationAction(action, index));
}

/**
 * 读取单条自动化动作。
 * @param value 原始动作值
 * @param index 当前动作索引
 * @returns 已校验的动作配置
 */
function readAutomationAction(
  value: JsonValue,
  index: number,
): ActionConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`actions[${index}] 必须是对象`);
  }

  const action = value as JsonObject;
  const type = readRequiredString(action, 'type') as ActionConfig['type'];
  if (type !== 'device_command' && type !== 'ai_message') {
    throw new Error(`actions[${index}].type 不合法`);
  }

  if (type === 'device_command') {
    return {
      type,
      plugin: readRequiredString(action, 'plugin'),
      capability: readRequiredString(action, 'capability'),
      params: readOptionalObject(action, 'params'),
    };
  }

  return {
    type,
    message: readOptionalString(action, 'message') ?? undefined,
  };
}
