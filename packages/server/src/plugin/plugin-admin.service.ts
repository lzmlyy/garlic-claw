import type { PluginActionName, PluginActionResult } from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PluginRuntimeService } from './plugin-runtime.service';
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
    private readonly pluginRuntime: PluginRuntimeService,
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

    const supportedActions = this.pluginRuntime.listSupportedActions(pluginId);
    if (!supportedActions.includes(action)) {
      throw new BadRequestException(
        `插件 ${pluginId} 不支持治理动作 ${action}`,
      );
    }

    switch (action) {
      case 'reload':
        await this.pluginRuntime.runPluginAction({
          pluginId,
          action: 'reload',
        });
        if (plugin.runtimeKind === 'builtin') {
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

        await this.pluginService.recordPluginSuccess(pluginId, {
          type: 'governance:reload',
          message: '已触发远程插件重连',
        });
        return this.createAcceptedResult(pluginId, action, '已触发远程插件重连');

      case 'reconnect':
        await this.pluginRuntime.runPluginAction({
          pluginId,
          action: 'reconnect',
        });
        await this.pluginService.recordPluginSuccess(pluginId, {
          type: 'governance:reconnect',
          message: '已请求远程插件重连',
        });
        return this.createAcceptedResult(pluginId, action, '已请求远程插件重连');

      case 'health-check': {
        const result = await this.pluginRuntime.checkPluginHealth(pluginId);
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
