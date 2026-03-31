import type {
  PluginErrorHookPayload,
  PluginLoadedHookPayload,
  PluginUnloadedHookPayload,
} from '@garlic-claw/shared';
import type { JsonObject } from '../../common/types/json-value';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';
import { readBuiltinHookPayload } from './builtin-hook-payload.helpers';

/**
 * 插件治理事件摘要。
 */
interface PluginGovernanceSummary extends JsonObject {
  /** 事件类型。 */
  eventType: string;
  /** 插件 ID。 */
  pluginId: string;
  /** 运行形态。 */
  runtimeKind: string;
  /** 设备类型。 */
  deviceType: string;
  /** 错误类型。 */
  errorType: string | null;
  /** 错误消息。 */
  errorMessage: string | null;
  /** 发生时间。 */
  occurredAt: string;
}

/**
 * 创建插件治理记录插件。
 *
 * 输入:
 * - 无
 *
 * 输出:
 * - 具备 `plugin:*` Hook 的内建插件定义
 *
 * 预期行为:
 * - 在插件加载、卸载、失败时记录最近一次治理摘要
 * - 同时向宿主事件日志写入治理审计事件
 * - 全程只通过统一 Host API 写 storage 与 log
 */
export function createPluginGovernanceRecorderPlugin(): BuiltinPluginDefinition {
  return {
    manifest: {
      id: 'builtin.plugin-governance-recorder',
      name: '插件治理记录器',
      version: '1.0.0',
      runtime: 'builtin',
      description: '用于验证插件治理生命周期 Hook 链路的内建插件',
      permissions: ['log:write', 'storage:write'],
      tools: [],
      hooks: [
        {
          name: 'plugin:loaded',
          description: '在插件加载后记录治理摘要',
        },
        {
          name: 'plugin:unloaded',
          description: '在插件卸载后记录治理摘要',
        },
        {
          name: 'plugin:error',
          description: '在插件失败后记录治理摘要',
        },
      ],
    },
    hooks: {
      'plugin:loaded': async (payload, { host }) => {
        const loaded = readBuiltinHookPayload<PluginLoadedHookPayload>(payload);
        const summary = buildGovernanceSummary({
          eventType: 'plugin:loaded',
          pluginId: loaded.plugin.id,
          runtimeKind: loaded.plugin.runtimeKind,
          deviceType: loaded.plugin.deviceType,
          occurredAt: loaded.loadedAt,
        });

        await persistGovernanceSummary(host, loaded.plugin.id, summary);
        return undefined;
      },
      'plugin:unloaded': async (payload, { host }) => {
        const unloaded = readBuiltinHookPayload<PluginUnloadedHookPayload>(payload);
        const summary = buildGovernanceSummary({
          eventType: 'plugin:unloaded',
          pluginId: unloaded.plugin.id,
          runtimeKind: unloaded.plugin.runtimeKind,
          deviceType: unloaded.plugin.deviceType,
          occurredAt: unloaded.unloadedAt,
        });

        await persistGovernanceSummary(host, unloaded.plugin.id, summary);
        return undefined;
      },
      'plugin:error': async (payload, { host }) => {
        const failed = readBuiltinHookPayload<PluginErrorHookPayload>(payload);
        const summary = buildGovernanceSummary({
          eventType: 'plugin:error',
          pluginId: failed.plugin.id,
          runtimeKind: failed.plugin.runtimeKind,
          deviceType: failed.plugin.deviceType,
          errorType: failed.error.type,
          errorMessage: failed.error.message,
          occurredAt: failed.occurredAt,
        });

        await persistGovernanceSummary(host, failed.plugin.id, summary);
        return undefined;
      },
    },
  };
}

/**
 * 统一写入治理摘要到宿主 storage 与事件日志。
 * @param host 插件 Host 门面
 * @param pluginId 被观察的插件 ID
 * @param summary 摘要
 * @returns 无返回值
 */
async function persistGovernanceSummary(
  host: {
    setStorage: (key: string, value: JsonObject) => Promise<unknown>;
    writeLog: (input: {
      level: 'info' | 'warn';
      type?: string;
      message: string;
      metadata?: JsonObject;
    }) => Promise<boolean>;
  },
  pluginId: string,
  summary: PluginGovernanceSummary,
): Promise<void> {
  await host.setStorage(`plugin.${pluginId}.last-governance-event`, summary);
  await host.writeLog({
    level: summary.eventType === 'plugin:error' ? 'warn' : 'info',
    type: 'plugin:observed',
    message: buildGovernanceMessage(summary),
    metadata: summary,
  });
}

/**
 * 构建统一治理摘要。
 * @param input 治理事件输入
 * @returns 可持久化摘要
 */
function buildGovernanceSummary(input: {
  eventType: string;
  pluginId: string;
  runtimeKind: string;
  deviceType: string;
  occurredAt: string;
  errorType?: string;
  errorMessage?: string;
}): PluginGovernanceSummary {
  return {
    eventType: input.eventType,
    pluginId: input.pluginId,
    runtimeKind: input.runtimeKind,
    deviceType: input.deviceType,
    errorType: input.errorType ?? null,
    errorMessage: input.errorMessage ?? null,
    occurredAt: input.occurredAt,
  };
}

/**
 * 构建统一治理日志文案。
 * @param summary 治理摘要
 * @returns 日志消息
 */
function buildGovernanceMessage(summary: PluginGovernanceSummary): string {
  if (summary.eventType === 'plugin:error') {
    return `插件 ${summary.pluginId} 发生失败：${summary.errorType ?? 'unknown'}`;
  }
  if (summary.eventType === 'plugin:unloaded') {
    return `插件 ${summary.pluginId} 已卸载`;
  }

  return `插件 ${summary.pluginId} 已加载`;
}
