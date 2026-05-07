import { RuntimeCommandCaptureService } from '../../../src/modules/execution/runtime/runtime-command-capture.service';
import { RuntimeCommandService } from '../../../src/modules/execution/runtime/runtime-command.service';
import { RuntimeBackendRoutingService } from '../../../src/modules/execution/runtime/runtime-backend-routing.service';
import type { RuntimeBackend } from '../../../src/modules/execution/runtime/runtime-command.types';
import { RuntimeFilesystemBackendService } from '../../../src/modules/execution/runtime/runtime-filesystem-backend.service';
import type { RuntimeFilesystemBackend } from '../../../src/modules/execution/runtime/runtime-filesystem-backend.types';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';
import { RuntimeToolBackendService } from '../../../src/modules/execution/runtime/runtime-tool-backend.service';

describe('RuntimeToolBackendService', () => {
  const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
  const originalFilesystemBackend = process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
  const emptyRuntimeToolsSettingsService = {
    readConfiguredShellBackend: () => undefined,
  };

  afterEach(() => {
    if (originalShellBackend === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
    }
    if (originalFilesystemBackend === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = originalFilesystemBackend;
    }
  });

  it('uses default backend for shell and filesystem when no routing override is configured', () => {
    delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    delete process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND;
    const service = new RuntimeToolBackendService(
      new RuntimeBackendRoutingService(),
      new RuntimeCommandService([
        createRuntimeBackend('alpha'),
        createRuntimeBackend('beta'),
      ], new RuntimeCommandCaptureService(new RuntimeSessionEnvironmentService())),
      new RuntimeFilesystemBackendService([
        createFilesystemBackend('alpha-filesystem'),
        createFilesystemBackend('beta-filesystem'),
      ]),
      emptyRuntimeToolsSettingsService as never,
    );

    expect(service.getShellBackendKind()).toBe('alpha');
    expect(service.getFilesystemBackendKind()).toBe('alpha-filesystem');
  });

  it('supports independent shell and filesystem backend routing', () => {
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'beta';
    process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = 'alpha-filesystem';
    const service = new RuntimeToolBackendService(
      new RuntimeBackendRoutingService(),
      new RuntimeCommandService([
        createRuntimeBackend('alpha'),
        createRuntimeBackend('beta'),
      ], new RuntimeCommandCaptureService(new RuntimeSessionEnvironmentService())),
      new RuntimeFilesystemBackendService([
        createFilesystemBackend('alpha-filesystem'),
        createFilesystemBackend('beta-filesystem'),
      ]),
      emptyRuntimeToolsSettingsService as never,
    );

    expect(service.getShellBackendKind()).toBe('beta');
    expect(service.getFilesystemBackendKind()).toBe('alpha-filesystem');
    expect(service.getBackendKind('shell')).toBe('beta');
    expect(service.getBackendKind('filesystem')).toBe('alpha-filesystem');
  });

  it('rejects unknown configured backend kind', () => {
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'missing';
    const service = new RuntimeToolBackendService(
      new RuntimeBackendRoutingService(),
      new RuntimeCommandService(
        [createRuntimeBackend('alpha')],
        new RuntimeCommandCaptureService(new RuntimeSessionEnvironmentService()),
      ),
      new RuntimeFilesystemBackendService([createFilesystemBackend('alpha-filesystem')]),
      emptyRuntimeToolsSettingsService as never,
    );

    expect(() => service.getShellBackendDescriptor()).toThrow(
      'Unknown runtime shell backend: missing',
    );
  });

  it('rejects unknown configured filesystem backend kind', () => {
    process.env.GARLIC_CLAW_RUNTIME_FILESYSTEM_BACKEND = 'missing-filesystem';
    const service = new RuntimeToolBackendService(
      new RuntimeBackendRoutingService(),
      new RuntimeCommandService(
        [createRuntimeBackend('alpha')],
        new RuntimeCommandCaptureService(new RuntimeSessionEnvironmentService()),
      ),
      new RuntimeFilesystemBackendService([createFilesystemBackend('alpha-filesystem')]),
      emptyRuntimeToolsSettingsService as never,
    );

    expect(() => service.getFilesystemBackendDescriptor()).toThrow(
      'Unknown runtime filesystem backend: missing-filesystem',
    );
  });

  it('prefers persisted runtime-tools shell backend over environment routing', () => {
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'alpha';
    const service = new RuntimeToolBackendService(
      new RuntimeBackendRoutingService(),
      new RuntimeCommandService(
        [createRuntimeBackend('alpha'), createRuntimeBackend('beta')],
        new RuntimeCommandCaptureService(new RuntimeSessionEnvironmentService()),
      ),
      new RuntimeFilesystemBackendService([createFilesystemBackend('alpha-filesystem')]),
      {
        readConfiguredShellBackend: () => 'beta',
      } as never,
    );

    expect(service.getShellBackendKind()).toBe('beta');
  });
});

