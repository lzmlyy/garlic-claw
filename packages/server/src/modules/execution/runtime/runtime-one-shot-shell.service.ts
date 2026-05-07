import {
  type ChildProcessWithoutNullStreams,
  spawn,
} from 'node:child_process';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { RuntimeBackendKind } from '@garlic-claw/shared';
import { listWindowsPowerShellCommandCandidates } from './runtime-powershell-variant';

const ONE_SHOT_TIMEOUT_CODE = 'runtime-one-shot-shell-timeout';

export interface RuntimeOneShotShellInput {
  backendKind: RuntimeBackendKind;
  command: string;
  cwd: string;
  timeoutMs: number;
}

export interface RuntimeOneShotShellResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

@Injectable()
export class RuntimeOneShotShellService {
  async execute(input: RuntimeOneShotShellInput): Promise<RuntimeOneShotShellResult> {
    const spawnArgs = buildOneShotSpawnArgs(input);
    let lastError: Error | null = null;

    for (const candidate of spawnArgs) {
      try {
        return await this.spawnAndWait(candidate, input.timeoutMs);
      } catch (error) {
        if (
          error != null
          && typeof error === 'object'
          && 'code' in error
          && (error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          if (error instanceof Error) {
            lastError = error;
          } else {
            const wrapped = new Error(String((error as any).message ?? 'spawn ENOENT'));
            (wrapped as any).code = (error as any).code;
            lastError = wrapped;
          }
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new Error('无法启动一次性 shell 进程');
  }

  private spawnAndWait(
    candidate: { command: string; args: string[]; cwd: string },
    timeoutMs: number,
  ): Promise<RuntimeOneShotShellResult> {
    return new Promise<RuntimeOneShotShellResult>((resolve, reject) => {
      const child: ChildProcessWithoutNullStreams = spawn(
        candidate.command,
        candidate.args,
        {
          cwd: candidate.cwd,
          env: process.env,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // 超时回收进程失败时，只返回超时错误。
        }
        reject(new Error(ONE_SHOT_TIMEOUT_CODE));
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.once('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.once('close', (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code ?? 0,
          stderr: normalizeOneShotOutput(stderr),
          stdout: normalizeOneShotOutput(stdout),
        });
      });
    });
  }
}

interface OneShotSpawnArgs {
  command: string;
  args: string[];
  cwd: string;
}

function buildOneShotSpawnArgs(input: RuntimeOneShotShellInput): OneShotSpawnArgs[] {
  if (input.backendKind === 'wsl-shell') {
    return [{
      command: 'wsl.exe',
      args: [
        '--cd',
        toWslPath(input.cwd),
        'bash',
        '--noprofile',
        '--norc',
        '-c',
        input.command,
      ],
      cwd: process.cwd(),
    }];
  }
  if (usesOneShotPowerShell(input.backendKind)) {
    const encodedScript = buildOneShotPowerShellScript(input.command);
    return listWindowsPowerShellCommandCandidates().map((command) => ({
      command,
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        encodedScript,
      ],
      cwd: input.cwd,
    }));
  }
  return [{
    command: 'bash',
    args: ['--noprofile', '--norc', '-c', input.command],
    cwd: input.cwd,
  }];
}

function buildOneShotPowerShellScript(command: string): string {
  const safeCommand = command.replace(/\r\n/g, '\n');
  const base64Command = Buffer.from(safeCommand, 'utf8').toString('base64');
  return [
    '$ErrorActionPreference = "Stop"',
    '$OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    'chcp 65001 > $null',
    '$global:LASTEXITCODE = 0',
    '$__gc_status = 0',
    '$__gc_user_command = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(\'' + base64Command + '\'))',
    'try { Invoke-Expression -Command $__gc_user_command; $__gc_status = [int]$LASTEXITCODE } catch { [Console]::Error.WriteLine($_.Exception.Message); $__gc_status = 1 }',
    'exit $__gc_status',
  ].join('\n');
}

function usesOneShotPowerShell(backendKind: RuntimeBackendKind): boolean {
  return process.platform === 'win32'
    && backendKind.includes('native-shell')
    && !backendKind.includes('wsl');
}

function toWslPath(hostPath: string): string {
  const normalized = path.win32.normalize(hostPath);
  const driveMatch = normalized.match(/^([A-Za-z]):\\(.*)$/u);
  if (driveMatch) {
    const drive = driveMatch[1].toLowerCase();
    const rest = driveMatch[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }
  return normalized.replace(/\\/g, '/');
}

function normalizeOneShotOutput(text: string): string {
  return text.replace(/\r\n/g, '\n');
}
