import { BashToolService } from '../../../src/modules/execution/bash/bash-tool.service';
import * as runtimePowerShellVariant from '../../../src/modules/execution/runtime/runtime-powershell-variant';

describe('BashToolService', () => {
  const originalHintsTestRoot = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalHintsTestRoot === undefined) {
      delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      return;
    }
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalHintsTestRoot;
  });

  it('describes ask-style network access and non-persistent shell state for just-bash', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    expect(service.buildToolDescription()).toBe([
      '在当前 session 的执行后端中执行命令。',
      '当前 shell backend 使用 bash 语法。',
      '如果后续命令依赖前序命令成功，请把它们放进同一条命令，并用 && 串起来。',
      '同一 session 下写入 backend 当前可见路径的文件，会在后续工具调用中继续可见。',
      '当前后端不会保留 shell 进程状态；不要依赖 cd、export、alias 或 shell function 在跨调用时继续存在。',
      '优先使用 workdir 指定目录，不要把 cd 写进命令里。',
      '读取、搜索或编辑文件时优先使用 read / glob / grep / write / edit，不要用 bash 代替。',
      '当前执行环境的网络访问可能需要审批；如需联网，请把依赖写进同一条命令中。',
      'workdir 必须位于当前 backend 可见路径内。',
    ].join('\n'));
  });

  it('describes native-shell syntax according to the host platform', async () => {
    if (process.platform === 'win32') {
      jest.spyOn(runtimePowerShellVariant, 'readWindowsPowerShellVariant').mockReturnValue('pwsh');
      jest.spyOn(runtimePowerShellVariant, 'supportsWindowsPowerShellAndAnd').mockReturnValue(true);
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.buildToolDescription()).toContain(
      process.platform === 'win32'
        ? '当前 shell backend 实际使用 PowerShell 7（pwsh）语法。'
        : '当前 shell backend 使用 bash 语法。',
    );
    expect(service.buildToolDescription()).toContain(
      process.platform === 'win32'
        ? '当前 PowerShell 7 支持 && / ||；如需更复杂的条件分支，仍优先使用 if ($?) { ... } 这类显式写法。'
        : '如果后续命令依赖前序命令成功，请把它们放进同一条命令，并用 && 串起来。',
    );
  });

  it('describes native-shell fallback as Windows PowerShell 5 when pwsh is unavailable', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    jest.spyOn(runtimePowerShellVariant, 'readWindowsPowerShellVariant').mockReturnValue('powershell');
    jest.spyOn(runtimePowerShellVariant, 'supportsWindowsPowerShellAndAnd').mockReturnValue(false);

    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    expect(service.buildToolDescription()).toContain('当前 shell backend 实际使用 Windows PowerShell 5 语法。');
    expect(service.buildToolDescription()).toContain('当前 Windows PowerShell 5 不支持 &&；请改用 PowerShell 条件写法，例如 cmd1; if ($?) { cmd2 }。');
  });

  it('describes persistent shell state when the backend keeps one shell session alive', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: true,
            shellExecution: true,
            workspaceRead: true,
            workspaceWrite: true,
          },
          kind: process.platform === 'win32' ? 'native-shell' : 'mock-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'allow',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => process.platform === 'win32' ? 'native-shell' : 'mock-shell',
      } as never,
    );

    // persistentShellState is always false now; non-persistent text always shown.
    expect(service.buildToolDescription()).toContain('当前后端不会保留 shell 进程状态');
  });

  it('treats native-shell aliases as the same shell syntax family', async () => {
    if (process.platform === 'win32') {
      jest.spyOn(runtimePowerShellVariant, 'readWindowsPowerShellVariant').mockReturnValue('powershell');
      jest.spyOn(runtimePowerShellVariant, 'supportsWindowsPowerShellAndAnd').mockReturnValue(false);
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
            shellExecution: true,
            workspaceRead: true,
            workspaceWrite: true,
          },
          kind: 'native-shell-alias',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell-alias',
      } as never,
    );

    expect(service.buildToolDescription()).toContain(
      process.platform === 'win32'
        ? '当前 shell backend 实际使用 Windows PowerShell 5 语法。'
        : '当前 shell backend 使用 bash 语法。',
    );

    const access = await service.readRuntimeAccess({
      backendKind: 'native-shell-alias',
      command: 'Write-Output first && Write-Output second',
      description: '检查 native-shell-alias chaining 提示',
      sessionId: 'session-1',
    });

    if (process.platform === 'win32') {
      expect(access).toMatchObject({
        metadata: {
          commandHints: {
            usesWindowsAndAnd: true,
          },
        },
        summary: '检查 native-shell-alias chaining 提示 (/)；静态提示: 当前 Windows PowerShell 不支持 &&',
      });
      return;
    }

    expect(access).toMatchObject({
      metadata: {
        command: 'Write-Output first && Write-Output second',
      },
      summary: '检查 native-shell-alias chaining 提示 (/)',
    });
  });

  it('treats wsl-shell as bash syntax even on Windows', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
            shellExecution: true,
            workspaceRead: true,
            workspaceWrite: true,
          },
          kind: 'wsl-shell',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'wsl-shell',
      } as never,
    );

    expect(service.buildToolDescription()).toContain('当前 shell backend 使用 bash 语法。');
    expect(service.buildToolDescription()).toContain('请把它们放进同一条命令，并用 && 串起来。');
  });

  it('describes denied network access inside a restricted visible root', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: false,
            persistentFilesystem: true,
            persistentShellState: false,
            shellExecution: true,
            workspaceRead: true,
            workspaceWrite: true,
          },
          kind: 'mock-shell',
          permissionPolicy: {
            networkAccess: 'deny',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'allow',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    expect(service.buildToolDescription()).toContain('当前执行环境不提供网络访问。');
    expect(service.buildToolDescription()).toContain('同一 session 下写入 /workspace 内的文件，会在后续工具调用中继续可见。');
    expect(service.buildToolDescription()).toContain('workdir 参数只能位于 /workspace 内。');
  });

  it('adds static shell hints into runtime access metadata and summary', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cd /tmp && cat /etc/hosts && rm logs/tmp.txt',
      description: '检查静态命令提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cd /tmp && cat /etc/hosts && rm logs/tmp.txt',
        commandHints: {
          absolutePaths: ['/tmp', '/etc/hosts'],
          externalAbsolutePaths: ['/tmp', '/etc/hosts'],
          fileCommands: ['cd', 'cat', 'rm'],
          usesCd: true,
        },
        description: '检查静态命令提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查静态命令提示 (/workspace)；静态提示: 含 cd、文件命令: cd, cat, rm、外部绝对路径: /tmp, /etc/hosts',
    });
  });

  it('treats visible-root slash paths as internal virtual workspace paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cp /tmp/source.txt /tmp/dest.txt',
      description: '检查默认可见根内部路径',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cp /tmp/source.txt /tmp/dest.txt',
        commandHints: {
          absolutePaths: ['/tmp/source.txt', '/tmp/dest.txt'],
          fileCommands: ['cp'],
        },
        description: '检查默认可见根内部路径',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查默认可见根内部路径 (/)；静态提示: 文件命令: cp',
    });
  });

  it('includes network command hints in static access metadata and summary', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl -fsSL https://example.com/install.sh',
      description: '检查联网命令提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh',
        commandHints: {
          networkCommands: ['curl'],
          usesNetworkCommand: true,
        },
        description: '检查联网命令提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查联网命令提示 (/workspace)；静态提示: 联网命令: curl',
    });
  });

  it('expands bash env path syntax in static hints', async () => {
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = process.platform === 'win32'
      ? 'C:\\env-root'
      : '/tmp/env-root';
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cp "$GARLIC_CLAW_HINTS_TEST_ROOT/source.txt" "${GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt"',
      description: '检查 bash env 路径展开',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cp "$GARLIC_CLAW_HINTS_TEST_ROOT/source.txt" "${GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt"',
        commandHints: {
          absolutePaths: [
            `${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/source.txt`,
            `${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt`,
          ],
          externalAbsolutePaths: [
            `${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/source.txt`,
            `${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt`,
          ],
          externalWritePaths: [`${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt`],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 bash env 路径展开',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: `检查 bash env 路径展开 (/workspace)；静态提示: 写入命令涉及外部绝对路径: ${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt、文件命令: cp、外部绝对路径: ${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/source.txt, ${process.env.GARLIC_CLAW_HINTS_TEST_ROOT}/copied.txt`,
    });
  });

  it('expands bash local variable path syntax in static hints', async () => {
    const externalRoot = process.platform === 'win32'
      ? 'C:/local-root'
      : '/tmp/local-root';
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: `ROOT=${externalRoot}; cp /workspace/source.txt "$ROOT/copied.txt"`,
      description: '检查 bash 本地变量路径展开',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: `ROOT=${externalRoot}; cp /workspace/source.txt "$ROOT/copied.txt"`,
        commandHints: {
          absolutePaths: ['/workspace/source.txt', `${externalRoot}/copied.txt`],
          externalAbsolutePaths: [`${externalRoot}/copied.txt`],
          externalWritePaths: [`${externalRoot}/copied.txt`],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 bash 本地变量路径展开',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: `检查 bash 本地变量路径展开 (/workspace)；静态提示: 写入命令涉及外部绝对路径: ${externalRoot}/copied.txt、文件命令: cp、外部绝对路径: ${externalRoot}/copied.txt`,
    });
  });

  it('does not expand single-quoted bash env path syntax in static hints', async () => {
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = process.platform === 'win32'
      ? 'C:\\env-root'
      : '/tmp/env-root';
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cp \'$GARLIC_CLAW_HINTS_TEST_ROOT/source.txt\' \'$GARLIC_CLAW_HINTS_TEST_ROOT/copied.txt\'',
      description: '检查 bash single-quoted env path 误报',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cp \'$GARLIC_CLAW_HINTS_TEST_ROOT/source.txt\' \'$GARLIC_CLAW_HINTS_TEST_ROOT/copied.txt\'',
        commandHints: {
          fileCommands: ['cp'],
        },
        description: '检查 bash single-quoted env path 误报',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 bash single-quoted env path 误报 (/workspace)；静态提示: 文件命令: cp',
    });
  });

  it('expands powershell local variable path syntax in static hints', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: '$root=\'C:\\temp\'; Set-Content -Path "$root\\note.txt" -Value hi',
      description: '检查 powershell 本地变量路径展开',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: '$root=\'C:\\temp\'; Set-Content -Path "$root\\note.txt" -Value hi',
        commandHints: {
          absolutePaths: ['C:\\temp\\note.txt'],
          externalAbsolutePaths: ['C:\\temp\\note.txt'],
          externalWritePaths: ['C:\\temp\\note.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 powershell 本地变量路径展开',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 powershell 本地变量路径展开 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note.txt',
    });
  });

  it('expands powershell simple subexpression local variable paths in static hints', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: '$root=\'C:\\temp\'; Set-Content -Path "$($root)\\note.txt" -Value hi',
      description: '检查 powershell 简单子表达式本地变量路径展开',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: '$root=\'C:\\temp\'; Set-Content -Path "$($root)\\note.txt" -Value hi',
        commandHints: {
          absolutePaths: ['C:\\temp\\note.txt'],
          externalAbsolutePaths: ['C:\\temp\\note.txt'],
          externalWritePaths: ['C:\\temp\\note.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 powershell 简单子表达式本地变量路径展开',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 powershell 简单子表达式本地变量路径展开 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note.txt',
    });
  });

  it('surfaces write targets inside bash control-flow blocks through AST parsing', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'if test -f src.txt; then cp src.txt /tmp/out.txt; fi',
      description: '检查 bash 控制流里的写入目标',
      sessionId: 'session-1',
    })).resolves.toMatchObject({
      backendKind: 'mock-shell',
      metadata: {
        commandHints: {
          externalAbsolutePaths: ['/tmp/out.txt'],
          externalWritePaths: ['/tmp/out.txt'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
    });
  });

  it('surfaces powershell script-block writes through AST parsing', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'if ($?) { Set-Content -Path C:\\temp\\note.txt -Value hi }',
      description: '检查 powershell script block 写入目标',
      sessionId: 'session-1',
    })).resolves.toMatchObject({
      backendKind: 'native-shell',
      metadata: {
        commandHints: {
          absolutePaths: ['C:\\temp\\note.txt'],
          externalAbsolutePaths: ['C:\\temp\\note.txt'],
          externalWritePaths: ['C:\\temp\\note.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
    });
  });

  it('surfaces powershell script-block writes through AST parsing for native-shell aliases', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
            shellExecution: true,
            workspaceRead: true,
            workspaceWrite: true,
          },
          kind: 'native-shell-alias',
          permissionPolicy: {
            networkAccess: 'ask',
            persistentFilesystem: 'allow',
            persistentShellState: 'deny',
            shellExecution: 'ask',
            workspaceRead: 'allow',
            workspaceWrite: 'allow',
          },
        }),
        getShellBackendKind: () => 'native-shell-alias',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell-alias',
      command: 'if ($?) { Set-Content -Path C:\\temp\\alias-note.txt -Value hi }',
      description: '检查 native-shell-alias script block 写入目标',
      sessionId: 'session-1',
    })).resolves.toMatchObject({
      backendKind: 'native-shell-alias',
      metadata: {
        commandHints: {
          absolutePaths: ['C:\\temp\\alias-note.txt'],
          externalAbsolutePaths: ['C:\\temp\\alias-note.txt'],
          externalWritePaths: ['C:\\temp\\alias-note.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
    });
  });

  it('falls back to bash token hints when AST parsing fails', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        }),
        getShellBackendKind: () => 'just-bash',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'just-bash',
      command: 'cp /workspace/input.txt /tmp/copied-from-fallback.txt (',
      description: '检查 bash AST 失败回退提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'just-bash',
      metadata: {
        command: 'cp /workspace/input.txt /tmp/copied-from-fallback.txt (',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', '/tmp/copied-from-fallback.txt'],
          externalAbsolutePaths: ['/tmp/copied-from-fallback.txt'],
          externalWritePaths: ['/tmp/copied-from-fallback.txt'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 bash AST 失败回退提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 bash AST 失败回退提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/copied-from-fallback.txt、文件命令: cp、外部绝对路径: /tmp/copied-from-fallback.txt',
    });
  });

  it('falls back to powershell token hints when AST parsing fails', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Copy-Item -Path /workspace/input.txt -Destination C:\\temp\\copied-from-fallback.txt )',
      description: '检查 powershell AST 失败回退提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Copy-Item -Path /workspace/input.txt -Destination C:\\temp\\copied-from-fallback.txt )',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'C:\\temp\\copied-from-fallback.txt'],
          externalAbsolutePaths: ['C:\\temp\\copied-from-fallback.txt'],
          externalWritePaths: ['C:\\temp\\copied-from-fallback.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 powershell AST 失败回退提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 powershell AST 失败回退提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\copied-from-fallback.txt、文件命令: copy-item、外部绝对路径: C:\\temp\\copied-from-fallback.txt',
    });
  });

  it('highlights when a network command also touches external absolute paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl -fsSL https://example.com/install.sh -o /tmp/install.sh',
      description: '检查联网外部路径组合提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh -o /tmp/install.sh',
        commandHints: {
          absolutePaths: ['/tmp/install.sh'],
          externalAbsolutePaths: ['/tmp/install.sh'],
          externalWritePaths: ['/tmp/install.sh'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查联网外部路径组合提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查联网外部路径组合提示 (/workspace)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: /tmp/install.sh、写入命令涉及外部绝对路径: /tmp/install.sh、外部绝对路径: /tmp/install.sh',
    });
  });

  it('treats curl --output external paths as external writes', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl -fsSL https://example.com/install.sh --output ~/install.sh',
      description: '检查 curl output 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl -fsSL https://example.com/install.sh --output ~/install.sh',
        commandHints: {
          absolutePaths: ['~/install.sh'],
          externalAbsolutePaths: ['~/install.sh'],
          externalWritePaths: ['~/install.sh'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 curl output 外部写入提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 curl output 外部写入提示 (/workspace)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/install.sh、写入命令涉及外部绝对路径: ~/install.sh、外部绝对路径: ~/install.sh',
    });
  });

  it('treats wget output-document external paths as external writes', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'wget -O /tmp/install.sh https://example.com/install.sh',
      description: '检查 wget 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'wget -O /tmp/install.sh https://example.com/install.sh',
        commandHints: {
          absolutePaths: ['/tmp/install.sh'],
          externalAbsolutePaths: ['/tmp/install.sh'],
          externalWritePaths: ['/tmp/install.sh'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 wget 外部写入提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 wget 外部写入提示 (/workspace)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: /tmp/install.sh、写入命令涉及外部绝对路径: /tmp/install.sh、外部绝对路径: /tmp/install.sh',
    });
  });

  it('does not treat lowercase wget -p as a write path flag', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'wget -p ~/downloads https://example.com/index.html',
      description: '检查 wget 短参数大小写',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'wget -p ~/downloads https://example.com/index.html',
        commandHints: {
          absolutePaths: ['~/downloads'],
          externalAbsolutePaths: ['~/downloads'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 wget 短参数大小写',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 wget 短参数大小写 (/workspace)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/downloads、外部绝对路径: ~/downloads',
    });
  });

  it('does not treat uppercase curl --Output as a write path flag', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl --Output ~/download.txt https://example.com/file.txt',
      description: '检查 curl 长参数大小写',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl --Output ~/download.txt https://example.com/file.txt',
        commandHints: {
          absolutePaths: ['~/download.txt'],
          externalAbsolutePaths: ['~/download.txt'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 curl 长参数大小写',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 curl 长参数大小写 (/workspace)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: ~/download.txt、外部绝对路径: ~/download.txt',
    });
  });

  it('does not treat mixed-case wget --Directory-Prefix as a write path flag', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'wget --Directory-Prefix ~/downloads https://example.com/index.html',
      description: '检查 wget 长参数大小写',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'wget --Directory-Prefix ~/downloads https://example.com/index.html',
        commandHints: {
          absolutePaths: ['~/downloads'],
          externalAbsolutePaths: ['~/downloads'],
          networkCommands: ['wget'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 wget 长参数大小写',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 wget 长参数大小写 (/workspace)；静态提示: 联网命令: wget、联网命令涉及外部绝对路径: ~/downloads、外部绝对路径: ~/downloads',
    });
  });

  it('treats git clone explicit external destination as an external write', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git clone https://example.com/repo.git /tmp/repo-copy',
      description: '检查 git clone 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git clone https://example.com/repo.git /tmp/repo-copy',
        commandHints: {
          absolutePaths: ['/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          networkCommands: ['git clone'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 git clone 外部写入提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 git clone 外部写入提示 (/workspace)；静态提示: 联网命令: git clone、联网命令涉及外部绝对路径: /tmp/repo-copy、写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/repo-copy',
    });
  });

  it('treats git clone separate git dir as an external write', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git clone --separate-git-dir /tmp/repo.git https://example.com/repo.git',
      description: '检查 git clone 单独 git 目录提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git clone --separate-git-dir /tmp/repo.git https://example.com/repo.git',
        commandHints: {
          absolutePaths: ['/tmp/repo.git'],
          externalAbsolutePaths: ['/tmp/repo.git'],
          externalWritePaths: ['/tmp/repo.git'],
          networkCommands: ['git clone'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 git clone 单独 git 目录提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 git clone 单独 git 目录提示 (/workspace)；静态提示: 联网命令: git clone、联网命令涉及外部绝对路径: /tmp/repo.git、写入命令涉及外部绝对路径: /tmp/repo.git、外部绝对路径: /tmp/repo.git',
    });
  });

  it('treats git init explicit external destination as an external write', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git init /tmp/repo-copy',
      description: '检查 git init 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git init /tmp/repo-copy',
        commandHints: {
          absolutePaths: ['/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 git init 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git init 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/repo-copy',
    });
  });

  it('treats git init external destination as write target but keeps template path out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git init --template /tmp/template-dir /tmp/repo-copy',
      description: '检查 git init 模板参数误报',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git init --template /tmp/template-dir /tmp/repo-copy',
        commandHints: {
          absolutePaths: ['/tmp/template-dir', '/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/template-dir', '/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 git init 模板参数误报',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git init 模板参数误报 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/template-dir, /tmp/repo-copy',
    });
  });

  it('treats git archive output file as an external write', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git archive --output /tmp/repo.tar HEAD',
      description: '检查 git archive 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git archive --output /tmp/repo.tar HEAD',
        commandHints: {
          absolutePaths: ['/tmp/repo.tar'],
          externalAbsolutePaths: ['/tmp/repo.tar'],
          externalWritePaths: ['/tmp/repo.tar'],
          writesExternalPath: true,
        },
        description: '检查 git archive 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git archive 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo.tar、外部绝对路径: /tmp/repo.tar',
    });
  });

  it('treats git bundle create output file as an external write', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git bundle create /tmp/repo.bundle HEAD',
      description: '检查 git bundle 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git bundle create /tmp/repo.bundle HEAD',
        commandHints: {
          absolutePaths: ['/tmp/repo.bundle'],
          externalAbsolutePaths: ['/tmp/repo.bundle'],
          externalWritePaths: ['/tmp/repo.bundle'],
          writesExternalPath: true,
        },
        description: '检查 git bundle 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git bundle 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo.bundle、外部绝对路径: /tmp/repo.bundle',
    });
  });

  it('treats git format-patch output directory as an external write', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git format-patch --output-directory /tmp/patches HEAD~2',
      description: '检查 git format-patch 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git format-patch --output-directory /tmp/patches HEAD~2',
        commandHints: {
          absolutePaths: ['/tmp/patches'],
          externalAbsolutePaths: ['/tmp/patches'],
          externalWritePaths: ['/tmp/patches'],
          writesExternalPath: true,
        },
        description: '检查 git format-patch 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git format-patch 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/patches、外部绝对路径: /tmp/patches',
    });
  });

  it('treats tar create archive file as external write but not source paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'tar -cf /tmp/archive.tar ~/source.txt',
      description: '检查 tar create 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'tar -cf /tmp/archive.tar ~/source.txt',
        commandHints: {
          absolutePaths: ['/tmp/archive.tar', '~/source.txt'],
          externalAbsolutePaths: ['/tmp/archive.tar', '~/source.txt'],
          externalWritePaths: ['/tmp/archive.tar'],
          fileCommands: ['tar'],
          writesExternalPath: true,
        },
        description: '检查 tar create 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 tar create 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/archive.tar、文件命令: tar、外部绝对路径: /tmp/archive.tar, ~/source.txt',
    });
  });

  it('treats tar extract directory as external write but not archive input', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'tar -xf ~/archive.tar -C /tmp/output',
      description: '检查 tar extract 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'tar -xf ~/archive.tar -C /tmp/output',
        commandHints: {
          absolutePaths: ['~/archive.tar', '/tmp/output'],
          externalAbsolutePaths: ['~/archive.tar', '/tmp/output'],
          externalWritePaths: ['/tmp/output'],
          fileCommands: ['tar'],
          writesExternalPath: true,
        },
        description: '检查 tar extract 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 tar extract 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/output、文件命令: tar、外部绝对路径: ~/archive.tar, /tmp/output',
    });
  });

  it('treats cp destination as external write but keeps source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cp ~/source.txt /tmp/copied.txt',
      description: '检查 cp 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cp ~/source.txt /tmp/copied.txt',
        commandHints: {
          absolutePaths: ['~/source.txt', '/tmp/copied.txt'],
          externalAbsolutePaths: ['~/source.txt', '/tmp/copied.txt'],
          externalWritePaths: ['/tmp/copied.txt'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 cp 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 cp 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/copied.txt、文件命令: cp、外部绝对路径: ~/source.txt, /tmp/copied.txt',
    });
  });

  it('treats mv destination as external write but keeps source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'mv ~/source.txt /tmp/moved.txt',
      description: '检查 mv 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'mv ~/source.txt /tmp/moved.txt',
        commandHints: {
          absolutePaths: ['~/source.txt', '/tmp/moved.txt'],
          externalAbsolutePaths: ['~/source.txt', '/tmp/moved.txt'],
          externalWritePaths: ['/tmp/moved.txt'],
          fileCommands: ['mv'],
          writesExternalPath: true,
        },
        description: '检查 mv 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 mv 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/moved.txt、文件命令: mv、外部绝对路径: ~/source.txt, /tmp/moved.txt',
    });
  });

  it('treats cp target-directory flag as external write but keeps sources out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cp -t /tmp/copied-dir ~/source-a.txt ~/source-b.txt',
      description: '检查 cp target-directory 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cp -t /tmp/copied-dir ~/source-a.txt ~/source-b.txt',
        commandHints: {
          absolutePaths: ['/tmp/copied-dir', '~/source-a.txt', '~/source-b.txt'],
          externalAbsolutePaths: ['/tmp/copied-dir', '~/source-a.txt', '~/source-b.txt'],
          externalWritePaths: ['/tmp/copied-dir'],
          fileCommands: ['cp'],
          writesExternalPath: true,
        },
        description: '检查 cp target-directory 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 cp target-directory 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/copied-dir、文件命令: cp、外部绝对路径: /tmp/copied-dir, ~/source-a.txt, ~/source-b.txt',
    });
  });

  it('treats mv target-directory flag as external write but keeps sources out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'mv --target-directory /tmp/moved-dir ~/source-a.txt ~/source-b.txt',
      description: '检查 mv target-directory 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'mv --target-directory /tmp/moved-dir ~/source-a.txt ~/source-b.txt',
        commandHints: {
          absolutePaths: ['/tmp/moved-dir', '~/source-a.txt', '~/source-b.txt'],
          externalAbsolutePaths: ['/tmp/moved-dir', '~/source-a.txt', '~/source-b.txt'],
          externalWritePaths: ['/tmp/moved-dir'],
          fileCommands: ['mv'],
          writesExternalPath: true,
        },
        description: '检查 mv target-directory 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 mv target-directory 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/moved-dir、文件命令: mv、外部绝对路径: /tmp/moved-dir, ~/source-a.txt, ~/source-b.txt',
    });
  });

  it('treats git worktree add explicit external destination as an external write', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git worktree add -b feature /tmp/repo-copy main',
      description: '检查 git worktree 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git worktree add -b feature /tmp/repo-copy main',
        commandHints: {
          absolutePaths: ['/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 git worktree 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git worktree 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/repo-copy',
    });
  });

  it('treats git submodule add explicit external destination as an external write', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'git submodule add https://example.com/repo.git /tmp/repo-copy',
      description: '检查 git submodule 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'git submodule add https://example.com/repo.git /tmp/repo-copy',
        commandHints: {
          absolutePaths: ['/tmp/repo-copy'],
          externalAbsolutePaths: ['/tmp/repo-copy'],
          externalWritePaths: ['/tmp/repo-copy'],
          writesExternalPath: true,
        },
        description: '检查 git submodule 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 git submodule 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: /tmp/repo-copy、外部绝对路径: /tmp/repo-copy',
    });
  });

  it('treats scp destination external paths as external writes', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'scp user@example.com:/var/log/app.log /tmp/app.log',
      description: '检查 scp 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'scp user@example.com:/var/log/app.log /tmp/app.log',
        commandHints: {
          absolutePaths: ['/tmp/app.log'],
          externalAbsolutePaths: ['/tmp/app.log'],
          externalWritePaths: ['/tmp/app.log'],
          networkCommands: ['scp'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 scp 外部写入提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 scp 外部写入提示 (/workspace)；静态提示: 联网命令: scp、联网命令涉及外部绝对路径: /tmp/app.log、写入命令涉及外部绝对路径: /tmp/app.log、外部绝对路径: /tmp/app.log',
    });
  });

  it('does not treat curl upload-file local input paths as external writes', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'curl --upload-file /tmp/input.txt https://example.com/upload',
      description: '检查 curl upload-file 误报',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'curl --upload-file /tmp/input.txt https://example.com/upload',
        commandHints: {
          absolutePaths: ['/tmp/input.txt'],
          externalAbsolutePaths: ['/tmp/input.txt'],
          networkCommands: ['curl'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 curl upload-file 误报',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 curl upload-file 误报 (/workspace)；静态提示: 联网命令: curl、联网命令涉及外部绝对路径: /tmp/input.txt、外部绝对路径: /tmp/input.txt',
    });
  });

  it('does not treat scp local source paths as external writes', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'scp /tmp/input.txt user@example.com:/var/log/app.log',
      description: '检查 scp 本地源文件误报',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'scp /tmp/input.txt user@example.com:/var/log/app.log',
        commandHints: {
          absolutePaths: ['/tmp/input.txt'],
          externalAbsolutePaths: ['/tmp/input.txt'],
          networkCommands: ['scp'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
        },
        description: '检查 scp 本地源文件误报',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 scp 本地源文件误报 (/workspace)；静态提示: 联网命令: scp、联网命令涉及外部绝对路径: /tmp/input.txt、外部绝对路径: /tmp/input.txt',
    });
  });

  it('highlights when a write command targets external absolute paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Copy-Item -Path /workspace/input.txt -Destination filesystem::C:\\temp\\copied.txt',
      description: '检查写入外部路径提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Copy-Item -Path /workspace/input.txt -Destination filesystem::C:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\copied.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查写入外部路径提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查写入外部路径提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\copied.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\copied.txt',
    });
  });

  it('treats Copy-Item destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt',
      description: '检查 Copy-Item 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 Copy-Item 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 Copy-Item 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied.txt',
    });
  });

  it('treats cpi destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-alias.txt',
      description: '检查 cpi 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-alias.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-alias.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 cpi 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 cpi 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-alias.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-alias.txt',
    });
  });

  it('treats copy destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'copy -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-word.txt',
      description: '检查 copy 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'copy -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\copied-word.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-word.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-word.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-word.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 copy 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 copy 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-word.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-word.txt',
    });
  });

  it('treats quoted attached Copy-Item destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-quoted.txt"',
      description: '检查 Copy-Item quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-quoted.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 Copy-Item quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 Copy-Item quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-quoted.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-quoted.txt',
    });
  });

  it('treats quoted attached cpi destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-alias-quoted.txt"',
      description: '检查 cpi quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'cpi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-alias-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-alias-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-alias-quoted.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 cpi quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 cpi quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-alias-quoted.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-alias-quoted.txt',
    });
  });

  it('treats quoted attached copy destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'copy -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-word-quoted.txt"',
      description: '检查 copy quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'copy -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\copied-word-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-word-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-word-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-word-quoted.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 copy quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 copy quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-word-quoted.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-word-quoted.txt',
    });
  });

  it('treats Move-Item destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt',
      description: '检查 Move-Item 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 Move-Item 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 Move-Item 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved.txt',
    });
  });

  it('treats mi destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-alias.txt',
      description: '检查 mi 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-alias.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-alias.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 mi 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 mi 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-alias.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-alias.txt',
    });
  });

  it('treats quoted attached Move-Item destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-quoted.txt"',
      description: '检查 Move-Item quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Move-Item -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-quoted.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 Move-Item quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 Move-Item quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-quoted.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-quoted.txt',
    });
  });

  it('treats quoted attached mi destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-alias-quoted.txt"',
      description: '检查 mi quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'mi -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-alias-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-alias-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-alias-quoted.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 mi quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 mi quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-alias-quoted.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-alias-quoted.txt',
    });
  });

  it('treats quoted attached move destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'move -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-word-quoted.txt"',
      description: '检查 move quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'move -Path filesystem::C:\\temp\\input.txt -Destination:"filesystem::D:\\temp\\moved-word-quoted.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-word-quoted.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-word-quoted.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-word-quoted.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 move quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 move quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-word-quoted.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-word-quoted.txt',
    });
  });

  it('treats move destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'move -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-word.txt',
      description: '检查 move 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'move -Path filesystem::C:\\temp\\input.txt -Destination filesystem::D:\\temp\\moved-word.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-word.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\moved-word.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\moved-word.txt'],
          fileCommands: ['move-item'],
          writesExternalPath: true,
        },
        description: '检查 move 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 move 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\moved-word.txt、文件命令: move-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\moved-word.txt',
    });
  });

  it('treats Copy-Item literalpath destination as external write but keeps external source out of external write paths', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Copy-Item -LiteralPath filesystem::C:\\temp\\input-literal.txt -Destination:"filesystem::D:\\temp\\copied-literal.txt"',
      description: '检查 Copy-Item literalpath 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Copy-Item -LiteralPath filesystem::C:\\temp\\input-literal.txt -Destination:"filesystem::D:\\temp\\copied-literal.txt"',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input-literal.txt', 'filesystem::D:\\temp\\copied-literal.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input-literal.txt', 'filesystem::D:\\temp\\copied-literal.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-literal.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 Copy-Item literalpath 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 Copy-Item literalpath 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-literal.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input-literal.txt, filesystem::D:\\temp\\copied-literal.txt',
    });
  });

  it('expands powershell env destination tokens for copy-item write hints', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-env.txt"',
        description: '检查 Copy-Item env destination 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-env.txt"',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt', 'C:\\env-root\\copied-env.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'C:\\env-root\\copied-env.txt'],
            externalWritePaths: ['C:\\env-root\\copied-env.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 Copy-Item env destination 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 Copy-Item env destination 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\copied-env.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, C:\\env-root\\copied-env.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('expands braced powershell env destination tokens for copy-item write hints', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\copied-braced-env.txt"',
        description: '检查 Copy-Item braced env destination 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\copied-braced-env.txt"',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt', 'C:\\env-root\\copied-braced-env.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'C:\\env-root\\copied-braced-env.txt'],
            externalWritePaths: ['C:\\env-root\\copied-braced-env.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 Copy-Item braced env destination 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 Copy-Item braced env destination 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\copied-braced-env.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, C:\\env-root\\copied-braced-env.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('expands powershell env destinations after filesystem provider prefixes for copy-item write hints', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-env.txt"',
        description: '检查 Copy-Item provider env destination 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination "filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-env.txt"',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::C:\\env-root\\copied-provider-env.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::C:\\env-root\\copied-provider-env.txt'],
            externalWritePaths: ['filesystem::C:\\env-root\\copied-provider-env.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 Copy-Item provider env destination 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 Copy-Item provider env destination 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\env-root\\copied-provider-env.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::C:\\env-root\\copied-provider-env.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('treats shell redirection to external absolute paths as external writes', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Write-Output done > filesystem::C:\\temp\\redirected.txt',
      description: '检查重定向写入外部路径提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Write-Output done > filesystem::C:\\temp\\redirected.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\redirected.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\redirected.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\redirected.txt'],
          writesExternalPath: true,
        },
        description: '检查重定向写入外部路径提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查重定向写入外部路径提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\redirected.txt、外部绝对路径: filesystem::C:\\temp\\redirected.txt',
    });
  });

  it('does not treat single-quoted powershell env redirection targets as external writes', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const access = await service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Write-Output done > \'$env:GARLIC_CLAW_HINTS_TEST_ROOT\\redirected-single-quoted-env.txt\'',
        description: '检查单引号 powershell env 重定向误报',
        sessionId: 'session-1',
      });
      expect(access).toMatchObject({
        backendKind: 'native-shell',
        metadata: {
          command: 'Write-Output done > \'$env:GARLIC_CLAW_HINTS_TEST_ROOT\\redirected-single-quoted-env.txt\'',
          description: '检查单引号 powershell env 重定向误报',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查单引号 powershell env 重定向误报 (/workspace)',
      });
      expect((access.metadata as any).commandHints?.externalWritePaths).toBeUndefined();
      expect((access.metadata as any).commandHints?.writesExternalPath).toBeUndefined();
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not treat single-quoted provider env redirection targets as external writes', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      const access = await service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Write-Output done > \'filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\redirected-provider-single-quoted-env.txt\'',
        description: '检查单引号 provider env 重定向误报',
        sessionId: 'session-1',
      });
      expect(access).toMatchObject({
        backendKind: 'native-shell',
        metadata: {
          command: 'Write-Output done > \'filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\redirected-provider-single-quoted-env.txt\'',
          description: '检查单引号 provider env 重定向误报',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查单引号 provider env 重定向误报 (/workspace)',
      });
      expect((access.metadata as any).commandHints?.externalWritePaths).toBeUndefined();
      expect((access.metadata as any).commandHints?.writesExternalPath).toBeUndefined();
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('recognizes out-file filepath writes as external write hints', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Get-Content /workspace/input.txt | Out-File -FilePath filesystem::C:\\temp\\copied.txt',
      description: '检查 out-file 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Get-Content /workspace/input.txt | Out-File -FilePath filesystem::C:\\temp\\copied.txt',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\temp\\copied.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\copied.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\copied.txt'],
          fileCommands: ['get-content', 'out-file'],
          writesExternalPath: true,
        },
        description: '检查 out-file 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 out-file 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\copied.txt、文件命令: get-content, out-file、外部绝对路径: filesystem::C:\\temp\\copied.txt',
    });
  });

  it('treats only the first positional token as out-file write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Out-File C:\\temp\\copied.txt D:\\payload.txt',
      description: '检查 out-file positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Out-File C:\\temp\\copied.txt D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\copied.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\copied.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\copied.txt'],
          fileCommands: ['out-file'],
          writesExternalPath: true,
        },
        description: '检查 out-file positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 out-file positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\copied.txt、文件命令: out-file、外部绝对路径: C:\\temp\\copied.txt, D:\\payload.txt',
    });
  });

  it('recognizes attached powershell filepath syntax as out-file write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Out-File -FilePath:C:\\temp\\copied-attached.txt D:\\payload.txt',
      description: '检查 out-file attached filepath 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Out-File -FilePath:C:\\temp\\copied-attached.txt D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\copied-attached.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\copied-attached.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\copied-attached.txt'],
          fileCommands: ['out-file'],
          writesExternalPath: true,
        },
        description: '检查 out-file attached filepath 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 out-file attached filepath 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\copied-attached.txt、文件命令: out-file、外部绝对路径: C:\\temp\\copied-attached.txt, D:\\payload.txt',
    });
  });

  it('recognizes quoted attached powershell filepath syntax as out-file write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Out-File -FilePath:"C:\\temp\\copied-attached-quoted.txt" D:\\payload.txt',
      description: '检查 out-file quoted attached filepath 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Out-File -FilePath:"C:\\temp\\copied-attached-quoted.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\copied-attached-quoted.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\copied-attached-quoted.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\copied-attached-quoted.txt'],
          fileCommands: ['out-file'],
          writesExternalPath: true,
        },
        description: '检查 out-file quoted attached filepath 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 out-file quoted attached filepath 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\copied-attached-quoted.txt、文件命令: out-file、外部绝对路径: C:\\temp\\copied-attached-quoted.txt, D:\\payload.txt',
    });
  });

  it('recognizes powershell native network commands in static hints', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'iwr https://example.com/api; irm https://example.com/data',
      description: '检查 powershell 联网提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'iwr https://example.com/api; irm https://example.com/data',
        commandHints: {
          networkCommands: ['invoke-webrequest', 'invoke-restmethod'],
          usesNetworkCommand: true,
        },
        description: '检查 powershell 联网提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 powershell 联网提示 (/workspace)；静态提示: 联网命令: invoke-webrequest, invoke-restmethod',
    });
  });

  it('treats new-item path plus name as the external write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'New-Item -Path filesystem::C:\\temp -Name created.txt -ItemType File',
      description: '检查 new-item 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'New-Item -Path filesystem::C:\\temp -Name created.txt -ItemType File',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp'],
          externalAbsolutePaths: ['filesystem::C:\\temp'],
          externalWritePaths: ['filesystem::C:\\temp\\created.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 new-item 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 new-item 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\created.txt、文件命令: new-item、外部绝对路径: filesystem::C:\\temp',
    });
  });

  it('recognizes quoted attached powershell path syntax as new-item write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'New-Item -Path:"C:\\temp" -Name created-attached-quoted.txt -ItemType File',
      description: '检查 new-item quoted attached path 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'New-Item -Path:"C:\\temp" -Name created-attached-quoted.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-attached-quoted.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 new-item quoted attached path 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 new-item quoted attached path 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-attached-quoted.txt、文件命令: new-item、外部绝对路径: C:\\temp',
    });
  });

  it('treats rename-item path plus newname as the external write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt',
      description: '检查 rename-item 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Rename-Item -Path filesystem::C:\\temp\\old.txt -NewName renamed.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\old.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\old.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\renamed.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 rename-item 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rename-item 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\renamed.txt、文件命令: rename-item、外部绝对路径: filesystem::C:\\temp\\old.txt',
    });
  });

  it('treats ni alias path plus name as the external write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'ni -Path C:\\temp -Name created-alias.txt -ItemType File',
      description: '检查 ni 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'ni -Path C:\\temp -Name created-alias.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-alias.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 ni 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 ni 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-alias.txt、文件命令: new-item、外部绝对路径: C:\\temp',
    });
  });

  it('recognizes quoted attached powershell path syntax for ni alias write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'ni -Path:"C:\\temp" -Name created-alias-quoted.txt -ItemType File',
      description: '检查 ni quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'ni -Path:"C:\\temp" -Name created-alias-quoted.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-alias-quoted.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 ni quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 ni quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-alias-quoted.txt、文件命令: new-item、外部绝对路径: C:\\temp',
    });
  });

  it('recognizes quoted attached powershell path syntax as rename-item write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Rename-Item -Path:"C:\\temp\\old.txt" -NewName renamed-attached-quoted.txt',
      description: '检查 rename-item quoted attached path 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Rename-Item -Path:"C:\\temp\\old.txt" -NewName renamed-attached-quoted.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old.txt'],
          externalAbsolutePaths: ['C:\\temp\\old.txt'],
          externalWritePaths: ['C:\\temp\\renamed-attached-quoted.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 rename-item quoted attached path 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rename-item quoted attached path 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-attached-quoted.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old.txt',
    });
  });

  it('treats ren alias path plus newname as the external write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'ren C:\\temp\\old-alias.txt renamed-alias.txt',
      description: '检查 ren 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'ren C:\\temp\\old-alias.txt renamed-alias.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-alias.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-alias.txt'],
          externalWritePaths: ['C:\\temp\\renamed-alias.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 ren 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 ren 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-alias.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-alias.txt',
    });
  });

  it('recognizes quoted attached powershell path syntax for ren alias write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'ren -Path:"C:\\temp\\old-quoted.txt" -NewName renamed-alias-quoted.txt',
      description: '检查 ren quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'ren -Path:"C:\\temp\\old-quoted.txt" -NewName renamed-alias-quoted.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-quoted.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-quoted.txt'],
          externalWritePaths: ['C:\\temp\\renamed-alias-quoted.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 ren quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 ren quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-alias-quoted.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-quoted.txt',
    });
  });

  it('treats new-item positional path plus name as the external write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'New-Item filesystem::C:\\temp -Name created-positional.txt -ItemType File',
      description: '检查 new-item positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'New-Item filesystem::C:\\temp -Name created-positional.txt -ItemType File',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp'],
          externalAbsolutePaths: ['filesystem::C:\\temp'],
          externalWritePaths: ['filesystem::C:\\temp\\created-positional.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 new-item positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 new-item positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\created-positional.txt、文件命令: new-item、外部绝对路径: filesystem::C:\\temp',
    });
  });

  it('recognizes quoted attached powershell literalpath syntax as rename-item write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Rename-Item -LiteralPath:"C:\\temp\\old-literal.txt" -NewName renamed-literal.txt',
      description: '检查 rename-item literalpath 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Rename-Item -LiteralPath:"C:\\temp\\old-literal.txt" -NewName renamed-literal.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-literal.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-literal.txt'],
          externalWritePaths: ['C:\\temp\\renamed-literal.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 rename-item literalpath 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rename-item literalpath 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-literal.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-literal.txt',
    });
  });

  it('treats rename-item positional path plus positional newname as the external write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Rename-Item filesystem::C:\\temp\\old-positional.txt renamed-positional.txt',
      description: '检查 rename-item positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Rename-Item filesystem::C:\\temp\\old-positional.txt renamed-positional.txt',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\old-positional.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\old-positional.txt'],
          externalWritePaths: ['filesystem::C:\\temp\\renamed-positional.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 rename-item positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rename-item positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\temp\\renamed-positional.txt、文件命令: rename-item、外部绝对路径: filesystem::C:\\temp\\old-positional.txt',
    });
  });

  it('keeps windows drive separators in new-item external write targets', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'New-Item -Path C:\\temp -Name created-drive.txt -ItemType File',
      description: '检查 new-item 裸盘符外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'New-Item -Path C:\\temp -Name created-drive.txt -ItemType File',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-drive.txt'],
          fileCommands: ['new-item'],
          writesExternalPath: true,
        },
        description: '检查 new-item 裸盘符外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 new-item 裸盘符外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-drive.txt、文件命令: new-item、外部绝对路径: C:\\temp',
    });
  });

  it('keeps windows drive separators in rename-item external write targets', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Rename-Item -Path C:\\temp\\old-drive.txt -NewName renamed-drive.txt',
      description: '检查 rename-item 裸盘符外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Rename-Item -Path C:\\temp\\old-drive.txt -NewName renamed-drive.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\old-drive.txt'],
          externalAbsolutePaths: ['C:\\temp\\old-drive.txt'],
          externalWritePaths: ['C:\\temp\\renamed-drive.txt'],
          fileCommands: ['rename-item'],
          writesExternalPath: true,
        },
        description: '检查 rename-item 裸盘符外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rename-item 裸盘符外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\renamed-drive.txt、文件命令: rename-item、外部绝对路径: C:\\temp\\old-drive.txt',
    });
  });

  it('treats mkdir path plus name as the external write target in powershell style syntax', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'mkdir -Path C:\\temp -Name created-dir',
      description: '检查 mkdir 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'mkdir -Path C:\\temp -Name created-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 mkdir 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 mkdir 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
    });
  });

  it('recognizes quoted attached powershell path syntax as mkdir write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'mkdir -Path:"C:\\temp" -Name created-quoted-dir',
      description: '检查 mkdir quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'mkdir -Path:"C:\\temp" -Name created-quoted-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-quoted-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 mkdir quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 mkdir quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-quoted-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
    });
  });

  it('treats md alias path plus name as the external write target in powershell style syntax', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'md -Path C:\\temp -Name created-alias-dir',
      description: '检查 md 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'md -Path C:\\temp -Name created-alias-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-alias-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 md 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 md 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-alias-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
    });
  });

  it('recognizes quoted attached powershell path syntax for md alias write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'md -Path:"C:\\temp" -Name created-alias-quoted-dir',
      description: '检查 md quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'md -Path:"C:\\temp" -Name created-alias-quoted-dir',
        commandHints: {
          absolutePaths: ['C:\\temp'],
          externalAbsolutePaths: ['C:\\temp'],
          externalWritePaths: ['C:\\temp\\created-alias-quoted-dir'],
          fileCommands: ['mkdir'],
          writesExternalPath: true,
        },
        description: '检查 md quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 md quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\created-alias-quoted-dir、文件命令: mkdir、外部绝对路径: C:\\temp',
    });
  });

  it('treats only the first positional token as set-content write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Set-Content C:\\temp\\note.txt D:\\payload.txt',
      description: '检查 set-content positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Set-Content C:\\temp\\note.txt D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 set-content positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 set-content positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note.txt, D:\\payload.txt',
    });
  });

  it('recognizes attached powershell path syntax as set-content write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Set-Content -Path:C:\\temp\\note-attached.txt D:\\payload.txt',
      description: '检查 set-content attached path 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Set-Content -Path:C:\\temp\\note-attached.txt D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note-attached.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note-attached.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note-attached.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 set-content attached path 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 set-content attached path 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note-attached.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note-attached.txt, D:\\payload.txt',
    });
  });

  it('recognizes quoted attached powershell path syntax as set-content write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Set-Content -Path:"C:\\temp\\note-attached-quoted.txt" D:\\payload.txt',
      description: '检查 set-content quoted attached path 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Set-Content -Path:"C:\\temp\\note-attached-quoted.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note-attached-quoted.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note-attached-quoted.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note-attached-quoted.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 set-content quoted attached path 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 set-content quoted attached path 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note-attached-quoted.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note-attached-quoted.txt, D:\\payload.txt',
    });
  });

  it('recognizes quoted attached powershell literalpath syntax as set-content write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Set-Content -LiteralPath:"C:\\temp\\note-literal-quoted.txt" D:\\payload.txt',
      description: '检查 set-content literalpath quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Set-Content -LiteralPath:"C:\\temp\\note-literal-quoted.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note-literal-quoted.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note-literal-quoted.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note-literal-quoted.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 set-content literalpath quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 set-content literalpath quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note-literal-quoted.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note-literal-quoted.txt, D:\\payload.txt',
    });
  });

  it('expands quoted attached powershell env path syntax as set-content write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Set-Content -Path:"$env:GARLIC_CLAW_HINTS_TEST_ROOT\\note-env.txt" D:\\payload.txt',
        description: '检查 set-content env path 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Set-Content -Path:"$env:GARLIC_CLAW_HINTS_TEST_ROOT\\note-env.txt" D:\\payload.txt',
          commandHints: {
            absolutePaths: ['C:\\env-root\\note-env.txt', 'D:\\payload.txt'],
            externalAbsolutePaths: ['C:\\env-root\\note-env.txt', 'D:\\payload.txt'],
            externalWritePaths: ['C:\\env-root\\note-env.txt'],
            fileCommands: ['set-content'],
            writesExternalPath: true,
          },
          description: '检查 set-content env path 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 set-content env path 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\note-env.txt、文件命令: set-content、外部绝对路径: C:\\env-root\\note-env.txt, D:\\payload.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('expands quoted attached braced powershell env path syntax as set-content write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Set-Content -Path:"${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-braced-env.txt" D:\\payload.txt',
        description: '检查 set-content braced env path 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Set-Content -Path:"${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-braced-env.txt" D:\\payload.txt',
          commandHints: {
            absolutePaths: ['C:\\env-root\\note-braced-env.txt', 'D:\\payload.txt'],
            externalAbsolutePaths: ['C:\\env-root\\note-braced-env.txt', 'D:\\payload.txt'],
            externalWritePaths: ['C:\\env-root\\note-braced-env.txt'],
            fileCommands: ['set-content'],
            writesExternalPath: true,
          },
          description: '检查 set-content braced env path 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 set-content braced env path 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\note-braced-env.txt、文件命令: set-content、外部绝对路径: C:\\env-root\\note-braced-env.txt, D:\\payload.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('expands quoted attached braced powershell env paths after filesystem provider prefixes for set-content', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Set-Content -Path:"filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-braced-env.txt" D:\\payload.txt',
        description: '检查 set-content provider braced env path 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Set-Content -Path:"filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-braced-env.txt" D:\\payload.txt',
          commandHints: {
            absolutePaths: ['filesystem::C:\\env-root\\note-provider-braced-env.txt', 'D:\\payload.txt'],
            externalAbsolutePaths: ['filesystem::C:\\env-root\\note-provider-braced-env.txt', 'D:\\payload.txt'],
            externalWritePaths: ['filesystem::C:\\env-root\\note-provider-braced-env.txt'],
            fileCommands: ['set-content'],
            writesExternalPath: true,
          },
          description: '检查 set-content provider braced env path 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 set-content provider braced env path 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\env-root\\note-provider-braced-env.txt、文件命令: set-content、外部绝对路径: filesystem::C:\\env-root\\note-provider-braced-env.txt, D:\\payload.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('treats single-quoted destination literals as copy-item write targets', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:\'filesystem::D:\\temp\\copied-single-quoted-literal.txt\'',
      description: '检查 Copy-Item single quoted literal destination 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination:\'filesystem::D:\\temp\\copied-single-quoted-literal.txt\'',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-single-quoted-literal.txt'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt', 'filesystem::D:\\temp\\copied-single-quoted-literal.txt'],
          externalWritePaths: ['filesystem::D:\\temp\\copied-single-quoted-literal.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 Copy-Item single quoted literal destination 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 Copy-Item single quoted literal destination 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::D:\\temp\\copied-single-quoted-literal.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt, filesystem::D:\\temp\\copied-single-quoted-literal.txt',
    });
  });

  it('treats single-quoted attached literal paths as set-content write targets', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Set-Content -Path:\'C:\\temp\\note-single-quoted-literal.txt\' D:\\payload.txt',
      description: '检查 set-content single quoted literal path 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Set-Content -Path:\'C:\\temp\\note-single-quoted-literal.txt\' D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note-single-quoted-literal.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note-single-quoted-literal.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note-single-quoted-literal.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 set-content single quoted literal path 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 set-content single quoted literal path 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note-single-quoted-literal.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note-single-quoted-literal.txt, D:\\payload.txt',
    });
  });

  it('does not treat single-quoted powershell env destinations as external write targets for copy-item', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination \'$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-single-quoted-env.txt\'',
        description: '检查 Copy-Item single quoted env destination 误报',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination \'$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-single-quoted-env.txt\'',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt'],
            fileCommands: ['copy-item'],
          },
          description: '检查 Copy-Item single quoted env destination 误报',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 Copy-Item single quoted env destination 误报 (/workspace)；静态提示: 文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not treat single-quoted braced powershell env paths as external write targets for set-content', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Set-Content -Path \'${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-single-quoted-braced-env.txt\' D:\\payload.txt',
        description: '检查 set-content single quoted braced env path 误报',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Set-Content -Path \'${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-single-quoted-braced-env.txt\' D:\\payload.txt',
          commandHints: {
            absolutePaths: ['D:\\payload.txt'],
            externalAbsolutePaths: ['D:\\payload.txt'],
            fileCommands: ['set-content'],
          },
          description: '检查 set-content single quoted braced env path 误报',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 set-content single quoted braced env path 误报 (/workspace)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not treat single-quoted provider env destinations as external write targets for copy-item', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
          capabilities: {
            networkAccess: true,
            persistentFilesystem: true,
            persistentShellState: false,
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination \'filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-single-quoted-env.txt\'',
        description: '检查 Copy-Item single quoted provider env destination 误报',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Copy-Item -Path filesystem::C:\\temp\\input.txt -Destination \'filesystem::$env:GARLIC_CLAW_HINTS_TEST_ROOT\\copied-provider-single-quoted-env.txt\'',
          commandHints: {
            absolutePaths: ['filesystem::C:\\temp\\input.txt'],
            externalAbsolutePaths: ['filesystem::C:\\temp\\input.txt'],
            fileCommands: ['copy-item'],
          },
          description: '检查 Copy-Item single quoted provider env destination 误报',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 Copy-Item single quoted provider env destination 误报 (/workspace)；静态提示: 文件命令: copy-item、外部绝对路径: filesystem::C:\\temp\\input.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not treat single-quoted provider braced env paths as external write targets for set-content', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Set-Content -Path \'filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-single-quoted-braced-env.txt\' D:\\payload.txt',
        description: '检查 set-content single quoted provider braced env path 误报',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Set-Content -Path \'filesystem::${env:GARLIC_CLAW_HINTS_TEST_ROOT}\\note-provider-single-quoted-braced-env.txt\' D:\\payload.txt',
          commandHints: {
            absolutePaths: ['D:\\payload.txt'],
            externalAbsolutePaths: ['D:\\payload.txt'],
            fileCommands: ['set-content'],
          },
          description: '检查 set-content single quoted provider braced env path 误报',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 set-content single quoted provider braced env path 误报 (/workspace)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('does not treat powershell local variable paths as external write targets for set-content', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Set-Content -Path "$targetRoot\\note.txt" D:\\payload.txt',
      description: '检查 set-content 本地变量路径误报',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Set-Content -Path "$targetRoot\\note.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['D:\\payload.txt'],
          externalAbsolutePaths: ['D:\\payload.txt'],
          fileCommands: ['set-content'],
        },
        description: '检查 set-content 本地变量路径误报',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 set-content 本地变量路径误报 (/workspace)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
    });
  });

  it('does not treat braced powershell local variable paths as external write targets for set-content', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Set-Content -Path "${targetRoot}\\note-braced-local.txt" D:\\payload.txt',
      description: '检查 set-content braced 本地变量路径误报',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Set-Content -Path "${targetRoot}\\note-braced-local.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['D:\\payload.txt'],
          externalAbsolutePaths: ['D:\\payload.txt'],
          fileCommands: ['set-content'],
        },
        description: '检查 set-content braced 本地变量路径误报',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 set-content braced 本地变量路径误报 (/workspace)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
    });
  });

  it('does not treat provider braced powershell local variable paths as external write targets for set-content', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Set-Content -Path "filesystem::${targetRoot}\\note-provider-braced-local.txt" D:\\payload.txt',
      description: '检查 set-content provider braced 本地变量路径误报',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Set-Content -Path "filesystem::${targetRoot}\\note-provider-braced-local.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['D:\\payload.txt'],
          externalAbsolutePaths: ['D:\\payload.txt'],
          fileCommands: ['set-content'],
        },
        description: '检查 set-content provider braced 本地变量路径误报',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 set-content provider braced 本地变量路径误报 (/workspace)；静态提示: 文件命令: set-content、外部绝对路径: D:\\payload.txt',
    });
  });

  it('treats powershell Join-Path command substitution destinations as external write targets for copy-item', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Copy-Item -Path /workspace/input.txt -Destination "$(Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied.txt\')"',
        description: '检查 Copy-Item Join-Path destination 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Copy-Item -Path /workspace/input.txt -Destination "$(Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied.txt\')"',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'C:\\env-root\\copied.txt'],
            externalAbsolutePaths: ['C:\\env-root\\copied.txt'],
            externalWritePaths: ['C:\\env-root\\copied.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 Copy-Item Join-Path destination 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 Copy-Item Join-Path destination 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\copied.txt、文件命令: copy-item、外部绝对路径: C:\\env-root\\copied.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('treats powershell Join-Path local variable destinations as external write targets for copy-item', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: '$root=\'C:\\temp\'; Copy-Item -Path /workspace/input.txt -Destination "$(Join-Path $root \'copied-local.txt\')"',
      description: '检查 Copy-Item Join-Path 本地变量 destination 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: '$root=\'C:\\temp\'; Copy-Item -Path /workspace/input.txt -Destination "$(Join-Path $root \'copied-local.txt\')"',
        commandHints: {
          absolutePaths: ['/workspace/input.txt', 'C:\\temp\\copied-local.txt'],
          externalAbsolutePaths: ['C:\\temp\\copied-local.txt'],
          externalWritePaths: ['C:\\temp\\copied-local.txt'],
          fileCommands: ['copy-item'],
          writesExternalPath: true,
        },
        description: '检查 Copy-Item Join-Path 本地变量 destination 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 Copy-Item Join-Path 本地变量 destination 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\copied-local.txt、文件命令: copy-item、外部绝对路径: C:\\temp\\copied-local.txt',
    });
  });

  it('treats provider-prefixed powershell Join-Path command substitution destinations as external write targets for copy-item', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Copy-Item -Path /workspace/input.txt -Destination "filesystem::$(Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied-provider.txt\')"',
        description: '检查 Copy-Item provider Join-Path destination 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Copy-Item -Path /workspace/input.txt -Destination "filesystem::$(Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied-provider.txt\')"',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'filesystem::C:\\env-root\\copied-provider.txt'],
            externalAbsolutePaths: ['filesystem::C:\\env-root\\copied-provider.txt'],
            externalWritePaths: ['filesystem::C:\\env-root\\copied-provider.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 Copy-Item provider Join-Path destination 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 Copy-Item provider Join-Path destination 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: filesystem::C:\\env-root\\copied-provider.txt、文件命令: copy-item、外部绝对路径: filesystem::C:\\env-root\\copied-provider.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('treats powershell Join-Path-assigned local variable destinations as external write targets for copy-item', async () => {
    if (process.platform !== 'win32') {
      return;
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: '$root = Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'nested\'; Copy-Item -Path /workspace/input.txt -Destination "$root\\copied-assigned-join-path.txt"',
        description: '检查 Copy-Item Join-Path 赋值本地变量 destination 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: '$root = Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'nested\'; Copy-Item -Path /workspace/input.txt -Destination "$root\\copied-assigned-join-path.txt"',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'C:\\env-root\\nested\\copied-assigned-join-path.txt'],
            externalAbsolutePaths: ['C:\\env-root\\nested\\copied-assigned-join-path.txt'],
            externalWritePaths: ['C:\\env-root\\nested\\copied-assigned-join-path.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 Copy-Item Join-Path 赋值本地变量 destination 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 Copy-Item Join-Path 赋值本地变量 destination 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\nested\\copied-assigned-join-path.txt、文件命令: copy-item、外部绝对路径: C:\\env-root\\nested\\copied-assigned-join-path.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('treats parenthesized powershell Join-Path destinations as external write targets for copy-item', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );
    const originalEnv = process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
    process.env.GARLIC_CLAW_HINTS_TEST_ROOT = 'C:\\env-root';
    try {
      await expect(service.readRuntimeAccess({
        backendKind: 'native-shell',
        command: 'Copy-Item -Path /workspace/input.txt -Destination (Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied-parenthesized.txt\')',
        description: '检查 Copy-Item parenthesized Join-Path destination 外部写入提示',
        sessionId: 'session-1',
      })).resolves.toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Copy-Item -Path /workspace/input.txt -Destination (Join-Path $env:GARLIC_CLAW_HINTS_TEST_ROOT \'copied-parenthesized.txt\')',
          commandHints: {
            absolutePaths: ['/workspace/input.txt', 'C:\\env-root\\copied-parenthesized.txt'],
            externalAbsolutePaths: ['C:\\env-root\\copied-parenthesized.txt'],
            externalWritePaths: ['C:\\env-root\\copied-parenthesized.txt'],
            fileCommands: ['copy-item'],
            writesExternalPath: true,
          },
          description: '检查 Copy-Item parenthesized Join-Path destination 外部写入提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 Copy-Item parenthesized Join-Path destination 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\env-root\\copied-parenthesized.txt、文件命令: copy-item、外部绝对路径: C:\\env-root\\copied-parenthesized.txt',
      });
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GARLIC_CLAW_HINTS_TEST_ROOT;
      } else {
        process.env.GARLIC_CLAW_HINTS_TEST_ROOT = originalEnv;
      }
    }
  });

  it('treats sc alias positional target as set-content write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'sc C:\\temp\\note-short.txt D:\\payload.txt',
      description: '检查 sc positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'sc C:\\temp\\note-short.txt D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\note-short.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\note-short.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\note-short.txt'],
          fileCommands: ['set-content'],
          writesExternalPath: true,
        },
        description: '检查 sc positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 sc positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\note-short.txt、文件命令: set-content、外部绝对路径: C:\\temp\\note-short.txt, D:\\payload.txt',
    });
  });

  it('treats only the first positional token as add-content alias write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'ac C:\\temp\\append.txt D:\\payload.txt',
      description: '检查 add-content positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'ac C:\\temp\\append.txt D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\append.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\append.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\append.txt'],
          fileCommands: ['add-content'],
          writesExternalPath: true,
        },
        description: '检查 add-content positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 add-content positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\append.txt、文件命令: add-content、外部绝对路径: C:\\temp\\append.txt, D:\\payload.txt',
    });
  });

  it('recognizes quoted attached powershell path syntax as add-content write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Add-Content -Path:"C:\\temp\\append-attached-quoted.txt" D:\\payload.txt',
      description: '检查 add-content quoted attached path 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Add-Content -Path:"C:\\temp\\append-attached-quoted.txt" D:\\payload.txt',
        commandHints: {
          absolutePaths: ['C:\\temp\\append-attached-quoted.txt', 'D:\\payload.txt'],
          externalAbsolutePaths: ['C:\\temp\\append-attached-quoted.txt', 'D:\\payload.txt'],
          externalWritePaths: ['C:\\temp\\append-attached-quoted.txt'],
          fileCommands: ['add-content'],
          writesExternalPath: true,
        },
        description: '检查 add-content quoted attached path 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 add-content quoted attached path 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp\\append-attached-quoted.txt、文件命令: add-content、外部绝对路径: C:\\temp\\append-attached-quoted.txt, D:\\payload.txt',
    });
  });

  it('treats only the first positional token as remove-item write target when include is present', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Remove-Item C:\\temp -Include D:\\archived.log',
      description: '检查 remove-item positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Remove-Item C:\\temp -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 remove-item positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 remove-item positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('recognizes quoted attached powershell path syntax as remove-item write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Remove-Item -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 remove-item quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Remove-Item -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 remove-item quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 remove-item quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('recognizes quoted attached powershell literalpath syntax as remove-item write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Remove-Item -LiteralPath:"C:\\temp" -Include D:\\archived.log',
      description: '检查 remove-item literalpath quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Remove-Item -LiteralPath:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 remove-item literalpath quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 remove-item literalpath quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('treats only the first positional token as rd alias write target when include is present', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'rd C:\\temp -Include D:\\archived.log',
      description: '检查 rd positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'rd C:\\temp -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 rd positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rd positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('recognizes quoted attached powershell path syntax for rd alias write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'rd -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 rd quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'rd -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 rd quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 rd quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('treats only the first positional token as ri alias write target when include is present', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'ri C:\\temp -Include D:\\archived.log',
      description: '检查 ri positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'ri C:\\temp -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 ri positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 ri positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('recognizes quoted attached powershell path syntax for ri alias write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'ri -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 ri quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'ri -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 ri quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 ri quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('treats only the first positional token as del alias write target when include is present', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'del C:\\temp -Include D:\\archived.log',
      description: '检查 del positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'del C:\\temp -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 del positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 del positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('recognizes quoted attached powershell path syntax for del alias write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'del -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 del quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'del -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 del quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 del quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('treats only the first positional token as erase alias write target when include is present', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'erase C:\\temp -Include D:\\archived.log',
      description: '检查 erase positional 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'erase C:\\temp -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 erase positional 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 erase positional 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('recognizes quoted attached powershell path syntax for erase alias write target', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'erase -Path:"C:\\temp" -Include D:\\archived.log',
      description: '检查 erase quoted attached 外部写入提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'erase -Path:"C:\\temp" -Include D:\\archived.log',
        commandHints: {
          absolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalAbsolutePaths: ['C:\\temp', 'D:\\archived.log'],
          externalWritePaths: ['C:\\temp'],
          fileCommands: ['remove-item'],
          writesExternalPath: true,
        },
        description: '检查 erase quoted attached 外部写入提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 erase quoted attached 外部写入提示 (/workspace)；静态提示: 写入命令涉及外部绝对路径: C:\\temp、文件命令: remove-item、外部绝对路径: C:\\temp, D:\\archived.log',
    });
  });

  it('recognizes invoke-webrequest outfile writes as combined network and external write hints', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Invoke-WebRequest https://example.com/install.ps1 -OutFile filesystem::C:\\temp\\install.ps1',
      description: '检查 powershell 联网写入外部路径提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Invoke-WebRequest https://example.com/install.ps1 -OutFile filesystem::C:\\temp\\install.ps1',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp\\install.ps1'],
          externalAbsolutePaths: ['filesystem::C:\\temp\\install.ps1'],
          externalWritePaths: ['filesystem::C:\\temp\\install.ps1'],
          networkCommands: ['invoke-webrequest'],
          networkTouchesExternalPath: true,
          usesNetworkCommand: true,
          writesExternalPath: true,
        },
        description: '检查 powershell 联网写入外部路径提示',
      },
      requiredOperations: ['command.execute', 'network.access'],
      role: 'shell',
      summary: '检查 powershell 联网写入外部路径提示 (/workspace)；静态提示: 联网命令: invoke-webrequest、联网命令涉及外部绝对路径: filesystem::C:\\temp\\install.ps1、写入命令涉及外部绝对路径: filesystem::C:\\temp\\install.ps1、外部绝对路径: filesystem::C:\\temp\\install.ps1',
    });
  });

  it('marks redundant cd when workdir is already provided', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cd nested && cat app.txt',
      description: '检查重复目录切换',
      sessionId: 'session-1',
      workdir: 'nested',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cd nested && cat app.txt',
        commandHints: {
          fileCommands: ['cd', 'cat'],
          redundantCdWithWorkdir: true,
          usesCd: true,
        },
        description: '检查重复目录切换',
        workdir: 'nested',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查重复目录切换 (nested)；静态提示: 含 cd、已提供 workdir，命令里仍含 cd、文件命令: cd, cat',
    });
  });

  it('highlights parent traversal paths in static hints', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'mock-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'mock-shell',
      command: 'cd .. && cat ../notes.txt',
      description: '检查上级目录提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'mock-shell',
      metadata: {
        command: 'cd .. && cat ../notes.txt',
        commandHints: {
          fileCommands: ['cd', 'cat'],
          parentTraversalPaths: ['..', '../notes.txt'],
          usesCd: true,
          usesParentTraversal: true,
        },
        description: '检查上级目录提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查上级目录提示 (/workspace)；静态提示: 含 cd、相对上级路径: .., ../notes.txt、文件命令: cd, cat',
    });
  });

  it('recognizes powershell aliases and filesystem provider paths in static hints', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'sl filesystem::C:\\temp; gc ~/notes.txt; ni -Path /workspace/tmp -ItemType Directory',
      description: '检查 powershell 静态提示',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'sl filesystem::C:\\temp; gc ~/notes.txt; ni -Path /workspace/tmp -ItemType Directory',
        commandHints: {
          absolutePaths: ['filesystem::C:\\temp', '~/notes.txt', '/workspace/tmp'],
          externalAbsolutePaths: ['filesystem::C:\\temp', '~/notes.txt'],
          fileCommands: ['set-location', 'get-content', 'new-item'],
          usesCd: true,
        },
        description: '检查 powershell 静态提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 powershell 静态提示 (/workspace)；静态提示: 含 cd、文件命令: set-location, get-content, new-item、外部绝对路径: filesystem::C:\\temp, ~/notes.txt',
    });
  });

  it('treats bare home path as external but keeps visible provider paths internal', async () => {
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    await expect(service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'gc ~; gc filesystem::/workspace/app.txt',
      description: '检查 home 与 provider 路径',
      sessionId: 'session-1',
    })).resolves.toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'gc ~; gc filesystem::/workspace/app.txt',
        commandHints: {
          absolutePaths: ['~', 'filesystem::/workspace/app.txt'],
          externalAbsolutePaths: ['~'],
          fileCommands: ['get-content'],
        },
        description: '检查 home 与 provider 路径',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 home 与 provider 路径 (/workspace)；静态提示: 文件命令: get-content、外部绝对路径: ~',
    });
  });

  it('warns about && in windows native-shell static hints', async () => {
    if (process.platform === 'win32') {
      jest.spyOn(runtimePowerShellVariant, 'supportsWindowsPowerShellAndAnd').mockReturnValue(false);
    }
    const service = new BashToolService(
      {} as never,
      {
        getDescriptor: () => ({ visibleRoot: '/workspace' }),
      } as never,
      {
        getShellBackendDescriptor: () => ({
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
        getShellBackendKind: () => 'native-shell',
      } as never,
    );

    const access = await service.readRuntimeAccess({
      backendKind: 'native-shell',
      command: 'Write-Output first && Write-Output second',
      description: '检查 windows chaining 提示',
      sessionId: 'session-1',
    });

    if (process.platform === 'win32') {
      expect(access).toEqual({
        backendKind: 'native-shell',
        metadata: {
          command: 'Write-Output first && Write-Output second',
          commandHints: {
            usesWindowsAndAnd: true,
          },
          description: '检查 windows chaining 提示',
        },
        requiredOperations: ['command.execute'],
        role: 'shell',
        summary: '检查 windows chaining 提示 (/workspace)；静态提示: 当前 Windows PowerShell 不支持 &&',
      });
      return;
    }

    expect(access).toEqual({
      backendKind: 'native-shell',
      metadata: {
        command: 'Write-Output first && Write-Output second',
        description: '检查 windows chaining 提示',
      },
      requiredOperations: ['command.execute'],
      role: 'shell',
      summary: '检查 windows chaining 提示 (/workspace)',
    });
  });
});
