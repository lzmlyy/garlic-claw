import type { PluginActionName, PluginActionResult } from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BuiltinPluginLoader } from './builtin/builtin-plugin.loader';
import { PluginGateway } from './plugin.gateway';
import { PluginService } from './plugin.service';

/**
 * 插件治理动作服务。
 *
 * 输入:
 * - 插件 ID
 * - 治理动作名称
 *
 * 输出:
 * - 动作执行结果
 *
 * 预期行为:
 * - 统一分发 builtin / remote 的治理动作
 * - 动作语义保持统一，但具体实现按 runtime kind 映射
 * - 将动作结果回写到插件健康 / 事件日志
 */
@Injectable()
export class PluginAdminService {
  constructor(
    private readonly pluginService: PluginService,
    private readonly pluginGateway: PluginGateway,
    private readonly builtinLoader: BuiltinPluginLoader,
  ) {}

  /**
   * 执行一个插件治理动作。
   * @param pluginId 插件 ID
   * @param action 治理动作名称
   * @returns 动作执行结果
   */
  async runAction(
    pluginId: string,
    action: PluginActionName,
  ): Promise<PluginActionResult> {
    const plugin = await this.pluginService.findByName(pluginId);
    if (!plugin) {
      throw new NotFoundException(`Plugin not found: ${pluginId}`);
    }

    switch (action) {
      case 'reload':
        if (plugin.runtimeKind === 'builtin') {
          await this.builtinLoader.reloadPlugin(pluginId);
          await this.pluginService.recordPluginSuccess(pluginId, {
            type: 'governance:reload',
            message: '已重新装载内建插件',
          });
          return this.createAcceptedResult(
            pluginId,
            action,
            '已重新装载内建插件',
          );
        }

        await this.pluginGateway.disconnectPlugin(pluginId);
        await this.pluginService.recordPluginSuccess(pluginId, {
          type: 'governance:reload',
          message: '已触发远程插件重连',
        });
        return this.createAcceptedResult(pluginId, action, '已触发远程插件重连');

      case 'reconnect':
        if (plugin.runtimeKind !== 'remote') {
          throw new BadRequestException('只有远程插件支持 reconnect');
        }

        await this.pluginGateway.disconnectPlugin(pluginId);
        await this.pluginService.recordPluginSuccess(pluginId, {
          type: 'governance:reconnect',
          message: '已请求远程插件重连',
        });
        return this.createAcceptedResult(pluginId, action, '已请求远程插件重连');

      case 'health-check': {
        const result = plugin.runtimeKind === 'builtin'
          ? await this.builtinLoader.checkPluginHealth(pluginId)
          : await this.pluginGateway.checkPluginHealth(pluginId);
        const message = result.ok ? '插件健康检查通过' : '插件健康检查失败';
        await this.pluginService.recordHealthCheck(pluginId, {
          ok: result.ok,
          message,
        });
        return this.createAcceptedResult(pluginId, action, message);
      }

      default:
        throw new BadRequestException(`不支持的插件治理动作: ${action}`);
    }
  }

  /**
   * 构造统一动作结果。
   * @param pluginId 插件 ID
   * @param action 动作名
   * @param message 动作消息
   * @returns 标准化动作结果
   */
  private createAcceptedResult(
    pluginId: string,
    action: PluginActionName,
    message: string,
  ): PluginActionResult {
    return {
      accepted: true,
      action,
      pluginId,
      message,
    };
  }
}
