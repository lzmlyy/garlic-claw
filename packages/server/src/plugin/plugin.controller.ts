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
  async listPlugins() {
    const plugins = await this.pluginService.findAll();
    const connected = new Set(this.pluginGateway.getConnectedPlugins());
    return plugins.map((p) => ({
      ...p,
      capabilities: p.capabilities ? JSON.parse(p.capabilities) : [],
      connected: connected.has(p.name),
    }));
  }

  @Get('connected')
  getConnectedPlugins() {
    const caps = this.pluginGateway.getAllCapabilities();
    const result: { name: string; capabilities: unknown[] }[] = [];
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
