import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpConfigSnapshot, JsonObject, JsonValue, McpServerConfig, McpServerDeleteResult, PluginParamSchema, ToolInfo, ToolSourceActionResult, ToolSourceInfo } from '@garlic-claw/shared';
import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { McpConfigStoreService } from './mcp-config-store.service';

type McpServerHealthStatus = 'healthy' | 'error' | 'unknown';
type McpServerStatus = { name: string; connected: boolean; enabled: boolean; health: McpServerHealthStatus; lastError: string | null; lastCheckedAt: string | null };
type McpServerRuntimeRecord = { status: McpServerStatus; tools: McpToolDescriptor[] };
type McpToolListResponse = { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>; };
type McpToolCallResponse = { content?: unknown; };
type McpToolDescriptor = { serverName: string; name: string; description?: string; inputSchema?: unknown };
type McpClientSession = Pick<Client, 'callTool' | 'close'>;

const MCP_CONNECT_TIMEOUT = 15000;
const MCP_TOOL_CALL_TIMEOUT = 10000;
const MCP_MAX_RETRIES = 2;

@Injectable()
export class McpService implements OnModuleDestroy, OnModuleInit {
  readonly clients = new Map<string, McpClientSession>();
  readonly serverRecords = new Map<string, McpServerRuntimeRecord>();

  constructor(private readonly configService: ConfigService, private readonly mcpConfigStoreService: McpConfigStoreService) {}

  async onModuleInit(): Promise<void> { await this.reloadServersFromConfig(); }

  async onModuleDestroy(): Promise<void> { await this.disconnectAllClients(); }

  getSnapshot(): McpConfigSnapshot { return this.mcpConfigStoreService.getSnapshot(); }

  async reloadServersFromConfig(): Promise<void> {
    await this.disconnectAllClients();
    this.serverRecords.clear();
    for (const server of this.getSnapshot().servers) {await this.syncServerRecord(server.name, server);}
  }

  async reloadServer(name: string): Promise<void> { const normalizedName = name.trim(); await this.syncServerRecord(normalizedName, await this.requireServerConfig(normalizedName)); }

  async applyServerConfig(config: McpServerConfig, previousName?: string): Promise<void> {
    const normalizedPreviousName = previousName?.trim();
    if (normalizedPreviousName && normalizedPreviousName !== config.name) {await this.removeServer(normalizedPreviousName);}
    await this.syncServerRecord(config.name, config);
  }

  async saveServer(server: McpServerConfig, previousName?: string): Promise<McpServerConfig> { return this.mcpConfigStoreService.saveServer(server, previousName); }

  async removeServer(name: string): Promise<void> {
    const normalizedName = name.trim();
    await this.disconnectServer(normalizedName);
    this.serverRecords.delete(normalizedName);
  }

  async deleteServer(name: string): Promise<McpServerDeleteResult> { return this.mcpConfigStoreService.deleteServer(name); }

  async setServerEnabled(name: string, enabled: boolean): Promise<void> { const normalizedName = name.trim(); await this.syncServerRecord(normalizedName, await this.requireServerConfig(normalizedName), enabled); }

  async runGovernanceAction(sourceId: string, action: 'health-check' | 'reconnect' | 'reload'): Promise<ToolSourceActionResult> {
    if (action !== 'health-check') {
      await this.reloadServer(sourceId);
      return { accepted: true, action, sourceKind: 'mcp', sourceId, message: `MCP source ${action}ed` };
    }
    const status = this.serverRecords.get(sourceId)?.status;
    if (!status) {throw new NotFoundException(`MCP source not found: ${sourceId}`);}
    return { accepted: true, action, sourceKind: 'mcp', sourceId, message: status.connected && status.health === 'healthy' ? 'MCP source health check passed' : status.lastError ? `MCP source health check failed: ${status.lastError}` : 'MCP source health check failed' };
  }

  getToolingSnapshot(): { statuses: McpServerStatus[]; tools: McpToolDescriptor[] } { const statuses: McpServerStatus[] = []; const tools: McpToolDescriptor[] = []; for (const record of this.serverRecords.values()) { statuses.push({ ...record.status }); if (!record.status.connected || !record.status.enabled) {continue;} tools.push(...record.tools.map((tool) => ({ ...tool }))); } return { statuses, tools }; }

