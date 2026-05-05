import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { RuntimeBackendDescriptor } from './runtime-command.types';
import { RUNTIME_FILESYSTEM_BACKENDS_TOKEN, type RuntimeFilesystemBackendList } from './runtime-filesystem-backend.tokens';
import type { RuntimeFilesystemBackend, RuntimeFilesystemDeleteResult, RuntimeFilesystemDirectoryResult, RuntimeFilesystemEditResult, RuntimeFilesystemFileEntry, RuntimeFilesystemGlobResult, RuntimeFilesystemGrepResult, RuntimeFilesystemPathStat, RuntimeFilesystemReadResult, RuntimeFilesystemResolvedPath, RuntimeFilesystemSymlinkResult, RuntimeFilesystemTransferResult, RuntimeFilesystemWriteOptions, RuntimeFilesystemWriteResult } from './runtime-filesystem-backend.types';

@Injectable()
export class RuntimeFilesystemBackendService {
  private readonly backends = new Map<RuntimeBackendKind, RuntimeFilesystemBackend>();
  private readonly defaultBackendKind: RuntimeBackendKind;

  constructor(@Inject(RUNTIME_FILESYSTEM_BACKENDS_TOKEN) filesystemBackends: RuntimeFilesystemBackendList) {
    if (filesystemBackends.length === 0) {throw new Error('RuntimeFilesystemBackendService 至少需要一个 filesystem backend');}
    for (const backend of filesystemBackends) {this.backends.set(backend.getKind(), backend);}
    this.defaultBackendKind = filesystemBackends[0].getKind();
  }

  getBackend(backendKind?: RuntimeBackendKind): RuntimeFilesystemBackend { return this.requireBackend(backendKind); }
  getBackendDescriptor(backendKind?: RuntimeBackendKind): RuntimeBackendDescriptor { return this.requireBackend(backendKind).getDescriptor(); }
  getDefaultBackend(): RuntimeFilesystemBackend { return this.requireBackend(); }
  getDefaultBackendDescriptor(): RuntimeBackendDescriptor { return this.requireBackend().getDescriptor(); }
  getDefaultBackendKind(): RuntimeBackendKind { return this.defaultBackendKind; }
  hasBackend(backendKind: RuntimeBackendKind): boolean { return this.backends.has(backendKind); }
  listBackendKinds(): RuntimeBackendKind[] { return [...this.backends.keys()]; }

  async copyPath(sessionId: string, fromPath: string, toPath: string, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemTransferResult> { return this.requireBackend(backendKind).copyPath(sessionId, fromPath, toPath); }
  async createSymlink(sessionId: string, input: { linkPath: string; targetPath: string }, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemSymlinkResult> { return this.requireBackend(backendKind).createSymlink(sessionId, input); }
  async deletePath(sessionId: string, inputPath: string, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemDeleteResult> { return this.requireBackend(backendKind).deletePath(sessionId, inputPath); }
  async editTextFile(sessionId: string, input: { filePath: string; newString: string; oldString: string; replaceAll?: boolean }, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemEditResult> { return this.requireBackend(backendKind).editTextFile(sessionId, input); }
  async ensureDirectory(sessionId: string, inputPath: string, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemDirectoryResult> { return this.requireBackend(backendKind).ensureDirectory(sessionId, inputPath); }
  async globPaths(sessionId: string, input: { maxResults: number; pattern: string; path?: string }, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemGlobResult> { return this.requireBackend(backendKind).globPaths(sessionId, input); }
  async grepText(sessionId: string, input: { include?: string; maxLineLength: number; maxMatches: number; path?: string; pattern: string }, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemGrepResult> { return this.requireBackend(backendKind).grepText(sessionId, input); }
  async listFiles(sessionId: string, inputPath?: string, backendKind?: RuntimeBackendKind): Promise<{ basePath: string; files: RuntimeFilesystemFileEntry[] }> { return this.requireBackend(backendKind).listFiles(sessionId, inputPath); }
  async movePath(sessionId: string, fromPath: string, toPath: string, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemTransferResult> { return this.requireBackend(backendKind).movePath(sessionId, fromPath, toPath); }
  async readDirectoryEntries(sessionId: string, inputPath?: string, backendKind?: RuntimeBackendKind): Promise<{ entries: string[]; path: string }> { return this.requireBackend(backendKind).readDirectoryEntries(sessionId, inputPath); }
  async readPathRange(sessionId: string, input: { limit: number; maxLineLength: number; offset: number; path?: string }, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemReadResult> { return this.requireBackend(backendKind).readPathRange(sessionId, input); }
  async readSymlink(sessionId: string, inputPath: string, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemSymlinkResult> { return this.requireBackend(backendKind).readSymlink(sessionId, inputPath); }
  async resolvePath(sessionId: string, inputPath?: string, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemResolvedPath> { return this.requireBackend(backendKind).resolvePath(sessionId, inputPath); }
  async statPath(sessionId: string, inputPath?: string, backendKind?: RuntimeBackendKind): Promise<RuntimeFilesystemPathStat> { return this.requireBackend(backendKind).statPath(sessionId, inputPath); }
  async readTextFile(sessionId: string, inputPath?: string, backendKind?: RuntimeBackendKind): Promise<{ content: string; path: string }> { return this.requireBackend(backendKind).readTextFile(sessionId, inputPath); }
  async writeTextFile(sessionId: string, inputPath: string, content: string, backendKind?: RuntimeBackendKind, options?: RuntimeFilesystemWriteOptions): Promise<RuntimeFilesystemWriteResult> { return this.requireBackend(backendKind).writeTextFile(sessionId, inputPath, content, options); }

  private requireBackend(backendKind?: RuntimeBackendKind): RuntimeFilesystemBackend {
    const resolvedBackendKind = backendKind ?? this.defaultBackendKind;
    const backend = this.backends.get(resolvedBackendKind);
    if (!backend) {throw new Error(`Unknown runtime filesystem backend: ${resolvedBackendKind}`);}
    return backend;
  }
}
