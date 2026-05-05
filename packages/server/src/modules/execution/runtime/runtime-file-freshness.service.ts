import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { RuntimeFilesystemBackendService } from './runtime-filesystem-backend.service';

interface RuntimeReadStamp { continuationOffset?: number; loadedWindow?: string; mtime: string | null; readAt: string; size: number | null; }
interface RuntimeRecentReadEntry extends Pick<RuntimeReadStamp, 'continuationOffset' | 'loadedWindow' | 'readAt'> { path: string; }
interface RuntimeRecentReadOptions { excludePath?: string; includeOnlyLoadedContext?: boolean; limit?: number; }
interface RuntimeRememberReadOptions { lineCount?: number; offset?: number; totalLines?: number; truncated?: boolean; }
export interface RuntimeWriteFreshnessOptions { requireReadBeforeWrite?: boolean; }

@Injectable()
export class RuntimeFileFreshnessService {
  private readonly readStamps = new Map<string, Map<string, RuntimeReadStamp>>();
  private readonly fileLocks = new Map<string, Promise<void>>();
  private readonly readInstructionClaims = new Map<string, Set<string>>();

  constructor(private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService) {}

  async assertCanWrite(sessionId: string, filePath: string, backendKind?: RuntimeBackendKind): Promise<void> {
    const stat = await this.runtimeFilesystemBackendService.statPath(sessionId, filePath, backendKind);
    if (!stat.exists || stat.type !== 'file') { return; }
    const stamp = this.readStamps.get(sessionId)?.get(stat.virtualPath);
    if (!stamp) {
      throw new BadRequestException([`修改已有文件前必须先读取: ${stat.virtualPath}`, '请先使用 read 工具读取该文件。', ...renderRuntimeRecentReadHints(this.listRecentReadEntries(sessionId, { excludePath: stat.virtualPath, includeOnlyLoadedContext: true, limit: 5 }))].join('\n'));
    }
    if (stamp.mtime === stat.mtime && stamp.size === stat.size) { return; }
    throw new BadRequestException([`文件在上次读取后已被修改: ${stat.virtualPath}`, `最近修改: ${stat.mtime ?? 'unknown'}`, `上次读取: ${stamp.readAt}`, ...(stamp.loadedWindow ? [`已过期上下文: ${stamp.loadedWindow}`] : []), `请先重新读取当前文件: read ${stat.virtualPath}`].join('\n'));
  }

  async rememberRead(sessionId: string, filePath: string, backendKind?: RuntimeBackendKind, options?: RuntimeRememberReadOptions): Promise<void> {
    const stat = await this.runtimeFilesystemBackendService.statPath(sessionId, filePath, backendKind);
    if (!stat.exists || stat.type !== 'file') { return; }
    this.readSessionStamps(sessionId).set(stat.virtualPath, { ...(options ? readRuntimeReadStampContext(options) : {}), mtime: stat.mtime, readAt: new Date().toISOString(), size: stat.size });
  }

  listRecentReads(sessionId: string, options: RuntimeRecentReadOptions = {}): string[] { return this.listRecentReadEntries(sessionId, options).map((entry) => entry.path); }

  claimReadInstructionPaths(sessionId: string, paths: string[], assistantMessageId?: string): string[] {
    const scopeKey = assistantMessageId?.trim() ? `${sessionId}::${assistantMessageId.trim()}` : sessionId, claimed = this.readInstructionClaims.get(scopeKey) ?? new Set<string>();
    this.readInstructionClaims.set(scopeKey, claimed);
    return paths.filter((nextPath) => Boolean(nextPath) && !claimed.has(nextPath) && (claimed.add(nextPath), true));
  }

  listRecentReadEntries(sessionId: string, options: RuntimeRecentReadOptions = {}): RuntimeRecentReadEntry[] {
    const sessionStamps = this.readStamps.get(sessionId), excludePath = options.excludePath?.trim();
    if (!sessionStamps) { return []; }
    return [...sessionStamps.entries()]
      .filter(([virtualPath, stamp]) => (!excludePath || virtualPath !== excludePath) && (!(options.includeOnlyLoadedContext ?? false) || Boolean(stamp.loadedWindow || stamp.continuationOffset)))
      .sort((left, right) => right[1].readAt.localeCompare(left[1].readAt))
      .slice(0, options.limit ?? 5)
      .map(([path, stamp]) => ({ continuationOffset: stamp.continuationOffset, loadedWindow: stamp.loadedWindow, path, readAt: stamp.readAt }));
  }

