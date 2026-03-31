import type { ResponseAfterSendHookPayload } from '@garlic-claw/shared';
import type { JsonObject } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';
import { readBuiltinHookPayload } from './builtin-hook-payload.helpers';

/**
 * 回复发送摘要。
 */
interface ResponseSendSummary extends JsonObject {
  /** assistant 消息 ID。 */
  assistantMessageId: string;
  /** provider ID。 */
  providerId: string;
  /** model ID。 */
  modelId: string;
  /** 回复来源。 */
  responseSource: string;
  /** 文本长度。 */
  contentLength: number;
  /** 工具调用条数。 */
  toolCallCount: number;
  /** 工具结果条数。 */
  toolResultCount: number;
  /** 发送时间。 */
  sentAt: string;
  /** 当前用户 ID。 */
  userId: string | null;
  /** 当前会话 ID。 */
  conversationId: string | null;
}

/**
 * 创建回复发送记录插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `response:after-send` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在最终回复发送后写入最近一次发送摘要
 * - 同时向宿主事件日志追加一条发送审计记录
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createResponseRecorderPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.response-recorder',
      name: '回复记录器',
      version: '1.0.0',
      runtime: 'builtin',
      description: '用于验证最终回复发送 Hook 链路的内建插件',
      permissions: ['log:write', 'storage:write'],
      tools: [],
      hooks: [
        {
          name: 'response:after-send',
          description: '在最终回复发送后记录发送摘要',
        },
      ],
    },
    hooks: {
      'response:after-send': async (payload, { host }) => {
        const afterSend = readBuiltinHookPayload<ResponseAfterSendHookPayload>(payload);
        const summary = buildResponseSendSummary(afterSend);

        await host.setStorage(
          `response.${afterSend.assistantMessageId}.last-sent`,
          summary,
        );
        await host.writeLog({
          level: 'info',
          type: 'response:sent',
          message: `回复 ${afterSend.assistantMessageId} 已发送 (${afterSend.responseSource})`,
          metadata: summary,
        });

        return undefined;
      },
    },
  };
}

/**
 * 从 Hook 负载中抽取稳定的发送摘要。
 * @param payload 最终回复发送后的 Hook 负载
 * @returns 可持久化、可写日志的摘要对象
 */
function buildResponseSendSummary(
  payload: ResponseAfterSendHookPayload,
): ResponseSendSummary {
  const summary: ResponseSendSummary = {
    assistantMessageId: payload.assistantMessageId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    responseSource: payload.responseSource,
    contentLength: payload.assistantContent.length,
    toolCallCount: payload.toolCalls.length,
    toolResultCount: payload.toolResults.length,
    sentAt: payload.sentAt,
    userId: payload.context.userId ?? null,
    conversationId: payload.context.conversationId ?? null,
  };

  return summary;
}
