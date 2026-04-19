import { spawn } from 'node:child_process';
import { resolveLaunchTarget } from '../../../src/execution/mcp/mcp-stdio-launcher';

describe('mcp-stdio-launcher', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: originalPlatform,
    });
  });

  it('keeps non-Windows commands unchanged', () => {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'linux',
    });

    expect(resolveLaunchTarget('npx', ['--version'])).toEqual({
      command: 'npx',
      args: ['--version'],
    });
  });

  it('resolves npx through the bundled npm cli on Windows', async () => {
    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'win32',
    });

    const target = resolveLaunchTarget('npx', ['--version']);

    expect(target.command).toBe(process.execPath);
    expect(target.args[0]).toMatch(/[\\/]node_modules[\\/]npm[\\/]bin[\\/]npx-cli\.js$/);

    const result = await new Promise<{ code: number | null; stderr: string; stdout: string }>((resolve) => {
      const child = spawn(target.command, target.args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.once('exit', (code) => {
        resolve({ code, stderr, stdout });
      });
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
