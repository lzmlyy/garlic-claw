import { RuntimeCommandCaptureService } from '../../../src/modules/execution/runtime/runtime-command-capture.service';
import { RuntimeCommandService } from '../../../src/modules/execution/runtime/runtime-command.service';
import type { RuntimeBackend } from '../../../src/modules/execution/runtime/runtime-command.types';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';

describe('RuntimeCommandService', () => {
  it('uses the first registered backend as default and supports explicit backend selection', async () => {
    const alphaBackend = createRuntimeBackend('alpha');
    const betaBackend = createRuntimeBackend('beta');
    const service = new RuntimeCommandService(
      [alphaBackend, betaBackend],
      new RuntimeCommandCaptureService(
        new RuntimeSessionEnvironmentService(),
        { readToolOutputCaptureOptions: jest.fn().mockReturnValue({ enabled: false, maxBytes: 5000, maxFilesPerSession: 3 }) } as never,
      ),
    );

    expect(service.getDefaultBackendKind()).toBe('alpha');
    expect(service.getDefaultBackendDescriptor()).toEqual(alphaBackend.getDescriptor());
    await expect(service.executeCommand({
      command: 'echo default',
      sessionId: 'session-1',
    })).resolves.toEqual(expect.objectContaining({
      backendKind: 'alpha',
      stdoutStats: {
        bytes: Buffer.byteLength('alpha:echo default', 'utf8'),
        lines: 1,
      },
      stdout: 'alpha:echo default',
    }));
    await expect(service.executeCommand({
      backendKind: 'beta',
      command: 'echo explicit',
      sessionId: 'session-1',
    })).resolves.toEqual(expect.objectContaining({
      backendKind: 'beta',
      stdoutStats: {
        bytes: Buffer.byteLength('beta:echo explicit', 'utf8'),
        lines: 1,
      },
      stdout: 'beta:echo explicit',
    }));
  });

  it('rejects unknown backend kind', async () => {
    const service = new RuntimeCommandService(
      [createRuntimeBackend('alpha')],
      new RuntimeCommandCaptureService(
        new RuntimeSessionEnvironmentService(),
        { readToolOutputCaptureOptions: jest.fn().mockReturnValue({ enabled: false, maxBytes: 5000, maxFilesPerSession: 3 }) } as never,
      ),
    );

    await expect(service.executeCommand({
      backendKind: 'missing',
      command: 'echo fail',
      sessionId: 'session-1',
    })).rejects.toThrow('Unknown runtime backend: missing');
    expect(() => service.getBackendDescriptor('missing')).toThrow('Unknown runtime backend: missing');
  });

  it('stores oversized stdout in a visible output file path', async () => {
    const service = new RuntimeCommandService(
      [createRuntimeBackend('alpha', { stdout: Array.from({ length: 240 }, (_, index) => `line-${index + 1}`).join('\n') })],
      {
        captureIfNeeded: jest.fn().mockResolvedValue('/.garlic-claw/runtime-command-output/command-test.txt'),
      } as never,
    );

    await expect(service.executeCommand({
      command: 'printf "oversized"',
      sessionId: 'session-1',
    })).resolves.toEqual(expect.objectContaining({
      outputPath: '/.garlic-claw/runtime-command-output/command-test.txt',
      stdoutStats: {
        bytes: expect.any(Number),
        lines: 240,
      },
    }));
  });
});

function createRuntimeBackend(
  kind: string,
  overrides?: Partial<{ stderr: string; stdout: string }>,
): RuntimeBackend {
  return {
    async executeCommand(input) {
      return {
        backendKind: kind,
        cwd: input.workdir ?? '/',
        exitCode: 0,
        sessionId: input.sessionId,
        stderr: overrides?.stderr ?? '',
        stdout: overrides?.stdout ?? `${kind}:${input.command}`,
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
