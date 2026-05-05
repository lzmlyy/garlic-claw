import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  McpConfigSnapshot,
  McpServerEnvEntry,
  McpServerConfig,
  McpServerDeleteResult,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectWorktreeRootService } from '../project/project-worktree-root.service';
import { normalizeEventLogSettings } from '../../../core/logging/runtime-event-log.service';
import { McpSecretStoreService } from './mcp-secret-store.service';

type StoredMcpServerFile = Partial<StoredMcpServerRecord> & {
  name?: string;
};

interface StoredMcpServerRecord {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  eventLog: McpServerConfig['eventLog'];
}

@Injectable()
export class McpServerStoreService {
  private readonly configRootPath: string;
  private readonly reportedConfigPath: string;
  private servers: StoredMcpServerRecord[];

  constructor(
    private readonly projectWorktreeRootService: ProjectWorktreeRootService,
    private readonly mcpSecretStoreService: McpSecretStoreService,
  ) {
    this.configRootPath = this.resolveMcpConfigRootPath();
    this.reportedConfigPath = readReportedMcpConfigPath(this.configRootPath);
    this.servers = this.loadServers();
  }

  getSnapshot(): McpConfigSnapshot {
    return {
      configPath: this.reportedConfigPath,
      servers: this.servers.map((server) =>
        toSnapshotServerConfig(server, this.mcpSecretStoreService.readServerSecrets(server.name))),
    };
  }

  getServer(name: string): McpServerConfig | null {
    const server = this.servers.find((entry) => entry.name === name);
    if (!server) {
      return null;
    }
    return toRuntimeServerConfig(server, this.mcpSecretStoreService.readServerSecrets(server.name));
  }

  saveServer(server: McpServerConfig, previousName?: string): McpServerConfig {
    const currentSecrets = this.mcpSecretStoreService.readServerSecrets(previousName ?? server.name);
    const currentServer = this.servers.find((entry) => entry.name === (previousName ?? server.name));
    const normalizedServer = normalizeIncomingServer(server, currentSecrets, currentServer);
    fs.mkdirSync(this.configRootPath, { recursive: true });
    fs.writeFileSync(
      resolveServerFilePath(this.configRootPath, normalizedServer.record.name),
      JSON.stringify(serializeStoredServer(normalizedServer.record), null, 2),
      'utf-8',
    );

    this.mcpSecretStoreService.saveServerSecrets(
      normalizedServer.record.name,
      normalizedServer.secretEnv,
      previousName,
    );

    if (previousName && previousName !== normalizedServer.record.name) {
      fs.rmSync(resolveServerFilePath(this.configRootPath, previousName), { force: true });
    }

    this.servers = this.upsertServer(normalizedServer.record, previousName);
    return toSnapshotServerConfig(normalizedServer.record, normalizedServer.secretEnv);
  }

  deleteServer(name: string): McpServerDeleteResult {
    const current = this.getServer(name);
    if (!current) {
      throw new NotFoundException(`MCP server not found: ${name}`);
    }

    fs.rmSync(resolveServerFilePath(this.configRootPath, name), { force: true });
    this.mcpSecretStoreService.deleteServerSecrets(name);
    this.servers = this.servers.filter((entry) => entry.name !== name);
    return { deleted: true, name };
  }

  private loadServers(): StoredMcpServerRecord[] {
    try {
      fs.mkdirSync(this.configRootPath, { recursive: true });
      return fs.readdirSync(this.configRootPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
        .map((entry) => readServerFile(path.join(this.configRootPath, entry.name)))
        .filter((server): server is StoredMcpServerRecord => server !== null)
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return [];
    }
  }

  private upsertServer(server: StoredMcpServerRecord, previousName?: string): StoredMcpServerRecord[] {
    const nextServers = this.servers.filter((entry) => entry.name !== (previousName ?? server.name));
    nextServers.push(cloneStoredServerRecord(server));
    return nextServers.sort((left, right) => left.name.localeCompare(right.name));
  }

  private resolveMcpConfigRootPath(): string {
    if (process.env.GARLIC_CLAW_MCP_CONFIG_PATH) {
      return path.resolve(process.env.GARLIC_CLAW_MCP_CONFIG_PATH);
    }

    return path.join(this.projectWorktreeRootService.resolveRoot(process.cwd()), 'config', 'mcp', 'servers');
  }
}

function readServerFile(filePath: string): StoredMcpServerRecord | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StoredMcpServerFile;
    const fallbackName = decodeURIComponent(path.basename(filePath, path.extname(filePath)));
    return toStoredServerRecord(raw, fallbackName);
  } catch {
    return null;
  }
}

function toStoredServerRecord(raw: StoredMcpServerFile, fallbackName: string): StoredMcpServerRecord | null {
  const name = typeof raw.name === 'string' && raw.name.trim().length > 0
    ? raw.name.trim()
    : fallbackName;
  const command = typeof raw.command === 'string' ? raw.command.trim() : '';
  if (!name || !command || !Array.isArray(raw.args)) {
    return null;
  }

  const env = typeof raw.env === 'object' && raw.env !== null ? raw.env : {};
  return {
    name,
    command,
    args: raw.args.filter((value): value is string => typeof value === 'string'),
    env: Object.fromEntries(
      Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ),
    eventLog: normalizeEventLogSettings(raw.eventLog),
  };
}

function serializeStoredServer(server: StoredMcpServerRecord): StoredMcpServerRecord {
  return {
    name: server.name,
    command: server.command,
    args: [...server.args],
    env: { ...server.env },
    eventLog: normalizeEventLogSettings(server.eventLog),
  };
}

