import type {
  PluginActionName,
  ToolSourceActionResult,
  ToolSourceInfo,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { McpService } from '../mcp/mcp.service';
import { PluginAdminService } from '../plugin/plugin-admin.service';
import type { ToolSourceKind } from './tool.types';
import { ToolRegistryService } from './tool-registry.service';

@Injectable()
export class ToolAdminService {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly pluginAdmin: PluginAdminService,
    private readonly mcpService: McpService,
  ) {}

  async runSourceAction(
    kind: ToolSourceKind,
    sourceId: string,
    action: PluginActionName,
  ): Promise<ToolSourceActionResult> {
    const source = await this.findSource(kind, sourceId);
    const supportedActions = source.supportedActions ?? [];
    if (!supportedActions.includes(action)) {
      throw new BadRequestException(
        `工具源 ${kind}:${sourceId} 不支持治理动作 ${action}`,
      );
    }

    if (kind === 'plugin') {
      const result = await this.pluginAdmin.runAction(sourceId, action);
      return {
        accepted: result.accepted,
        action: result.action,
        sourceKind: 'plugin',
        sourceId,
        message: result.message,
      };
    }

    return this.runMcpSourceAction(sourceId, action);
  }

  private async findSource(
    kind: ToolSourceKind,
    sourceId: string,
  ): Promise<ToolSourceInfo> {
    const source = (await this.toolRegistry.listSources()).find((entry) =>
      entry.kind === kind && entry.id === sourceId);
    if (!source) {
      throw new NotFoundException(`Tool source not found: ${kind}:${sourceId}`);
    }

    return source;
  }

  private async runMcpSourceAction(
    sourceId: string,
    action: PluginActionName,
  ): Promise<ToolSourceActionResult> {
    if (action === 'reload') {
      await this.mcpService.reloadServer(sourceId);
      return {
        accepted: true,
        action,
        sourceKind: 'mcp',
        sourceId,
        message: 'MCP source reloaded',
      };
    }

    if (action === 'reconnect') {
      await this.mcpService.reconnectServer(sourceId);
      return {
        accepted: true,
        action,
        sourceKind: 'mcp',
        sourceId,
        message: 'MCP source reconnected',
      };
    }

    if (action !== 'health-check') {
      throw new BadRequestException(`MCP source does not support action: ${action}`);
    }

    const status = this.mcpService.listServerStatuses().find((entry) => entry.name === sourceId);
    if (!status) {
      throw new NotFoundException(`MCP source not found: ${sourceId}`);
    }

    const message = status.connected && status.health === 'healthy'
      ? 'MCP source health check passed'
      : status.lastError
        ? `MCP source health check failed: ${status.lastError}`
        : 'MCP source health check failed';

    return {
      accepted: true,
      action,
      sourceKind: 'mcp',
      sourceId,
      message,
    };
  }
}
