import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  readRuntimeNativeShellOptions,
  readRuntimeNativeShellTimeout,
} from '../../../src/modules/execution/runtime/runtime-native-shell-options';
import { RuntimeNativeShellService } from '../../../src/modules/execution/runtime/runtime-native-shell.service';
import { RuntimeOneShotShellService } from '../../../src/modules/execution/runtime/runtime-one-shot-shell.service';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';

describe('RuntimeNativeShellService', () => {
  const workspaceRoots: string[] = [];
  const originalEnvironment = {
    GARLIC_CLAW_RUNTIME_NATIVE_SHELL_DEFAULT_TIMEOUT_MS:
      process.env.GARLIC_CLAW_RUNTIME_NATIVE_SHELL_DEFAULT_TIMEOUT_MS,
    GARLIC_CLAW_RUNTIME_NATIVE_SHELL_ENABLE_NETWORK:
      process.env.GARLIC_CLAW_RUNTIME_NATIVE_SHELL_ENABLE_NETWORK,
    GARLIC_CLAW_RUNTIME_NATIVE_SHELL_MAX_TIMEOUT_MS:
      process.env.GARLIC_CLAW_RUNTIME_NATIVE_SHELL_MAX_TIMEOUT_MS,
    GARLIC_CLAW_RUNTIME_NATIVE_SHELL_NETWORK_POLICY:
      process.env.GARLIC_CLAW_RUNTIME_NATIVE_SHELL_NETWORK_POLICY,
    GARLIC_CLAW_RUNTIME_WORKSPACES_PATH:
      process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH,
  } as const;

  afterEach(async () => {
    for (const [envKey, envValue] of Object.entries(originalEnvironment)) {
      if (envValue === undefined) {
        delete process.env[envKey];
        continue;
      }
      process.env[envKey] = envValue;
    }
    while (workspaceRoots.length > 0) {
      const nextRoot = workspaceRoots.pop();
      if (!nextRoot) {
        continue;
      }
      try {
        fs.rmSync(nextRoot, { force: true, recursive: true });
      } catch {
        // Windows may hold file locks on temp directories; ignore cleanup failures
      }
    }
  });

  it('persists files under the session workspace across command executions', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-native-shell-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = createRuntimeNativeShellService();
    const first = await service.executeCommand({
      command: buildNativeWriteAndReadCommand('logs/run.txt', 'persisted'),
      sessionId: 'session-1',
    });

    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain('persisted');
    expect(fs.readFileSync(path.join(workspaceRoot, 'session-1', 'logs', 'run.txt'), 'utf8')).toContain('persisted');

    const second = await service.executeCommand({
      command: buildNativeReadCommand('logs/run.txt'),
      sessionId: 'session-1',
    });

    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('persisted');
    expect(second.cwd).toBe('/');
    expect(second.backendKind).toBe('native-shell');
  });

  it('supports workdir within the backend visible root', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-native-shell-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = createRuntimeNativeShellService();
    await service.executeCommand({
      command: buildNativeMkdirCommand('nested'),
      sessionId: 'session-1',
    });

    const result = await service.executeCommand({
      command: buildNativePwdCommand(),
      sessionId: 'session-1',
      workdir: '/nested',
    });

    expect(result.exitCode).toBe(0);
    expect(result.cwd).toBe('/nested');
    expect(normalizeNativeShellOutput(result.stdout)).toContain(readNativeExpectedPwdSuffix('/nested'));
  });

  it('reports a missing workdir explicitly', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-native-shell-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = createRuntimeNativeShellService();

    await expect(service.executeCommand({
      command: buildNativePwdCommand(),
      sessionId: 'session-1',
      workdir: '/workspace',
    })).rejects.toThrow(`${process.platform === 'win32' ? 'powershell' : 'bash'}.workdir 不存在: /workspace`);
  });

  it('accepts host absolute workdir for windows native-shell', async () => {
    if (process.platform !== 'win32') {
      return;
    }

    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-native-shell-'));
    const hostWorkdir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-native-host-workdir-'));
    workspaceRoots.push(workspaceRoot, hostWorkdir);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = createRuntimeNativeShellService();
    const result = await service.executeCommand({
      command: buildNativePwdCommand(),
      sessionId: 'session-1',
      workdir: hostWorkdir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.cwd).toBe(hostWorkdir);
    expect(normalizeNativeShellOutput(result.stdout)).toContain(hostWorkdir);
  });

  it('reads configurable timeout and network descriptor options', () => {
    process.env.GARLIC_CLAW_RUNTIME_NATIVE_SHELL_DEFAULT_TIMEOUT_MS = '45000';
    process.env.GARLIC_CLAW_RUNTIME_NATIVE_SHELL_MAX_TIMEOUT_MS = '90000';
    process.env.GARLIC_CLAW_RUNTIME_NATIVE_SHELL_NETWORK_POLICY = 'allow';

    const options = readRuntimeNativeShellOptions();

    expect(options.defaultTimeoutMs).toBe(45000);
    expect(options.maxTimeoutMs).toBe(90000);
    expect(options.descriptor.capabilities.networkAccess).toBe(true);
    expect(options.descriptor.permissionPolicy.networkAccess).toBe('allow');
    expect(readRuntimeNativeShellTimeout(undefined)).toBe(45000);
    expect(readRuntimeNativeShellTimeout(1000)).toBe(1000);
  });

  it('surfaces actionable timeout guidance on slow network commands', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-native-shell-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const server = http.createServer(async (_request, response) => {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('slow-ok');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('failed to allocate local slow test server port');
      }
      const service = createRuntimeNativeShellService();
      await expect(service.executeCommand({
        command: buildNativeSlowHttpCommand(address.port),
        sessionId: 'session-1',
        timeout: 50,
      })).rejects.toThrow(`${process.platform === 'win32' ? 'powershell' : 'bash'} 执行超时（>1 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it('rejects invalid native-shell timeout configuration', () => {
    process.env.GARLIC_CLAW_RUNTIME_NATIVE_SHELL_DEFAULT_TIMEOUT_MS = '200000';
    process.env.GARLIC_CLAW_RUNTIME_NATIVE_SHELL_MAX_TIMEOUT_MS = '100000';

    expect(() => readRuntimeNativeShellTimeout(undefined)).toThrow(BadRequestException);
  });

  it('returns stderr with non-zero exit code on syntax errors instead of timing out', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-native-shell-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = createRuntimeNativeShellService();
    const result = await service.executeCommand({
      command: 'Write-Output "before-error"; $(unclosed-subexpression',
      sessionId: 'session-1',
      timeout: 30000,
    });

    expect(result.stderr.length).toBeGreaterThan(0);
    expect(result.exitCode).not.toBe(0);
  });

  it('does not persist shell state between command executions', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-native-shell-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = createRuntimeNativeShellService();
    const first = await service.executeCommand({
      command: buildNativePersistStateCommand(),
      sessionId: 'session-1',
    });
    const second = await service.executeCommand({
      command: buildNativeReadPersistedStateCommand(),
      sessionId: 'session-1',
    });

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    // Shell state (env vars, cwd) should NOT persist between one-shot calls.
    const secondOutput = normalizeNativeShellOutput(second.stdout);
    expect(secondOutput).not.toContain('persisted-state');
    expect(secondOutput).not.toContain('/nested');
  });

  function createRuntimeNativeShellService(): RuntimeNativeShellService {
    const sessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const oneShotShellService = new RuntimeOneShotShellService();
    return new RuntimeNativeShellService(
      sessionEnvironmentService,
      oneShotShellService,
    );
  }
});

function buildNativeWriteAndReadCommand(filePath: string, content: string): string {
  if (process.platform === 'win32') {
    return [
      '$dir = Split-Path -Parent "' + filePath + '"',
      'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
      'Set-Content -LiteralPath "' + filePath + '" -Value "' + content + '"',
      'Get-Content -LiteralPath "' + filePath + '"',
    ].join('; ');
  }
  return `mkdir -p "${path.posix.dirname(filePath)}" && printf "${content}\\n" > "${filePath}" && cat "${filePath}"`;
}

function buildNativeReadCommand(filePath: string): string {
  return process.platform === 'win32'
    ? `Get-Content -LiteralPath "${filePath}"`
    : `cat "${filePath}"`;
}

function buildNativeMkdirCommand(dirPath: string): string {
  return process.platform === 'win32'
    ? `New-Item -ItemType Directory -Force -Path "${dirPath}" | Out-Null`
    : `mkdir -p "${dirPath}"`;
}

function buildNativePwdCommand(): string {
  return process.platform === 'win32' ? '(Get-Location).Path' : 'pwd';
}

function buildNativePersistStateCommand(): string {
  if (process.platform === 'win32') {
    return [
      'New-Item -ItemType Directory -Force -Path "nested" | Out-Null',
      '$env:GC_RUNTIME_NATIVE_STATE = "persisted-state"',
      'Set-Location -LiteralPath "nested"',
      'Write-Output $env:GC_RUNTIME_NATIVE_STATE',
      '(Get-Location).Path',
    ].join('; ');
  }
  return [
    'mkdir -p nested',
    'export GC_RUNTIME_NATIVE_STATE="persisted-state"',
    'cd nested',
    'printf "%s\\n" "$GC_RUNTIME_NATIVE_STATE"',
    'pwd',
  ].join('\n');
}

function buildNativeReadPersistedStateCommand(): string {
  return process.platform === 'win32'
    ? 'Write-Output $env:GC_RUNTIME_NATIVE_STATE; (Get-Location).Path'
    : 'printf "%s\\n" "$GC_RUNTIME_NATIVE_STATE"; pwd';
}

function buildNativeSlowHttpCommand(port: number): string {
  return process.platform === 'win32'
    ? `(Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:${port}/slow").Content`
    : `curl -s "http://127.0.0.1:${port}/slow"`;
}

function normalizeNativeShellOutput(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

function readNativeExpectedPwdSuffix(virtualPath: string): string {
  if (process.platform === 'win32') {
    return virtualPath === '/' ? 'session-1' : `session-1\\${virtualPath.replace(/^\/+/, '').replace(/\//g, '\\')}`;
  }
  return virtualPath;
}
