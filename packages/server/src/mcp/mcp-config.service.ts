import * as fs from 'node:fs/promises';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  McpConfigSnapshot,
  McpServerConfig,
  McpServerDeleteResult,
} from '@garlic-claw/shared';
import {
  ensureParentDirectory,
  resolveMcpConfigFilePath,
} from './mcp-path.util';

interface PersistedMcpConfig {
  mcpServers?: Record<string, {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  [key: string]: unknown;
}

type PersistedMcpServer = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

@Injectable()
export class McpConfigService {
  private readonly configPath = resolveMcpConfigFilePath();

  async getSnapshot(): Promise<McpConfigSnapshot> {
    const config = await this.readConfig();

    return {
      configPath: this.configPath,
      servers: this.readServers(config),
    };
  }

  async getServer(name: string): Promise<McpServerConfig | null> {
    return (await this.getSnapshot()).servers.find((server) => server.name === name) ?? null;
  }

  async saveServer(
    input: McpServerConfig,
    currentName?: string,
  ): Promise<McpServerConfig> {
    const normalized = normalizeServerConfig(input);
    const config = await this.readConfig();
    const entries = Object.entries(config.mcpServers ?? {});
    const previousName = currentName?.trim();

    if (!previousName && entries.some(([name]) => name === normalized.name)) {
      throw new BadRequestException(`MCP server already exists: ${normalized.name}`);
    }

    if (
      previousName
      && previousName !== normalized.name
      && entries.some(([name]) => name === normalized.name)
    ) {
      throw new BadRequestException(`MCP server already exists: ${normalized.name}`);
    }

    if (previousName && !entries.some(([name]) => name === previousName)) {
      throw new NotFoundException(`MCP server not found: ${previousName}`);
    }

    const nextEntries: Array<[string, PersistedMcpServer]> = [];
    let inserted = false;

    for (const [name, server] of entries) {
      if (previousName && name === previousName) {
        nextEntries.push([normalized.name, toPersistedServer(normalized)]);
        inserted = true;
        continue;
      }

      nextEntries.push([name, server]);
    }

    if (!previousName) {
      nextEntries.push([normalized.name, toPersistedServer(normalized)]);
      inserted = true;
    }

    if (!inserted) {
      throw new NotFoundException(`MCP server not found: ${previousName ?? normalized.name}`);
    }

    await this.writeConfig({
      ...config,
      mcpServers: Object.fromEntries(nextEntries),
    });

    return normalized;
  }

  async deleteServer(name: string): Promise<McpServerDeleteResult> {
    const normalizedName = name.trim();
    const config = await this.readConfig();
    const entries = Object.entries(config.mcpServers ?? {});

    if (!entries.some(([entryName]) => entryName === normalizedName)) {
      throw new NotFoundException(`MCP server not found: ${normalizedName}`);
    }

    await this.writeConfig({
      ...config,
      mcpServers: Object.fromEntries(
        entries.filter(([entryName]) => entryName !== normalizedName),
      ),
    });

    return {
      deleted: true,
      name: normalizedName,
    };
  }

  private async readConfig(): Promise<PersistedMcpConfig> {
    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(raw) as PersistedMcpConfig;
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String(error.code)
        : null;
      if (code === 'ENOENT') {
        return {};
      }

      throw error;
    }
  }

  private readServers(config: PersistedMcpConfig): McpServerConfig[] {
    return Object.entries(config.mcpServers ?? {}).map(([name, server]) =>
      normalizeServerConfig({
        name,
        command: server.command,
        args: server.args ?? [],
        env: server.env ?? {},
      }));
  }

  private async writeConfig(config: PersistedMcpConfig): Promise<void> {
    ensureParentDirectory(this.configPath);
    await fs.writeFile(
      this.configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      'utf-8',
    );
  }
}

function normalizeServerConfig(input: McpServerConfig): McpServerConfig {
  const name = input.name.trim();
  const command = input.command.trim();
  if (!name) {
    throw new BadRequestException('MCP server name is required');
  }
  if (!command) {
    throw new BadRequestException('MCP server command is required');
  }

  const args = input.args
    .map((arg: string) => arg.trim())
    .filter((arg: string) => arg.length > 0);
  const envEntries = Object.entries(input.env ?? {}) as Array<[string, string]>;
  const env = Object.fromEntries(
    envEntries
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => key.length > 0 && value.length > 0),
  );

  return {
    name,
    command,
    args,
    env,
  };
}

function toPersistedServer(input: McpServerConfig): PersistedMcpServer {
  return {
    command: input.command,
    args: input.args,
    ...(Object.keys(input.env).length > 0 ? { env: input.env } : {}),
  };
}
