import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type {
  RuntimeBackend,
  RuntimeBackendDescriptor,
  RuntimeCommandBackendResult,
  RuntimeCommandRequest,
} from './runtime-command.types';
import {
  readRuntimeNativeShellOptions,
  readRuntimeNativeShellTimeout,
} from './runtime-native-shell-options';
import { RuntimeOneShotShellService } from './runtime-one-shot-shell.service';
import { toHostPath } from './host-path';
import {
  isAbsoluteShellWorkdir,
  readRuntimeShellToolName,
} from './runtime-shell-tool-name';
import { RuntimeSessionEnvironmentService } from './runtime-session-environment.service';
import { resolveRuntimeVisiblePath } from './runtime-visible-path';

@Injectable()
export class RuntimeNativeShellService implements RuntimeBackend {
  constructor(
    private readonly runtimeSessionEnvironmentService: RuntimeSessionEnvironmentService,
    private readonly runtimeOneShotShellService: RuntimeOneShotShellService,
  ) {}

  getDescriptor(): RuntimeBackendDescriptor {
    return readRuntimeNativeShellOptions().descriptor;
  }

  getKind(): 'native-shell' {
    return 'native-shell';
  }

  async executeCommand(input: RuntimeCommandRequest): Promise<RuntimeCommandBackendResult> {
    validateNativeShellCommand(input.command);
    const session = await this.runtimeSessionEnvironmentService.getSessionEnvironment(input.sessionId);
    const toolName = readRuntimeShellToolName('native-shell');
    const rawWorkdir = typeof input.workdir === 'string' ? input.workdir.trim() : '';
    const cwd = isAbsoluteShellWorkdir('native-shell', rawWorkdir)
      ? path.resolve(rawWorkdir)
      : resolveRuntimeVisiblePath(
          session.visibleRoot,
          input.workdir,
          `${toolName}.workdir 必须位于 ${session.visibleRoot} 内`,
        );
    const hostCwd = isAbsoluteShellWorkdir('native-shell', rawWorkdir)
      ? path.resolve(rawWorkdir)
      : toHostPath(session.sessionRoot, session.visibleRoot, cwd);
    if (!fs.existsSync(hostCwd)) {
      throw new Error(`${toolName}.workdir 不存在: ${cwd}`);
    }
    const timeoutMs = readRuntimeNativeShellTimeout(input.timeout);
    try {
      const result = await this.runtimeOneShotShellService.execute({
        backendKind: 'native-shell',
        command: input.command,
        cwd: hostCwd,
        timeoutMs,
      });
      return {
        backendKind: 'native-shell',
        cwd,
        exitCode: result.exitCode,
        sessionId: input.sessionId,
        stderr: result.stderr,
        stdout: result.stdout,
      };
    } catch (error) {
      throw normalizeRuntimeNativeShellError(error, timeoutMs);
    }
  }
}

function normalizeRuntimeNativeShellError(error: unknown, timeoutMs: number): Error {
  const toolName = process.platform === 'win32' ? 'powershell' : 'bash';
  if (error instanceof Error && error.message === 'runtime-one-shot-shell-timeout') {
    return new Error(`${toolName} 执行超时（>${Math.ceil(timeoutMs / 1000)} 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。`);
  }
  if (isRuntimeShellSpawnMissing(error)) {
    return new Error('native-shell 缺少可用的 PowerShell 可执行文件，请改用 just-bash / WSL，或安装并暴露 powershell.exe / pwsh.exe 到 PATH。');
  }
  return error instanceof Error ? error : new Error(`${toolName} 执行失败`);
}

function isRuntimeShellSpawnMissing(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT';
}

const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /Invoke-Expression/i, label: 'Invoke-Expression' },
  { pattern: /\biex\b/i, label: 'iex' },
  { pattern: /Start-Process/i, label: 'Start-Process' },
  { pattern: /\bcmd(\.exe)?[\s;|]/i, label: 'cmd' },
  { pattern: /\bpwsh(\.exe)?\b/i, label: 'pwsh' },
  { pattern: /\bpowershell(\.exe)?\b/i, label: 'powershell' },
  { pattern: /\$\(/, label: '$()' },
  { pattern: /&&/, label: '&&' },
  { pattern: /\|\|/, label: '||' },
  { pattern: /\bbash\b/i, label: 'bash' },
  { pattern: /\bwsl\b/i, label: 'wsl' },
];

function validateNativeShellCommand(command: string): void {
  if (process.platform !== 'win32') {
    return;
  }
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) {
      throw new Error(`powershell 命令包含禁止的模式: ${label}`);
    }
  }
}
