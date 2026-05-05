import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { RuntimeBackendDescriptor } from '../runtime/runtime-command.types';
import type { RuntimeFilesystemBackend, RuntimeFilesystemDeleteResult, RuntimeFilesystemDirectoryResult, RuntimeFilesystemEditResult, RuntimeFilesystemFileEntry, RuntimeFilesystemGlobResult, RuntimeFilesystemGrepMatch, RuntimeFilesystemGrepResult, RuntimeFilesystemPathStat, RuntimeFilesystemReadResult, RuntimeFilesystemResolvedPath, RuntimeFilesystemSkippedEntry, RuntimeFilesystemSkippedReason, RuntimeFilesystemSymlinkResult, RuntimeFilesystemTransferResult, RuntimeFilesystemWriteOptions, RuntimeFilesystemWriteResult, RuntimeFilesystemWriteStatus } from '../runtime/runtime-filesystem-backend.types';
import { RuntimeFilesystemPostWriteService } from '../runtime/runtime-filesystem-post-write.service';
import { RuntimeMountedWorkspaceFileSystem } from '../runtime/runtime-mounted-workspace-file-system';
import type { RuntimeSessionEnvironment } from '../runtime/runtime-session-environment.types';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { toHostPath } from '../runtime/host-path';
import { joinRuntimeVisiblePath, normalizeRuntimeVisiblePath, resolveRuntimeVisiblePath } from '../runtime/runtime-visible-path';
import { buildRuntimeFilesystemDiff } from './runtime-file-diff';
import { collectRuntimeFileTreeEntries, containsRuntimeBinarySample, readRuntimeDirectoryEntryNames, readRuntimePathType } from './runtime-file-tree';
import { renderRuntimeMissingPathNextStep } from './runtime-search-result-report';
import { replaceRuntimeText } from './runtime-text-replace';

