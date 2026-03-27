import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';

/**
 * 创建通用内建工具插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 时间、系统信息、计算器三个基础工具的插件定义
 *
 * 预期行为:
 * - 取代原先硬编码在聊天工具集合里的通用内置工具
 * - 不依赖宿主 Host API 即可在本地直接执行
 */
export function createCoreToolsPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.core-tools',
      name: 'Core Tools',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: [],
      tools: [
        {
          name: 'getCurrentTime',
          description: '获取当前日期和时间',
          parameters: {},
        },
        {
          name: 'getSystemInfo',
          description: '获取服务器的基本系统信息',
          parameters: {},
        },
        {
          name: 'calculate',
          description: '执行数学计算',
          parameters: {
            expression: {
              type: 'string',
              description: '简单数学表达式，例如 2 + 3 * 4',
              required: true,
            },
          },
        },
      ],
      hooks: [],
    },
    tools: {
      /**
       * 读取当前时间。
       * @returns 当前 ISO 时间字符串
       */
      getCurrentTime: async (): Promise<JsonValue> => ({
        time: new Date().toISOString(),
      }),

      /**
       * 读取当前进程的系统信息。
       * @returns 平台、版本、运行时与内存摘要
       */
      getSystemInfo: async (): Promise<JsonValue> => ({
        platform: process.platform,
        nodeVersion: process.version,
        uptime: Math.floor(process.uptime()),
        memoryUsage: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
      }),

      /**
       * 计算简单数学表达式。
       * @param params 包含 expression 的 JSON 参数
       * @returns 计算结果或错误信息
       */
      calculate: async (params: JsonObject): Promise<JsonValue> => {
        const expression = readRequiredString(params, 'expression');
        if (!/^[\d\s+\-*/().]+$/.test(expression)) {
          return {
            error: '无效的表达式。只允许数字和 +, -, *, /, (, )。',
          };
        }

        try {
          const fn = new Function(`"use strict"; return (${expression});`);
          const result = fn();
          return {
            expression,
            result: Number(result),
          };
        } catch {
          return {
            error: '表达式计算失败',
          };
        }
      },
    },
  };
}

/**
 * 读取必填字符串字段。
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
