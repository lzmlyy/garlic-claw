import { BadRequestException, Injectable } from '@nestjs/common';
import type { Tool } from 'ai';
import type { PluginParamSchema, PluginRuntimePostWriteSummary, RuntimeBackendKind } from '@garlic-claw/shared';
import type { RuntimeFilesystemDiffSummary } from '../file/runtime-file-diff';
import { renderRuntimeFilesystemDiffLines } from '../file/runtime-file-diff-report';
import { readRuntimeFilesystemPostWriteSummary, renderRuntimeFilesystemPostWriteLines } from '../file/runtime-file-post-write-report';
import { RuntimeFileFreshnessService } from '../runtime/runtime-file-freshness.service';
import type { RuntimeToolAccessRequest } from '../runtime/runtime-tool-access';
import { RuntimeSessionEnvironmentService } from '../runtime/runtime-session-environment.service';
import { RuntimeFilesystemBackendService } from '../runtime/runtime-filesystem-backend.service';
import type { RuntimeFilesystemPostWriteResult } from '../runtime/runtime-filesystem-backend.types';

export interface WriteToolInput {
  backendKind: RuntimeBackendKind;
  content: string;
  filePath: string;
  sessionId: string;
}

export interface WriteToolResult {
  created: boolean;
  diff: RuntimeFilesystemDiffSummary | null;
  lineCount: number;
  output: string;
  path: string;
  postWrite: RuntimeFilesystemPostWriteResult;
  postWriteSummary: PluginRuntimePostWriteSummary;
  size: number;
}

export const WRITE_TOOL_PARAMETERS: Record<string, PluginParamSchema> = {
  filePath: { description: '要写入的文件路径。相对路径会基于当前 backend 的可见根解析。', required: true, type: 'string' },
  content: { description: '要写入文件的完整内容。', required: true, type: 'string' },
};

@Injectable()
export class WriteToolService {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
    private readonly runtimeFileFreshnessService: RuntimeFileFreshnessService,
  ) {}

  getToolName(): string {
    return 'write';
  }

  buildToolDescription(): string {
    const { visibleRoot } = this.runtimeSessionEnvironmentService.getDescriptor();
    return [
      '直接把完整内容写入目标文件。',
      visibleRoot === '/' ? 'filePath 可传相对路径或 backend 可见的绝对路径；相对路径按当前 backend 可见根解析。' : `filePath 必须位于 ${visibleRoot} 内；相对路径也按该可见根解析。`,
      '需要写新文件时直接调用 write；不需要先描述将要创建哪些文件，也不需要先创建目录。',
      '父目录不存在时工具会自动创建。',
      '如果文件已存在，写入前必须先拿到该文件的当前内容；可先用 read 工具读取，或沿用同一 session 中最新一次成功 write/edit 后记录的当前版本。',
      '如果文件自上次读取或修改后又发生变化，需要重新 read 再写入。',
      '该工具不执行命令，只负责文件系统写入。',
    ].join('\n');
  }

  getToolParameters(): Record<string, PluginParamSchema> {
    return WRITE_TOOL_PARAMETERS;
  }

  readInput(args: Record<string, unknown>, sessionId?: string, backendKind?: RuntimeBackendKind): WriteToolInput {
    if (!sessionId) {
      throw new BadRequestException('write 工具只能在 session 上下文中使用');
    }
    const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : '';
    if (!filePath) {
      throw new BadRequestException('write.filePath 不能为空');
    }
    if (typeof args.content !== 'string') {
      throw new BadRequestException('write.content 必须是字符串');
    }
    return {
      backendKind: backendKind ?? this.runtimeFilesystemBackendService.getDefaultBackendKind(),
      content: args.content,
      filePath,
      sessionId,
    };
  }

  async execute(input: WriteToolInput): Promise<WriteToolResult> {
    const result = await this.runtimeFileFreshnessService.withWriteFreshnessGuard(
      input.sessionId,
      input.filePath,
      () => this.runtimeFilesystemBackendService.writeTextFile(input.sessionId, input.filePath, input.content, input.backendKind),
      input.backendKind,
    );
    const postWriteSummary = readRuntimeFilesystemPostWriteSummary(result.postWrite, { targetPath: result.path });
    return {
      created: result.created,
      diff: result.diff,
      lineCount: result.lineCount,
      output: [
        '<write_result>',
        `Path: ${result.path}`,
        `Status: ${result.created ? 'created' : 'overwritten'}`,
        `Lines: ${result.lineCount}`,
        `Size: ${formatWriteSize(result.size)}`,
        ...(result.diff ? [`Diff: +${result.diff.additions} / -${result.diff.deletions}`, `Line delta: ${result.diff.beforeLineCount} -> ${result.diff.afterLineCount}`] : []),
        ...renderRuntimeFilesystemDiffLines(result.diff),
        ...renderRuntimeFilesystemPostWriteLines(result.postWrite, { targetPath: result.path }),
        '</write_result>',
      ].join('\n'),
      path: result.path,
      postWrite: result.postWrite,
      postWriteSummary,
      size: result.size,
    };
  }

  readRuntimeAccess(input: WriteToolInput): RuntimeToolAccessRequest {
    return {
      backendKind: input.backendKind,
      metadata: { filePath: input.filePath },
      requiredOperations: ['file.write'],
      role: 'filesystem',
      summary: `写入路径 ${input.filePath}`,
    };
  }

  toModelOutput: NonNullable<Tool['toModelOutput']> = ({ output }) => ({ type: 'text', value: (output as WriteToolResult).output });
}

function formatWriteSize(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
