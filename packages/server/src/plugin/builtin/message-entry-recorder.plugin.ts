import type {
  ChatWaitingModelHookPayload,
  MessageReceivedHookPayload,
} from '@garlic-claw/shared';
import type { JsonObject } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.types';
import { readBuiltinHookPayload } from './builtin-hook-payload.helpers';

/**
 * 收到消息阶段摘要。
 */
interface MessageReceivedSummary extends JsonObject {
  conversationId: string;
  providerId: string;
  modelId: string;
  contentLength: number;
  partsCount: number;
  userId: string | null;
}

/**
 * waiting-model 阶段摘要。
 */
interface WaitingModelSummary extends JsonObject {
  conversationId: string;
  assistantMessageId: string;
  providerId: string;
  modelId: string;
  messageCount: number;
  toolCount: number;
  userId: string | null;
}

/**
 * 创建收到消息 / waiting-model 记录插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `message:received / chat:waiting-model` 观测 Hook 的内建插件定义
 *
 * 预期行为:
 * - 对命令式消息在进入 LLM 前记录稳定摘要
 * - 在真正进入模型调用前记录 waiting 摘要
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createMessageEntryRecorderPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.message-entry-recorder',
      name: '消息入口记录器',
      version: '1.0.0',
      runtime: 'builtin',
      description: '用于验证 message:received 与 chat:waiting-model 链路的内建插件',
      permissions: ['log:write', 'storage:write'],
      tools: [],
      hooks: [
        {
          name: 'message:received',
          description: '在命令式消息进入 LLM 前记录摘要',
          priority: 100,
          filter: {
            message: {
              regex: '^/',
            },
          },
        },
        {
          name: 'chat:waiting-model',
          description: '在真正进入模型调用前记录 waiting 摘要',
        },
      ],
    },
    hooks: {
      'message:received': async (payload, { host }) => {
        const received = readBuiltinHookPayload<MessageReceivedHookPayload>(payload);
        const summary = buildMessageReceivedSummary(received);

        await host.setStorage('message.received.last-entry', summary);
        await host.writeLog({
          level: 'info',
          type: 'message:received:observed',
          message: `会话 ${received.conversationId} 收到一条待处理用户消息`,
          metadata: summary,
        });

        return {
          action: 'pass',
        };
      },
      'chat:waiting-model': async (payload, { host }) => {
        const waiting = readBuiltinHookPayload<ChatWaitingModelHookPayload>(payload);
        const summary = buildWaitingModelSummary(waiting);

        await host.setStorage('message.waiting.last-model-request', summary);
        await host.writeLog({
          level: 'info',
          type: 'chat:waiting-model:observed',
          message: `会话 ${waiting.conversationId} 即将进入模型调用`,
          metadata: summary,
        });

        return undefined;
      },
    },
  };
}

/**
 * 构建收到消息阶段摘要。
 * @param payload 收到消息 Hook 载荷
 * @returns 可持久化的摘要
 */
function buildMessageReceivedSummary(
  payload: MessageReceivedHookPayload,
): MessageReceivedSummary {
  return {
    conversationId: payload.conversationId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    contentLength: payload.message.content?.length ?? 0,
    partsCount: payload.message.parts.length,
    userId: payload.context.userId ?? null,
  };
}

/**
 * 构建 waiting-model 阶段摘要。
 * @param payload waiting-model Hook 载荷
 * @returns 可持久化的摘要
 */
function buildWaitingModelSummary(
  payload: ChatWaitingModelHookPayload,
): WaitingModelSummary {
  return {
    conversationId: payload.conversationId,
    assistantMessageId: payload.assistantMessageId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    messageCount: payload.request.messages.length,
    toolCount: payload.request.availableTools.length,
    userId: payload.context.userId ?? null,
  };
}