const HOST_FILESYSTEM_BACKEND_KIND = 'host-filesystem', MAX_READ_BYTES = 50 * 1024, MAX_READ_LINE_SUFFIX = '... (line truncated)';
const HOST_FILESYSTEM_BACKEND_DESCRIPTOR: RuntimeBackendDescriptor = {
  capabilities: { networkAccess: false, persistentFilesystem: true, persistentShellState: false, shellExecution: false, workspaceRead: true, workspaceWrite: true },
  kind: HOST_FILESYSTEM_BACKEND_KIND,
  permissionPolicy: { networkAccess: 'deny', persistentFilesystem: 'allow', persistentShellState: 'deny', shellExecution: 'deny', workspaceRead: 'allow', workspaceWrite: 'allow' },
};
const PLAIN_TEXT_MIME_EXTENSIONS = new Set(['.txt', '.log', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.css', '.html', '.xml', '.yml', '.yaml', '.sh', '.py', '.rs', '.go', '.java', '.c', '.cc', '.cpp', '.h', '.hpp']);
const MIME_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = { '.avif': 'image/avif', '.bmp': 'image/bmp', '.gif': 'image/gif', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.json': 'application/json', '.md': 'text/markdown', '.pdf': 'application/pdf', '.png': 'image/png', '.svg': 'image/svg+xml', '.svgz': 'image/svg+xml', '.webp': 'image/webp' };
const BINARY_PATH_EXTENSIONS = new Set(['.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.class', '.jar', '.war', '.7z', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.bin', '.dat', '.obj', '.o', '.a', '.lib', '.wasm', '.pyc', '.pyo']);

type HostFilesystemResolveMode = 'directory' | 'existing' | 'file' | 'missing' | 'writable-file';
interface HostFilesystemResolvedPath extends RuntimeFilesystemResolvedPath { hostPath: string; }
interface HostFilesystemFileEntry extends RuntimeFilesystemFileEntry { hostPath: string; }
interface HostFilesystemReadMetadata { mimeType: string; nonTextType?: 'image' | 'pdf' | 'binary'; size: number; }
interface HostFilesystemTextSource extends HostFilesystemReadMetadata { content: string; normalizedContent: string; }

@Injectable()
export class HostFilesystemBackendService implements RuntimeFilesystemBackend {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    @Optional() private readonly runtimeFilesystemPostWriteService?: RuntimeFilesystemPostWriteService,
  ) {}

  getKind(): string { return HOST_FILESYSTEM_BACKEND_KIND; }
  getDescriptor(): RuntimeBackendDescriptor { return HOST_FILESYSTEM_BACKEND_DESCRIPTOR; }

  async copyPath(sessionId: string, fromPath: string, toPath: string): Promise<RuntimeFilesystemTransferResult> {
    return this.transferPath(sessionId, fromPath, toPath, (source, target) => fsPromises.cp(source.hostPath, target.hostPath, { errorOnExist: true, force: false, recursive: source.type === 'directory' }));
  }

  async movePath(sessionId: string, fromPath: string, toPath: string): Promise<RuntimeFilesystemTransferResult> {
    return this.transferPath(sessionId, fromPath, toPath, (source, target) => fsPromises.rename(source.hostPath, target.hostPath));
  }

  async createSymlink(sessionId: string, input: { linkPath: string; targetPath: string }): Promise<RuntimeFilesystemSymlinkResult> {
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(sessionId), link = await this.resolveValidatedPath(sessionId, input.linkPath, { mode: 'missing' }), mountedFilesystem = new RuntimeMountedWorkspaceFileSystem(sessionEnvironment.sessionRoot, sessionEnvironment.visibleRoot);
    await mountedFilesystem.symlink(input.targetPath, link.virtualPath);
    return { path: link.virtualPath, target: await mountedFilesystem.readlink(link.virtualPath) };
  }

  async readSymlink(sessionId: string, inputPath: string): Promise<RuntimeFilesystemSymlinkResult> {
    const target = await this.resolveValidatedPath(sessionId, inputPath, { mode: 'existing' });
    if (!(await fsPromises.lstat(target.hostPath)).isSymbolicLink()) {throw new BadRequestException(`路径不是符号链接: ${target.virtualPath}`);}
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(sessionId);
    return { path: target.virtualPath, target: await new RuntimeMountedWorkspaceFileSystem(sessionEnvironment.sessionRoot, sessionEnvironment.visibleRoot).readlink(target.virtualPath) };
  }

  async deletePath(sessionId: string, inputPath: string): Promise<RuntimeFilesystemDeleteResult> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (!target.exists) {return { deleted: false, path: target.virtualPath };}
    await fsPromises.rm(target.hostPath, { force: true, recursive: target.type === 'directory' });
    return { deleted: true, path: target.virtualPath };
  }

  async ensureDirectory(sessionId: string, inputPath: string): Promise<RuntimeFilesystemDirectoryResult> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (target.exists && target.type !== 'directory') {throw new BadRequestException(`路径不是目录: ${target.virtualPath}`);}
    await fsPromises.mkdir(target.hostPath, { recursive: true });
    return { created: !target.exists, path: target.virtualPath };
  }

  async globPaths(sessionId: string, input: { maxResults: number; pattern: string; path?: string }): Promise<RuntimeFilesystemGlobResult> {
    const target = await this.resolveValidatedPath(sessionId, input.path, { label: 'glob.path', mode: 'directory', nextStepHint: renderRuntimeMissingPathNextStep('glob') });
    const listed = await this.listFiles(sessionId, target.virtualPath);
    const matches = await Promise.all(listed.files
      .filter((entry) => matchesFilesystemGlobPattern(input.pattern, toFilesystemRelativePath(listed.basePath, entry.virtualPath)))
      .map(async (entry) => ({ mtime: (await fsPromises.stat(entry.hostPath)).mtime.getTime(), virtualPath: entry.virtualPath })));
    matches.sort(compareRuntimeSearchEntries);
    return {
      basePath: listed.basePath,
      matches: matches.slice(0, input.maxResults).map((entry) => entry.virtualPath),
      partial: listed.partial,
      skippedEntries: listed.skippedEntries,
      skippedPaths: listed.skippedPaths,
      totalMatches: matches.length,
      truncated: matches.length > input.maxResults,
    };
  }

  async grepText(sessionId: string, input: {
    include?: string;
    maxLineLength: number;
    maxMatches: number;
    path?: string;
    pattern: string;
  }): Promise<RuntimeFilesystemGrepResult> {
    let matcher: RegExp;
    try {
      matcher = new RegExp(input.pattern);
    } catch (error) {
      throw new BadRequestException(`grep.pattern 不是合法正则: ${(error as Error).message}`);
    }
    const listed = await this.listFiles(sessionId, input.path, { nextStepHint: renderRuntimeMissingPathNextStep('grep') });
    const matches: Array<{ mtime: number; rows: Array<{ line: number; text: string }>; virtualPath: string }> = [];
    const skippedEntries = [...listed.skippedEntries], skippedPaths = [...listed.skippedPaths];
    let partial = listed.partial;
    for (const file of listed.files) {
      if (input.include && !matchesFilesystemGlobPattern(input.include, toFilesystemRelativePath(listed.basePath, file.virtualPath))) {continue;}
      let source: HostFilesystemTextSource;
      try {
        source = await readHostFilesystemTextSource(file);
      } catch (error) {
        if (error instanceof BadRequestException && error.message.includes('暂不支持读取二进制文件')) {
          pushRuntimeSkippedEntry(skippedEntries, file.virtualPath, 'binary');
        } else {
          partial = true;
          pushRuntimeSkippedPath(skippedPaths, file.virtualPath);
          pushRuntimeSkippedEntry(skippedEntries, file.virtualPath, 'unreadable');
        }
        continue;
      }
      const rows = splitFilesystemTextLines(source.normalizedContent).flatMap((text, index) => {
        matcher.lastIndex = 0;
        return matcher.test(text) ? [{ line: index + 1, text: truncateFilesystemLine(text, input.maxLineLength) }] : [];
      });
      if (rows.length > 0) {matches.push({ mtime: (await fsPromises.stat(file.hostPath)).mtime.getTime(), rows, virtualPath: file.virtualPath });}
    }
    matches.sort(compareRuntimeSearchEntries);
    const rows: RuntimeFilesystemGrepMatch[] = matches.flatMap((file) => file.rows.map((row) => ({ line: row.line, text: row.text, virtualPath: file.virtualPath })));
    return {
      basePath: listed.basePath,
      matches: rows.slice(0, input.maxMatches),
      partial,
      skippedEntries,
      skippedPaths,
      totalMatches: rows.length,
      truncated: rows.length > input.maxMatches,
    };
  }

  async resolvePath(sessionId: string, inputPath?: string): Promise<HostFilesystemResolvedPath> {
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(sessionId);
    const virtualPath = resolveRuntimeVisiblePath(sessionEnvironment.visibleRoot, inputPath);
    const hostPath = toHostPath(sessionEnvironment.sessionRoot, sessionEnvironment.visibleRoot, virtualPath);
    const type = await readRuntimePathType(hostPath);
    return { exists: type !== 'missing', hostPath, type, virtualPath };
  }

  async statPath(sessionId: string, inputPath?: string): Promise<RuntimeFilesystemPathStat> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (!target.exists) {return { ...target, mtime: null, size: null };}
    const stat = await fsPromises.lstat(target.hostPath);
    return { ...target, mtime: stat.mtime.toISOString(), size: stat.size };
  }

  async readDirectoryEntries(sessionId: string, inputPath?: string): Promise<{ entries: string[]; path: string }> {
    const target = await this.resolveValidatedPath(sessionId, inputPath, { mode: 'directory' });
    return { entries: await readRuntimeDirectoryEntryNames(target.hostPath), path: target.virtualPath };
  }

  async readPathRange(sessionId: string, input: { limit: number; maxLineLength: number; offset: number; path?: string }): Promise<RuntimeFilesystemReadResult> {
    const target = await this.resolveValidatedPath(sessionId, input.path, { mode: 'existing' });
    if (target.type === 'directory') {
      const entries = await readRuntimeDirectoryEntryNames(target.hostPath);
      const startIndex = input.offset - 1;
      if (startIndex > entries.length && !(startIndex === 0 && entries.length === 0)) {throw new BadRequestException(`read.offset 超出范围: ${input.offset}，目录总条目数为 ${entries.length}`);}
      const visibleEntries = entries.slice(startIndex, startIndex + input.limit);
      return { entries: visibleEntries, limit: input.limit, offset: input.offset, path: target.virtualPath, totalEntries: entries.length, truncated: startIndex + visibleEntries.length < entries.length, type: 'directory' };
    }
    const metadata = await readHostFilesystemReadMetadata(target);
    if (metadata.nonTextType) {return { mimeType: metadata.mimeType, path: target.virtualPath, size: metadata.size, type: metadata.nonTextType };}
    const file = await readFilesystemTextRange(target.hostPath, { limit: input.limit, maxBytes: MAX_READ_BYTES, maxLineLength: input.maxLineLength, offset: input.offset });
    return { byteLimited: file.byteLimited, limit: input.limit, lines: file.lines, mimeType: metadata.mimeType, offset: input.offset, path: target.virtualPath, totalBytes: metadata.size, totalLines: file.totalLines, truncated: file.truncated, type: 'file' };
  }

  async readTextFile(sessionId: string, inputPath?: string): Promise<{ content: string; path: string }> {
    const target = await this.resolveValidatedPath(sessionId, inputPath, { mode: 'file' });
    return { content: (await readHostFilesystemTextSource(target)).normalizedContent, path: target.virtualPath };
  }

  async listFiles(sessionId: string, inputPath?: string, options?: { nextStepHint?: string }): Promise<{
    basePath: string;
    files: HostFilesystemFileEntry[];
    partial: boolean;
    skippedEntries: RuntimeFilesystemSkippedEntry[];
    skippedPaths: string[];
  }> {
    const target = await this.resolveValidatedPath(sessionId, inputPath, { mode: 'existing', ...options });
    if (target.type === 'file') {return { basePath: target.virtualPath, files: [{ hostPath: target.hostPath, virtualPath: target.virtualPath }], partial: false, skippedEntries: [], skippedPaths: [] };}
    const files: HostFilesystemFileEntry[] = [], skippedEntries: RuntimeFilesystemSkippedEntry[] = [], skippedPaths: string[] = [];
    let partial = false;
    await collectRuntimeFileTreeEntries({
      absolutePath: target.hostPath,
      buildEntry: (hostPath, virtualPath) => ({ hostPath, virtualPath }),
      files,
      handleError: async (virtualPath) => {
        partial = true;
        pushRuntimeSkippedPath(skippedPaths, virtualPath);
        pushRuntimeSkippedEntry(skippedEntries, virtualPath, 'inaccessible');
      },
      joinLogicalPath: joinRuntimeVisiblePath,
      logicalPath: target.virtualPath,
      visitedDirectories: new Set<string>(),
    });
    files.sort((left, right) => left.virtualPath.localeCompare(right.virtualPath));
    return { basePath: target.virtualPath, files, partial, skippedEntries, skippedPaths };
  }

  async writeTextFile(sessionId: string, inputPath: string, content: string, options?: RuntimeFilesystemWriteOptions): Promise<RuntimeFilesystemWriteResult> {
    return this.writeResolvedTextFile(sessionId, await this.resolveValidatedPath(sessionId, inputPath, { mode: 'writable-file' }), content, undefined, options);
  }

  async editTextFile(sessionId: string, input: { filePath: string; newString: string; oldString: string; replaceAll?: boolean }): Promise<RuntimeFilesystemEditResult> {
    if (input.oldString === input.newString) {throw new BadRequestException('edit.oldString 和 edit.newString 不能完全相同');}
    const target = await this.resolveValidatedPath(sessionId, input.filePath, { mode: input.oldString === '' ? 'writable-file' : 'file' });
    const previousContent = target.exists ? (await readHostFilesystemTextSource(target)).content : '';
    const replaced = input.oldString === '' ? { content: input.newString, occurrences: 1, strategy: 'empty-old-string' as const } : replaceRuntimeText(previousContent, input.oldString, input.newString, input.replaceAll);
    const nextContent = input.oldString === '' && !previousContent ? replaced.content : normalizeWorkspaceLineEnding(replaced.content, detectWorkspaceLineEnding(previousContent));
    const writeResult = await this.writeResolvedTextFile(sessionId, target, nextContent, previousContent);
    if (!writeResult.diff) {throw new BadRequestException(input.oldString === '' ? '空旧文本写入必须产生 diff' : '文本替换必须产生 diff');}
    return { diff: writeResult.diff, occurrences: replaced.occurrences, postWrite: writeResult.postWrite, path: writeResult.path, strategy: replaced.strategy };
  }

  private async writeResolvedTextFile(
    sessionId: string,
    target: HostFilesystemResolvedPath,
    content: string,
    previousContent?: string | null,
    options?: RuntimeFilesystemWriteOptions,
  ): Promise<RuntimeFilesystemWriteResult> {
    const sessionEnvironment = await this.runtimeSessionEnvironmentService.getSessionEnvironment(sessionId);
    const diffBase = previousContent ?? await readFileDiffBase(target);
    const mode = options?.mode ?? 'overwrite';
    const nextContent = mode === 'append' && typeof diffBase === 'string'
      ? `${diffBase}${content}`
      : content;
    const processed = this.runtimeFilesystemPostWriteService?.processTextFile({ content: nextContent, hostPath: target.hostPath, path: target.virtualPath, sessionRoot: sessionEnvironment.sessionRoot, visibleRoot: sessionEnvironment.visibleRoot }) ?? { content: nextContent, postWrite: { diagnostics: [], formatting: null } };
    await fsPromises.mkdir(path.dirname(target.hostPath), { recursive: true });
    await fsPromises.writeFile(target.hostPath, processed.content, 'utf8');
    const status: RuntimeFilesystemWriteStatus = !target.exists ? 'created' : mode === 'append' ? 'appended' : 'overwritten';
    return {
      created: !target.exists,
      diff: diffBase === null ? null : buildRuntimeFilesystemDiff(target.virtualPath, diffBase, processed.content),
      lineCount: splitFilesystemTextLines(processed.content).length,
      path: target.virtualPath,
      postWrite: processed.postWrite,
      size: Buffer.byteLength(processed.content, 'utf8'),
      status,
    };
  }

  private async transferPath(
    sessionId: string,
    fromPath: string,
    toPath: string,
    transfer: (source: HostFilesystemResolvedPath, target: HostFilesystemResolvedPath) => Promise<void>,
  ): Promise<RuntimeFilesystemTransferResult> {
    const source = await this.resolveValidatedPath(sessionId, fromPath, { mode: 'existing' });
    const target = await this.resolveValidatedPath(sessionId, toPath, { mode: 'missing' });
    await fsPromises.mkdir(path.dirname(target.hostPath), { recursive: true });
    await transfer(source, target);
    return { fromPath: source.virtualPath, path: target.virtualPath };
  }

  private async resolveValidatedPath(
    sessionId: string,
    inputPath: string | undefined,
    options: { label?: string; mode: HostFilesystemResolveMode; nextStepHint?: string },
  ): Promise<HostFilesystemResolvedPath> {
    const target = await this.resolvePath(sessionId, inputPath);
    if (options.mode === 'missing') {
      if (target.exists) {throw new BadRequestException(`目标路径已存在: ${target.virtualPath}`);}
      return target;
    }
    if (!target.exists) {
      if (options.mode === 'writable-file') {return target;}
      throw new NotFoundException(await this.readMissingPathMessage(sessionId, target.virtualPath, options.nextStepHint));
    }
    const expectedType = options.mode === 'directory' ? 'directory' : options.mode === 'file' || options.mode === 'writable-file' ? 'file' : undefined;
    if (expectedType && target.type !== expectedType) {throw new BadRequestException(`${options.label ?? '路径'} 不是${expectedType === 'directory' ? '目录' : '文件'}: ${target.virtualPath}`);}
    return target;
  }

  private async readMissingPathMessage(sessionId: string, virtualPath: string, nextStepHint = renderRuntimeMissingPathNextStep('read')): Promise<string> {
    const suggestions = await readNearbyVisiblePaths(await this.runtimeSessionEnvironmentService.getSessionEnvironment(sessionId), virtualPath);
    return suggestions.length > 0 ? [`路径不存在: ${virtualPath}`, '可选路径：', ...suggestions, nextStepHint].join('\n') : `路径不存在: ${virtualPath}`;
  }
}

function compareRuntimeSearchEntries(left: { mtime: number; virtualPath: string }, right: { mtime: number; virtualPath: string }): number { return right.mtime - left.mtime || left.virtualPath.localeCompare(right.virtualPath); }

function toFilesystemRelativePath(basePath: string, virtualPath: string): string { return basePath === virtualPath ? path.posix.basename(virtualPath) : path.posix.relative(basePath, virtualPath) || path.posix.basename(virtualPath); }

async function readFilesystemTextRange(hostPath: string, input: { limit: number; maxBytes: number; maxLineLength: number; offset: number }): Promise<{
  byteLimited: boolean;
  lines: string[];
  totalLines: number;
  truncated: boolean;
}> {
  const stream = fs.createReadStream(hostPath, { encoding: 'utf8' });
  const lineReader = readline.createInterface({ crlfDelay: Infinity, input: stream });
  const { limit, maxBytes, maxLineLength, offset } = input;
  const lines: string[] = [];
  const startIndex = offset - 1;
  let bytes = 0, byteLimited = false, moreLines = false, totalLines = 0;
  try {
    for await (const lineText of lineReader) {
      totalLines += 1;
      if (totalLines <= startIndex) {continue;}
      if (lines.length >= limit) { moreLines = true; continue; }
      const renderedLine = truncateFilesystemLine(lineText, maxLineLength);
      const renderedBytes = Buffer.byteLength(renderedLine, 'utf8') + (lines.length > 0 ? 1 : 0);
      if (bytes + renderedBytes > maxBytes) { byteLimited = true; moreLines = true; break; }
      lines.push(renderedLine);
      bytes += renderedBytes;
    }
  } finally {
    lineReader.close();
    stream.destroy();
  }
  if (startIndex > totalLines && !(startIndex === 0 && totalLines === 0)) {throw new BadRequestException(`read.offset 超出范围: ${offset}，文件总行数为 ${totalLines}`);}
  return { byteLimited, lines, totalLines, truncated: moreLines };
}

async function readNearbyVisiblePaths(sessionEnvironment: RuntimeSessionEnvironment, virtualPath: string): Promise<string[]> {
  const directoryVirtualPath = path.posix.dirname(virtualPath) === '.' ? sessionEnvironment.visibleRoot : path.posix.dirname(virtualPath);
  const directoryHostPath = toHostPath(sessionEnvironment.sessionRoot, sessionEnvironment.visibleRoot, directoryVirtualPath);
  let entries: fs.Dirent[];
  try { entries = await fsPromises.readdir(directoryHostPath, { withFileTypes: true }); } catch { return []; }
  const missingName = path.posix.basename(virtualPath).toLowerCase();
  return entries
    .map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name)
    .filter((entryName) => {
      const normalized = entryName.toLowerCase();
      return normalized.includes(missingName) || missingName.includes(normalized.replace(/\/$/, ''));
    })
    .sort((left, right) => {
      const normalizedLeft = left.toLowerCase().replace(/\/$/, ''), normalizedRight = right.toLowerCase().replace(/\/$/, '');
      return (normalizedLeft.startsWith(missingName) ? 0 : 1) - (normalizedRight.startsWith(missingName) ? 0 : 1)
        || Math.abs(normalizedLeft.length - missingName.length) - Math.abs(normalizedRight.length - missingName.length)
        || normalizedLeft.localeCompare(normalizedRight);
    })
    .slice(0, 3)
    .map((entryName) => normalizeRuntimeVisiblePath(`${directoryVirtualPath}/${entryName}`));
}

