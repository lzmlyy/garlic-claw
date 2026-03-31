import type { JsonValue } from '../../common/types/json-value';
import { toJsonValue } from '../../common/utils/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';
import {
  asChatBeforeModelPayload,
  createChatBeforeModelHookResult,
} from './builtin-plugin.transport';

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
        fields: [
          {
            key: 'limit',
            type: 'number',
            description: '每次检索系统知识的最大条数',
            defaultValue: 3,
          },
          {
            key: 'promptPrefix',
            type: 'string',
            description: '知识摘要写入系统提示词时的前缀',
            defaultValue: '与当前问题相关的系统知识',
          },
        ],
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
        const latestUserText = findLatestUserText(hookPayload.request.messages);
        if (!latestUserText) {
          return null;
        }

        const config = (await context.host.getConfig()) as {
          limit?: number;
          promptPrefix?: string;
        };
        const entries = await context.host.searchKnowledgeBase(
          latestUserText,
          config.limit ?? 3,
        );
        if (entries.length === 0) {
          return null;
        }

        const knowledgeLines = entries.map((entry) =>
          `- [${entry.title}] ${clipKnowledgeContent(entry.content)}`,
        );
        return toJsonValue(
          createChatBeforeModelHookResult(
            hookPayload.request.systemPrompt,
            `${config.promptPrefix ?? '与当前问题相关的系统知识'}：\n${knowledgeLines.join('\n')}`,
          ),
        );
      },
    },
  };
}

/**
 * 从聊天消息中提取最近一条用户纯文本。
 * @param messages Hook 输入中的聊天消息
 * @returns 最近一条用户文本；没有时返回空字符串
 */
function findLatestUserText(
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | Array<{ type: string; text?: string }>;
  }>,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }
    if (typeof message.content === 'string') {
      return message.content;
    }

    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    if (text) {
      return text;
    }
  }

  return '';
}

/**
 * 裁剪知识库正文，避免一次塞入过长上下文。
 * @param content 原始正文
 * @returns 截断后的正文
 */
function clipKnowledgeContent(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 240) {
    return normalized;
  }

  return `${normalized.slice(0, 237)}...`;
}
