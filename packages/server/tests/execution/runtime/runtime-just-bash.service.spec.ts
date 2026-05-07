import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { BadRequestException } from '@nestjs/common';
import { readRuntimeJustBashOptions, readRuntimeJustBashTimeout } from '../../../src/modules/execution/runtime/runtime-just-bash-options';
import { RuntimeJustBashService } from '../../../src/modules/execution/runtime/runtime-just-bash.service';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';

describe('RuntimeJustBashService', () => {
  const workspaceRoots: string[] = [];
  const originalEnvironment = {
    GARLIC_CLAW_RUNTIME_JUST_BASH_DEFAULT_TIMEOUT_MS:
      process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_DEFAULT_TIMEOUT_MS,
    GARLIC_CLAW_RUNTIME_JUST_BASH_ENABLE_NETWORK:
      process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_ENABLE_NETWORK,
    GARLIC_CLAW_RUNTIME_JUST_BASH_MAX_TIMEOUT_MS:
      process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_MAX_TIMEOUT_MS,
    GARLIC_CLAW_RUNTIME_JUST_BASH_NETWORK_POLICY:
      process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_NETWORK_POLICY,
    GARLIC_CLAW_RUNTIME_WORKSPACES_PATH:
      process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH,
  } as const;

  afterEach(() => {
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
      fs.rmSync(nextRoot, { force: true, recursive: true });
    }
  });

  it('persists files under the session workspace across command executions', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-workspace-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new RuntimeJustBashService(runtimeSessionEnvironmentService);

    const first = await service.executeCommand({
      command: 'mkdir -p logs && echo persisted > logs/run.txt && cat logs/run.txt',
      sessionId: 'session-1',
    });

    expect(first.exitCode).toBe(0);
    expect(first.stdout).toBe('persisted\n');
    expect(fs.readFileSync(path.join(workspaceRoot, 'session-1', 'logs', 'run.txt'), 'utf8')).toBe('persisted\n');

    const second = await service.executeCommand({
      command: 'cat logs/run.txt',
      sessionId: 'session-1',
    });

    expect(second.exitCode).toBe(0);
    expect(second.stdout).toBe('persisted\n');
    expect(second.cwd).toBe('/');
  });

  it('supports append, copy, move and remove operations inside the workspace', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-workspace-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = new RuntimeJustBashService(new RuntimeSessionEnvironmentService());
    const result = await service.executeCommand({
      command: 'mkdir -p src && echo first > src/a.txt && echo second >> src/a.txt && cp src/a.txt nested/b.txt && mv nested/b.txt final/c.txt && cat final/c.txt && rm src/a.txt && test ! -f src/a.txt && printf "removed\\n" && find final -type f | sort',
      sessionId: 'session-1',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('first\nsecond\nremoved\nfinal/c.txt\n');
    expect(fs.existsSync(path.join(workspaceRoot, 'session-1', 'src', 'a.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(workspaceRoot, 'session-1', 'final', 'c.txt'), 'utf8')).toBe('first\nsecond\n');
  });

  it('does not persist shell state between command executions', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-workspace-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = new RuntimeJustBashService(new RuntimeSessionEnvironmentService());

    const first = await service.executeCommand({
      command: 'mkdir -p src && cd src && export DEMO=1 && pwd && echo $DEMO',
      sessionId: 'session-1',
    });
    const second = await service.executeCommand({
      command: 'pwd && echo ${DEMO:-empty}',
      sessionId: 'session-1',
    });

    expect(first.stdout).toBe('/src\n1\n');
    expect(second.stdout).toBe('/\nempty\n');
  });

  it('supports symbolic links and hard links inside the workspace', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-workspace-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = new RuntimeJustBashService(new RuntimeSessionEnvironmentService());

    const relativeLink = await service.executeCommand({
      command: 'echo hello > source.txt && ln -s source.txt link.txt && readlink link.txt && cat link.txt',
      sessionId: 'session-1',
    });
    const absoluteLink = await service.executeCommand({
      command: 'ln -s /source.txt abs-link.txt && readlink abs-link.txt && cat abs-link.txt',
      sessionId: 'session-1',
    });
    const hardLink = await service.executeCommand({
      command: 'ln source.txt hard.txt && echo updated > hard.txt && cat source.txt',
      sessionId: 'session-1',
    });

    expect(relativeLink.exitCode).toBe(0);
    expect(relativeLink.stdout).toBe('source.txt\nhello\n');
    expect(absoluteLink.exitCode).toBe(0);
    expect(absoluteLink.stdout).toBe('/source.txt\nhello\n');
    expect(hardLink.exitCode).toBe(0);
    expect(hardLink.stdout).toBe('updated\n');
  });

  it('maps absolute symbolic link targets inside the backend visible root', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-workspace-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = new RuntimeJustBashService(new RuntimeSessionEnvironmentService());
    const result = await service.executeCommand({
      command: 'mkdir -p etc && echo safe > etc/passwd && ln -s /etc/passwd safe-link.txt && readlink safe-link.txt && cat safe-link.txt',
      sessionId: 'session-1',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('/etc/passwd\nsafe\n');
  });

  it('supports network access through curl', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-workspace-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('network-ok');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('failed to allocate local test server port');
      }
      const service = new RuntimeJustBashService(new RuntimeSessionEnvironmentService());
      const result = await service.executeCommand({
        command: `curl -s http://127.0.0.1:${address.port}/`,
        sessionId: 'session-1',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('network-ok');
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

  it('enforces timeout on slow curl requests', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-workspace-'));
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
      const service = new RuntimeJustBashService(new RuntimeSessionEnvironmentService());
      await expect(service.executeCommand({
        command: `curl -s http://127.0.0.1:${address.port}/slow`,
        sessionId: 'session-1',
        timeout: 50,
      })).rejects.toThrow('bash 执行超时（>1 秒）。如果这条命令本应耗时更久，且不是在等待交互输入，请调大 timeout 后重试。');
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

  it('allows cwd values across the backend visible root', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-workspace-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = new RuntimeJustBashService(new RuntimeSessionEnvironmentService());
    await service.executeCommand({
      command: 'mkdir -p nested',
      sessionId: 'session-1',
    });

    const result = await service.executeCommand({
      command: 'pwd',
      workdir: '/nested',
      sessionId: 'session-1',
    });

    expect(result.exitCode).toBe(0);
    expect(result.cwd).toBe('/nested');
  });

  it('supports tar archive round-trip on nested workspace trees', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-runtime-workspace-'));
    workspaceRoots.push(workspaceRoot);
    process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = workspaceRoot;

    const service = new RuntimeJustBashService(new RuntimeSessionEnvironmentService());
    const result = await service.executeCommand({
      command: 'mkdir -p tree/a tree/b && printf "one\\n" > tree/a/one.txt && printf "two\\n" > tree/b/two.txt && tar -cf bundle.tar tree && mkdir -p restored && tar -xf bundle.tar -C restored && find restored -type f | sort && cat restored/tree/a/one.txt && cat restored/tree/b/two.txt',
      sessionId: 'session-1',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('restored/tree/a/one.txt\nrestored/tree/b/two.txt\none\ntwo\n');
    expect(fs.existsSync(path.join(workspaceRoot, 'session-1', 'bundle.tar'))).toBe(true);
    expect(fs.readFileSync(path.join(workspaceRoot, 'session-1', 'restored', 'tree', 'a', 'one.txt'), 'utf8')).toBe('one\n');
    expect(fs.readFileSync(path.join(workspaceRoot, 'session-1', 'restored', 'tree', 'b', 'two.txt'), 'utf8')).toBe('two\n');
  });

  it('reads configurable timeout and network descriptor options', () => {
    process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_DEFAULT_TIMEOUT_MS = '45000';
    process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_MAX_TIMEOUT_MS = '90000';
    process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_NETWORK_POLICY = 'allow';

    const options = readRuntimeJustBashOptions();

    expect(options.defaultTimeoutMs).toBe(45000);
    expect(options.maxTimeoutMs).toBe(90000);
    expect(options.descriptor.capabilities.networkAccess).toBe(true);
    expect(options.descriptor.permissionPolicy.networkAccess).toBe('allow');
    expect(readRuntimeJustBashTimeout(undefined)).toBe(45000);
    expect(readRuntimeJustBashTimeout(1000)).toBe(1000);
  });

  it('turns network capability off when explicitly disabled', () => {
    process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_ENABLE_NETWORK = 'false';
    process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_NETWORK_POLICY = 'allow';

    const options = readRuntimeJustBashOptions();

    expect(options.descriptor.capabilities.networkAccess).toBe(false);
    expect(options.descriptor.permissionPolicy.networkAccess).toBe('deny');
  });

  it('rejects invalid just-bash timeout configuration', () => {
    process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_DEFAULT_TIMEOUT_MS = '200000';
    process.env.GARLIC_CLAW_RUNTIME_JUST_BASH_MAX_TIMEOUT_MS = '100000';

    expect(() => readRuntimeJustBashTimeout(undefined)).toThrow(BadRequestException);
  });
});
