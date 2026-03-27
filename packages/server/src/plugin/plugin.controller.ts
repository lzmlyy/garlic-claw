import type { PluginCapability, PluginInfo } from '@garlic-claw/shared';
import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PluginGateway } from './plugin.gateway';
import { PluginService } from './plugin.service';

@ApiTags('Plugins')
@ApiBearerAuth()
@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginController {
  constructor(
    private pluginService: PluginService,
    private pluginGateway: PluginGateway,
  ) {}

  @Get()
  async listPlugins(): Promise<PluginInfo[]> {
    const plugins = await this.pluginService.findAll();
    const connected = new Set(this.pluginGateway.getConnectedPlugins());
    return plugins.map((p) => ({
      ...p,
      // 将数据库中的 JSON / Date 字段收敛为前端公共契约所需的 API 形状。
      capabilities: p.capabilities ? (JSON.parse(p.capabilities) as PluginCapability[]) : [],
      connected: connected.has(p.name),
      lastSeenAt: p.lastSeenAt ? p.lastSeenAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  @Get('connected')
  getConnectedPlugins() {
    const caps = this.pluginGateway.getAllCapabilities();
    const result: { name: string; capabilities: PluginCapability[] }[] = [];
    for (const [name, capabilities] of caps) {
      result.push({ name, capabilities });
    }
    return result;
  }

  @Delete(':name')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  deletePlugin(@Param('name') name: string) {
    return this.pluginService.deletePlugin(name);
  }
}
