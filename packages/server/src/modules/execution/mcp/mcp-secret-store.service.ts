import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { resolveServerStatePath } from '../../../core/runtime/server-workspace-paths';
import { ProjectWorktreeRootService } from '../project/project-worktree-root.service';

interface StoredMcpSecretsFile {
  servers?: Record<string, Record<string, string>>;
}

@Injectable()
export class McpSecretStoreService {
  constructor(private readonly projectWorktreeRootService: ProjectWorktreeRootService) {}

  readServerSecrets(name: string): Record<string, string> {
    return {
      ...(this.readStore().servers?.[name] ?? {}),
    };
  }

  saveServerSecrets(name: string, secrets: Record<string, string>, previousName?: string): void {
    const store = this.readStore();
    const servers = {
      ...(store.servers ?? {}),
    };

    if (previousName && previousName !== name) {
      delete servers[previousName];
    }

    if (Object.keys(secrets).length > 0) {
      servers[name] = { ...secrets };
    } else {
      delete servers[name];
    }

    this.writeStore({ servers });
  }

  deleteServerSecrets(name: string): void {
    const store = this.readStore();
    const servers = {
      ...(store.servers ?? {}),
    };
    delete servers[name];
    this.writeStore({ servers });
  }

  private readStore(): StoredMcpSecretsFile {
    const storagePath = this.resolveStoragePath();
    try {
      return fs.existsSync(storagePath)
        ? JSON.parse(fs.readFileSync(storagePath, 'utf-8')) as StoredMcpSecretsFile
        : {};
    } catch {
      return {};
    }
  }

  private writeStore(store: StoredMcpSecretsFile): void {
    const storagePath = this.resolveStoragePath();
    const parentPath = path.dirname(storagePath);
    fs.mkdirSync(parentPath, { recursive: true });
    if (store.servers && Object.keys(store.servers).length > 0) {
      fs.writeFileSync(storagePath, JSON.stringify(store, null, 2), 'utf-8');
      return;
    }
    fs.rmSync(storagePath, { force: true });
  }

  private resolveStoragePath(): string {
    const configuredPath = process.env.GARLIC_CLAW_MCP_SECRET_STATE_PATH?.trim();
    if (configuredPath) {
      return path.resolve(configuredPath);
    }
    if (process.env.GARLIC_CLAW_MCP_CONFIG_PATH || process.env.JEST_WORKER_ID) {
      const configRootPath = process.env.GARLIC_CLAW_MCP_CONFIG_PATH?.trim()
        ? path.resolve(process.env.GARLIC_CLAW_MCP_CONFIG_PATH)
        : path.join(
          this.projectWorktreeRootService.resolveRoot(process.cwd()),
          'config',
          'mcp',
          'servers',
        );
      return path.join(path.dirname(configRootPath), 'mcp-secrets.server.json');
    }
    return resolveServerStatePath('mcp-secrets.server.json');
  }
}