function matchesFilesystemGlobPattern(pattern: string, relativePath: string): boolean {
  return path.posix.matchesGlob(relativePath, pattern) || (!pattern.includes('/') && path.posix.matchesGlob(path.posix.basename(relativePath), pattern));
}

function detectWorkspaceLineEnding(content: string): '\n' | '\r\n' { return content.includes('\r\n') ? '\r\n' : '\n'; }
function splitFilesystemTextLines(content: string): string[] { return !content.length ? [] : content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n'); }
function truncateFilesystemLine(line: string, maxLineLength: number): string { return line.length > maxLineLength ? `${line.slice(0, maxLineLength)}${MAX_READ_LINE_SUFFIX}` : line; }
function normalizeWorkspaceLineEnding(content: string, lineEnding: '\n' | '\r\n'): string { return lineEnding === '\n' ? content.replace(/\r\n/g, '\n') : content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'); }

async function readFileDiffBase(target: HostFilesystemResolvedPath): Promise<string | null> { if (!target.exists || target.type !== 'file') {return '';} const metadata = await readHostFilesystemReadMetadata(target); return metadata.nonTextType ? null : fsPromises.readFile(target.hostPath, 'utf8'); }

async function readHostFilesystemTextSource(target: Pick<HostFilesystemResolvedPath, 'hostPath' | 'virtualPath'>): Promise<HostFilesystemTextSource> {
  const metadata = await readHostFilesystemReadMetadata(target);
  if (metadata.nonTextType) {throw new BadRequestException(`暂不支持读取二进制文件: ${target.virtualPath} (${metadata.mimeType})`);}
  const content = await fsPromises.readFile(target.hostPath, 'utf8');
  return { ...metadata, content, normalizedContent: content.replace(/\r\n/g, '\n') };
}

async function readHostFilesystemReadMetadata(target: Pick<HostFilesystemResolvedPath, 'hostPath' | 'virtualPath'>): Promise<HostFilesystemReadMetadata> {
  const stat = await fsPromises.stat(target.hostPath);
  const extension = path.extname(target.virtualPath).toLowerCase();
  const mimeType = MIME_TYPE_BY_EXTENSION[extension] ?? (PLAIN_TEXT_MIME_EXTENSIONS.has(extension) ? 'text/plain' : 'application/octet-stream');
  const nonTextType = mimeType.startsWith('image/') && mimeType !== 'image/svg+xml' && mimeType !== 'image/vnd.fastbidsheet' ? 'image' : mimeType === 'application/pdf' ? 'pdf' : undefined;
  if (nonTextType) {return { mimeType, nonTextType, size: stat.size };}
  let containsBinary = false;
  if (stat.size > 0) {
    const file = await fsPromises.open(target.hostPath, 'r');
    try {
      const sampleSize = Math.min(stat.size, 4096);
      const buffer = Buffer.alloc(sampleSize);
      containsBinary = containsRuntimeBinarySample(buffer.subarray(0, (await file.read(buffer, 0, sampleSize, 0)).bytesRead));
    } finally {
      await file.close();
    }
  }
  return { mimeType, nonTextType: BINARY_PATH_EXTENSIONS.has(extension) || containsBinary ? 'binary' : undefined, size: stat.size };
}

function pushRuntimeSkippedPath(skippedPaths: string[], virtualPath: string): void { if (!skippedPaths.includes(virtualPath)) {skippedPaths.push(virtualPath);} }

function pushRuntimeSkippedEntry(skippedEntries: RuntimeFilesystemSkippedEntry[], virtualPath: string, reason: RuntimeFilesystemSkippedReason): void { if (!skippedEntries.some((entry) => entry.path === virtualPath && entry.reason === reason)) {skippedEntries.push({ path: virtualPath, reason });} }
