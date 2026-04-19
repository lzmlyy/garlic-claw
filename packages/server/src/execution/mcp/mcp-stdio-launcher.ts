import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

let child: ChildProcessWithoutNullStreams | null = null;
let shuttingDown = false;

function main(): void {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    process.exitCode = 1;
    return;
  }

  let launchTarget: { command: string; args: string[] };
  try {
    launchTarget = resolveLaunchTarget(command, args);
  } catch (error) {
    reportLaunchFailure(error);
    process.exitCode = 1;
    return;
  }

  child = spawn(launchTarget.command, launchTarget.args, {
    env: process.env,
    shell: false,
    stdio: 'pipe',
    windowsHide: true,
  });

  bindParentInput();
  bindChildOutput();
  bindSignals();

  child.once('error', (error) => {
    reportLaunchFailure(error);
    shutdown(1);
  });
  child.once('exit', (code, signal) => {
    if (shuttingDown) {
      process.exit(code ?? 0);
      return;
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

function bindParentInput(): void {
  if (!child) {
    return;
  }

  process.stdin.on('data', (chunk) => {
    if (!child || shuttingDown) {
      return;
    }
    if (!child.stdin.write(chunk)) {
      process.stdin.pause();
    }
  });
  child.stdin.on('drain', () => process.stdin.resume());
  process.stdin.on('end', () => {
    child?.stdin.end();
  });
  process.stdin.on('error', () => {
    shutdown(0);
  });
}

function bindChildOutput(): void {
  if (!child) {
    return;
  }

  forwardReadableToWritable(child.stdout, process.stdout);
  forwardReadableToWritable(child.stderr, process.stderr);
  process.stdout.on('error', handleWritableError);
  process.stderr.on('error', handleWritableError);
}

function bindSignals(): void {
  process.on('SIGINT', () => shutdown(0, 'SIGINT'));
  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
  process.on('disconnect', () => shutdown(0));
}

function forwardReadableToWritable(
  readable: NodeJS.ReadableStream,
  writable: NodeJS.WritableStream,
): void {
  readable.on('data', (chunk) => {
    if (shuttingDown) {
      return;
    }
    const accepted = writable.write(chunk);
    if (!accepted && 'pause' in readable && typeof readable.pause === 'function') {
      readable.pause();
    }
  });
  writable.on('drain', () => {
    if ('resume' in readable && typeof readable.resume === 'function') {
      readable.resume();
    }
  });
  readable.on('error', () => {
    shutdown(0);
  });
}

function handleWritableError(error: Error & { code?: string }): void {
  if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED') {
    shutdown(0);
    return;
  }
  shutdown(1);
}

function shutdown(exitCode: number, signal?: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  process.stdout.off('error', handleWritableError);
  process.stderr.off('error', handleWritableError);

  if (child && !child.killed) {
    if (signal) {
      child.kill(signal);
    } else {
      child.kill();
    }
    setTimeout(() => {
      if (child && !child.killed) {
        child.kill('SIGKILL');
      }
    }, 1000).unref();
  }

  process.exit(exitCode);
}

function reportLaunchFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  try {
    process.stderr.write(`MCP stdio launcher failed: ${message}\n`);
  } catch {
    // ignore stderr write failure during shutdown
  }
}

export function resolveLaunchTarget(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { command, args: [...args] };
  }

  if (command === 'npm' || command === 'npx') {
    return {
      command: process.execPath,
      args: [resolveBundledNpmCli(command), ...args],
    };
  }

  return { command, args: [...args] };
}

function resolveBundledNpmCli(command: 'npm' | 'npx'): string {
  const cliFileName = command === 'npx' ? 'npx-cli.js' : 'npm-cli.js';
  const nodeDir = path.dirname(process.execPath);
  const candidate = path.join(nodeDir, 'node_modules', 'npm', 'bin', cliFileName);
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  throw new Error(`无法解析 ${command} CLI 入口: ${candidate}`);
}

if (require.main === module) {
  main();
}
