import {
  asChatBeforeModelPayload,
  createChatBeforeModelLineBlockResult,
  readLatestUserTextFromMessages,
  readMemorySearchResults,
  readPromptBlockConfig,
} from '@garlic-claw/plugin-sdk';
import type { JsonValue } from '../../common/types/json-value';
import { toJsonValue } from '../../common/utils/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建记忆上下文注入插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `chat:before-model` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在模型调用前按当前用户消息检索长期记忆
 * - 将命中的记忆拼接为附加系统提示词
 */
export function createMemoryContextPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.memory-context',
      name: '记忆上下文',
      version: '1.0.0',
      runtime: 'builtin',
      description: '在模型调用前检索并注入用户长期记忆摘要的内建插件。',
      permissions: ['memory:read', 'config:read'],
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
          description: '在模型调用前补入用户长期记忆摘要',
        },
      ],
      config: {
        fields: [
          {
            key: 'limit',
            type: 'number',
            description: '每次检索长期记忆的最大条数',
            defaultValue: 5,
          },
          {
            key: 'promptPrefix',
            type: 'string',
            description: '记忆摘要写入系统提示词时的前缀',
            defaultValue: '与此用户相关的记忆',
          },
        ],
      },
    },
    hooks: {
      /**
       * 在模型调用前补入记忆提示词。
       * @param payload Hook 输入负载
       * @param context 插件执行上下文
       * @returns 要追加到系统提示词的文本；无命中时返回 null
       */
      'chat:before-model': async (payload: JsonValue, context) => {
        const hookPayload = asChatBeforeModelPayload(payload);
        const latestUserText = readLatestUserTextFromMessages(hookPayload.request.messages);
        if (!latestUserText) {
          return null;
        }

        const config = readPromptBlockConfig(await context.host.getConfig());
        const memories = readMemorySearchResults(await context.host.searchMemories(
          latestUserText,
          config.limit ?? 5,
        ));
        if (memories.length === 0) {
          return null;
        }

        const memoryLines = memories.map((memory) =>
          `- [${memory.category ?? 'general'}] ${memory.content ?? ''}`,
        );
        return toJsonValue(createChatBeforeModelLineBlockResult(
          hookPayload.request.systemPrompt,
          config.promptPrefix ?? '与此用户相关的记忆',
          memoryLines,
        ));
      },
    },
  };
}
