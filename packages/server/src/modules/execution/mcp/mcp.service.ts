import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  EventLogListResult,
  EventLogQuery,
  JsonObject,
  JsonValue,
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
  PluginParamSchema,
  ToolInfo,
  ToolSourceActionResult,
  ToolSourceInfo,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMcpConnectionConnectedEvent, createMcpConnectionErrorEvent, createMcpGovernanceEvent, createMcpToolErrorEvent, type LogEventPayload } from '../../../core/logging/log-event-payloads';
import { RuntimeEventLogService } from '../../../core/logging/runtime-event-log.service';
import { createServerLogger } from '../../../core/logging/server-logger';
import { McpServerStoreService } from './mcp-server-store.service';
import { ToolManagementSettingsService } from '../tool/tool-management-settings.service';

type McpServerHealthStatus = 'healthy' | 'error' | 'unknown';
type McpServerStatus = { name: string; connected: boolean; enabled: boolean; health: McpServerHealthStatus; lastError: string | null; lastCheckedAt: string | null };
type McpToolDescriptor = { serverName: string; name: string; description?: string; inputSchema?: unknown };
type McpRecord = { status: McpServerStatus; tools: McpToolDescriptor[] };
type McpToolListResponse = { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> };
type McpToolCallResponse = { content?: unknown };
type McpClientSession = Pick<Client, 'callTool' | 'close'>;

const MCP_CONNECT_TIMEOUT = 15_000;
const MCP_TOOL_CALL_TIMEOUT = 10_000;
const MCP_MAX_RETRIES = 2;

