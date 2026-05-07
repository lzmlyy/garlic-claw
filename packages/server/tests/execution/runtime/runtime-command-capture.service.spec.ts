import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RuntimeCommandCaptureService } from '../../../src/modules/execution/runtime/runtime-command-capture.service';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';
import { RuntimeToolsSettingsService } from '../../../src/modules/execution/runtime/runtime-tools-settings.service';

describe('RuntimeCommandCaptureService', () => {
  let runtimeWorkspaceRoot: string;

  beforeEach(async () => {
    runtimeWorkspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gc-runtime-command-capture-'));
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;
  });

  afterEach(async () => {
    delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    await fs.rm(runtimeWorkspaceRoot, { force: true, recursive: true });
  });

  it('returns null when output stays within render limits', async () => {
    const service = new RuntimeCommandCaptureService(
      new RuntimeSessionEnvironmentService(),
      new RuntimeToolsSettingsService(),
    );

    await expect(service.captureIfNeeded({
      backendKind: 'just-bash',
      cwd: '/',
      exitCode: 0,
      sessionId: 'session-small',
      stderr: '',
      stdout: 'short output',
    })).resolves.toBeNull();
  });

  it('writes oversized output under the session visible path', async () => {
    const runtimeToolsSettingsService = new RuntimeToolsSettingsService();
    runtimeToolsSettingsService.updateConfig({
      toolOutputCapture: {
        enabled: true,
        maxBytes: 32,
        maxFilesPerSession: 20,
      },
    } as never);
    const service = new RuntimeCommandCaptureService(
      new RuntimeSessionEnvironmentService(),
      runtimeToolsSettingsService,
    );
    const stdout = Array.from({ length: 220 }, (_, index) => `line-${index + 1}`).join('\n');

    const outputPath = await service.captureIfNeeded({
      backendKind: 'just-bash',
      cwd: '/',
      exitCode: 0,
      sessionId: 'session-large',
      stderr: '',
      stdout,
    });

    expect(outputPath).toMatch(/^\/\.garlic-claw\/runtime-command-output\/command-.+\.txt$/);
    const hostPath = path.join(
      runtimeWorkspaceRoot,
      'session-large',
      '.garlic-claw',
      'runtime-command-output',
      path.basename(outputPath ?? ''),
    );
    await expect(fs.readFile(hostPath, 'utf8')).resolves.toContain('<runtime_command_output>');
    await expect(fs.readFile(hostPath, 'utf8')).resolves.toContain('line-220');
  });

  it('cleans stale captured files by maxFilesPerSession', async () => {
    const runtimeToolsSettingsService = new RuntimeToolsSettingsService();
    runtimeToolsSettingsService.updateConfig({
      toolOutputCapture: {
        enabled: true,
        maxBytes: 8,
        maxFilesPerSession: 2,
      },
    } as never);
    const service = new RuntimeCommandCaptureService(
      new RuntimeSessionEnvironmentService(),
      runtimeToolsSettingsService,
    );

    const sessionId = 'session-cleanup';
    const outputs = [
      'line-a\nline-a\nline-a',
      'line-b\nline-b\nline-b',
      'line-c\nline-c\nline-c',
    ];

    for (const stdout of outputs) {
      await service.captureIfNeeded({
        backendKind: 'just-bash',
        cwd: '/',
        exitCode: 0,
        sessionId,
        stderr: '',
        stdout,
      });
    }

    const captureDirectory = path.join(
      runtimeWorkspaceRoot,
      sessionId,
      '.garlic-claw',
      'runtime-command-output',
    );
    const files = await fs.readdir(captureDirectory);

    expect(files).toHaveLength(2);
  });
});