function createRuntimeBackend(kind: string): RuntimeBackend {
  return {
    async executeCommand(input) {
      return {
        backendKind: kind,
        cwd: input.workdir ?? '/',
        exitCode: 0,
        sessionId: input.sessionId,
        stderr: '',
        stdout: `${kind}:${input.command}`,
      };
    },
    getDescriptor() {
      return {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind,
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      };
    },
    getKind() {
      return kind;
    },
  };
}

function createFilesystemBackend(kind: string): RuntimeFilesystemBackend {
  return {
    async copyPath() {
      return {
        fromPath: '/mock.txt',
        path: '/mock-copy.txt',
      };
    },
    async createSymlink() {
      return {
        path: '/mock-link.txt',
        target: '/mock.txt',
      };
    },
    async deletePath() {
      return {
        deleted: true,
        path: '/mock.txt',
      };
    },
    async editTextFile() {
      return {
        diff: {
          additions: 1,
          afterLineCount: 1,
          beforeLineCount: 1,
          deletions: 1,
          patch: 'mock patch',
        },
        occurrences: 1,
        path: '/mock.txt',
        postWrite: {
          diagnostics: [],
          formatting: null,
        },
        strategy: 'exact',
      };
    },
    async ensureDirectory() {
      return {
        created: true,
        path: '/mock-dir',
      };
    },
    async globPaths() {
      return {
        basePath: '/',
        matches: ['/mock.txt'],
        partial: false,
        skippedEntries: [],
        skippedPaths: [],
        totalMatches: 1,
        truncated: false,
      };
    },
    getDescriptor() {
      return {
        capabilities: {
          networkAccess: false,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: false,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind,
        permissionPolicy: {
          networkAccess: 'deny',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'deny',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      };
    },
    getKind() {
      return kind;
    },
    async grepText() {
      return {
        basePath: '/',
        matches: [
          {
            line: 1,
            text: 'mock content',
            virtualPath: '/mock.txt',
          },
        ],
        partial: false,
        skippedEntries: [],
        skippedPaths: [],
        totalMatches: 1,
        truncated: false,
      };
    },
    async listFiles() {
      return {
        basePath: '/',
        files: [],
      };
    },
    async movePath() {
      return {
        fromPath: '/mock.txt',
        path: '/mock-moved.txt',
      };
    },
    async readDirectoryEntries() {
      return {
        entries: [],
        path: '/',
      };
    },
    async readPathRange(_sessionId, input) {
      return {
        byteLimited: false,
        limit: input.limit,
        lines: ['mock'],
        mimeType: 'text/plain',
        offset: input.offset,
        path: '/mock.txt',
        totalBytes: 4,
        totalLines: 1,
        truncated: false,
        type: 'file' as const,
      };
    },
    async readSymlink() {
      return {
        path: '/mock-link.txt',
        target: '/mock.txt',
      };
    },
    async resolvePath() {
      return {
        exists: true,
        type: 'file' as const,
        virtualPath: '/mock.txt',
      };
    },
    async statPath() {
      return {
        exists: true,
        mtime: '2026-04-21T00:00:00.000Z',
        size: 4,
        type: 'file' as const,
        virtualPath: '/mock.txt',
      };
    },
    async readTextFile() {
      return {
        content: 'mock',
        path: '/mock.txt',
      };
    },
    async writeTextFile() {
      return {
        created: true,
        diff: {
          additions: 1,
          afterLineCount: 1,
          beforeLineCount: 0,
          deletions: 0,
          patch: 'mock patch',
        },
        lineCount: 1,
        path: '/mock.txt',
        postWrite: {
          diagnostics: [],
          formatting: null,
        },
        size: 4,
      };
    },
  };
}
