import type {
  PluginActionName,
  PluginManifest,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { buildPluginLifecycleHookInfo } from './plugin-runtime-manifest.helpers';
import { PluginRuntimeService } from './plugin-runtime.service';
import type { PluginTransport } from './plugin-runtime.types';
import { PluginCronService } from './plugin-cron.service';
import { PluginService } from './plugin.service';

/**
 * 插件运行时宿主编排层。
 *
 * 输入:
 * - 插件注册/注销/治理刷新请求
 * - 远程插件心跳
 *
 * 输出:
 * - 已写入持久化与 runtime kernel 的统一结果
 *
 * 预期行为:
 * - 把 pluginService / cronService / lifecycle hook 的宿主编排从 kernel 中剥离
 * - runtime kernel 只保留 record、transport 与 hook 执行能力
 * - controller / gateway / builtin loader 统一通过本编排层驱动生命周期
 */
@Injectable()
export class PluginRuntimeOrchestratorService {
  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly pluginService: PluginService,
    private readonly cronService: PluginCronService,
  ) {}

  async registerPlugin(input: {
    manifest: PluginManifest;
    runtimeKind: PluginRuntimeKind;
    deviceType?: string;
    transport: PluginTransport;
  }): Promise<PluginManifest> {
    const governance = await this.pluginService.registerPlugin(
      input.manifest.id,
      input.deviceType ?? input.runtimeKind,
      input.manifest,
    );

    await this.pluginRuntime.registerPlugin({
      ...input,
      governance,
    });
    await this.cronService.onPluginRegistered(
      input.manifest.id,
      input.manifest.crons ?? [],
    );
    await this.pluginRuntime.runPluginLoadedHooks({
      context: {
        source: 'plugin',
      },
      payload: {
        context: {
          source: 'plugin',
        },
        plugin: buildPluginLifecycleHookInfo({
          manifest: input.manifest,
          runtimeKind: input.runtimeKind,
          deviceType: input.deviceType ?? input.runtimeKind,
        }),
        loadedAt: new Date().toISOString(),
      },
    });

    return input.manifest;
  }

  async refreshPluginGovernance(pluginId: string): Promise<void> {
    const governance = await this.pluginService.getGovernanceSnapshot(pluginId);
    this.pluginRuntime.refreshPluginGovernance(pluginId, governance);
  }

  async unregisterPlugin(pluginId: string): Promise<void> {
    const runtimeInfo = this.pluginRuntime.listPlugins().find(
      (plugin) => plugin.pluginId === pluginId,
    );
    if (runtimeInfo) {
      await this.pluginRuntime.runPluginUnloadedHooks({
        context: {
          source: 'plugin',
        },
        payload: {
          context: {
            source: 'plugin',
          },
          plugin: buildPluginLifecycleHookInfo(runtimeInfo),
          unloadedAt: new Date().toISOString(),
        },
      });
    }

    this.cronService.onPluginUnregistered(pluginId);
    this.pluginRuntime.unregisterPlugin(pluginId);
    await this.pluginService.setOffline(pluginId);
  }

  async touchPluginHeartbeat(pluginId: string): Promise<void> {
    if (!pluginId) {
      return;
    }

    try {
      await this.pluginService.heartbeat(pluginId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return;
      }
      throw error;
    }
  }

  listSupportedActions(pluginId: string): PluginActionName[] {
    return this.pluginRuntime.listSupportedActions(pluginId);
  }

  async runPluginAction(input: {
    pluginId: string;
    action: Exclude<PluginActionName, 'health-check'>;
  }): Promise<void> {
    await this.pluginRuntime.runPluginAction(input);
  }

  async checkPluginHealth(pluginId: string): Promise<{ ok: boolean }> {
    return this.pluginRuntime.checkPluginHealth(pluginId);
  }
}
