import type { JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';
import { asChatAfterModelPayload } from './builtin-plugin.transport';

/**
 * 会话标题插件使用的最小会话摘要。
 */
interface ConversationSummary {
  /** 会话 ID。 */
  id?: string;
  /** 当前标题。 */
  title?: string;
}

/**
 * 会话标题插件的配置。
 */
interface ConversationTitlePluginConfig {
  /** 默认标题；仍为该值时才自动改标题。 */
  defaultTitle?: string;
  /** 参与生成标题的最大消息条数。 */
  maxMessages?: number;
}

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
      name: 'Conversation Title',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: [
        'config:read',
        'conversation:read',
        'conversation:write',
        'subagent:run',
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
      'chat:after-model': async (payload: JsonValue, context) => {
        const hookPayload = asChatAfterModelPayload(payload);
        const config = (await context.host.getConfig()) as ConversationTitlePluginConfig;
        const conversation = (await context.host.getConversation()) as ConversationSummary;
        const defaultTitle = (config.defaultTitle ?? 'New Chat').trim() || 'New Chat';
        if (!shouldGenerateConversationTitle(conversation.title, defaultTitle)) {
          return null;
        }

        const messages = (await context.host.listConversationMessages()) as Array<{
          role?: string;
          content?: string;
        }>;
        const prompt = buildConversationTitlePrompt(
          messages,
          config.maxMessages ?? 4,
        );
        if (!prompt) {
          return null;
        }

        const generated = await context.host.runSubagent({
          providerId: hookPayload.providerId,
          modelId: hookPayload.modelId,
          system:
            '你是一个对话标题生成器。请基于给定对话生成一个简短、准确、自然的中文标题。',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt,
                },
              ],
            },
          ],
          maxOutputTokens: 32,
          maxSteps: 1,
        });
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

/**
 * 判断当前会话是否仍需要自动生成标题。
 * @param title 当前会话标题
 * @param defaultTitle 默认标题
 * @returns 是否应继续生成标题
 */
function shouldGenerateConversationTitle(
  title: string | undefined,
  defaultTitle: string,
): boolean {
  return (title ?? '').trim() === defaultTitle;
}

/**
 * 基于最近几条消息构造标题生成提示词。
 * @param messages 会话消息列表
 * @param maxMessages 最多使用多少条消息
 * @returns 可直接交给 `llm.generate-text` 的提示词
 */
function buildConversationTitlePrompt(
  messages: Array<{
    role?: string;
    content?: string;
  }>,
  maxMessages: number,
): string {
  const visibleMessages = messages
    .filter((message) => typeof message.content === 'string' && message.content.trim())
    .slice(0, Math.max(1, maxMessages))
    .map((message) => `${mapRoleLabel(message.role)}: ${message.content?.trim() ?? ''}`);

  if (visibleMessages.length === 0) {
    return '';
  }

  return [
    '请为下面这段对话生成一个简洁中文标题。',
    '要求：',
    '- 8 到 20 个字',
    '- 不要使用引号',
    '- 不要输出序号或解释',
    '- 只输出标题本身',
    '',
    '对话：',
    ...visibleMessages,
  ].join('\n');
}

/**
 * 把角色标记转成更自然的提示词标签。
 * @param role 原始角色
 * @returns 标题生成提示词里的角色名称
 */
function mapRoleLabel(role?: string): string {
  switch (role) {
    case 'assistant':
      return '助手';
    case 'system':
      return '系统';
    case 'tool':
      return '工具';
    default:
      return '用户';
  }
}

/**
 * 清洗模型输出，得到可直接写入会话标题的文本。
 * @param raw 模型输出原文
 * @returns 清洗后的标题
 */
function sanitizeConversationTitle(raw?: string): string {
  if (!raw) {
    return '';
  }

  return raw
    .trim()
    .replace(/^["'`「『]+/, '')
    .replace(/["'`」』]+$/, '')
    .split('\n')[0]
    .trim();
}
