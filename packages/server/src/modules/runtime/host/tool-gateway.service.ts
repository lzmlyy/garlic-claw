import type {
  JsonObject,
  JsonValue,
  PluginCallContext,
  PluginRuntimeCommandResult,
  PluginRuntimeEditResult,
  PluginRuntimeGlobResult,
  PluginRuntimeGrepResult,
  PluginRuntimeReadResult,
  PluginRuntimeWriteResult,
  RuntimeBackendKind,
} from '@garlic-claw/shared';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { BashToolService } from '../../execution/bash/bash-tool.service';
import { EditToolService } from '../../execution/edit/edit-tool.service';
import { GlobToolService } from '../../execution/glob/glob-tool.service';
import { GrepToolService } from '../../execution/grep/grep-tool.service';
import { ProjectWorktreeSearchOverlayService } from '../../execution/project/project-worktree-search-overlay.service';
import {
  readRuntimeClaimedPathInstructionReminder,
  readRuntimePathInstructionReminder,
} from '../../execution/read/read-path-instruction';
import { ReadToolService } from '../../execution/read/read-tool.service';
import { RuntimeFileFreshnessService } from '../../execution/runtime/runtime-file-freshness.service';
import { RuntimeFilesystemBackendService } from '../../execution/runtime/runtime-filesystem-backend.service';
import { RuntimeSessionEnvironmentService } from '../../execution/runtime/runtime-session-environment.service';
import { readRuntimeShellToolName } from '../../execution/runtime/runtime-shell-tool-name';
import { RuntimeToolBackendService } from '../../execution/runtime/runtime-tool-backend.service';
import type { RuntimeToolAccessRequest } from '../../execution/runtime/runtime-tool-access';
import { RuntimeToolPermissionService } from '../../execution/runtime/runtime-tool-permission.service';
import { RuntimeToolsSettingsService } from '../../execution/runtime/runtime-tools-settings.service';
import { WriteToolService } from '../../execution/write/write-tool.service';

const DEFAULT_READ_LIMIT = 2000;
const MAX_READ_LINE_LENGTH = 2000;
const MAX_GLOB_RESULTS = 100;
const MAX_GREP_MATCHES = 100;
const MAX_GREP_LINE_LENGTH = 2000;

@Injectable()
export class ToolGatewayService {
  constructor(
    private readonly bashToolService: BashToolService,
    private readonly editToolService: EditToolService,
    private readonly globToolService: GlobToolService,
    private readonly grepToolService: GrepToolService,
    private readonly readToolService: ReadToolService,
    private readonly runtimeFileFreshnessService: RuntimeFileFreshnessService,
    private readonly runtimeFilesystemBackendService: RuntimeFilesystemBackendService,
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeToolBackendService: RuntimeToolBackendService,
    private readonly runtimeToolPermissionService: RuntimeToolPermissionService,
    private readonly runtimeToolsSettingsService: RuntimeToolsSettingsService,
    private readonly writeToolService: WriteToolService,
    @Optional() private readonly projectWorktreeSearchOverlayService?: ProjectWorktreeSearchOverlayService,
  ) {}

  async executeCommand(context: PluginCallContext, params: JsonObject): Promise<PluginRuntimeCommandResult> {
    const assistantMessageId = readHostAssistantMessageId(context);
    const backendKind = readHostBackendKind(params.backendKind) ?? this.runtimeToolsSettingsService.readConfiguredShellBackend();
    const toolName = readRuntimeShellToolName(backendKind);
    const runtimeInput = this.bashToolService.readInput(params, readHostSessionId(context, toolName), backendKind);
    await this.reviewRuntimeToolAccess(context, assistantMessageId, toolName, await this.bashToolService.readRuntimeAccess(runtimeInput));
    return this.bashToolService.execute(runtimeInput);
  }

  async readPath(context: PluginCallContext, params: JsonObject): Promise<PluginRuntimeReadResult> {
    const assistantMessageId = readHostAssistantMessageId(context);
    const runtimeInput = this.readToolService.readInput(
      params,
      readHostSessionId(context, 'read'),
      undefined,
      assistantMessageId,
    );
    await this.reviewRuntimeToolAccess(context, assistantMessageId, 'read', this.readToolService.readRuntimeAccess(runtimeInput));
    try {
      const readResult = await this.runtimeFilesystemBackendService.readPathRange(
        runtimeInput.sessionId,
        {
          limit: runtimeInput.limit ?? DEFAULT_READ_LIMIT,
          maxLineLength: MAX_READ_LINE_LENGTH,
          offset: runtimeInput.offset ?? 1,
          path: runtimeInput.filePath,
        },
        runtimeInput.backendKind,
      );
      if (readResult.type !== 'file') {
        return { freshnessReminders: [], loaded: [], readResult, reminderEntries: [] };
      }
      await this.runtimeFileFreshnessService.rememberRead(runtimeInput.sessionId, readResult.path, runtimeInput.backendKind, {
        lineCount: readResult.lines.length,
        offset: readResult.offset,
        totalLines: readResult.totalLines,
        truncated: readResult.truncated,
      });
      const reminder = await readRuntimePathInstructionReminder(
        {
          backendKind: runtimeInput.backendKind,
          path: readResult.path,
          sessionId: runtimeInput.sessionId,
          visibleRoot: this.runtimeSessionEnvironmentService.getDescriptor().visibleRoot,
        },
        this.runtimeFilesystemBackendService,
      );
      const claimedReminder = readRuntimeClaimedPathInstructionReminder({
        assistantMessageId,
        claimPaths: this.runtimeFileFreshnessService.claimReadInstructionPaths.bind(this.runtimeFileFreshnessService),
        reminder,
        sessionId: runtimeInput.sessionId,
      });
      return {
        freshnessReminders: this.runtimeFileFreshnessService.buildReadSystemReminder(runtimeInput.sessionId, {
          excludePath: readResult.path,
          limit: 5,
        }),
        loaded: claimedReminder.loadedPaths,
        readResult,
        reminderEntries: claimedReminder.entries,
      };
    } finally {
      await this.runtimeSessionEnvironmentService.deleteSessionEnvironmentIfEmpty(runtimeInput.sessionId);
    }
  }