function cloneStoredServerRecord(server: StoredMcpServerRecord): StoredMcpServerRecord {
  return serializeStoredServer(server);
}

function toSnapshotServerConfig(
  server: StoredMcpServerRecord,
  secretEnv: Record<string, string>,
): McpServerConfig {
  return toServerConfigWithSecrets(server, secretEnv, false);
}

function toRuntimeServerConfig(
  server: StoredMcpServerRecord,
  secretEnv: Record<string, string>,
): McpServerConfig {
  return toServerConfigWithSecrets(server, secretEnv, true);
}

function toServerConfigWithSecrets(
  server: StoredMcpServerRecord,
  secretEnv: Record<string, string>,
  exposeStoredSecretValue: boolean,
): McpServerConfig {
  const envEntries = mergeEnvEntries(server.env, secretEnv, exposeStoredSecretValue);
  const config: McpServerConfig = {
    name: server.name,
    command: server.command,
    args: [...server.args],
    env: Object.fromEntries(
      envEntries.map((entry) => [
        entry.key,
        entry.source === 'stored-secret' && !exposeStoredSecretValue ? '' : entry.value,
      ]),
    ),
    eventLog: normalizeEventLogSettings(server.eventLog),
  };
  if (envEntries.length > 0) {
    config.envEntries = envEntries;
  }
  return config;
}

function mergeEnvEntries(
  configEnv: Record<string, string>,
  secretEnv: Record<string, string>,
  exposeStoredSecretValue: boolean,
): McpServerEnvEntry[] {
  const entriesByKey = new Map<string, McpServerEnvEntry>();
  for (const [key, value] of Object.entries(configEnv)) {
    entriesByKey.set(key, {
      key,
      source: isEnvReference(value) ? 'env-ref' : 'literal',
      value,
    });
  }
  for (const [key, value] of Object.entries(secretEnv)) {
    entriesByKey.set(key, {
      key,
      source: 'stored-secret',
      value: exposeStoredSecretValue ? value : '',
      hasStoredValue: true,
    });
  }
  return [...entriesByKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function normalizeIncomingServer(
  server: McpServerConfig,
  currentSecrets: Record<string, string>,
  currentServer?: StoredMcpServerRecord,
): { record: StoredMcpServerRecord; secretEnv: Record<string, string> } {
  const visibleEnv = readVisibleEnv(server, currentServer?.env ?? {});
  const secretEnv = readNextSecretEnv(server, currentSecrets);
  const storedEnv = {
    ...visibleEnv,
  };
  for (const secretKey of Object.keys(secretEnv)) {
    if (!isEnvReference(storedEnv[secretKey] ?? '')) {
      delete storedEnv[secretKey];
    }
  }
  return {
    record: {
      name: server.name,
      command: server.command,
      args: [...server.args],
      env: storedEnv,
      eventLog: normalizeEventLogSettings(server.eventLog),
    },
    secretEnv,
  };
}

function normalizeEnvMap(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0),
  );
}

function readVisibleEnv(server: McpServerConfig, fallbackEnv: Record<string, string>): Record<string, string> {
  const envFromField = normalizeEnvMap(server.env);
  const normalizedEntries = normalizeIncomingEnvEntries(server);
  const visibleEntries = normalizedEntries
    .filter((entry) => entry.source !== 'stored-secret')
    .map((entry) => [entry.key, entry.value] as const);
  if (
    Array.isArray(server.envEntries)
    && server.envEntries.length > 0
    && visibleEntries.length === 0
    && Object.keys(envFromField).length === 0
  ) {
    return { ...fallbackEnv };
  }
  return {
    ...envFromField,
    ...Object.fromEntries(visibleEntries),
  };
}

function readNextSecretEnv(
  server: McpServerConfig,
  currentSecrets: Record<string, string>,
): Record<string, string> {
  const nextSecrets: Record<string, string> = {};
  for (const entry of normalizeIncomingEnvEntries(server)) {
    if (entry.source !== 'stored-secret') {
      continue;
    }
    const key = entry.key.trim();
    const value = entry.value.trim();
    if (value.length > 0) {
      nextSecrets[key] = value;
      continue;
    }
    if (entry.hasStoredValue && currentSecrets[key]) {
      nextSecrets[key] = currentSecrets[key];
    }
  }
  return nextSecrets;
}

function normalizeIncomingEnvEntries(server: McpServerConfig): McpServerEnvEntry[] {
  if (!Array.isArray(server.envEntries) || server.envEntries.length === 0) {
    return Object.entries(normalizeEnvMap(server.env)).map(([key, value]) => ({
      key,
      source: isEnvReference(value) ? 'env-ref' : 'literal',
      value,
    }));
  }
  return server.envEntries
    .map((entry) => ({
      key: entry.key.trim(),
      source: entry.source,
      value: entry.value.trim(),
      ...(entry.hasStoredValue ? { hasStoredValue: true } : {}),
    }))
    .filter((entry) => entry.key.length > 0);
}

function isEnvReference(value: string): boolean {
  return value.startsWith('${') && value.endsWith('}');
}

function readReportedMcpConfigPath(configRootPath: string): string {
  if (process.env.GARLIC_CLAW_MCP_CONFIG_PATH) {
    return configRootPath;
  }

  return 'config/mcp/servers';
}

function resolveServerFilePath(configRootPath: string, serverName: string): string {
  return path.join(configRootPath, `${encodeURIComponent(serverName)}.json`);
}
