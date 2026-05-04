import {
  createMemoryRecallToolResult,
  createMemorySaveToolResult,
  readMemorySaveResultId,
  readMemorySearchResults,
  readOptionalStringParam,
  readRequiredStringParam,
} from '@garlic-claw/plugin-sdk/authoring';
import type { BuiltinPluginDefinition } from './builtin-plugin-definition';

export const BUILTIN_MEMORY_PLUGIN: BuiltinPluginDefinition = {
  governance: {
    builtinRole: 'system-optional',
    canDisable: true,
    defaultEnabled: true,
  },
  manifest: {
    description: '提供长期记忆写入与检索工具。',
    id: 'builtin.memory',
    name: '记忆',
    permissions: ['memory:read', 'memory:write'],
    runtime: 'local',
    tools: [
      {
        description: '将重要信息保存到长期记忆中',
        name: 'save_memory',
        parameters: {
          category: {
            description: '记忆类别',
            type: 'string',
          },
          content: {
            description: '要记住的信息',
            required: true,
            type: 'string',
          },
          keywords: {
            description: '逗号分隔的关键词',
            type: 'string',
          },
        },
      },
      {
        description: '搜索用户长期记忆',
        name: 'search_memory',
        parameters: {
          query: {
            description: '搜索查询',
            required: true,
            type: 'string',
          },
        },
      },
    ],
    version: '1.0.0',
  },
  tools: {
    save_memory: async (params, context) => (
      createMemorySaveToolResult(
        readMemorySaveResultId(
          await context.host.saveMemory({
            ...(readOptionalStringParam(params, 'category') ? { category: readOptionalStringParam(params, 'category') ?? undefined } : {}),
            content: readRequiredStringParam(params, 'content'),
            ...(readOptionalStringParam(params, 'keywords') ? { keywords: readOptionalStringParam(params, 'keywords') ?? undefined } : {}),
          }),
        ),
      )
    ),
    search_memory: async (params, context) => (
      createMemoryRecallToolResult(
        readMemorySearchResults(
          await context.host.searchMemories(
            readRequiredStringParam(params, 'query'),
          ),
        ),
      )
    ),
  },
};