  listToolSources(): Array<{ source: ToolSourceInfo; tools: ToolInfo[] }> { return [...this.serverRecords.values()].map(({ status, tools: descriptors }) => { const tools = (status.connected && status.enabled ? descriptors : []).map((tool) => createMcpToolInfo(status, tool)); return { source: createMcpToolSourceInfo(status, tools.length), tools }; }); }

  async callTool(input: { arguments: object; serverName: string; toolName: string }): Promise<unknown> {
    const record = this.serverRecords.get(input.serverName);
    if (record && !record.status.enabled) {throw new Error(`MCP 服务器 "${input.serverName}" 已禁用`);}
    const client = this.clients.get(input.serverName);
    if (!client) {
      const message = `MCP 服务器 "${input.serverName}" 未连接`;
      this.updateServerStatus(input.serverName, { connected: false, health: 'error', lastError: message });
      throw new Error(message);
    }
    try {
      const result = await this.callClientTool({ client, serverName: input.serverName, toolName: input.toolName, arguments: input.arguments as JsonObject });
      this.updateServerStatus(input.serverName, { connected: true, health: 'healthy', lastError: null });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateServerStatus(input.serverName, { connected: false, health: 'error', lastError: errorMessage });
      throw error;
    }
  }

  async connectMcpServer(name: string, config: McpServerConfig): Promise<void> {
    const lastCheckedAt = new Date().toISOString();
    try {
      const connected = await this.connectClientSession({ name, config });
      this.clients.set(name, connected.client);
      this.serverRecords.set(name, createServerRuntimeRecord(name, { connected: true, health: 'healthy', lastCheckedAt }, connected.tools));
    } catch (error) {
      this.serverRecords.set(name, createServerRuntimeRecord(name, { health: 'error', lastError: error instanceof Error ? error.message : String(error), lastCheckedAt }, []));
    }
  }

  async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {await this.closeClient(client);}
    this.clients.delete(name);
    this.updateServerStatus(name, { connected: false, health: 'unknown', lastError: null });
  }

  async disconnectAllClients(): Promise<void> { for (const name of [...this.clients.keys()]) {await this.disconnectServer(name);} }

  private async requireServerConfig(name: string): Promise<McpServerConfig> { const server = await this.mcpConfigStoreService.getServer(name); if (!server) {throw new NotFoundException(`MCP server not found: ${name}`);} return server; }

  private async syncServerRecord(name: string, config: McpServerConfig, enabled = true): Promise<void> {
    this.serverRecords.set(name, createServerRuntimeRecord(name, { enabled }, []));
    await this.disconnectServer(name);
    if (enabled) {await this.connectMcpServer(name, config);}
  }

  private updateServerStatus(name: string, patch: Partial<McpServerStatus>): void { const record = this.serverRecords.get(name); if (!record) {return;} record.status = { ...record.status, ...patch }; }

  private async connectClientSession(input: { name: string; config: McpServerConfig }): Promise<{ client: McpClientSession; tools: McpToolDescriptor[] }> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MCP_MAX_RETRIES; attempt++) {
      try {
        const client = new Client({ name: `garlic-claw-${input.name}`, version: '0.1.0' }, { capabilities: {} });
        await withTimeout(client.connect(new StdioClientTransport(this.buildTransportConfig(input.config))), MCP_CONNECT_TIMEOUT, `连接 MCP 服务器 "${input.name}"`);
        const toolsResponse = await withTimeout(client.listTools(), MCP_TOOL_CALL_TIMEOUT, `获取 MCP 服务器 "${input.name}" 工具列表`) as McpToolListResponse;
        return { client, tools: (toolsResponse.tools ?? []).map((tool): McpToolDescriptor => ({ serverName: input.name, name: tool.name, description: tool.description, inputSchema: tool.inputSchema })) };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MCP_MAX_RETRIES) {await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));}
      }
    }
    throw lastError ?? new Error(`MCP 服务器 "${input.name}" 连接失败`);
  }

  private async callClientTool(input: { client: McpClientSession; serverName: string; toolName: string; arguments: JsonObject }): Promise<JsonValue> {
    const result = await withTimeout(input.client.callTool({ name: input.toolName, arguments: input.arguments }), MCP_TOOL_CALL_TIMEOUT, `调用 MCP 工具 "${input.serverName}__${input.toolName}"`) as McpToolCallResponse;
    return (result.content ?? null) as JsonValue;
  }

  private async closeClient(client: McpClientSession): Promise<void> { try { await client.close(); } catch { /* ignore close cleanup errors */ } }

  private buildTransportConfig(config: McpServerConfig): { command: string; args: string[]; env: Record<string, string> } {
    return {
      command: process.execPath,
      args: [resolveMcpStdioLauncherPath(), config.command, ...config.args],
      env: this.buildTransportEnv(config),
    };
  }

  private buildTransportEnv(config: McpServerConfig): Record<string, string> {
    const transportEnv = Object.fromEntries(Object.entries(process.env).flatMap(([key, value]) => value !== undefined ? [[key, value]] : [])) as Record<string, string>;
    for (const [key, value] of Object.entries(config.env ?? {})) {
      transportEnv[key] = typeof value === 'string' && value.startsWith('${') && value.endsWith('}') ? this.configService.get<string>(value.slice(2, -1)) || '' : value;
    }
    return transportEnv;
  }
}

