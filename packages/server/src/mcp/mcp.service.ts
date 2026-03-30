import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs/promises';
import type { McpServerConfig } from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { McpConfigService } from './mcp-config.service';
import { resolveCityCoordinatesFilePath } from './mcp-path.util';

interface McpToolListResponse {
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
}

interface McpToolCallResponse {
  content?: unknown;
}

interface McpToolingSnapshot {
  statuses: McpServerStatus[];
  tools: McpToolDescriptor[];
}

export type McpServerHealthStatus = 'healthy' | 'error' | 'unknown';

export interface McpServerStatus {
  name: string;
  connected: boolean;
  enabled: boolean;
  health: McpServerHealthStatus;
  lastError: string | null;
  lastCheckedAt: string | null;
}

export interface McpToolDescriptor {
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface McpServerRuntimeRecord {
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpToolDescriptor[];
}

interface CityCoordinate {
  name: string;
  nameZh: string;
  lat: number;
  lon: number;
  country: string;
  state: string;
}

interface CityCoordinatesConfig {
  description: string;
  cities: Record<string, CityCoordinate>;
}

// 超时和重试配置
const MCP_CONNECT_TIMEOUT = 15000; // 连接超时 15 秒
const MCP_TOOL_CALL_TIMEOUT = 10000; // 工具调用超时 10 秒
const MCP_MAX_RETRIES = 2; // 最大重试次数

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private clients = new Map<string, Client>();
  private serverRecords = new Map<string, McpServerRuntimeRecord>();
  private cityCoordinates = new Map<string, CityCoordinate>();
  private cityCoordinatesLoaded = false;
  private startupWarmupPromise: Promise<void> | null = null;

  constructor(
    private configService: ConfigService,
    private readonly mcpConfig: McpConfigService,
  ) {}

  async warmupOnStartup(): Promise<void> {
    if (!this.startupWarmupPromise) {
      this.startupWarmupPromise = Promise.allSettled([
        this.reloadServersFromConfig(),
        this.loadCityCoordinates(),
      ]).then(() => undefined);
    }

    return this.startupWarmupPromise;
  }