@Injectable()
export class McpService implements OnModuleDestroy, OnModuleInit {
  readonly clients = new Map<string, McpClientSession>();
  readonly serverRecords = new Map<string, McpRecord>();
  private readonly logger: ReturnType<typeof createServerLogger>;

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpServerStoreService: McpServerStoreService,
    private readonly runtimeEventLogService: RuntimeEventLogService,
    private readonly toolManagementSettingsService: ToolManagementSettingsService,
  ) {
    this.logger = createServerLogger(McpService.name, this.runtimeEventLogService);
  }

  onModuleInit(): void {
    this.primeServerRecords(this.getSnapshot().servers);
    void this.reloadServersFromConfig().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`启动期 MCP 预热失败: ${message}`);
    });
  }
  async onModuleDestroy(): Promise<void> { await this.disconnectAllClients(); }
  getSnapshot(): McpConfigSnapshot { return this.mcpServerStoreService.getSnapshot(); }

  async reloadServersFromConfig(): Promise<void> {
    const snapshot = this.getSnapshot();
    const previousRecords = new Map(this.serverRecords);
    await this.disconnectAllClients();
    this.serverRecords.clear();
    for (const server of snapshot.servers) {
      await this.syncServerRecord(
        server.name,
        this.requireServerConfig(server.name),
        this.readSourceEnabled(server.name),
        previousRecords.get(server.name)?.tools ?? [],
      );
    }
  }

  async reloadServer(name: string): Promise<void> { const normalized = name.trim(); await this.syncServerRecord(normalized, this.requireServerConfig(normalized)); }
  async applyServerConfig(config: McpServerConfig, previousName?: string): Promise<void> {
    const previous = previousName?.trim();
    if (previous && previous !== config.name) {
      await this.removeServer(previous);
    }
    await this.syncServerRecord(config.name, this.requireServerConfig(config.name));
  }
  async saveServer(server: McpServerConfig, previousName?: string): Promise<McpServerConfig> {
    return this.mcpServerStoreService.saveServer(server, previousName);
  }
  async removeServer(name: string): Promise<void> {
    const normalized = name.trim();
    await this.disconnectServer(normalized);
    this.serverRecords.delete(normalized);
    this.toolManagementSettingsService.deleteSourceOverrides(`mcp:${normalized}`);
  }
  async deleteServer(name: string): Promise<McpServerDeleteResult> { return this.mcpServerStoreService.deleteServer(name); }
  async setServerEnabled(name: string, enabled: boolean): Promise<void> {
    const normalized = name.trim();
    this.toolManagementSettingsService.writeSourceEnabledOverride(`mcp:${normalized}`, enabled);
    await this.syncServerRecord(normalized, this.requireServerConfig(normalized), enabled);
  }
  async listServerEvents(name: string, query: EventLogQuery = {}): Promise<EventLogListResult> { this.requireServerConfig(name.trim()); return this.runtimeEventLogService.listLogs('mcp', name.trim(), query); }

  async runGovernanceAction(sourceId: string, action: 'health-check' | 'reconnect' | 'reload'): Promise<ToolSourceActionResult> {
    if (action === 'health-check') {return this.runHealthCheck(sourceId);}
    await this.reloadServer(sourceId);
    const message = `MCP source ${action}ed`;
    this.recordServerEvent(sourceId, createMcpGovernanceEvent(action, message));
    return { accepted: true, action, sourceId, sourceKind: 'mcp', message };
  }

  getToolingSnapshot(): { statuses: McpServerStatus[]; tools: McpToolDescriptor[] } {
    const statuses: McpServerStatus[] = [], tools: McpToolDescriptor[] = [];
    for (const { status, tools: descriptors } of this.serverRecords.values()) {
      statuses.push({ ...status });
      if (status.connected && status.enabled) {tools.push(...descriptors.map((tool) => ({ ...tool })));}
    }
    return { statuses, tools };
  }

  listToolSources(): Array<{ source: ToolSourceInfo; tools: ToolInfo[] }> {
    return [...this.serverRecords.values()].map(({ status, tools }) => {
      const toolInfos = tools.map((tool) => {
        const toolId = `mcp:${status.name}:${tool.name}`;
        const enabledByOverride = this.toolManagementSettingsService.readToolEnabledOverride(toolId) ?? true;
        return {
          toolId,
          name: tool.name,
          callName: `${status.name}__${tool.name}`,
          description: tool.description ?? tool.name,
          parameters: readMcpToolParameters(tool.inputSchema),
          enabled: status.connected && status.enabled && enabledByOverride,
          sourceKind: 'mcp' as const,
          sourceId: status.name,
          sourceLabel: status.name,
          health: status.health,
          lastError: status.lastError,
          lastCheckedAt: status.lastCheckedAt,
        } satisfies ToolInfo;
      });
      return {
        source: {
          kind: 'mcp',
          id: status.name,
          label: status.name,
          enabled: status.enabled,
          health: status.health,
          lastError: status.lastError,
          lastCheckedAt: status.lastCheckedAt,
          totalTools: toolInfos.length,
          enabledTools: toolInfos.filter((tool) => tool.enabled).length,
          supportedActions: ['health-check', 'reconnect', 'reload'],
        },
        tools: toolInfos,
      };
    });
  }

  async callTool(input: { arguments: object; serverName: string; toolName: string }): Promise<unknown> {
    const record = this.serverRecords.get(input.serverName);
    if (record && !record.status.enabled) {throw new Error(`MCP 服务器 "${input.serverName}" 已禁用`);}
    const client = this.clients.get(input.serverName);
    if (!client) {
      const message = `MCP 服务器 "${input.serverName}" 未连接`;
      this.updateServerStatus(input.serverName, { connected: false, health: 'error', lastCheckedAt: new Date().toISOString(), lastError: message });
      throw new Error(message);
    }
    try {
      const result = await this.callClientTool({ arguments: input.arguments as JsonObject, client, serverName: input.serverName, toolName: input.toolName });
      this.updateServerStatus(input.serverName, { connected: true, health: 'healthy', lastCheckedAt: new Date().toISOString(), lastError: null });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.closeClient(input.serverName);
      this.updateServerStatus(input.serverName, { connected: false, health: 'error', lastCheckedAt: new Date().toISOString(), lastError: message });
      this.recordServerEvent(input.serverName, createMcpToolErrorEvent(message, input.toolName));
      throw error;
    }
  }

  async connectMcpServer(name: string, config: McpServerConfig): Promise<void> {
    const lastCheckedAt = new Date().toISOString();
    const knownTools = this.serverRecords.get(name)?.tools ?? [];
    try {
      const connected = await this.connectClientSession({ name, config });
      this.clients.set(name, connected.client);
      this.serverRecords.set(name, createMcpRecord(name, { connected: true, health: 'healthy', lastCheckedAt }, connected.tools));
      this.recordServerEvent(name, createMcpConnectionConnectedEvent(name, connected.tools.length), config);
    } catch (error) {
      this.serverRecords.set(name, createMcpRecord(name, { health: 'error', lastCheckedAt, lastError: error instanceof Error ? error.message : String(error) }, knownTools));
      this.recordServerEvent(name, createMcpConnectionErrorEvent(error instanceof Error ? error.message : String(error)), config);
    }
  }

  async disconnectServer(name: string): Promise<void> {
    await this.closeClient(name);
    this.updateServerStatus(name, { connected: false, health: 'unknown', lastError: null });
  }

  async disconnectAllClients(): Promise<void> { for (const name of [...this.clients.keys()]) {await this.disconnectServer(name);} }

  private requireServerConfig(name: string): McpServerConfig { const server = this.mcpServerStoreService.getServer(name); if (!server) {throw new NotFoundException(`MCP server not found: ${name}`);} return server; }
  private primeServerRecords(servers: McpServerConfig[]): void {
    this.serverRecords.clear();
    for (const server of servers) {
      this.serverRecords.set(server.name, createMcpRecord(server.name, { enabled: this.readSourceEnabled(server.name) }, []));
    }
  }
  private async syncServerRecord(name: string, config: McpServerConfig, enabled = this.readSourceEnabled(name), knownTools = this.serverRecords.get(name)?.tools ?? []): Promise<void> {
    this.serverRecords.set(name, createMcpRecord(name, { enabled }, knownTools));
    await this.closeClient(name);
    this.updateServerStatus(name, { connected: false, health: 'unknown', lastError: null });
    if (enabled) {
      await this.connectMcpServer(name, config);
    }
  }
  private updateServerStatus(name: string, patch: Partial<McpServerStatus>): void { const record = this.serverRecords.get(name); if (record) {record.status = { ...record.status, ...patch };} }
  private readSourceEnabled(name: string): boolean {
    return this.toolManagementSettingsService.readSourceEnabledOverride(`mcp:${name}`) ?? true;
  }
  private async closeClient(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {try { await client.close(); } catch { void client; }}
    this.clients.delete(name);
  }

  private async connectClientSession(input: { name: string; config: McpServerConfig }): Promise<{ client: McpClientSession; tools: McpToolDescriptor[] }> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MCP_MAX_RETRIES; attempt += 1) {
      let client: Client | null = null;
      try {
        client = new Client({ name: `garlic-claw-${input.name}`, version: '0.1.0' }, { capabilities: {} });
        await withTimeout(client.connect(new StdioClientTransport(this.buildTransportConfig(input.config))), MCP_CONNECT_TIMEOUT, `连接 MCP 服务器 "${input.name}"`);
        const response = await withTimeout(client.listTools(), MCP_TOOL_CALL_TIMEOUT, `获取 MCP 服务器 "${input.name}" 工具列表`) as McpToolListResponse;
        return { client, tools: (response.tools ?? []).map((tool) => ({ serverName: input.name, name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (client) {
          try {
            await client.close();
          } catch {
            void client;
          }
        }
        if (attempt < MCP_MAX_RETRIES) {await new Promise((resolve) => setTimeout(resolve, attempt * 1000));}
      }
    }
    throw lastError ?? new Error(`MCP 服务器 "${input.name}" 连接失败`);
  }

  private async callClientTool(input: { arguments: JsonObject; client: McpClientSession; serverName: string; toolName: string }): Promise<JsonValue> {
    const result = await withTimeout(input.client.callTool({ name: input.toolName, arguments: input.arguments }), MCP_TOOL_CALL_TIMEOUT, `调用 MCP 工具 "${input.serverName}__${input.toolName}"`) as McpToolCallResponse;
    return (result.content ?? null) as JsonValue;
  }

  private buildTransportConfig(config: McpServerConfig): { command: string; args: string[]; env: Record<string, string> } {
    const runtimeConfig = this.resolveTransportConfig(config);
    return {
      command: process.execPath,
      args: [resolveMcpStdioLauncherPath(), runtimeConfig.command, ...runtimeConfig.args],
      env: Object.fromEntries([
        ...Object.entries(process.env).flatMap(([key, value]) => value === undefined ? [] : [[key, value]]),
        ...readTransportEnvEntries(runtimeConfig).map(([key, value]) => [key, resolveTransportEnvValue(key, value, this.configService)]),
      ]),
    };
  }

  private resolveTransportConfig(config: McpServerConfig): McpServerConfig {
    if (!config.envEntries?.some((entry) => entry.source === 'stored-secret' && entry.hasStoredValue && entry.value.trim().length === 0)) {
      return config;
    }
    return this.mcpServerStoreService.getServer(config.name) ?? config;
  }

  private async runHealthCheck(sourceId: string): Promise<ToolSourceActionResult> {
    const status = this.serverRecords.get(sourceId)?.status;
    if (!status) {throw new NotFoundException(`MCP source not found: ${sourceId}`);}
    const config = this.requireServerConfig(sourceId);
    const checkedAt = new Date().toISOString();
    try {
      const connected = await this.connectClientSession({ config, name: sourceId });
      if (status.enabled) {
        await this.closeClient(sourceId);
        this.clients.set(sourceId, connected.client);
        this.serverRecords.set(sourceId, createMcpRecord(sourceId, { connected: true, enabled: true, health: 'healthy', lastCheckedAt: checkedAt, lastError: null }, connected.tools));
      } else {
        try { await connected.client.close(); } catch { void connected; }
        this.serverRecords.set(sourceId, createMcpRecord(sourceId, { connected: false, enabled: false, health: 'healthy', lastCheckedAt: checkedAt, lastError: null }, connected.tools));
      }
      const message = 'MCP source health check passed';
      this.recordServerEvent(sourceId, createMcpGovernanceEvent('health-check', message, { toolCount: connected.tools.length }));
      return { accepted: true, action: 'health-check', sourceId, sourceKind: 'mcp', message };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateServerStatus(sourceId, { connected: false, health: 'error', lastCheckedAt: checkedAt, lastError: message });
      this.recordServerEvent(sourceId, createMcpGovernanceEvent('health-check', `MCP source health check failed: ${message}`, undefined, 'warn'));
      return { accepted: true, action: 'health-check', sourceId, sourceKind: 'mcp', message: `MCP source health check failed: ${message}` };
    }
  }

  private recordServerEvent(name: string, input: LogEventPayload, config?: McpServerConfig): void {
    this.logger[input.level](input.message, {
      console: false,
      event: {
        entityId: name,
        kind: 'mcp',
        metadata: input.metadata,
        settings: config?.eventLog ?? this.mcpServerStoreService.getServer(name)?.eventLog,
        type: input.type,
      },
    });
  }
}

function createMcpRecord(name: string, status: Partial<McpServerStatus>, tools: McpToolDescriptor[]): McpRecord {
  return { status: { name, connected: false, enabled: true, health: 'unknown', lastError: null, lastCheckedAt: null, ...status }, tools };
}

function readMcpToolParameters(schema: unknown): Record<string, PluginParamSchema> {
  if (!isMcpRecord(schema) || !isMcpRecord(schema.properties)) {return {};}
  const required = Array.isArray(schema.required) ? new Set(schema.required.filter((item): item is string => typeof item === 'string')) : new Set<string>();
  return Object.fromEntries(Object.entries(schema.properties).flatMap(([key, rawDefinition]) => !isMcpRecord(rawDefinition) ? [] : [[key, { type: rawDefinition.type === 'number' || rawDefinition.type === 'boolean' || rawDefinition.type === 'object' || rawDefinition.type === 'array' ? rawDefinition.type : 'string', ...(typeof rawDefinition.description === 'string' ? { description: rawDefinition.description } : {}), required: required.has(key) } satisfies PluginParamSchema]]));
}

function isMcpRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`操作超时: ${operation} (${timeoutMs}ms)`)), timeoutMs);
    timer.unref();
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error); });
  });
}

function resolveMcpStdioLauncherPath(): string {
  const directPath = path.join(__dirname, 'mcp-stdio-launcher.js');
  if (fs.existsSync(directPath)) {return directPath;}
  const distCandidates = [
    path.resolve(__dirname, '../../../../dist/src/modules/execution/mcp/mcp-stdio-launcher.js'),
    path.resolve(__dirname, '../../../../dist/src/execution/mcp/mcp-stdio-launcher.js'),
  ];
  const distPath = distCandidates.find((candidate) => fs.existsSync(candidate));
  return distPath ?? directPath;
}

function readTransportEnvEntries(config: McpServerConfig): Array<[string, string]> {
  if (Array.isArray(config.envEntries) && config.envEntries.length > 0) {
    return config.envEntries
      .map((entry): [string, string] => [entry.key, entry.value])
      .filter(([key]) => key.trim().length > 0);
  }
  return Object.entries(config.env ?? {});
}

function resolveTransportEnvValue(
  key: string,
  value: string,
  configService: ConfigService,
): string {
  const normalizedValue = value.trim();
  if (normalizedValue.startsWith('${') && normalizedValue.endsWith('}')) {
    return configService.get<string>(normalizedValue.slice(2, -1)) || '';
  }
  return normalizedValue;
}
