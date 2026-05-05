import type { RuntimeBackendKind } from './runtime-permission';

export interface PluginRuntimeCommandParams {
  backendKind?: RuntimeBackendKind;
  command: string;
  description: string;
  timeout?: number;
  workdir?: string;
}

export interface PluginRuntimeCommandStreamStats {
  bytes: number;
  lines: number;
}

export interface PluginRuntimeCommandResult {
  backendKind: RuntimeBackendKind;
  cwd: string;
  exitCode: number;
  outputPath?: string;
  sessionId: string;
  stderr: string;
  stderrStats: PluginRuntimeCommandStreamStats;
  stdout: string;
  stdoutStats: PluginRuntimeCommandStreamStats;
}

export interface PluginRuntimeReadParams {
  filePath: string;
  limit?: number;
  offset?: number;
}

export interface PluginRuntimeReadInstructionEntry {
  content: string;
  path: string;
}

export interface PluginRuntimeReadDirectoryResult {
  entries: string[];
  limit: number;
  offset: number;
  path: string;
  totalEntries: number;
  truncated: boolean;
  type: 'directory';
}

export interface PluginRuntimeReadFileResult {
  byteLimited: boolean;
  limit: number;
  lines: string[];
  mimeType: string;
  offset: number;
  path: string;
  totalBytes: number;
  totalLines: number;
  truncated: boolean;
  type: 'file';
}

export interface PluginRuntimeReadAssetResult {
  mimeType: string;
  path: string;
  size: number;
  type: 'binary' | 'image' | 'pdf';
}

export type PluginRuntimeReadBackendResult =
  | PluginRuntimeReadDirectoryResult
  | PluginRuntimeReadFileResult
  | PluginRuntimeReadAssetResult;

export interface PluginRuntimeReadResult {
  freshnessReminders: string[];
  loaded: string[];
  readResult: PluginRuntimeReadBackendResult;
  reminderEntries: PluginRuntimeReadInstructionEntry[];
}

export interface PluginRuntimeGlobParams {
  path?: string;
  pattern: string;
}

export type PluginRuntimeSearchSkippedReason = 'binary' | 'inaccessible' | 'unreadable';

export interface PluginRuntimeSearchSkippedEntry {
  path: string;
  reason: PluginRuntimeSearchSkippedReason;
}

export interface PluginRuntimeGlobBackendResult {
  basePath: string;
  matches: string[];
  partial: boolean;
  skippedEntries: PluginRuntimeSearchSkippedEntry[];
  skippedPaths: string[];
  totalMatches: number;
  truncated: boolean;
}

export interface PluginRuntimeGlobResult {
  globResult: PluginRuntimeGlobBackendResult;
  overlay: string[];
}

export interface PluginRuntimeGrepParams {
  include?: string;
  path?: string;
  pattern: string;
}

export interface PluginRuntimeGrepMatch {
  line: number;
  text: string;
  virtualPath: string;
}

export interface PluginRuntimeGrepBackendResult {
  basePath: string;
  matches: PluginRuntimeGrepMatch[];
  partial: boolean;
  skippedEntries: PluginRuntimeSearchSkippedEntry[];
  skippedPaths: string[];
  totalMatches: number;
  truncated: boolean;
}

export interface PluginRuntimeGrepResult {
  grepResult: PluginRuntimeGrepBackendResult;
  overlay: string[];
}

export interface PluginRuntimeWriteParams {
  content: string;
  filePath: string;
  mode?: 'append' | 'overwrite';
}

export interface PluginRuntimeFileDiffSummary {
  additions: number;
  afterLineCount: number;
  beforeLineCount: number;
  deletions: number;
  patch: string;
}

export interface PluginRuntimeFormattingSummary {
  kind: string;
  label: string;
}

export interface PluginRuntimeDiagnosticEntry {
  code?: string;
  column: number;
  line: number;
  message: string;
  path: string;
  severity: 'error' | 'hint' | 'info' | 'warning';
  source: string;
}

export interface PluginRuntimeDiagnosticSeverityCounts {
  error: number;
  hint: number;
  info: number;
  warning: number;
}

export interface PluginRuntimePostWriteResult {
  diagnostics: PluginRuntimeDiagnosticEntry[];
  formatting: PluginRuntimeFormattingSummary | null;
}

export interface PluginRuntimePostWriteSummary {
  currentFileDiagnostics: number;
  formatting: PluginRuntimeFormattingSummary | null;
  nextHint: string | null;
  omittedRelatedFiles: number;
  relatedFileDiagnostics: number;
  relatedFiles: number;
  relatedFocusPaths: string[];
  severityCounts: PluginRuntimeDiagnosticSeverityCounts;
  totalDiagnostics: number;
  visibleRelatedFiles: number;
  visibleRelatedPaths: string[];
}

export interface PluginRuntimeWriteResult {
  created: boolean;
  diff: PluginRuntimeFileDiffSummary | null;
  lineCount: number;
  path: string;
  postWrite: PluginRuntimePostWriteResult;
  size: number;
  status: 'appended' | 'created' | 'overwritten';
}

export interface PluginRuntimeEditParams {
  filePath: string;
  newString: string;
  oldString: string;
  replaceAll?: boolean;
}

export interface PluginRuntimeEditResult {
  diff: PluginRuntimeFileDiffSummary;
  occurrences: number;
  path: string;
  postWrite: PluginRuntimePostWriteResult;
  strategy: string;
}
