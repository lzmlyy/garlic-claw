import type {
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
} from '@garlic-claw/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpsertMcpServerDto } from './dto/upsert-mcp-server.dto';
import { McpConfigService } from './mcp-config.service';
import { McpService } from './mcp.service';

@ApiTags('MCP')
@ApiBearerAuth()
@Controller('mcp')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class McpController {
  constructor(
    private readonly mcpConfig: McpConfigService,
    private readonly mcpService: McpService,
  ) {}

  @Get('servers')
  listServers(): Promise<McpConfigSnapshot> {
    return this.mcpConfig.getSnapshot();
  }

  @Post('servers')
  async createServer(@Body() dto: UpsertMcpServerDto): Promise<McpServerConfig> {
    const saved = await this.mcpConfig.saveServer(toServerConfig(dto));
    await this.mcpService.reloadServersFromConfig();
    return saved;
  }

  @Put('servers/:name')
  async updateServer(
    @Param('name') name: string,
    @Body() dto: UpsertMcpServerDto,
  ): Promise<McpServerConfig> {
    const saved = await this.mcpConfig.saveServer(toServerConfig(dto), name);
    await this.mcpService.reloadServersFromConfig();
    return saved;
  }

  @Delete('servers/:name')
  async deleteServer(@Param('name') name: string): Promise<McpServerDeleteResult> {
    const result = await this.mcpConfig.deleteServer(name);
    await this.mcpService.reloadServersFromConfig();
    return result;
  }
}

function toServerConfig(dto: UpsertMcpServerDto): McpServerConfig {
  const envFromEntries = Object.fromEntries(
    (dto.envEntries ?? []).map((entry) => [entry.key, entry.value]),
  );

  return {
    name: dto.name,
    command: dto.command,
    args: dto.args,
    env: {
      ...(dto.env ?? {}),
      ...envFromEntries,
    },
  };
}
