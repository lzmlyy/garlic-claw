import type { ToolAfterCallHookPayload } from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';

/**
 * 工具调用审计摘要。
 */
interface ToolAuditSummary extends JsonObject {
  /** 工具来源类型。 */
  sourceKind: string;
  /** 工具来源 ID。 */
  sourceId: string;
  /** 被调用的插件 ID。 */
  pluginId: string | null;
  /** 插件运行形态。 */
  runtimeKind: string | null;
  /** 统一工具 ID。 */
  toolId: string;
  /** LLM 看到的调用名。 */
  callName: string;
  /** 工具名。 */
  toolName: string;
  /** 调用来源。 */
  callSource: string;
  /** 参数键列表。 */
  paramKeys: string[];
  /** 输出类型摘要。 */
  outputKind: string;
  /** 当前用户 ID。 */
  userId: string | null;
  /** 当前会话 ID。 */
  conversationId: string | null;
}

/**
 * 创建工具调用审计插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `tool:after-call` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在工具成功执行后记录最近一次调用摘要
 * - 同时向宿主事件日志写入统一审计事件
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createToolAuditPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.tool-audit',
      name: '工具审计器',
      version: '1.0.0',
      runtime: 'builtin',
      description: '用于验证工具生命周期 Hook 链路的内建插件',
      permissions: ['log:write', 'storage:write'],
      tools: [],
      hooks: [
        {
          name: 'tool:after-call',
          description: '在工具执行完成后记录调用摘要',
        },
      ],
    },
    hooks: {
      'tool:after-call': async (payload, { host }) => {
        const afterCall = payload as unknown as ToolAfterCallHookPayload;
        const summary = buildToolAuditSummary(afterCall);
        const storageScope = afterCall.source.kind === 'plugin'
          ? afterCall.pluginId ?? afterCall.source.id
          : `${afterCall.source.kind}.${afterCall.source.id}`;

        await host.setStorage(
          `tool.${storageScope}.${afterCall.tool.name}.last-call`,
          summary,
        );
        await host.writeLog({
          level: 'info',
          type: 'tool:observed',
          message: `工具 ${afterCall.source.id}:${afterCall.tool.name} 执行完成`,
          metadata: summary,
        });

        return {
          action: 'pass',
        };
      },
    },
  };
}

/**
 * 从 Hook 载荷中抽取稳定的工具调用摘要。
 * @param payload 工具调用后的 Hook 载荷
 * @returns 可持久化、可写日志的摘要对象
 */
function buildToolAuditSummary(
  payload: ToolAfterCallHookPayload,
): ToolAuditSummary {
  const summary: ToolAuditSummary = {
    sourceKind: payload.source.kind,
    sourceId: payload.source.id,
    pluginId: payload.pluginId ?? null,
    runtimeKind: payload.runtimeKind ?? null,
    toolId: payload.tool.toolId,
    callName: payload.tool.callName,
    toolName: payload.tool.name,
    callSource: payload.context.source,
    paramKeys: Object.keys(payload.params),
    outputKind: describeJsonValue(payload.output),
    userId: payload.context.userId ?? null,
    conversationId: payload.context.conversationId ?? null,
  };

  return summary;
}

/**
 * 归一化 JSON 值类型，避免把完整输出直接灌进审计摘要。
 * @param value 任意 JSON 值
 * @returns 类型标签
 */
function describeJsonValue(value: JsonValue): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }

  return typeof value;
}
