import type { PluginActionName, PluginHealthSnapshot, PluginHealthStatus } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PluginBootstrapService } from '../../plugin/bootstrap/plugin-bootstrap.service';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeGatewayConnectionLifecycleService } from '../gateway/runtime-gateway-connection-lifecycle.service';

const BUILTIN_PLUGIN_ACTIONS: PluginActionName[] = ['health-check', 'reload'];
const REMOTE_PLUGIN_ACTIONS: PluginActionName[] = ['health-check', 'reload', 'reconnect'];
const REMOTE_PLUGIN_ACTION_MESSAGES = {
  reconnect: '已请求远程插件重连',
  reload: '已触发远程插件重连',
} as const;

@Injectable()
export class RuntimePluginGovernanceService {
  constructor(
    private readonly pluginBootstrapService: PluginBootstrapService,
    private readonly runtimeGatewayConnectionLifecycleService: RuntimeGatewayConnectionLifecycleService,
  ) {}

  checkPluginHealth(pluginId: string): { ok: boolean } { return readPluginHealth(this.pluginBootstrapService.getPlugin(pluginId), pluginId, this.runtimeGatewayConnectionLifecycleService); }
  readPluginHealthSnapshot(pluginId: string): PluginHealthSnapshot {
    const plugin = this.pluginBootstrapService.getPlugin(pluginId);
    return createPluginHealthSnapshot(
      plugin,
      readPluginHealth(plugin, pluginId, this.runtimeGatewayConnectionLifecycleService).ok,
    );
  }

  listPlugins(): RegisteredPluginRecord[] { return this.pluginBootstrapService.listPlugins().sort((left, right) => left.pluginId.localeCompare(right.pluginId)); }

  listSupportedActions(pluginId: string): PluginActionName[] {
    const plugin = this.pluginBootstrapService.getPlugin(pluginId);
    return [...(plugin.manifest.runtime === 'local' ? BUILTIN_PLUGIN_ACTIONS : REMOTE_PLUGIN_ACTIONS)];
  }

  async runPluginAction(input: { action: PluginActionName; pluginId: string }) {
    const plugin = this.pluginBootstrapService.getPlugin(input.pluginId);
    if (input.action === 'health-check') {
      const health = plugin.manifest.runtime === 'remote'
        ? await this.runtimeGatewayConnectionLifecycleService.probePluginHealth(input.pluginId)
        : readPluginHealth(plugin, input.pluginId, this.runtimeGatewayConnectionLifecycleService);
      return createAcceptedActionResult(input.pluginId, input.action, health.ok ? '插件健康检查通过' : '插件健康检查失败');
    }
    if (input.action === 'reload' && plugin.manifest.runtime === 'local') {
      this.pluginBootstrapService.reloadBuiltin(input.pluginId);
      return createAcceptedActionResult(input.pluginId, input.action, '已重新装载本地插件');
    }
    if (plugin.manifest.runtime !== 'remote' || (input.action !== 'reload' && input.action !== 'reconnect')) {
      throw new BadRequestException(`Plugin ${input.pluginId} does not support action ${input.action}`);
    }
    this.runtimeGatewayConnectionLifecycleService.disconnectPlugin(input.pluginId);
    return createAcceptedActionResult(input.pluginId, input.action, REMOTE_PLUGIN_ACTION_MESSAGES[input.action]);
  }
}

function createAcceptedActionResult(pluginId: string, action: PluginActionName, message: string) {
  return { accepted: true, action, pluginId, message };
}

function readPluginHealth(
  plugin: RegisteredPluginRecord,
  pluginId: string,
  runtimeGatewayConnectionLifecycleService: RuntimeGatewayConnectionLifecycleService,
): { ok: boolean } {
  return plugin.manifest.runtime === 'remote'
    ? runtimeGatewayConnectionLifecycleService.checkPluginHealth(pluginId)
    : { ok: plugin.connected };
}

function createPluginHealthSnapshot(
  plugin: RegisteredPluginRecord,
  ok: boolean,
): PluginHealthSnapshot {
  const checkedAt = new Date().toISOString();
  const status = readPluginHealthStatus(plugin, ok);

  return {
    consecutiveFailures: status === 'error' ? 1 : 0,
    failureCount: status === 'error' ? 1 : 0,
    lastCheckedAt: checkedAt,
    lastError: status === 'error' ? '插件健康检查失败' : null,
    lastErrorAt: status === 'error' ? checkedAt : null,
    lastSuccessAt: ok ? plugin.lastSeenAt : plugin.lastSeenAt,
    status,
  };
}

function readPluginHealthStatus(
  plugin: RegisteredPluginRecord,
  ok: boolean,
): PluginHealthStatus {
  if (!plugin.connected) {
    return 'offline';
  }
  if (plugin.status === 'error') {
    return 'error';
  }
  if (!ok) {
    return plugin.manifest.runtime === 'remote' ? 'offline' : 'error';
  }
  return 'healthy';
}
