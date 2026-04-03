import {
  buildConversationTitlePrompt,
  readConversationMessages,
  readConversationSummary,
  readConversationTitleConfig,
  readTextGenerationResult,
  sanitizeConversationTitle,
  shouldGenerateConversationTitle,
} from '@garlic-claw/plugin-sdk';
import type { JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 创建会话标题生成插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `chat:after-model` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在 assistant 首次完成回复后，为默认标题会话生成更合适的标题
 * - 全程只通过统一 Host API 读取会话、消息和模型生成能力
 */
export function createConversationTitlePlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.conversation-title',
      name: '会话标题',
      version: '1.0.0',
      runtime: 'builtin',
      description: '在首次回复后为默认标题会话自动生成更合适标题的内建插件。',
      permissions: [
        'config:read',
        'conversation:read',
        'conversation:write',
        'llm:generate',
      ],
      tools: [],
      hooks: [
        {
          name: 'chat:after-model',
          description: '在 assistant 完成回复后为会话生成标题',
        },
      ],
      config: {
        fields: [
          {
            key: 'defaultTitle',
            type: 'string',
            description: '仍命中该默认标题时才尝试自动改标题',
            defaultValue: 'New Chat',
          },
          {
            key: 'maxMessages',
            type: 'number',
            description: '参与标题生成的最大消息条数',
            defaultValue: 4,
          },
        ],
      },
    },
    hooks: {
      /**
       * 在 assistant 完成后尝试生成会话标题。
       * @param payload Hook 输入负载
       * @param context 插件执行上下文
       * @returns 当前不需要返回结果，始终返回 null
       */
      'chat:after-model': async (_payload: JsonValue, context) => {
        const config = readConversationTitleConfig(await context.host.getConfig());
        const conversation = readConversationSummary(await context.host.getConversation());
        const defaultTitle = (config.defaultTitle ?? 'New Chat').trim() || 'New Chat';
        if (!shouldGenerateConversationTitle(conversation.title, defaultTitle)) {
          return null;
        }

        const messages = readConversationMessages(await context.host.listConversationMessages());
        const prompt = buildConversationTitlePrompt(
          messages,
          config.maxMessages ?? 4,
        );
        if (!prompt) {
          return null;
        }

        const generated = readTextGenerationResult(await context.host.generateText({
          system:
            '你是一个对话标题生成器。请基于给定对话生成一个简短、准确、自然的中文标题。',
          prompt,
          maxOutputTokens: 32,
        }));
        const title = sanitizeConversationTitle(generated.text);
        if (!title || title === conversation.title) {
          return null;
        }

        await context.host.setConversationTitle(title);
        return null;
      },
    },
  };
}
