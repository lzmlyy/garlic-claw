import type {
  PluginActionName,
  PluginCallContext,
  PluginCapability,
  PluginConversationSessionInfo,
  PluginManifest,
  PluginRuntimePressureSnapshot,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { getRuntimeRecordOrThrow, isRuntimeRecordEnabledForContext } from './plugin-runtime-dispatch.helpers';
import {
  buildRuntimePressureSnapshot,
  listSupportedPluginActions,
} from './plugin-runtime-record.helpers';
import { runPromiseWithTimeout } from './plugin-runtime-timeout.helpers';
import {
  finishOwnedConversationSession,
  listActiveConversationSessionInfos,
  type ConversationSessionRecord,
} from './plugin-runtime-session.helpers';

interface RuntimeGovernanceRecord {
  manifest: PluginManifest;
  runtimeKind: PluginRuntimeKind;
  deviceType: string;
  governance: {
    scope: {
      defaultEnabled: boolean;
      conversations: Record<string, boolean>;
    };
  };
  transport: {
    reload?: () => Promise<void> | void;
    reconnect?: () => Promise<void> | void;
    checkHealth?: () => Promise<{ ok: boolean }> | { ok: boolean };
    listSupportedActions?: () => PluginActionName[];
  };
  activeExecutions: number;
  maxConcurrentExecutions: number;
}

@Injectable()
export class PluginRuntimeGovernanceFacade {
  listTools(
    records: Map<string, RuntimeGovernanceRecord>,
    context?: PluginCallContext,
  ): Array<{
    pluginId: string;
    runtimeKind: PluginRuntimeKind;
    tool: PluginCapability;
  }> {
    const tools: Array<{
      pluginId: string;
      runtimeKind: PluginRuntimeKind;
      tool: PluginCapability;
    }> = [];

    for (const [pluginId, record] of records) {
      if (context && !isRuntimeRecordEnabledForContext(record, context)) {
        continue;
      }

      for (const tool of record.manifest.tools ?? []) {
        tools.push({
          pluginId,
          runtimeKind: record.runtimeKind,
          tool,
        });
      }
    }

    return tools;
  }

  listPlugins(records: Map<string, RuntimeGovernanceRecord>): Array<{
    pluginId: string;
    runtimeKind: PluginRuntimeKind;
    deviceType: string;
    manifest: PluginManifest;
    supportedActions: PluginActionName[];
    runtimePressure: PluginRuntimePressureSnapshot;
  }> {
    return [...records.entries()].map(([pluginId, record]) => ({
      pluginId,
      runtimeKind: record.runtimeKind,
      deviceType: record.deviceType,
      manifest: record.manifest,
      supportedActions: listSupportedPluginActions(record),
      runtimePressure: buildRuntimePressureSnapshot(record),
    }));
  }

  getRuntimePressure(
    records: Map<string, RuntimeGovernanceRecord>,
    pluginId: string,
  ): PluginRuntimePressureSnapshot | null {
    const record = records.get(pluginId);
    if (!record) {
      return null;
    }

    return buildRuntimePressureSnapshot(record);
  }

  listSupportedActions(
    records: Map<string, RuntimeGovernanceRecord>,
    pluginId: string,
  ): PluginActionName[] {
    const record = records.get(pluginId);
    if (!record) {
      return ['health-check'];
    }

    return listSupportedPluginActions(record);
  }

  listConversationSessions(
    sessions: Map<string, ConversationSessionRecord>,
    pluginId?: string,
  ): PluginConversationSessionInfo[] {
    return listActiveConversationSessionInfos(sessions, pluginId, Date.now());
  }

  finishConversationSessionForGovernance(
    sessions: Map<string, ConversationSessionRecord>,
    pluginId: string,
    conversationId: string,
  ): boolean {
    return finishOwnedConversationSession(sessions, pluginId, conversationId);
  }

  async runPluginAction(input: {
    records: Map<string, RuntimeGovernanceRecord>;
    pluginId: string;
    action: Exclude<PluginActionName, 'health-check'>;
  }): Promise<void> {
    const record = getRuntimeRecordOrThrow(input.records, input.pluginId);
    const handler = input.action === 'reload'
      ? record.transport.reload
      : record.transport.reconnect;
    if (!handler) {
      throw new BadRequestException(
        `插件 ${input.pluginId} 不支持治理动作 ${input.action}`,
      );
    }

    await runPromiseWithTimeout(
      Promise.resolve(handler.call(record.transport)),
      15000,
      `插件 ${input.pluginId} 治理动作 ${input.action} 执行超时`,
    );
  }

  async checkPluginHealth(
    records: Map<string, RuntimeGovernanceRecord>,
    pluginId: string,
  ): Promise<{ ok: boolean }> {
    const record = records.get(pluginId);
    if (!record) {
      return { ok: false };
    }
    if (!record.transport.checkHealth) {
      return { ok: true };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await runPromiseWithTimeout(
          Promise.resolve(record.transport.checkHealth()),
          5000,
          `插件 ${pluginId} 健康检查超时`,
        );
        if (result.ok) {
          return result;
        }
      } catch {
        // 健康检查允许做一次轻量重试，以过滤瞬时网络抖动。
      }
    }

    return { ok: false };
  }
}
