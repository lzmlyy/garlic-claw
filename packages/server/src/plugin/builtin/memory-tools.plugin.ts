import {
  readMemorySearchResults,
  readMemorySaveResultId,
  readOptionalStringParam,
  readRequiredStringParam,
} from '@garlic-claw/plugin-sdk';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

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
          content: readRequiredStringParam(params, 'content'),
          category: readOptionalStringParam(params, 'category') ?? undefined,
          keywords: readOptionalStringParam(params, 'keywords') ?? undefined,
        });

        return {
          saved: true,
          id: readMemorySaveResultId(saved),
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
          readRequiredStringParam(params, 'query'),
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
