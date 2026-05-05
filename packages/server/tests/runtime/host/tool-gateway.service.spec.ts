import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BashToolService } from '../../../src/modules/execution/bash/bash-tool.service';
import { HostFilesystemBackendService } from '../../../src/modules/execution/file/host-filesystem-backend.service';
import { ReadToolService } from '../../../src/modules/execution/read/read-tool.service';
import { RuntimeFileFreshnessService } from '../../../src/modules/execution/runtime/runtime-file-freshness.service';
import { RuntimeFilesystemBackendService } from '../../../src/modules/execution/runtime/runtime-filesystem-backend.service';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';
import { WriteToolService } from '../../../src/modules/execution/write/write-tool.service';
import { ToolGatewayService } from '../../../src/modules/runtime/host/tool-gateway.service';

const runtimeWorkspaceRoots: string[] = [];

describe('ToolGatewayService', () => {
  afterEach(() => {
    delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    while (runtimeWorkspaceRoots.length > 0) {
      const nextRoot = runtimeWorkspaceRoots.pop();
      if (nextRoot && fs.existsSync(nextRoot)) {
        fs.rmSync(nextRoot, { force: true, recursive: true });
      }
    }
  });

  it('reuses one filesystem backend kind across access review and raw read execution', async () => {
    const runtimeFilesystemBackendService = {
      getDefaultBackendKind: jest.fn().mockReturnValue('mock-filesystem'),
      readPathRange: jest.fn().mockResolvedValue({
        byteLimited: false,
        limit: 20,
        lines: ['hello'],
        mimeType: 'text/plain',
        offset: 1,
        path: '/docs/readme.md',
        totalBytes: 5,
        totalLines: 1,
        truncated: false,
        type: 'file',
      }),
      readTextFile: jest.fn().mockResolvedValue({
        content: 'follow the docs',
        path: '/docs/AGENTS.md',
      }),
      statPath: jest.fn().mockResolvedValue({
        exists: true,
        mtime: null,
        size: 16,
        type: 'file',
        virtualPath: '/docs/AGENTS.md',
      }),
    };
    const runtimeFileFreshnessService = {
      buildReadSystemReminder: jest.fn().mockReturnValue(['fresh reminder']),
      claimReadInstructionPaths: jest.fn().mockReturnValue(['/docs/AGENTS.md']),
      rememberRead: jest.fn().mockResolvedValue(undefined),
      withWriteFreshnessGuard: jest.fn(),
    };
    const runtimeSessionEnvironmentService = {
      deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
      getDescriptor: jest.fn().mockReturnValue({ visibleRoot: '/' }),
    };
    const runtimeToolBackendService = {
      getBackendDescriptor: jest.fn().mockReturnValue({
        capabilities: {
          networkAccess: false,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: false,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'mock-filesystem',
        permissionPolicy: {
          networkAccess: 'deny',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'deny',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      }),
      getFilesystemBackendKind: jest.fn().mockReturnValue('mock-filesystem'),
    };
    const runtimeToolPermissionService = {
      review: jest.fn().mockResolvedValue(undefined),
    };
    const readToolService = new ReadToolService(
      runtimeSessionEnvironmentService as never,
      runtimeFilesystemBackendService as never,
      runtimeFileFreshnessService as never,
    );
    const service = new ToolGatewayService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      readToolService,
      runtimeFileFreshnessService as never,
      runtimeFilesystemBackendService as never,
      runtimeSessionEnvironmentService as never,
      runtimeToolBackendService as never,
      runtimeToolPermissionService as never,
      {} as never,
      {} as never,
    );

    await expect(service.readPath({
      conversationId: 'conversation-1',
      metadata: {
        assistantMessageId: 'assistant-message-1',
      },
      source: 'plugin',
      userId: 'user-1',
    } as never, {
      filePath: 'docs/readme.md',
    } as never)).resolves.toEqual({
      freshnessReminders: ['fresh reminder'],
      loaded: ['/docs/AGENTS.md'],
      readResult: {
        byteLimited: false,
        limit: 20,
        lines: ['hello'],
        mimeType: 'text/plain',
        offset: 1,
        path: '/docs/readme.md',
        totalBytes: 5,
        totalLines: 1,
        truncated: false,
        type: 'file',
      },
      reminderEntries: [
        {
          content: 'follow the docs',
          path: '/docs/AGENTS.md',
        },
      ],
    });

    expect(runtimeFilesystemBackendService.getDefaultBackendKind).toHaveBeenCalledTimes(1);
    expect(runtimeToolPermissionService.review).toHaveBeenCalledWith(expect.objectContaining({
      backend: expect.objectContaining({
        kind: 'mock-filesystem',
      }),
      conversationId: 'conversation-1',
      messageId: 'assistant-message-1',
      requiredOperations: ['file.read'],
      toolName: 'read',
    }));
    expect(runtimeFilesystemBackendService.readPathRange).toHaveBeenCalledWith(
      'conversation-1',
      {
        limit: 2000,
        maxLineLength: 2000,
        offset: 1,
        path: 'docs/readme.md',
      },
      'mock-filesystem',
    );
    expect(runtimeFileFreshnessService.rememberRead).toHaveBeenCalledWith(
      'conversation-1',
      '/docs/readme.md',
      'mock-filesystem',
      {
        lineCount: 1,
        offset: 1,
        totalLines: 1,
        truncated: false,
      },
    );
  });

  it('reuses one shell backend kind across access review and command execution', async () => {
    const originalShellBackend = process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
    process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = 'mock-shell';
    const runtimeCommandService = {
      executeCommand: jest.fn().mockResolvedValue({
        backendKind: 'mock-shell',
        cwd: '/',
        exitCode: 0,
        sessionId: 'conversation-2',
        stderr: '',
        stderrStats: { bytes: 0, lines: 0 },
        stdout: 'ok',
        stdoutStats: { bytes: 2, lines: 1 },
      }),
    };
    const runtimeSessionEnvironmentService = {
      deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
      getDescriptor: jest.fn().mockReturnValue({ visibleRoot: '/' }),
    };
    const runtimeToolBackendService = {
      getBackendDescriptor: jest.fn().mockReturnValue({
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'mock-shell',
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      }),
      getShellBackendDescriptor: jest.fn().mockReturnValue({
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'mock-shell',
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      }),
      getShellBackendKind: jest.fn().mockReturnValue('mock-shell'),
    };
    const runtimeToolPermissionService = {
      review: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeToolsSettingsService = {
      readConfiguredShellBackend: jest.fn().mockReturnValue('mock-shell'),
    };
    const bashToolService = new BashToolService(
      runtimeCommandService as never,
      runtimeSessionEnvironmentService as never,
      runtimeToolBackendService as never,
    );
    const service = new ToolGatewayService(
      bashToolService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runtimeSessionEnvironmentService as never,
      runtimeToolBackendService as never,
      runtimeToolPermissionService as never,
      runtimeToolsSettingsService as never,
      {} as never,
    );

    try {
      await expect(service.executeCommand({
        conversationId: 'conversation-2',
        source: 'plugin',
        userId: 'user-1',
      } as never, {
        command: 'pwd',
        description: '打印当前目录',
      } as never)).resolves.toEqual({
        backendKind: 'mock-shell',
        cwd: '/',
        exitCode: 0,
        sessionId: 'conversation-2',
        stderr: '',
        stderrStats: { bytes: 0, lines: 0 },
        stdout: 'ok',
        stdoutStats: { bytes: 2, lines: 1 },
      });

      expect(runtimeToolPermissionService.review).toHaveBeenCalledWith(expect.objectContaining({
        backend: expect.objectContaining({
          kind: 'mock-shell',
        }),
        conversationId: 'conversation-2',
        requiredOperations: ['command.execute'],
        toolName: 'bash',
      }));
      expect(runtimeCommandService.executeCommand).toHaveBeenCalledWith({
        backendKind: 'mock-shell',
        command: 'pwd',
        description: '打印当前目录',
        sessionId: 'conversation-2',
      });
    } finally {
      if (originalShellBackend === undefined) {
        delete process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND;
      } else {
        process.env.GARLIC_CLAW_RUNTIME_SHELL_BACKEND = originalShellBackend;
      }
    }
  });

  it('allows shell tools to override backend kind through host params', async () => {
    const runtimeCommandService = {
      executeCommand: jest.fn().mockResolvedValue({
        backendKind: 'native-shell',
        cwd: '/',
        exitCode: 0,
        sessionId: 'conversation-3',
        stderr: '',
        stderrStats: { bytes: 0, lines: 0 },
        stdout: 'override-ok',
        stdoutStats: { bytes: 11, lines: 1 },
      }),
    };
    const runtimeSessionEnvironmentService = {
      deleteSessionEnvironmentIfEmpty: jest.fn().mockResolvedValue(undefined),
      getDescriptor: jest.fn().mockReturnValue({ visibleRoot: '/' }),
    };
    const runtimeToolBackendService = {
      getBackendDescriptor: jest.fn().mockReturnValue({
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'native-shell',
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      }),
      getShellBackendDescriptor: jest.fn().mockReturnValue({
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'native-shell',
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      }),
      getShellBackendKind: jest.fn().mockReturnValue('native-shell'),
    };
    const runtimeToolPermissionService = {
      review: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeToolsSettingsService = {
      readConfiguredShellBackend: jest.fn().mockReturnValue(undefined),
    };
    const bashToolService = new BashToolService(
      runtimeCommandService as never,
      runtimeSessionEnvironmentService as never,
      runtimeToolBackendService as never,
    );
    const service = new ToolGatewayService(
      bashToolService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runtimeSessionEnvironmentService as never,
      runtimeToolBackendService as never,
      runtimeToolPermissionService as never,
      runtimeToolsSettingsService as never,
      {} as never,
    );

    await service.executeCommand({
      conversationId: 'conversation-3',
      source: 'plugin',
      userId: 'user-1',
    } as never, {
      backendKind: 'native-shell',
      command: 'pwd',
      description: '打印当前目录',
    } as never);

    expect(runtimeToolBackendService.getShellBackendKind).not.toHaveBeenCalled();
    expect(runtimeCommandService.executeCommand).toHaveBeenCalledWith({
      backendKind: 'native-shell',
      command: 'pwd',
      description: '打印当前目录',
      sessionId: 'conversation-3',
    });
  });

  it('passes write status through runtime host write owner', async () => {
    const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-tool-gateway-write-'));
    runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const hostFilesystemBackend = new HostFilesystemBackendService(runtimeSessionEnvironmentService);
    const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService([hostFilesystemBackend]);
    const runtimeFileFreshnessService = new RuntimeFileFreshnessService(runtimeFilesystemBackendService);
    const writeToolService = new WriteToolService(
      runtimeSessionEnvironmentService,
      runtimeFilesystemBackendService,
      runtimeFileFreshnessService,
    );
    const runtimeToolBackendService = {
      getBackendDescriptor: jest.fn().mockReturnValue({
        capabilities: {
          networkAccess: false,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: false,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'host-filesystem',
        permissionPolicy: {
          networkAccess: 'deny',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'deny',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      }),
    };
    const runtimeToolPermissionService = {
      review: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ToolGatewayService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      runtimeFileFreshnessService as never,
      runtimeFilesystemBackendService as never,
      runtimeSessionEnvironmentService as never,
      runtimeToolBackendService as never,
      runtimeToolPermissionService as never,
      {} as never,
      writeToolService as never,
    );

    const { sessionRoot } = await runtimeSessionEnvironmentService.getSessionEnvironment('conversation-4');
    fs.mkdirSync(path.join(sessionRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(sessionRoot, 'docs', 'runtime.txt'), 'head\n', 'utf8');

    await expect(service.writeFile({
      conversationId: 'conversation-4',
      metadata: {
        assistantMessageId: 'assistant-message-4',
      },
      source: 'plugin',
      userId: 'user-1',
    } as never, {
      content: 'tail\n',
      filePath: 'docs/runtime.txt',
      mode: 'append',
    } as never)).resolves.toEqual({
      created: false,
      diff: expect.objectContaining({
        additions: 1,
        beforeLineCount: 1,
      }),
      lineCount: 2,
      path: '/docs/runtime.txt',
      postWrite: {
        diagnostics: [],
        formatting: null,
      },
      size: 10,
      status: 'appended',
    });

    expect(fs.readFileSync(path.join(sessionRoot, 'docs', 'runtime.txt'), 'utf8')).toBe('head\ntail\n');
    expect(runtimeToolPermissionService.review).toHaveBeenCalledWith(expect.objectContaining({
      backend: expect.objectContaining({
        kind: 'host-filesystem',
      }),
      conversationId: 'conversation-4',
      messageId: 'assistant-message-4',
      requiredOperations: ['file.write'],
      toolName: 'write',
    }));

    await expect(service.writeFile({
      conversationId: 'conversation-4',
      metadata: {
        assistantMessageId: 'assistant-message-4',
      },
      source: 'plugin',
      userId: 'user-1',
    } as never, {
      content: 'replace\n',
      filePath: 'docs/runtime.txt',
      mode: 'overwrite',
    } as never)).rejects.toThrow('修改已有文件前必须先读取');
  });
});
