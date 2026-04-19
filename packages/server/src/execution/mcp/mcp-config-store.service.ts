import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';

type LegacyMcpConfigFile = {
  mcpServers?: Record<string, { args: string[]; command: string; env?: Record<string, string> }>;
  servers?: McpServerConfig[];
  [key: string]: unknown;
};

@Injectable()
export class McpConfigStoreService {
  private readonly configPath = resolveMcpConfigFilePath();
  private readonly reportedConfigPath = readReportedMcpConfigPath(this.configPath);
  private config = this.loadConfig();

  getSnapshot(): McpConfigSnapshot {
    return {
      configPath: this.reportedConfigPath,
      servers: this.config.servers.map(cloneServerConfig),
    };
  }

  getServer(name: string): McpServerConfig | null {
    return this.config.servers.find((entry) => entry.name === name) ?? null;
  }

  saveServer(server: McpServerConfig, previousName?: string): McpServerConfig {
    const nextServers = this.config.servers.filter((entry) => entry.name !== (previousName ?? server.name));
    nextServers.push(cloneServerConfig(server));
    this.config.servers = nextServers.sort((left, right) => left.name.localeCompare(right.name));
    this.saveConfig();
    return cloneServerConfig(server);
  }

  deleteServer(name: string): McpServerDeleteResult {
    const before = this.config.servers.length;
    this.config.servers = this.config.servers.filter((entry) => entry.name !== name);
    if (before === this.config.servers.length) {
      throw new NotFoundException(`MCP server not found: ${name}`);
    }
    this.saveConfig();
    return { deleted: true, name };
  }

  private loadConfig(): { raw: LegacyMcpConfigFile; servers: McpServerConfig[] } {
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      if (!fs.existsSync(this.configPath)) {
        const initial = { raw: { mcpServers: {} }, servers: [] as McpServerConfig[] };
        fs.writeFileSync(this.configPath, JSON.stringify(initial.raw, null, 2), 'utf-8');
        return initial;
      }
      const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as LegacyMcpConfigFile;
      return { raw, servers: readServers(raw) };
    } catch {
      return { raw: { mcpServers: {} }, servers: [] };
    }
  }

  private saveConfig(): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const raw = {
      ...this.config.raw,
      mcpServers: Object.fromEntries(this.config.servers.map((server) => [
        server.name,
        {
          command: server.command,
          args: [...server.args],
          ...(Object.keys(server.env).length > 0 ? { env: { ...server.env } } : {}),
        },
      ])),
    };
    fs.writeFileSync(this.configPath, JSON.stringify(raw, null, 2), 'utf-8');
    this.config.raw = raw;
  }
}

function readServers(raw: LegacyMcpConfigFile): McpServerConfig[] {
  if (raw.mcpServers && typeof raw.mcpServers === 'object') {
    return Object.entries(raw.mcpServers)
      .filter(([, value]) => value && typeof value.command === 'string' && Array.isArray(value.args))
      .map(([name, value]) => ({
        name,
        command: value.command,
        args: [...value.args],
        env: { ...(value.env ?? {}) },
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  return Array.isArray(raw.servers)
    ? raw.servers
      .filter((entry): entry is McpServerConfig => Boolean(
        entry
        && typeof entry.name === 'string'
        && typeof entry.command === 'string'
        && Array.isArray(entry.args)
        && typeof entry.env === 'object'
        && entry.env !== null,
      ))
      .map(cloneServerConfig)
      .sort((left, right) => left.name.localeCompare(right.name))
    : [];
}

function cloneServerConfig(server: McpServerConfig): McpServerConfig {
  return { ...server, args: [...server.args], env: { ...server.env } };
}

function resolveMcpConfigFilePath(): string {
  if (process.env.GARLIC_CLAW_MCP_CONFIG_PATH) {
    return path.resolve(process.env.GARLIC_CLAW_MCP_CONFIG_PATH);
  }

  return path.join(resolveProjectRoot(), 'mcp', 'mcp.json');
}

function readReportedMcpConfigPath(configPath: string): string {
  if (process.env.GARLIC_CLAW_MCP_CONFIG_PATH) {
    return configPath;
  }

  return 'mcp/mcp.json';
}

function resolveProjectRoot(): string {
  return findProjectRoot(process.cwd())
    ?? findProjectRoot(__dirname)
    ?? process.cwd();
}

function findProjectRoot(startPath: string): string | null {
  let currentPath = path.resolve(startPath);

  while (true) {
    if (
      fs.existsSync(path.join(currentPath, 'package.json'))
      && fs.existsSync(path.join(currentPath, 'packages', 'server'))
    ) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
}
