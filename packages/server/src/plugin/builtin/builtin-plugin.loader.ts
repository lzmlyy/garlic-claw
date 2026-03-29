import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PluginRuntimeService } from '../plugin-runtime.service';
import type { BuiltinPluginDefinition } from './builtin-plugin.transport';
import { BuiltinPluginTransport } from './builtin-plugin.transport';
import { createAutomationRecorderPlugin } from './automation-recorder.plugin';
import { createAutomationToolsPlugin } from './automation-tools.plugin';
import { createConversationTitlePlugin } from './conversation-title.plugin';
import { createCoreToolsPlugin } from './core-tools.plugin';
import { createCronHeartbeatPlugin } from './cron-heartbeat.plugin';
import { createKbContextPlugin } from './kb-context.plugin';
import { createMemoryContextPlugin } from './memory-context.plugin';
import { createMessageEntryRecorderPlugin } from './message-entry-recorder.plugin';
import { createMessageLifecycleRecorderPlugin } from './message-lifecycle-recorder.plugin';
import { createMemoryToolsPlugin } from './memory-tools.plugin';
import { createPersonaRouterPlugin } from './persona-router.plugin';
import { createPluginGovernanceRecorderPlugin } from './plugin-governance-recorder.plugin';
import { createProviderRouterPlugin } from './provider-router.plugin';
import { createResponseRecorderPlugin } from './response-recorder.plugin';
import { createRouteInspectorPlugin } from './route-inspector.plugin';
import { createSubagentDelegatePlugin } from './subagent-delegate.plugin';
import { createToolAuditPlugin } from './tool-audit.plugin';

/**
 * 默认内建插件加载器。
 *
 * 输入:
 * - 应用启动事件
 *
 * 输出:
 * - 已注册到统一 runtime 的默认内建插件
 *
 * 预期行为:
 * - 后端启动时自动挂载首批内建插件
 * - 所有内建插件都通过统一 transport 接入 runtime
 */
@Injectable()
export class BuiltinPluginLoader implements OnModuleInit {
  private readonly definitions = new Map<string, BuiltinPluginDefinition>();

  constructor(private readonly pluginRuntime: PluginRuntimeService) {}

  /**
   * 启动时注册默认内建插件。
   * @returns 无返回值
   */
  async onModuleInit(): Promise<void> {
    const definitions = [
      createCoreToolsPlugin(),
      createMemoryToolsPlugin(),
      createAutomationToolsPlugin(),
      createMemoryContextPlugin(),
      createMessageLifecycleRecorderPlugin(),
      createMessageEntryRecorderPlugin(),
      createKbContextPlugin(),
      createConversationTitlePlugin(),
      createSubagentDelegatePlugin(),
      createProviderRouterPlugin(),
      createPersonaRouterPlugin(),
      createCronHeartbeatPlugin(),
      createRouteInspectorPlugin(),
      createAutomationRecorderPlugin(),
      createToolAuditPlugin(),
      createResponseRecorderPlugin(),
      createPluginGovernanceRecorderPlugin(),
    ];

    for (const definition of definitions) {
      this.definitions.set(definition.manifest.id, definition);
      await this.registerDefinition(definition);
    }
  }

  /**
   * 重新装载一个内建插件定义。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  async reloadPlugin(pluginId: string): Promise<void> {
    const definition = this.definitions.get(pluginId);
    if (!definition) {
      throw new NotFoundException(`Builtin plugin not found: ${pluginId}`);
    }

    await this.pluginRuntime.unregisterPlugin(pluginId);
    await this.registerDefinition(definition);
  }

  /**
   * 对内建插件执行一次本地健康检查。
   * @param pluginId 插件 ID
   * @returns 健康检查结果
   */
  async checkPluginHealth(pluginId: string): Promise<{ ok: boolean }> {
    const exists = this.pluginRuntime.listPlugins().some(
      (plugin) => plugin.pluginId === pluginId && plugin.runtimeKind === 'builtin',
    );
    return {
      ok: exists,
    };
  }

  /**
   * 把一个内建插件定义注册到统一 runtime。
   * @param definition 内建插件定义
   * @returns 无返回值
   */
  private async registerDefinition(
    definition: BuiltinPluginDefinition,
  ): Promise<void> {
    await this.pluginRuntime.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => this.pluginRuntime.callHost(input),
      }, {
        reload: () => this.reloadPlugin(definition.manifest.id),
        checkHealth: () => this.checkPluginHealth(definition.manifest.id),
      }),
    });
  }
}
