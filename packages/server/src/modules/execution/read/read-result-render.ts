export interface RuntimeReadDirectoryView {
  offset: number;
  entries: string[];
  path: string;
  totalEntries: number;
  truncated: boolean;
}

export interface RuntimeReadAssetView {
  mimeType: string;
  path: string;
  size: number;
  type: 'image' | 'pdf' | 'binary';
}

export interface RuntimeReadFileView {
  byteLimited: boolean;
  lines: string[];
  mimeType: string;
  offset: number;
  path: string;
  totalBytes: number;
  totalLines: number;
  truncated: boolean;
}

export function renderDirectoryReadOutput(result: RuntimeReadDirectoryView): string {
  const start = result.offset;
  const end = result.offset + result.entries.length - 1;
  return [
    '<read_result>',
    `Path: ${result.path}`,
    'Type: directory',
    '<entries>',
    ...(result.entries.length > 0 ? result.entries : ['(empty)']),
    result.truncated
      ? `(showing entries ${start}-${end} of ${result.totalEntries}. Use offset=${end + 1} to continue. Read a child path from this directory to inspect content.)`
      : `(total entries: ${result.totalEntries}. Read a child path from this directory to inspect content.)`,
    '</entries>',
    '</read_result>',
  ].join('\n');
}

export function renderAssetReadOutput(result: RuntimeReadAssetView): string {
  return [
    '<read_result>',
    `Path: ${result.path}`,
    `Type: ${result.type}`,
    `Mime: ${result.mimeType}`,
    `Size: ${formatReadSize(result.size)}`,
    `${readAssetSummary(result.type)} Read a related text file or use an asset-aware tool to continue.`,
    '</read_result>',
  ].join('\n');
}

export function renderFileReadOutput(
  result: RuntimeReadFileView,
  reminderLines: string[],
  options: { maxReadBytesLabel: string },
): string {
  const start = result.offset;
  const end = result.offset + result.lines.length - 1;
  return [
    '<read_result>',
    `Path: ${result.path}`,
    'Type: file',
    `Mime: ${result.mimeType}`,
    '<content>',
    ...(result.lines.length > 0
      ? result.lines.map((line, index) => `${start + index}: ${line}`)
      : ['(empty)']),
    result.byteLimited
      ? `(output capped at ${options.maxReadBytesLabel}. Showing lines ${start}-${end}. Use offset=${end + 1} to continue reading this file. If this file is large or has long lines, use grep to find anchors before reading another window.)`
      : result.truncated
        ? `(showing lines ${start}-${end} of ${result.totalLines}. Use offset=${end + 1} to continue reading this file. If this file is large or has long lines, use grep to find anchors before reading another window.)`
        : `(end of file, total lines: ${result.totalLines}, total bytes: ${formatReadSize(result.totalBytes)}. Re-run read with a different offset if you need another window.)`,
    '</content>',
    ...reminderLines,
    '</read_result>',
  ].join('\n');
}

function readAssetSummary(type: RuntimeReadAssetView['type']): string {
  return type === 'image'
    ? 'Image file detected. Text content was not expanded.'
    : type === 'pdf'
      ? 'PDF file detected. Text content was not expanded.'
      : 'Binary file detected. Text content was not expanded.';
}

function formatReadSize(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
