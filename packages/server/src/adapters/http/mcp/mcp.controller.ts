import type { McpConfigSnapshot, McpServerConfig, McpServerDeleteResult } from '@garlic-claw/shared';
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { McpService } from '../../../execution/mcp/mcp.service';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('servers')
  async listServers(): Promise<McpConfigSnapshot> {
    return this.mcpService.getSnapshot();
  }

  @Post('servers')
  async createServer(@Body() dto: {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    envEntries?: Array<{ key: string; value: string }>;
  }): Promise<McpServerConfig> {
    const server = await this.mcpService.saveServer({
      ...dto,
      env: {
        ...(dto.env ?? {}),
        ...Object.fromEntries((dto.envEntries ?? []).map((entry) => [entry.key, entry.value])),
      },
    });
    await this.mcpService.applyServerConfig(server);
    return server;
  }

  @Put('servers/:name')
  async updateServer(
    @Param('name') name: string,
    @Body() dto: {
      name: string;
      command: string;
      args: string[];
      env?: Record<string, string>;
      envEntries?: Array<{ key: string; value: string }>;
    },
  ): Promise<McpServerConfig> {
    const server = await this.mcpService.saveServer({
      ...dto,
      env: {
        ...(dto.env ?? {}),
        ...Object.fromEntries((dto.envEntries ?? []).map((entry) => [entry.key, entry.value])),
      },
    }, name);
    await this.mcpService.applyServerConfig(server, name);
    return server;
  }

  @Delete('servers/:name')
  async deleteServer(@Param('name') name: string): Promise<McpServerDeleteResult> {
    const deleted = await this.mcpService.deleteServer(name);
    await this.mcpService.removeServer(name);
    return deleted;
  }
}