  /**
   * 创建带超时的 Promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`操作超时: ${operation} (${timeoutMs}ms)`)), timeoutMs)
      ),
    ]);
  }

  async reloadServersFromConfig(): Promise<void> {
    try {
      await this.disconnectAllClients();
      this.serverRecords.clear();

      const snapshot = await this.mcpConfig.getSnapshot();
      for (const server of snapshot.servers) {
        this.setInitialServerRecord(server);
        await this.connectMcpServer(server.name, server);
      }
    } catch (error) {
      this.logger.warn('加载 MCP 服务器配置失败', error);
    }
  }

  async reloadServer(name: string): Promise<void> {
    const config = await this.mcpConfig.getServer(name);
    if (!config) {
      throw new Error(`MCP server not found: ${name}`);
    }

    await this.disconnectServer(name);
    this.setInitialServerRecord(config);
    await this.connectMcpServer(config.name, config);
  }

  async reconnectServer(name: string): Promise<void> {
    await this.reloadServer(name);
  }

  /**
   * 加载城市坐标预配置
   */
  private async loadCityCoordinates() {
    try {
      const cityCoordsPath = resolveCityCoordinatesFilePath();

      try {
        await fs.access(cityCoordsPath);
      } catch {
        return;
      }

      try {
        const configContent = await fs.readFile(cityCoordsPath, 'utf-8');
        const config: CityCoordinatesConfig = JSON.parse(configContent);

        for (const [cityName, coordinate] of Object.entries(config.cities)) {
          // 使用中文名和英文名都作为键
          this.cityCoordinates.set(cityName.toLowerCase(), coordinate);
          this.cityCoordinates.set(coordinate.nameZh.toLowerCase(), coordinate);
        }

        this.cityCoordinatesLoaded = true;
        this.logger.log(`成功加载 ${this.cityCoordinates.size} 个城市坐标`);
      } catch (fileError) {
        this.logger.warn(`城市坐标配置文件读取失败: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
      }
    } catch (error) {
      this.logger.warn('加载城市坐标失败', error);
    }
  }

  private async connectMcpServer(name: string, config: McpServerConfig) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MCP_MAX_RETRIES; attempt++) {
      try {
        this.logger.log(`尝试连接 MCP 服务器 "${name}" (第 ${attempt}/${MCP_MAX_RETRIES} 次)`);

        // 替换环境变量
        const env: Record<string, string> = config.env ?? {};
        const resolvedEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(env)) {
          if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
            const envVar = value.slice(2, -1);
            resolvedEnv[key] = this.configService.get<string>(envVar) || '';
          } else {
            resolvedEnv[key] = value;
          }
        }

        // 创建传输层
        const transportEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined) {
            transportEnv[key] = value;
          }
        }
        Object.assign(transportEnv, resolvedEnv);

        // 创建传输层
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: transportEnv,
        });

        // 创建客户端
        const client = new Client({
          name: `garlic-claw-${name}`,
          version: '0.1.0',
        }, {
          capabilities: {},
        });

        // 使用带超时的连接
        await this.withTimeout(
          client.connect(transport),
          MCP_CONNECT_TIMEOUT,
          `连接 MCP 服务器 "${name}"`
        );

        const toolsResponse = await this.withTimeout(
          client.listTools(),
          MCP_TOOL_CALL_TIMEOUT,
          `获取 MCP 服务器 "${name}" 工具列表`
        ) as McpToolListResponse;

        this.clients.set(name, client);
        this.serverRecords.set(name, {
          config,
          status: {
            name,
            connected: true,
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: new Date().toISOString(),
          },
          tools: (toolsResponse.tools ?? []).map((tool) => ({
            serverName: name,
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });
        this.logger.log(`MCP 服务器 "${name}" 连接成功`);
        return; // 成功则退出
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `MCP 服务器 "${name}" 连接失败 (第 ${attempt}/${MCP_MAX_RETRIES} 次): ${lastError.message}`
        );

        if (attempt < MCP_MAX_RETRIES) {
          // 等待一段时间后重试
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // 所有重试都失败
    this.logger.error(
      `MCP 服务器 "${name}" 连接失败，已重试 ${MCP_MAX_RETRIES} 次`,
      lastError
    );
    this.serverRecords.set(name, {
      config,
      status: {
        name,
        connected: false,
        enabled: true,
        health: 'error',
        lastError: lastError?.message ?? '连接失败',
        lastCheckedAt: new Date().toISOString(),
      },
      tools: [],
    });
  }

  listServerStatuses(): McpServerStatus[] {
    return this.getToolingSnapshot().statuses;
  }

  async listToolDescriptors(): Promise<McpToolDescriptor[]> {
    return this.getToolingSnapshot().tools;
  }

  getToolingSnapshot(): McpToolingSnapshot {
    const statuses: McpServerStatus[] = [];
    const tools: McpToolDescriptor[] = [];

    for (const record of this.serverRecords.values()) {
      statuses.push({
        ...record.status,
      });

      if (!record.status.connected) {
        continue;
      }

      for (const tool of record.tools) {
        tools.push({
          ...tool,
        });
      }
    }

    return {
      statuses,
      tools,
    };
  }

  async callTool(input: {
    serverName: string;
    toolName: string;
    arguments: JsonObject;
  }): Promise<JsonValue> {
    const client = this.clients.get(input.serverName);
    if (!client) {
      this.updateServerStatus(input.serverName, {
        connected: false,
        health: 'error',
        lastError: `MCP 服务器 "${input.serverName}" 未连接`,
      });
      throw new Error(`MCP 服务器 "${input.serverName}" 未连接`);
    }

    try {
      const result = await this.withTimeout(
        client.callTool({
          name: input.toolName,
          arguments: input.arguments,
        }),
        MCP_TOOL_CALL_TIMEOUT,
        `调用 MCP 工具 "${input.serverName}__${input.toolName}"`
      ) as McpToolCallResponse;
      this.updateServerStatus(input.serverName, {
        connected: true,
        health: 'healthy',
        lastError: null,
      });
      return (result.content ?? null) as JsonValue;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`调用 MCP 工具 "${input.serverName}__${input.toolName}" 失败: ${errorMessage}`);
      this.updateServerStatus(input.serverName, {
        connected: true,
        health: 'error',
        lastError: errorMessage,
      });
      throw error;
    }
  }

  /**
   * 获取城市坐标
   * @param cityName 城市名称（支持中英文）
   * @returns 城市坐标，如果未找到则返回 null
   */
  getCityCoordinates(cityName: string): CityCoordinate | null {
    if (!this.cityCoordinatesLoaded) {
      this.logger.warn('城市坐标尚未加载');
      return null;
    }

    const normalizedCityName = cityName.toLowerCase().trim();
    return this.cityCoordinates.get(normalizedCityName) || null;
  }

  /**
   * 批量获取城市坐标
   * @param cityNames 城市名称数组
   * @returns 城市坐标映射
   */
  getMultipleCityCoordinates(cityNames: string[]): Map<string, CityCoordinate | null> {
    const result = new Map<string, CityCoordinate | null>();

    for (const cityName of cityNames) {
      result.set(cityName, this.getCityCoordinates(cityName));
    }

    return result;
  }

  /**
   * 搜索城市（模糊匹配）
   * @param query 搜索关键词
   * @returns 匹配的城市列表
   */
  searchCities(query: string): CityCoordinate[] {
    if (!this.cityCoordinatesLoaded) {
      return [];
    }

    const normalizedQuery = query.toLowerCase().trim();
    const results: CityCoordinate[] = [];

    for (const coordinate of this.cityCoordinates.values()) {
      if (coordinate.name.toLowerCase().includes(normalizedQuery) ||
          coordinate.nameZh.includes(normalizedQuery)) {
        results.push(coordinate);
      }
    }

    return results;
  }

  /**
   * 获取所有已加载的城市列表
   */
  getAllCities(): CityCoordinate[] {
    if (!this.cityCoordinatesLoaded) {
      return [];
    }

    // 去重，因为同一个城市有两个键（中英文）
    const uniqueCities = new Map<string, CityCoordinate>();
    for (const coordinate of this.cityCoordinates.values()) {
      uniqueCities.set(coordinate.name, coordinate);
    }

    return Array.from(uniqueCities.values());
  }

  /**
   * 获取城市坐标统计信息
   */
  getCityCoordinatesStats() {
    if (!this.cityCoordinatesLoaded) {
      return {
        loaded: false,
        count: 0,
      };
    }

    // 统计不同国家的城市数量
    const countryStats = new Map<string, number>();
    for (const coordinate of this.cityCoordinates.values()) {
      const count = countryStats.get(coordinate.country) || 0;
      countryStats.set(coordinate.country, count + 1);
    }

    // 去重后统计
    const uniqueCities = new Map<string, CityCoordinate>();
    for (const coordinate of this.cityCoordinates.values()) {
      uniqueCities.set(coordinate.name, coordinate);
    }

    return {
      loaded: true,
      count: uniqueCities.size,
      countries: Object.fromEntries(countryStats),
    };
  }

  private updateServerStatus(
    name: string,
    patch: Partial<Pick<McpServerStatus, 'connected' | 'health' | 'lastError'>>,
  ) {
    const existing = this.serverRecords.get(name);
    if (!existing) {
      return;
    }

    existing.status = {
      ...existing.status,
      ...patch,
      lastCheckedAt: new Date().toISOString(),
    };
    this.serverRecords.set(name, existing);
  }

  private setInitialServerRecord(config: McpServerConfig): void {
    this.serverRecords.set(config.name, {
      config,
      status: {
        name: config.name,
        connected: false,
        enabled: true,
        health: 'unknown',
        lastError: null,
        lastCheckedAt: null,
      },
      tools: [],
    });
  }

  private async disconnectAllClients(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map(async (client) => {
        try {
          await client.close();
        } catch {
          // 忽略关闭阶段的清理错误，避免阻塞整体重载。
        }
      }),
    );
    this.clients.clear();
  }

  private async disconnectServer(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      try {
        await client.close();
      } catch {
        // 忽略关闭阶段的清理错误，避免阻塞单个 server 重连。
      }
      this.clients.delete(name);
    }
  }
}
