import type { PluginActionName, PluginActionResult } from '@garlic-claw/shared';
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

  checkPluginHealth(pluginId: string): { ok: boolean } {
    const plugin = this.pluginBootstrapService.getPlugin(pluginId);
    return plugin.manifest.runtime === 'remote'
      ? this.runtimeGatewayConnectionLifecycleService.checkPluginHealth(pluginId)
      : { ok: plugin.connected };
  }

  listPlugins(): RegisteredPluginRecord[] {
    return this.pluginBootstrapService
      .listPlugins()
      .sort((left, right) => left.pluginId.localeCompare(right.pluginId));
  }

  listConnectedPlugins(): RegisteredPluginRecord[] {
    return this.listPlugins().filter((plugin) => plugin.connected);
  }

  listSupportedActions(pluginId: string): PluginActionName[] {
    const plugin = this.pluginBootstrapService.getPlugin(pluginId);
    return [...(plugin.manifest.runtime === 'builtin' ? BUILTIN_PLUGIN_ACTIONS : REMOTE_PLUGIN_ACTIONS)];
  }

  async runPluginAction(input: { action: PluginActionName; pluginId: string }): Promise<PluginActionResult> {
    const plugin = this.pluginBootstrapService.getPlugin(input.pluginId);
    switch (input.action) {
      case 'health-check': {
        const health = plugin.manifest.runtime === 'remote'
          ? await this.runtimeGatewayConnectionLifecycleService.probePluginHealth(input.pluginId)
          : this.checkPluginHealth(input.pluginId);
        return createAcceptedPluginActionResult(
          input.pluginId,
          input.action,
          health.ok ? '插件健康检查通过' : '插件健康检查失败',
        );
      }
      case 'reload':
        if (plugin.manifest.runtime === 'builtin') {
          this.pluginBootstrapService.reloadBuiltin(input.pluginId);
          return createAcceptedPluginActionResult(input.pluginId, input.action, '已重新装载内建插件');
        }
        if (plugin.manifest.runtime !== 'remote') {
          throw new BadRequestException(`Plugin ${input.pluginId} does not support action ${input.action}`);
        }
        this.runtimeGatewayConnectionLifecycleService.disconnectPlugin(input.pluginId);
        return createAcceptedPluginActionResult(
          input.pluginId,
          input.action,
          REMOTE_PLUGIN_ACTION_MESSAGES[input.action],
        );
      case 'reconnect':
        if (plugin.manifest.runtime !== 'remote') {
          throw new BadRequestException(`Plugin ${input.pluginId} does not support action reconnect`);
        }
        this.runtimeGatewayConnectionLifecycleService.disconnectPlugin(input.pluginId);
        return createAcceptedPluginActionResult(
          input.pluginId,
          input.action,
          REMOTE_PLUGIN_ACTION_MESSAGES.reconnect,
        );
      default:
        throw new BadRequestException(`Unsupported plugin action: ${input.action}`);
    }
  }
}

function createAcceptedPluginActionResult(
  pluginId: string,
  action: PluginActionName,
  message: string,
): PluginActionResult {
  return { accepted: true, action, pluginId, message };
}
