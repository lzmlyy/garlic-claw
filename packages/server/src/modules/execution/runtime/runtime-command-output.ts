import type { RuntimeCommandStreamStats } from './runtime-command.types';

export const DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_LINES = 200;
export const DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_BYTES = 16 * 1024;

interface RuntimeCommandRenderableResult {
  cwd: string;
  exitCode: number;
  outputPath?: string;
  stderr: string;
  stderrStats: RuntimeCommandStreamStats;
  stdout: string;
  stdoutStats: RuntimeCommandStreamStats;
}

export interface RuntimeCommandTextOutputOptions {
  maxBytes?: number;
  maxLines?: number;
  resultTagName?: string;
  showTruncationDetails?: boolean;
}

interface RuntimeCommandRenderedStream {
  output: string;
  truncatedByBytes: boolean;
  truncatedByLines: boolean;
}

interface RuntimeCommandOutputLimits {
  maxBytes: number;
  maxLines: number;
  resultTagName: string;
  showTruncationDetails: boolean;
}

export function renderRuntimeCommandTextOutput(
  result: RuntimeCommandRenderableResult,
  options?: RuntimeCommandTextOutputOptions,
): string {
  const limits = normalizeRuntimeCommandOutputOptions(options);
  const stdout = renderRuntimeCommandStream(result.stdout, result.stdoutStats, limits);
  const stderr = renderRuntimeCommandStream(result.stderr, result.stderrStats, limits);
  const sections = readRuntimeCommandSections(stdout.output, stderr.output, result.stdout, result.stderr);
  const metadata = readRuntimeCommandMetadata(result.exitCode, result.stderr);
  const truncationPrefix = readRuntimeCommandTruncationPrefix(result.outputPath, stdout, stderr, limits);
  return [
    `<${limits.resultTagName}>`,
    ...(truncationPrefix.length > 0 ? [...truncationPrefix, ''] : []),
    ...sections,
    ...(metadata.length > 0 ? ['', '<bash_metadata>', ...metadata, '</bash_metadata>'] : []),
    `</${limits.resultTagName}>`,
  ].join('\n');
}

function normalizeRuntimeCommandOutputOptions(options?: RuntimeCommandTextOutputOptions): RuntimeCommandOutputLimits {
  return {
    maxBytes: normalizeRuntimeCommandOutputLimit(options?.maxBytes, DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_BYTES),
    maxLines: normalizeRuntimeCommandOutputLimit(options?.maxLines, DEFAULT_MAX_RUNTIME_COMMAND_OUTPUT_LINES),
    resultTagName: normalizeRuntimeResultTagName(options?.resultTagName),
    showTruncationDetails: options?.showTruncationDetails ?? true,
  };
}

function normalizeRuntimeResultTagName(value: string | undefined): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z][A-Za-z0-9_-]*$/u.test(normalized)
    ? normalized
    : 'bash_result';
}

function renderRuntimeCommandStream(
  text: string,
  stats: RuntimeCommandStreamStats | undefined,
  limits: RuntimeCommandOutputLimits,
): RuntimeCommandRenderedStream {
  if (!text) {
    return { output: '(empty)', truncatedByBytes: false, truncatedByLines: false };
  }
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.endsWith('\n') ? normalized.slice(0, -1).split('\n') : normalized.split('\n');
  const tail = limits.maxLines > 0 ? lines.slice(-limits.maxLines) : [...lines];
  let output = tail.join('\n');
  const truncatedByLines = limits.maxLines > 0 && tail.length < lines.length;
  let truncatedByBytes = false;
  while (limits.maxBytes > 0 && Buffer.byteLength(output, 'utf8') > limits.maxBytes && tail.length > 1) {
    tail.shift();
    output = tail.join('\n');
    truncatedByBytes = true;
  }
  if (limits.maxBytes > 0 && Buffer.byteLength(output, 'utf8') > limits.maxBytes) {
    output = trimRuntimeCommandBytes(output, limits.maxBytes);
    truncatedByBytes = true;
  }
  if (!limits.showTruncationDetails || (!truncatedByLines && !truncatedByBytes)) {
    return {
      output: output || '(empty)',
      truncatedByBytes,
      truncatedByLines,
    };
  }
  return {
    output: [`... output truncated (${readRuntimeTruncationDetail(text, stats, tail.length, limits.maxBytes, truncatedByLines, truncatedByBytes)}) ...`, output || '(empty)'].join('\n'),
    truncatedByBytes,
    truncatedByLines,
  };
}