function createServerRuntimeRecord(name: string, status: Partial<McpServerStatus>, tools: McpToolDescriptor[]): McpServerRuntimeRecord {
  return { status: { name, connected: false, enabled: true, health: 'unknown', lastError: null, lastCheckedAt: null, ...status }, tools };
}

function createMcpToolInfo(status: McpServerStatus, tool: McpToolDescriptor): ToolInfo { return { toolId: `mcp:${status.name}:${tool.name}`, name: tool.name, callName: `${status.name}__${tool.name}`, description: tool.description ?? tool.name, parameters: readMcpToolParameters(tool.inputSchema), enabled: status.enabled, sourceKind: 'mcp', sourceId: status.name, sourceLabel: status.name, health: status.health, lastError: status.lastError, lastCheckedAt: status.lastCheckedAt }; }

function createMcpToolSourceInfo(status: McpServerStatus, totalTools: number): ToolSourceInfo { return { kind: 'mcp', id: status.name, label: status.name, enabled: status.enabled, health: status.health, lastError: status.lastError, lastCheckedAt: status.lastCheckedAt, totalTools, enabledTools: status.enabled ? totalTools : 0, supportedActions: ['health-check', 'reconnect', 'reload'] }; }

function readMcpToolParameters(schema: unknown): Record<string, PluginParamSchema> {
  if (!isRecord(schema) || !isRecord(schema.properties)) {return {};}
  const required = Array.isArray(schema.required) ? new Set(schema.required.filter((item): item is string => typeof item === 'string')) : new Set<string>();
  return Object.fromEntries(
    Object.entries(schema.properties).flatMap(([key, rawDefinition]) =>
      !isRecord(rawDefinition)
        ? []
        : [[key, {
            type:
              rawDefinition.type === 'number'
              || rawDefinition.type === 'boolean'
              || rawDefinition.type === 'object'
              || rawDefinition.type === 'array'
                ? rawDefinition.type
                : 'string',
            ...(typeof rawDefinition.description === 'string' ? { description: rawDefinition.description } : {}),
            required: required.has(key),
          } satisfies PluginParamSchema]],
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`操作超时: ${operation} (${timeoutMs}ms)`));
    }, timeoutMs);
    timer.unref();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function resolveMcpStdioLauncherPath(): string {
  const directPath = path.join(__dirname, 'mcp-stdio-launcher.js');
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const distPath = path.resolve(__dirname, '../../../dist/src/execution/mcp/mcp-stdio-launcher.js');
  if (fs.existsSync(distPath)) {
    return distPath;
  }

  return directPath;
}
