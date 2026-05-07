import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readRuntimeToolsConfiguredShellBackend,
  RuntimeToolsSettingsService,
} from '../../../src/modules/execution/runtime/runtime-tools-settings.service';

describe('RuntimeToolsSettingsService', () => {
  const originalConfigPath = process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
  const tempFiles: string[] = [];

  afterEach(() => {
    if (originalConfigPath === undefined) {
      delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
    } else {
      process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = originalConfigPath;
    }
    for (const nextPath of tempFiles.splice(0)) {
      fs.rmSync(nextPath, { force: true, recursive: true });
    }
  });

  it('exposes platform-scoped shell backend options in config schema', () => {
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = createTempConfigPath(tempFiles);

    const snapshot = new RuntimeToolsSettingsService().getConfigSnapshot();
    const schema = snapshot.schema;
    if (!schema || schema.type !== 'object') {
      throw new Error('runtime-tools schema is missing');
    }
    const shellBackend = schema.items.shellBackend;
    if (!shellBackend || shellBackend.type !== 'string') {
      throw new Error('shellBackend schema is missing');
    }

    expect(shellBackend.options).toEqual(process.platform === 'win32'
      ? [
          { label: 'just-bash', value: 'just-bash' },
          { label: 'PowerShell', value: 'native-shell' },
          { label: 'WSL', value: 'wsl-shell' },
        ]
      : [{ label: 'bash', value: 'native-shell' }]);
    expect(shellBackend.defaultValue).toBe(process.platform === 'win32' ? 'just-bash' : 'native-shell');
  });

  it('accepts just-bash as a stored shell backend on Windows', () => {
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = createTempConfigPath(tempFiles);
    const service = new RuntimeToolsSettingsService();

    if (process.platform !== 'win32') {
      expect(service.updateConfig({ shellBackend: 'native-shell' })).toEqual(expect.objectContaining({
        values: { shellBackend: 'native-shell' },
      }));
      return;
    }

    expect(service.updateConfig({ shellBackend: 'just-bash' })).toEqual(expect.objectContaining({
      values: { shellBackend: 'just-bash' },
    }));
    expect(service.readConfiguredShellBackend()).toBe('just-bash');
  });

  it('copies settings.example.json when settings.json is missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-settings-example-'));
    const configPath = path.join(tempDir, 'settings.json');
    const examplePath = path.join(tempDir, 'settings.example.json');
    tempFiles.push(tempDir);
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = configPath;
    fs.writeFileSync(examplePath, JSON.stringify({
      runtimeTools: {
        shellBackend: 'native-shell',
      },
    }, null, 2), 'utf-8');

    const service = new RuntimeToolsSettingsService();

    expect(service.getStoredConfig()).toEqual({
      shellBackend: 'native-shell',
    });
    expect(fs.existsSync(configPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(configPath, 'utf-8'))).toEqual({
      runtimeTools: {
        shellBackend: 'native-shell',
      },
    });
  });

  it('falls back to just-bash when native-shell is configured on Windows without PowerShell', () => {
    const originalPath = process.env.PATH;
    const originalProgramFiles = process.env.ProgramFiles;
    const originalProgramFilesX86 = process.env['ProgramFiles(x86)'];
    const originalSystemRoot = process.env.SystemRoot;
    const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-tools-shell-'));

    try {
      process.env.PATH = fakeRoot;
      process.env.ProgramFiles = path.join(fakeRoot, 'missing-program-files');
      process.env['ProgramFiles(x86)'] = path.join(fakeRoot, 'missing-program-files-x86');
      process.env.SystemRoot = path.join(fakeRoot, 'missing-system-root');

      expect(readRuntimeToolsConfiguredShellBackend({ shellBackend: 'native-shell' }, 'win32' as NodeJS.Platform)).toBe('just-bash');
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalProgramFiles === undefined) {
        delete process.env.ProgramFiles;
      } else {
        process.env.ProgramFiles = originalProgramFiles;
      }
      if (originalProgramFilesX86 === undefined) {
        delete process.env['ProgramFiles(x86)'];
      } else {
        process.env['ProgramFiles(x86)'] = originalProgramFilesX86;
      }
      if (originalSystemRoot === undefined) {
        delete process.env.SystemRoot;
      } else {
        process.env.SystemRoot = originalSystemRoot;
      }
      fs.rmSync(fakeRoot, { force: true, recursive: true });
    }
  });

  it('persists toolOutputCapture settings and exposes them through the runtime snapshot', () => {
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = createTempConfigPath(tempFiles);
    const service = new RuntimeToolsSettingsService();

    const snapshot = service.updateConfig({
      toolOutputCapture: {
        enabled: true,
        maxBytes: 2048,
        maxFilesPerSession: 7,
      },
    });

    expect(snapshot.values).toEqual({
      toolOutputCapture: {
        enabled: true,
        maxBytes: 2048,
        maxFilesPerSession: 7,
      },
    });
    expect(service.readToolOutputCaptureOptions()).toEqual({
      enabled: true,
      maxBytes: 2048,
      maxFilesPerSession: 7,
    });
    const toolOutputCaptureSchema = snapshot.schema?.type === 'object'
      ? snapshot.schema.items.toolOutputCapture
      : undefined;
    expect(toolOutputCaptureSchema?.type).toBe('object');
    if (!toolOutputCaptureSchema || toolOutputCaptureSchema.type !== 'object') {
      throw new Error('toolOutputCapture schema is missing');
    }
    expect(toolOutputCaptureSchema.items.maxBytes?.type).toBe('int');
    expect(toolOutputCaptureSchema.items.maxFilesPerSession?.type).toBe('int');
  });

  it('persists approvalMode and exposes review/yolo options in runtime-tools schema', () => {
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = createTempConfigPath(tempFiles);
    const service = new RuntimeToolsSettingsService();

    const snapshot = service.updateConfig({
      approvalMode: 'yolo',
    });

    expect(snapshot.values).toEqual({
      approvalMode: 'yolo',
    });
    const approvalModeSchema = snapshot.schema?.type === 'object'
      ? snapshot.schema.items.approvalMode
      : undefined;
    expect(approvalModeSchema?.type).toBe('string');
    if (!approvalModeSchema || approvalModeSchema.type !== 'string') {
      throw new Error('approvalMode schema is missing');
    }
    expect(approvalModeSchema.defaultValue).toBe('review');
    expect(approvalModeSchema.options).toEqual([
      { label: '审批确认', value: 'review' },
      { label: 'YOLO 直通', value: 'yolo' },
    ]);
  });
});

function createTempConfigPath(tempFiles: string[]): string {
  const filePath = path.join(
    os.tmpdir(),
    `gc-runtime-tools-settings-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
  tempFiles.push(filePath);
  return filePath;
}