function trimRuntimeCommandBytes(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, 'utf8');
  let start = buffer.length - maxBytes;
  while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) {
    start += 1;
  }
  return buffer.subarray(start).toString('utf8');
}

function readRuntimeTruncationDetail(
  text: string,
  stats: RuntimeCommandStreamStats | undefined,
  keptLines: number,
  maxBytes: number,
  truncatedByLines: boolean,
  truncatedByBytes: boolean,
): string {
  const normalized = stats ?? readRuntimeCommandStreamStats(text);
  return [
    truncatedByLines ? `共 ${normalized.lines} 行，仅保留最后 ${keptLines} 行` : null,
    truncatedByBytes ? `共 ${normalized.bytes} 字节，仅保留最后 ${maxBytes} 字节内的内容` : null,
  ].filter((item): item is string => Boolean(item)).join('，');
}

function readRuntimeCommandSections(
  stdout: string,
  stderr: string,
  rawStdout: string,
  rawStderr: string,
): string[] {
  const sections: string[] = [];
  if (rawStdout.trim().length > 0) {
    sections.push('<stdout>', stdout, '</stdout>');
  }
  if (rawStderr.trim().length > 0) {
    if (sections.length > 0) {
      sections.push('');
    }
    sections.push('<stderr>', stderr, '</stderr>');
  }
  return sections.length > 0 ? sections : ['(no output)'];
}

function readRuntimeCommandMetadata(exitCode: number, stderr: string): string[] {
  const metadata: string[] = [];
  if (exitCode !== 0) {
    metadata.push(`Command exited with code ${exitCode}.`);
  }
  if (stderr.trim().length > 0 && exitCode === 0) {
    metadata.push('Command produced stderr output; review it for warnings or errors.');
  }
  return metadata;
}

function readRuntimeCommandTruncationPrefix(
  outputPath: string | undefined,
  stdout: RuntimeCommandRenderedStream,
  stderr: RuntimeCommandRenderedStream,
  limits: RuntimeCommandOutputLimits,
): string[] {
  const truncationLine = readRuntimeCommandTruncationLine(stdout, stderr, limits);
  if (!truncationLine && !outputPath) {
    return [];
  }
  return [
    ...(truncationLine ? [truncationLine] : []),
    ...(outputPath ? [`Full output saved to: ${outputPath}`] : []),
    ...((truncationLine || outputPath) ? ['Use grep to search the full output or read the saved file with offset/limit to inspect a narrower window.'] : []),
  ];
}

function readRuntimeCommandTruncationLine(
  stdout: RuntimeCommandRenderedStream,
  stderr: RuntimeCommandRenderedStream,
  limits: RuntimeCommandOutputLimits,
): string | null {
  if (!limits.showTruncationDetails) {
    return null;
  }
  const detail = [stdout, stderr]
    .map((stream) => stream.truncatedByLines || stream.truncatedByBytes ? readRuntimeTruncationDetailFromRendered(stream, limits) : null)
    .find((item): item is string => Boolean(item));
  if (!detail) {
    return null;
  }
  return `...output truncated (${detail})...`;
}

function readRuntimeTruncationDetailFromRendered(
  rendered: RuntimeCommandRenderedStream,
  limits: RuntimeCommandOutputLimits,
): string {
  return [
    rendered.truncatedByLines && limits.maxLines > 0 ? `仅保留最后 ${limits.maxLines} 行` : null,
    rendered.truncatedByBytes && limits.maxBytes > 0 ? `仅保留最后 ${limits.maxBytes} 字节内的内容` : null,
  ].filter((item): item is string => Boolean(item)).join('，');
}

function readRuntimeCommandStreamStats(text: string): RuntimeCommandStreamStats {
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: text.length === 0 ? 0 : text.replace(/\r\n/g, '\n').split('\n').length,
  };
}

function normalizeRuntimeCommandOutputLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
