import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { RuntimeToolPermissionService } from '../../../src/modules/execution/runtime/runtime-tool-permission.service';
import { RuntimeToolsSettingsService } from '../../../src/modules/execution/runtime/runtime-tools-settings.service';
import { ConversationStoreService } from '../../../src/modules/runtime/host/conversation-store.service';

describe('RuntimeToolPermissionService', () => {
  const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let conversationId: string;
  let service: RuntimeToolPermissionService;
  let conversationsPath: string;
  const originalApprovalMode = process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE;

  beforeEach(() => {
    conversationsPath = path.join(
      os.tmpdir(),
      `runtime-tool-permission.service.spec-${Date.now()}-${Math.random()}.json`,
    );
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationsPath;
    const conversationRecordService = new ConversationStoreService();
    conversationId = (conversationRecordService.createConversation({
      title: 'Runtime Permission Test',
    }) as { id: string }).id;
    expect(conversationId).toBeTruthy();
    service = new RuntimeToolPermissionService(conversationRecordService);
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
    if (originalApprovalMode === undefined) {
      delete process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE;
    } else {
      process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE = originalApprovalMode;
    }
    try {
      if (fs.existsSync(conversationsPath)) {
        fs.unlinkSync(conversationsPath);
      }
    } catch {
      // 忽略测试临时文件清理失败。
    }
  });

  it('allows immediately when required operations are already allowed', async () => {
    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'allow',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['file.read'],
      summary: '读取工作区文件',
      toolName: 'read',
    })).resolves.toBeUndefined();
  });

  it('creates a pending request and remembers always approvals', async () => {
    const reviewPromise = service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      messageId: 'message-1',
      requiredOperations: ['command.execute'],
      summary: '执行 bash 命令',
      toolName: 'bash',
    });

    const [pendingRequest] = service.listPendingRequests(conversationId);
    expect(pendingRequest).toMatchObject({
      operations: ['command.execute'],
      messageId: 'message-1',
      toolName: 'bash',
    });
    expect(pendingRequest.id).toMatch(uuidV7Pattern);

    expect(service.reply(conversationId, pendingRequest.id, 'always')).toEqual({
      requestId: pendingRequest.id,
      resolution: 'approved',
    });
    await expect(reviewPromise).resolves.toBeUndefined();

    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['command.execute'],
      summary: '再次执行 bash 命令',
      toolName: 'bash',
    })).resolves.toBeUndefined();
    expect(service.listPendingRequests(conversationId)).toEqual([]);
  });

  it('persists always approvals across service instances', async () => {
    const conversationRecordService = new ConversationStoreService();
    const conversationId = (conversationRecordService.createConversation({
      title: 'Persistent Runtime Permission',
    }) as { id: string }).id;
    const firstService = new RuntimeToolPermissionService(conversationRecordService);

    const reviewPromise = firstService.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['command.execute'],
      summary: '执行 bash 命令',
      toolName: 'bash',
    });

    const [pendingRequest] = firstService.listPendingRequests(conversationId);
    firstService.reply(conversationId, pendingRequest.id, 'always');
    await expect(reviewPromise).resolves.toBeUndefined();

    const secondService = new RuntimeToolPermissionService(
      new ConversationStoreService(),
    );

    await expect(secondService.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'allow',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['command.execute'],
      summary: '再次执行 bash 命令',
      toolName: 'bash',
    })).resolves.toBeUndefined();
    expect(secondService.listPendingRequests(conversationId)).toEqual([]);
  });

  it('rejects unsupported or denied operations', async () => {
    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: false,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'allow',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['network.access'],
      summary: '联网执行命令',
      toolName: 'bash',
    })).rejects.toThrow('不支持能力');

    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'deny',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'allow',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['network.access'],
      summary: '联网执行命令',
      toolName: 'bash',
    })).rejects.toThrow('权限策略拒绝');
  });

  it('allows ask capabilities directly in yolo mode without creating pending requests', async () => {
    process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE = 'yolo';

    await expect(service.review({
      backend: {
        capabilities: {
          networkAccess: true,
          persistentFilesystem: true,
          persistentShellState: false,
          shellExecution: true,
          workspaceRead: true,
          workspaceWrite: true,
        },
        kind: 'just-bash',
        permissionPolicy: {
          networkAccess: 'ask',
          persistentFilesystem: 'allow',
          persistentShellState: 'deny',
          shellExecution: 'ask',
          workspaceRead: 'allow',
          workspaceWrite: 'allow',
        },
      },
      conversationId,
      requiredOperations: ['command.execute', 'network.access'],
      summary: '联网执行 bash 命令',
      toolName: 'bash',
    })).resolves.toBeUndefined();

    expect(service.listPendingRequests(conversationId)).toEqual([]);
  });

  it('allows ask capabilities directly when runtime-tools config stores approvalMode=yolo', async () => {
    const settingsPath = path.join(
      os.tmpdir(),
      `runtime-tool-permission.settings-${Date.now()}-${Math.random()}.json`,
    );
    fs.writeFileSync(settingsPath, JSON.stringify({
      runtimeTools: {
        approvalMode: 'yolo',
      },
    }, null, 2), 'utf-8');
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = settingsPath;
    const configuredService = new RuntimeToolPermissionService(
      new ConversationStoreService(),
      new RuntimeToolsSettingsService(),
    );

    try {
      await expect(configuredService.review({
        backend: {
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
            shellExecution: true,
            workspaceRead: true,
            workspaceWrite: true,
          },
          kind: 'just-bash',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        },
        conversationId,
        requiredOperations: ['command.execute', 'network.access'],
        summary: '联网执行 bash 命令',
        toolName: 'bash',
      })).resolves.toBeUndefined();

      expect(configuredService.listPendingRequests(conversationId)).toEqual([]);
    } finally {
      delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
      fs.rmSync(settingsPath, { force: true });
    }
  });

  it('still lets the environment variable override stored approvalMode', async () => {
    const settingsPath = path.join(
      os.tmpdir(),
      `runtime-tool-permission.settings-${Date.now()}-${Math.random()}.json`,
    );
    fs.writeFileSync(settingsPath, JSON.stringify({
      runtimeTools: {
        approvalMode: 'yolo',
      },
    }, null, 2), 'utf-8');
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = settingsPath;
    process.env.GARLIC_CLAW_RUNTIME_APPROVAL_MODE = 'review';
    const configuredService = new RuntimeToolPermissionService(
      new ConversationStoreService(),
      new RuntimeToolsSettingsService(),
    );

    try {
      const reviewPromise = configuredService.review({
        backend: {
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
            shellExecution: true,
            workspaceRead: true,
            workspaceWrite: true,
          },
          kind: 'just-bash',
          permissionPolicy: {
            networkAccess: 'allow',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        },
        conversationId,
        requiredOperations: ['command.execute'],
        summary: '执行 bash 命令',
        toolName: 'bash',
      });

      const [pendingRequest] = configuredService.listPendingRequests(conversationId);
      expect(pendingRequest?.toolName).toBe('bash');
      configuredService.reply(conversationId, pendingRequest.id, 'once');
      await expect(reviewPromise).resolves.toBeUndefined();
    } finally {
      delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
      fs.rmSync(settingsPath, { force: true });
    }
  });

  it('bypasses ask approvals for subagent conversations while keeping the same backend policy checks', async () => {
    const conversationRecordService = new ConversationStoreService();
    const subagentConversationId = (conversationRecordService.createConversation({
      kind: 'subagent',
      title: 'Subagent Runtime Permission',
      userId: 'user-1',
    }) as { id: string }).id;
    const configuredService = new RuntimeToolPermissionService(conversationRecordService);

    await expect(configuredService.review({
      backend: {
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
      },
      conversationId: subagentConversationId,
      requiredOperations: ['command.execute', 'network.access'],
      summary: '子代理执行联网命令',
      toolName: 'powershell',
    })).resolves.toBeUndefined();

    expect(configuredService.listPendingRequests(subagentConversationId)).toEqual([]);
  });
});
