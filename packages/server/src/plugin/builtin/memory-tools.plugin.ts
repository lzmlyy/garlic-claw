import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';

/**
 * 创建记忆工具插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `save_memory` / `recall_memory` 的内建插件定义
 *
 * 预期行为:
 * - 通过统一 Host API 调用记忆服务
 * - 维持当前聊天工具对外暴露的行为与返回结构
 */
export function createMemoryToolsPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.memory-tools',
      name: '记忆工具',
      version: '1.0.0',
      runtime: 'builtin',
      description: '提供长期记忆写入与检索能力的内建插件。',
      permissions: ['memory:read', 'memory:write'],
      tools: [
        {
          name: 'save_memory',
          description: '将重要信息保存到长期记忆中',
          parameters: {
            content: {
              type: 'string',
              description: '要记住的信息',
              required: true,
            },
            category: {
              type: 'string',
              description: '记忆类别',
            },
            keywords: {
              type: 'string',
              description: '逗号分隔的关键词',
            },
          },
        },
        {
          name: 'recall_memory',
          description: '搜索用户长期记忆',
          parameters: {
            query: {
              type: 'string',
              description: '搜索查询',
              required: true,
            },
          },
        },
      ],
      hooks: [],
    },
    tools: {
      /**
       * 保存一条长期记忆。
       * @param params 保存参数
       * @param context 插件执行上下文
       * @returns 兼容当前工具返回值的保存结果
       */
      save_memory: async (
        params: JsonObject,
        context,
      ): Promise<JsonValue> => {
        const saved = await context.host.saveMemory({
          content: readRequiredString(params, 'content'),
          category: readOptionalString(params, 'category') ?? undefined,
          keywords: readOptionalString(params, 'keywords') ?? undefined,
        });

        return {
          saved: true,
          id: readSavedMemoryId(saved),
        };
      },

      /**
       * 搜索长期记忆。
       * @param params 搜索参数
       * @param context 插件执行上下文
       * @returns 兼容当前工具返回值的记忆列表
       */
      recall_memory: async (
        params: JsonObject,
        context,
      ): Promise<JsonValue> => {
        const memories = readMemorySearchResults(await context.host.searchMemories(
          readRequiredString(params, 'query'),
          10,
        ));

        return {
          count: memories.length,
          memories: memories.map((memory) => ({
            content: memory.content ?? '',
            category: memory.category ?? 'general',
            date: (memory.createdAt ?? '').split('T')[0] ?? '',
          })),
        };
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

function readSavedMemoryId(value: JsonValue): string | null {
  const object = readJsonObjectValue(value);
  return object && typeof object.id === 'string' ? object.id : null;
}

function readMemorySearchResults(
  value: JsonValue,
): Array<{
  content?: string;
  category?: string;
  createdAt?: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const object = readJsonObjectValue(entry);
    if (!object) {
      return [];
    }

    return [{
      ...(typeof object.content === 'string' ? { content: object.content } : {}),
      ...(typeof object.category === 'string' ? { category: object.category } : {}),
      ...(typeof object.createdAt === 'string' ? { createdAt: object.createdAt } : {}),
    }];
  });
}

function readJsonObjectValue(
  value: JsonValue,
): Record<string, JsonValue> | null {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}
