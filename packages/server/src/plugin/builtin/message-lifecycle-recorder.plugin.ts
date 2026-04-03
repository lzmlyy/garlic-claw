import { readPluginHookPayload } from '@garlic-claw/plugin-sdk';
import type {
  ConversationCreatedHookPayload,
  MessageCreatedHookPayload,
  MessageDeletedHookPayload,
  MessageUpdatedHookPayload,
} from '@garlic-claw/shared';
import type { JsonObject } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 会话创建摘要。
 */
interface ConversationCreatedSummary extends JsonObject {
  /** 会话 ID。 */
  conversationId: string;
  /** 标题长度。 */
  titleLength: number;
  /** 当前用户 ID。 */
  userId: string | null;
}

/**
 * 消息生命周期摘要。
 */
interface MessageLifecycleSummary extends JsonObject {
  /** 生命周期事件名。 */
  eventType: string;
  /** 会话 ID。 */
  conversationId: string;
  /** 消息 ID。 */
  messageId: string | null;
  /** 角色。 */
  role: string;
  /** 文本长度。 */
  contentLength: number;
  /** part 数量。 */
  partsCount: number;
  /** 状态。 */
  status: string | null;
  /** 当前用户 ID。 */
  userId: string | null;
}

/**
 * 创建会话/消息生命周期记录插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `conversation:* / message:*` 观测 Hook 的内建插件定义
 *
 * 预期行为:
 * - 在会话创建、消息创建/更新/删除后写入最近一次摘要
 * - 同时向宿主事件日志追加统一审计记录
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createMessageLifecycleRecorderPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.message-lifecycle-recorder',
      name: '消息生命周期记录器',
      version: '1.0.0',
      runtime: 'builtin',
      description: '用于验证会话与消息生命周期 Hook 链路的内建插件',
      permissions: ['log:write', 'storage:write'],
      tools: [],
      hooks: [
        {
          name: 'conversation:created',
          description: '在新会话创建后记录会话摘要',
        },
        {
          name: 'message:created',
          description: '在消息创建后记录消息摘要',
        },
        {
          name: 'message:updated',
          description: '在消息更新后记录消息摘要',
        },
        {
          name: 'message:deleted',
          description: '在消息删除后记录消息摘要',
        },
      ],
    },
    hooks: {
      'conversation:created': async (payload, { host }) => {
        const created = readPluginHookPayload<ConversationCreatedHookPayload>(payload);
        const summary = buildConversationCreatedSummary(created);

        await host.setStorage(
          `conversation.${created.conversation.id}.last-created`,
          summary,
        );
        await host.writeLog({
          level: 'info',
          type: 'conversation:observed',
          message: `会话 ${created.conversation.id} 已创建`,
          metadata: summary,
        });

        return undefined;
      },
      'message:created': async (payload, { host }) => {
        const created = readPluginHookPayload<MessageCreatedHookPayload>(payload);
        const summary = buildMessageLifecycleSummary(
          'message:created',
          created.conversationId,
          created.message,
          created.context.userId ?? null,
        );

        await host.setStorage(
          `conversation.${created.conversationId}.last-message-created`,
          summary,
        );
        await host.writeLog({
          level: 'info',
          type: 'message:observed',
          message: `会话 ${created.conversationId} 已创建一条 ${created.message.role} 消息`,
          metadata: summary,
        });

        return {
          action: 'pass',
        };
      },
      'message:updated': async (payload, { host }) => {
        const updated = readPluginHookPayload<MessageUpdatedHookPayload>(payload);
        const summary = buildMessageLifecycleSummary(
          'message:updated',
          updated.conversationId,
          {
            id: updated.messageId,
            ...updated.nextMessage,
          },
          updated.context.userId ?? null,
        );

        await host.setStorage(
          `message.${updated.messageId}.last-updated`,
          summary,
        );
        await host.writeLog({
          level: 'info',
          type: 'message:observed',
          message: `消息 ${updated.messageId} 已更新`,
          metadata: summary,
        });

        return {
          action: 'pass',
        };
      },
      'message:deleted': async (payload, { host }) => {
        const deleted = readPluginHookPayload<MessageDeletedHookPayload>(payload);
        const summary = buildMessageLifecycleSummary(
          'message:deleted',
          deleted.conversationId,
          {
            id: deleted.messageId,
            ...deleted.message,
          },
          deleted.context.userId ?? null,
        );

        await host.setStorage(
          `message.${deleted.messageId}.last-deleted`,
          summary,
        );
        await host.writeLog({
          level: 'info',
          type: 'message:observed',
          message: `消息 ${deleted.messageId} 已删除`,
          metadata: summary,
        });

        return undefined;
      },
    },
  };
}

/**
 * 构建会话创建摘要。
 * @param payload 会话创建 Hook 载荷
 * @returns 可持久化的摘要
 */
function buildConversationCreatedSummary(
  payload: ConversationCreatedHookPayload,
): ConversationCreatedSummary {
  return {
    conversationId: payload.conversation.id,
    titleLength: payload.conversation.title.length,
    userId: payload.context.userId ?? null,
  };
}

/**
 * 构建消息生命周期摘要。
 * @param eventType 生命周期事件名
 * @param conversationId 会话 ID
 * @param message 消息快照
 * @param userId 当前用户 ID
 * @returns 可持久化的摘要
 */
function buildMessageLifecycleSummary(
  eventType: string,
  conversationId: string,
  message: {
    id?: string | null;
    role: string;
    content: string | null;
    parts: unknown[];
    status?: string | null;
  },
  userId: string | null,
): MessageLifecycleSummary {
  return {
    eventType,
    conversationId,
    messageId: message.id ?? null,
    role: message.role,
    contentLength: message.content?.length ?? 0,
    partsCount: message.parts.length,
    status: message.status ?? null,
    userId,
  };
}
