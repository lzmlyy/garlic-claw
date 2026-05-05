import type { RuntimeBackendKind } from '@garlic-claw/shared';
import type { RuntimeBackendDescriptor } from './runtime-command.types';
import type { RuntimeFilesystemDiffSummary } from '../file/runtime-file-diff';

export interface RuntimeFilesystemResolvedPath { exists: boolean; type: 'directory' | 'file' | 'missing'; virtualPath: string; }
export interface RuntimeFilesystemPathStat extends RuntimeFilesystemResolvedPath { mtime: string | null; size: number | null; }
export interface RuntimeFilesystemReadBaseResult { limit: number; offset: number; path: string; truncated: boolean; type: 'directory' | 'file'; }
export interface RuntimeFilesystemReadDirectoryResult extends RuntimeFilesystemReadBaseResult { entries: string[]; totalEntries: number; type: 'directory'; }
export interface RuntimeFilesystemReadFileResult extends RuntimeFilesystemReadBaseResult { byteLimited: boolean; lines: string[]; mimeType: string; totalBytes: number; totalLines: number; type: 'file'; }
export interface RuntimeFilesystemReadAssetResult { mimeType: string; path: string; size: number; type: 'binary' | 'image' | 'pdf'; }
export type RuntimeFilesystemReadResult = RuntimeFilesystemReadDirectoryResult | RuntimeFilesystemReadFileResult | RuntimeFilesystemReadAssetResult;

export interface RuntimeFilesystemFileEntry { virtualPath: string; }
export type RuntimeFilesystemSkippedReason = 'binary' | 'inaccessible' | 'unreadable';
export interface RuntimeFilesystemSkippedEntry { path: string; reason: RuntimeFilesystemSkippedReason; }
export type RuntimeFilesystemDiagnosticSeverity = 'error' | 'hint' | 'info' | 'warning';
export interface RuntimeFilesystemDiagnosticEntry { code?: string; column: number; line: number; message: string; path: string; severity: RuntimeFilesystemDiagnosticSeverity; source: string; }
export interface RuntimeFilesystemFormattingResult { kind: string; label: string; }
export interface RuntimeFilesystemPostWriteResult { diagnostics: RuntimeFilesystemDiagnosticEntry[]; formatting: RuntimeFilesystemFormattingResult | null; }
export interface RuntimeFilesystemDirectoryResult { created: boolean; path: string; }
export type RuntimeFilesystemWriteMode = 'append' | 'overwrite';
export type RuntimeFilesystemWriteStatus = 'appended' | 'created' | 'overwritten';
export interface RuntimeFilesystemWriteOptions { mode?: RuntimeFilesystemWriteMode; }
export interface RuntimeFilesystemWriteResult { created: boolean; diff: RuntimeFilesystemDiffSummary | null; lineCount: number; postWrite: RuntimeFilesystemPostWriteResult; path: string; size: number; status: RuntimeFilesystemWriteStatus; }
export interface RuntimeFilesystemEditResult { diff: RuntimeFilesystemDiffSummary; occurrences: number; postWrite: RuntimeFilesystemPostWriteResult; path: string; strategy: string; }
export interface RuntimeFilesystemDeleteResult { deleted: boolean; path: string; }
export interface RuntimeFilesystemTransferResult { fromPath: string; path: string; }
export interface RuntimeFilesystemSymlinkResult { path: string; target: string; }
export interface RuntimeFilesystemGlobResult { basePath: string; matches: string[]; partial: boolean; skippedEntries: RuntimeFilesystemSkippedEntry[]; skippedPaths: string[]; totalMatches: number; truncated: boolean; }
export interface RuntimeFilesystemGrepMatch { line: number; text: string; virtualPath: string; }
export interface RuntimeFilesystemGrepResult { basePath: string; matches: RuntimeFilesystemGrepMatch[]; partial: boolean; skippedEntries: RuntimeFilesystemSkippedEntry[]; skippedPaths: string[]; totalMatches: number; truncated: boolean; }

export interface RuntimeFilesystemBackend {
  copyPath(sessionId: string, fromPath: string, toPath: string): Promise<RuntimeFilesystemTransferResult>;
  createSymlink(sessionId: string, input: { linkPath: string; targetPath: string }): Promise<RuntimeFilesystemSymlinkResult>;
  deletePath(sessionId: string, inputPath: string): Promise<RuntimeFilesystemDeleteResult>;
  editTextFile(sessionId: string, input: { filePath: string; newString: string; oldString: string; replaceAll?: boolean }): Promise<RuntimeFilesystemEditResult>;
  ensureDirectory(sessionId: string, inputPath: string): Promise<RuntimeFilesystemDirectoryResult>;
  getDescriptor(): RuntimeBackendDescriptor;
  getKind(): RuntimeBackendKind;
  globPaths(sessionId: string, input: { maxResults: number; pattern: string; path?: string }): Promise<RuntimeFilesystemGlobResult>;
  grepText(sessionId: string, input: { include?: string; maxLineLength: number; maxMatches: number; path?: string; pattern: string }): Promise<RuntimeFilesystemGrepResult>;
  listFiles(sessionId: string, inputPath?: string): Promise<{ basePath: string; files: RuntimeFilesystemFileEntry[] }>;
  movePath(sessionId: string, fromPath: string, toPath: string): Promise<RuntimeFilesystemTransferResult>;
  readDirectoryEntries(sessionId: string, inputPath?: string): Promise<{ entries: string[]; path: string }>;
  readPathRange(sessionId: string, input: { limit: number; maxLineLength: number; offset: number; path?: string }): Promise<RuntimeFilesystemReadResult>;
  readSymlink(sessionId: string, inputPath: string): Promise<RuntimeFilesystemSymlinkResult>;
  resolvePath(sessionId: string, inputPath?: string): Promise<RuntimeFilesystemResolvedPath>;
  statPath(sessionId: string, inputPath?: string): Promise<RuntimeFilesystemPathStat>;
  readTextFile(sessionId: string, inputPath?: string): Promise<{ content: string; path: string }>;
  writeTextFile(sessionId: string, inputPath: string, content: string, options?: RuntimeFilesystemWriteOptions): Promise<RuntimeFilesystemWriteResult>;
}
