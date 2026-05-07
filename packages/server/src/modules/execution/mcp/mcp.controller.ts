import type {
  EventLogListResult,
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
  McpServerEnvEntry,
} from '@garlic-claw/shared';
import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { McpService } from './mcp.service';
import { normalizeEventLogSettings } from '../../../core/logging/runtime-event-log.service';
import { readPluginEventQuery } from '../../../shared/http/http-request.codec';
import { JwtAuthGuard } from '../../auth/http-auth';
import { McpEventQueryDto, McpServerDto } from './dto/mcp-server.dto';

@Controller('mcp')
@UseGuards(JwtAuthGuard)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get('servers')
  async listServers(): Promise<McpConfigSnapshot> {
    return this.mcpService.getSnapshot();
  }

  @Get('servers/:name/events')
  async listServerEvents(
    @Param('name') name: string,
    @Query() query?: McpEventQueryDto,
  ): Promise<EventLogListResult> {
    return this.mcpService.listServerEvents(name, readPluginEventQuery(query ?? {}));
  }

  @Post('servers')
  async createServer(@Body() dto: McpServerDto): Promise<McpServerConfig> {
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
    @Body() dto: McpServerDto,
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

function toMcpServerConfig(input: McpServerDto): McpServerConfig {
  const envEntries = normalizeEnvEntries(input.envEntries);
  const env = {
    ...normalizeEnvMap(input.env),
    ...Object.fromEntries(
      envEntries
        .filter((entry) => entry.source !== 'stored-secret')
        .map((entry) => [entry.key, entry.value]),
    ),
  };
  return {
    name: input.name.trim(),
    command: input.command.trim(),
    args: input.args,
    env,
    ...(envEntries.length > 0 ? { envEntries } : {}),
    eventLog: normalizeMcpEventLog(input.eventLog),
  };
}

function normalizeEnvEntries(
  envEntries: McpServerDto['envEntries'],
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

function normalizeEnvMap(env: McpServerDto['env']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key]) => key.length > 0),
  );
}

function normalizeMcpEventLog(eventLog: McpServerDto['eventLog']): McpServerConfig['eventLog'] {
  return normalizeEventLogSettings(
    typeof eventLog?.maxFileSizeMb === 'number'
      ? { maxFileSizeMb: eventLog.maxFileSizeMb }
      : undefined,
  );
}

function inferEnvSource(value: string): McpServerEnvEntry['source'] {
  const normalizedValue = value.trim();
  return normalizedValue.startsWith('${') && normalizedValue.endsWith('}')
    ? 'env-ref'
    : 'literal';
}
