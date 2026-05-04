import type {
  EventLogListResult,
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
  McpServerEnvEntry,
} from '@garlic-claw/shared';
import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { McpService } from './mcp.service';
import { normalizeEventLogSettings } from '../../../core/logging/runtime-event-log.service';
import { readPluginEventQuery } from '../../../shared/http/http-request.codec';

interface McpEventQueryInput {
  limit?: string;
  level?: string;
  type?: string;
  keyword?: string;
  cursor?: string;
}

interface McpServerInput {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  envEntries?: Array<{
    key: string;
    value: string;
    source?: McpServerEnvEntry['source'];
    hasStoredValue?: boolean;
  }>;
  eventLog?: McpServerConfig['eventLog'];
}

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('servers')
  async listServers(): Promise<McpConfigSnapshot> {
    return this.mcpService.getSnapshot();
  }

  @Get('servers/:name/events')
  async listServerEvents(
    @Param('name') name: string,
    @Query() query?: McpEventQueryInput,
  ): Promise<EventLogListResult> {
    return this.mcpService.listServerEvents(name, readPluginEventQuery(query ?? {}));
  }

  @Post('servers')
  async createServer(@Body() dto: McpServerInput): Promise<McpServerConfig> {
    const normalizedServer = toMcpServerConfig(dto);
    const server = await this.mcpService.saveServer({
      ...normalizedServer,
      eventLog: normalizeEventLogSettings(normalizedServer.eventLog),
    });
    await this.mcpService.applyServerConfig(server);
    return server;
  }

  @Put('servers/:name')
  async updateServer(
    @Param('name') name: string,
    @Body() dto: McpServerInput,
  ): Promise<McpServerConfig> {
    const normalizedServer = toMcpServerConfig(dto);
    const server = await this.mcpService.saveServer({
      ...normalizedServer,
      eventLog: normalizeEventLogSettings(normalizedServer.eventLog),
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

function toMcpServerConfig(input: McpServerInput): McpServerConfig {
  const envEntries = normalizeEnvEntries(input.envEntries);
  const env = {
    ...(input.env ?? {}),
    ...Object.fromEntries(
      envEntries
        .filter((entry) => entry.source !== 'stored-secret')
        .map((entry) => [entry.key, entry.value]),
    ),
  };
  return {
    name: input.name,
    command: input.command,
    args: input.args,
    env,
    ...(envEntries.length > 0 ? { envEntries } : {}),
    eventLog: normalizeEventLogSettings(input.eventLog),
  };
}

function normalizeEnvEntries(
  envEntries: McpServerInput['envEntries'],
): McpServerEnvEntry[] {
  return (envEntries ?? [])
    .map((entry) => ({
      key: entry.key.trim(),
      source: entry.source ?? inferEnvSource(entry.value),
      value: entry.value.trim(),
      ...(entry.hasStoredValue ? { hasStoredValue: true } : {}),
    }))
    .filter((entry) => entry.key.length > 0);
}

function inferEnvSource(value: string): McpServerEnvEntry['source'] {
  const normalizedValue = value.trim();
  return normalizedValue.startsWith('${') && normalizedValue.endsWith('}')
    ? 'env-ref'
    : 'literal';
}