  buildReadSystemReminder(sessionId: string, options: RuntimeRecentReadOptions = {}): string[] {
    const recentReads = this.listRecentReadEntries(sessionId, { ...options, includeOnlyLoadedContext: true });
    return recentReads.length === 0 ? [] : ['<system-reminder>', '本 session 已加载这些文件上下文（按最近读取排序）：', ...renderRuntimeRecentReadEntries(recentReads), '如需跨文件继续，优先复用这些已加载内容，避免重复 read。', '如果目标文件可能已变化，修改前先重新 read 该文件。', '</system-reminder>'];
  }

  async withFileLock<T>(sessionId: string, filePath: string, run: () => Promise<T>, backendKind?: RuntimeBackendKind): Promise<T> {
    const resolvedPath = await this.runtimeFilesystemBackendService.resolvePath(sessionId, filePath, backendKind), lockKey = `${sessionId}:${resolvedPath.virtualPath}`, previous = this.fileLocks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; }), queued = previous.then(() => current);
    this.fileLocks.set(lockKey, queued);
    await previous;
    try { return await run(); } finally {
      release();
      if (this.fileLocks.get(lockKey) === queued) { this.fileLocks.delete(lockKey); }
    }
  }

  async withWriteFreshnessGuard<T extends { path: string }>(
    sessionId: string,
    filePath: string,
    run: () => Promise<T>,
    backendKind?: RuntimeBackendKind,
    options?: RuntimeWriteFreshnessOptions,
  ): Promise<T> {
    return this.withFileLock(sessionId, filePath, async () => {
      const statBeforeWrite = await this.runtimeFilesystemBackendService.statPath(sessionId, filePath, backendKind);
      if (options?.requireReadBeforeWrite !== false) {
        await this.assertCanWrite(sessionId, filePath, backendKind);
      }
      const result = await run();
      if (options?.requireReadBeforeWrite !== false || !statBeforeWrite.exists || statBeforeWrite.type !== 'file') {
        await this.rememberRead(sessionId, result.path, backendKind);
      }
      return result;
    }, backendKind);
  }

  private readSessionStamps(sessionId: string): Map<string, RuntimeReadStamp> {
    let sessionStamps = this.readStamps.get(sessionId);
    if (!sessionStamps) { sessionStamps = new Map<string, RuntimeReadStamp>(); this.readStamps.set(sessionId, sessionStamps); }
    return sessionStamps;
  }
}

function renderRuntimeRecentReadHints(recentReads: RuntimeRecentReadEntry[]): string[] {
  return recentReads.length === 0 ? [] : ['本 session 已加载的其他文件上下文（按最近读取排序）：', ...renderRuntimeRecentReadEntries(recentReads)];
}

function renderRuntimeRecentReadEntries(recentReads: RuntimeRecentReadEntry[]): string[] {
  return recentReads.map((entry, index) => {
    const age = readRuntimeRecentReadAge(entry.readAt), header = age ? `[最近读取 #${index + 1} | ${age}]` : `[最近读取 #${index + 1}]`;
    const detail = [entry.loadedWindow, entry.continuationOffset ? `下一步可 read ${entry.path} offset=${entry.continuationOffset}` : '当前窗口已加载，可直接复用'].filter((part): part is string => Boolean(part));
    return detail.length > 0 ? `- ${header} ${entry.path} (${detail.join('，')})` : `- ${header} ${entry.path}`;
  });
}

function readRuntimeReadStampContext(options: RuntimeRememberReadOptions): Pick<RuntimeReadStamp, 'continuationOffset' | 'loadedWindow'> {
  const offset = options.offset ?? 0, lineCount = options.lineCount ?? 0;
  if (offset <= 0) { return {}; }
  if (lineCount <= 0) { return options.totalLines === 0 ? { loadedWindow: '已加载空文件（0 lines of 0）' } : {}; }
  const end = offset + lineCount - 1;
  return { continuationOffset: options.truncated ? end + 1 : undefined, loadedWindow: options.totalLines ? `已加载 lines ${offset}-${end} of ${options.totalLines}` : `已加载 lines ${offset}-${end}` };
}

function readRuntimeRecentReadAge(readAt: string): string | undefined {
  const readTimestamp = Date.parse(readAt);
  if (Number.isNaN(readTimestamp)) { return undefined; }
  const seconds = Math.max(0, Math.floor((Date.now() - readTimestamp) / 1000));
  if (seconds < 5) { return '刚刚读取'; }
  if (seconds < 60) { return `${seconds} 秒前`; }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) { return `${minutes} 分钟前`; }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) { return `${hours} 小时前`; }
  const date = new Date(readTimestamp);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')} ${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')} 读取`;
}