  async globPaths(context: PluginCallContext, params: JsonObject): Promise<PluginRuntimeGlobResult> {
    const assistantMessageId = readHostAssistantMessageId(context);
    const runtimeInput = this.globToolService.readInput(params, readHostSessionId(context, 'glob'));
    await this.reviewRuntimeToolAccess(context, assistantMessageId, 'glob', this.globToolService.readRuntimeAccess(runtimeInput));
    try {
      const globResult = await this.runtimeFilesystemBackendService.globPaths(
        runtimeInput.sessionId,
        {
          maxResults: MAX_GLOB_RESULTS,
          pattern: runtimeInput.pattern,
          ...(runtimeInput.path ? { path: runtimeInput.path } : {}),
        },
        runtimeInput.backendKind,
      );
      return {
        globResult,
        overlay: await this.projectWorktreeSearchOverlayService?.buildSearchOverlay({
          basePath: globResult.basePath,
          matches: globResult.matches,
          sessionId: runtimeInput.sessionId,
        }) ?? [],
      };
    } finally {
      await this.runtimeSessionEnvironmentService.deleteSessionEnvironmentIfEmpty(runtimeInput.sessionId);
    }
  }

  async grepContent(context: PluginCallContext, params: JsonObject): Promise<PluginRuntimeGrepResult> {
    const assistantMessageId = readHostAssistantMessageId(context);
    const runtimeInput = this.grepToolService.readInput(params, readHostSessionId(context, 'grep'));
    await this.reviewRuntimeToolAccess(context, assistantMessageId, 'grep', this.grepToolService.readRuntimeAccess(runtimeInput));
    try {
      const grepResult = await this.runtimeFilesystemBackendService.grepText(
        runtimeInput.sessionId,
        {
          maxLineLength: MAX_GREP_LINE_LENGTH,
          maxMatches: MAX_GREP_MATCHES,
          pattern: runtimeInput.pattern,
          ...(runtimeInput.include ? { include: runtimeInput.include } : {}),
          ...(runtimeInput.path ? { path: runtimeInput.path } : {}),
        },
        runtimeInput.backendKind,
      );
      return {
        grepResult,
        overlay: await this.projectWorktreeSearchOverlayService?.buildSearchOverlay({
          basePath: grepResult.basePath,
          matches: grepResult.matches,
          sessionId: runtimeInput.sessionId,
        }) ?? [],
      };
    } finally {
      await this.runtimeSessionEnvironmentService.deleteSessionEnvironmentIfEmpty(runtimeInput.sessionId);
    }
  }

  async writeFile(context: PluginCallContext, params: JsonObject): Promise<PluginRuntimeWriteResult> {
    const assistantMessageId = readHostAssistantMessageId(context);
    const runtimeInput = this.writeToolService.readInput(params, readHostSessionId(context, 'write'));
    await this.reviewRuntimeToolAccess(context, assistantMessageId, 'write', this.writeToolService.readRuntimeAccess(runtimeInput));
    const result = await this.writeToolService.execute(runtimeInput);
    return {
      created: result.created,
      diff: result.diff,
      lineCount: result.lineCount,
      path: result.path,
      postWrite: result.postWrite,
      size: result.size,
      status: result.status,
    };
  }

  async editFile(context: PluginCallContext, params: JsonObject): Promise<PluginRuntimeEditResult> {
    const assistantMessageId = readHostAssistantMessageId(context);
    const runtimeInput = this.editToolService.readInput(params, readHostSessionId(context, 'edit'));
    await this.reviewRuntimeToolAccess(context, assistantMessageId, 'edit', this.editToolService.readRuntimeAccess(runtimeInput));
    const result = await this.editToolService.execute(runtimeInput);
    return {
      diff: result.diff,
      occurrences: result.occurrences,
      path: result.path,
      postWrite: result.postWrite,
      strategy: result.strategy,
    };
  }

  private async reviewRuntimeToolAccess(
    context: PluginCallContext,
    assistantMessageId: string | undefined,
    toolName: string,
    access: RuntimeToolAccessRequest,
  ): Promise<void> {
    await this.runtimeToolPermissionService.review({
      backend: this.runtimeToolBackendService.getBackendDescriptor(access.role, access.backendKind),
      conversationId: context.conversationId,
      ...(assistantMessageId ? { messageId: assistantMessageId } : {}),
      ...(access.metadata !== undefined ? { metadata: access.metadata as JsonValue } : {}),
      requiredOperations: access.requiredOperations,
      summary: access.summary,
      toolName,
    });
  }
}

function readHostSessionId(
  context: PluginCallContext,
  toolName: 'bash' | 'powershell' | 'edit' | 'glob' | 'grep' | 'read' | 'write',
): string {
  if (context.conversationId) {
    return context.conversationId;
  }
  throw new BadRequestException(`${toolName} 工具只能在 session 上下文中使用`);
}

function readHostAssistantMessageId(context: PluginCallContext): string | undefined {
  const metadata = context.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const messageId = metadata.assistantMessageId;
  return typeof messageId === 'string' && messageId.trim() ? messageId.trim() : undefined;
}

function readHostBackendKind(value: unknown): RuntimeBackendKind | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
