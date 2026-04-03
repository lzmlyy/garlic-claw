import {
  asChatBeforeModelPayload,
  clipContextText,
  createChatBeforeModelLineBlockResult,
  KB_CONTEXT_CONFIG_FIELDS,
  KB_CONTEXT_DEFAULT_LIMIT,
  KB_CONTEXT_DEFAULT_PROMPT_PREFIX,
  readLatestUserTextFromMessages,
  readPromptBlockConfig,
  resolvePromptBlockConfig,
  toHostJsonValue,
} from '@garlic-claw/plugin-sdk';
import type { JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建知识库上下文注入插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `chat:before-model` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在模型调用前按当前用户问题检索系统知识
 * - 将命中的知识摘要追加到系统提示词
 */
export function createKbContextPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.kb-context',
      name: '知识库上下文',
      version: '1.0.0',
      runtime: 'builtin',
      description: '在模型调用前检索并注入系统知识摘要的内建插件。',
      permissions: ['kb:read', 'config:read'],
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
          description: '在模型调用前补入系统知识摘要',
        },
      ],
      config: {
        fields: KB_CONTEXT_CONFIG_FIELDS,
      },
    },
    hooks: {
      /**
       * 在模型调用前补入知识库提示词。
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

        const config = resolvePromptBlockConfig(
          readPromptBlockConfig(await context.host.getConfig()),
          {
            limit: KB_CONTEXT_DEFAULT_LIMIT,
            promptPrefix: KB_CONTEXT_DEFAULT_PROMPT_PREFIX,
          },
        );
        const entries = await context.host.searchKnowledgeBase(
          latestUserText,
          config.limit,
        );
        if (entries.length === 0) {
          return null;
        }

        const knowledgeLines = entries.map((entry) =>
          `- [${entry.title}] ${clipContextText(entry.content)}`,
        );
        return toHostJsonValue(createChatBeforeModelLineBlockResult(
          hookPayload.request.systemPrompt,
          config.promptPrefix,
          knowledgeLines,
        ));
      },
    },
  };
}
