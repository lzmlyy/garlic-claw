import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

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
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);
  private clients = new Map<string, Client>();
  private cityCoordinates = new Map<string, CityCoordinate>();
  private cityCoordinatesLoaded = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.loadMcpServers();
    await this.loadCityCoordinates();
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

  private async loadMcpServers() {
    try {
      // 使用更可靠的方式定位项目根目录
      // 从当前工作目录开始，向上查找包含 package.json 的目录
      let currentPath = process.cwd();
      let projectRoot = currentPath;
      
      // 向上查找项目根目录（包含 package.json 的目录）
      while (currentPath !== path.parse(currentPath).root) {
        const pkgJsonPath = path.join(currentPath, 'package.json');
        try {
          await fs.access(pkgJsonPath);
          // 找到了 package.json，检查是否是项目根目录的 package.json
          const pkgContent = await fs.readFile(pkgJsonPath, 'utf-8');
          const pkg = JSON.parse(pkgContent);
          
          // 项目根目录的 package.json 应该有特定的结构
          // 例如有 packages 字段，或者 name 字段不是 @garlic-claw/server
          if (pkg.name !== '@garlic-claw/server') {
            projectRoot = currentPath;
            break;
          }
        } catch {
          // package.json 不存在或无法读取，继续向上查找
        }
        
        // 如果当前目录已经是 packages/server，就向上找到项目根目录
        const parentDir = path.dirname(currentPath);
        if (path.basename(parentDir) === 'packages' && 
            path.basename(currentPath) === 'server') {
          projectRoot = path.dirname(parentDir);
          break;
        }
        
        currentPath = parentDir;
      }
      
      const mcpConfigPath = path.join(projectRoot, '.mcp', 'mcp.json');
      this.logger.log(`process.cwd(): ${process.cwd()}`);
      this.logger.log(`项目根目录: ${projectRoot}`);
      this.logger.log(`MCP 配置文件路径: ${mcpConfigPath}`);
      this.logger.log(`配置文件是否存在: ${await fs.access(mcpConfigPath).then(() => true).catch(() => false)}`);
      
      const configContent = await fs.readFile(mcpConfigPath, 'utf-8');
      const config = JSON.parse(configContent);
      this.logger.log(`MCP 配置内容: ${JSON.stringify(config)}`);

      const servers = config.mcpServers || {};
      this.logger.log(`找到 ${Object.keys(servers).length} 个 MCP 服务器配置`);
      
      for (const [name, serverConfig] of Object.entries(servers)) {
        await this.connectMcpServer(name, serverConfig as McpServerConfig);
      }

      this.logger.log(`成功加载 ${this.clients.size} 个 MCP 服务器`);
    } catch (error) {
      this.logger.warn('加载 MCP 服务器配置失败', error);
    }
  }

  /**
   * 加载城市坐标预配置
   */
  private async loadCityCoordinates() {
    try {
      // 从当前工作目录向上查找项目根目录
      let currentPath = process.cwd();
      let projectRoot = currentPath;

      while (currentPath !== path.parse(currentPath).root) {
        const parentDir = path.dirname(currentPath);
        if (path.basename(parentDir) === 'packages' &&
            path.basename(currentPath) === 'server') {
          projectRoot = path.dirname(parentDir);
          break;
        }
        currentPath = parentDir;
      }

      const cityCoordsPath = path.join(projectRoot, '.mcp', 'city-coordinates.json');

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
        this.logger.warn(`城市坐标配置文件不存在或读取失败: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
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
        const env = config.env || {};
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

        this.clients.set(name, client);
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
  }

  async getTools() {
    const allTools: Record<string, any> = {};

    for (const [name, client] of this.clients) {
      try {
        const response = await this.withTimeout(
          client.listTools(),
          MCP_TOOL_CALL_TIMEOUT,
          `获取 MCP 服务器 "${name}" 工具列表`
        ) as McpToolListResponse;

        for (const tool of response.tools ?? []) {
          const toolName = `${name}__${tool.name}`;
          allTools[toolName] = {
            description: tool.description || `[MCP:${name}] ${tool.name}`,
            inputSchema: tool.inputSchema,
            execute: async (args: any) => {
              try {
                const result = await this.withTimeout(
                  client.callTool({
                    name: tool.name,
                    arguments: args,
                  }),
                  MCP_TOOL_CALL_TIMEOUT,
                  `调用 MCP 工具 "${toolName}"`
                ) as McpToolCallResponse;
                return result.content;
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`调用 MCP 工具 "${toolName}" 失败: ${errorMessage}`);
                return { error: errorMessage };
              }
            },
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`获取 MCP 服务器 "${name}" 的工具失败: ${errorMessage}`);
      }
    }

    this.logger.log(`成功加载 ${Object.keys(allTools).length} 个 MCP 工具`);
    return allTools;
  }

  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  isServerConnected(name: string): boolean {
    return this.clients.has(name);
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
}
