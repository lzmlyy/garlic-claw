import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { BuiltinPluginRegistryService } from '../../../src/modules/plugin/builtin/builtin-plugin-registry.service';
import { PluginBootstrapService } from '../../../src/modules/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/modules/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/modules/plugin/persistence/plugin-persistence.service';
import { ProjectPluginRegistryService } from '../../../src/modules/plugin/project/project-plugin-registry.service';
import { RuntimeGatewayConnectionLifecycleService } from '../../../src/modules/runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from '../../../src/modules/runtime/gateway/runtime-gateway-remote-transport.service';
import { PluginDispatchService } from '../../../src/modules/runtime/host/plugin-dispatch.service';

describe('PluginDispatchService', () => {
  let projectRootPath: string;
  let originalProjectRootPath: string | undefined;

  beforeEach(() => {
    originalProjectRootPath = process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH;
    projectRootPath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-plugin-dispatch-'),
    );
    fs.mkdirSync(path.join(projectRootPath, 'packages', 'server'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(projectRootPath, 'package.json'),
      JSON.stringify({ name: 'garlic-claw-test-root', private: true }, null, 2),
      'utf-8',
    );
    process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH = projectRootPath;
  });

  afterEach(() => {
    if (originalProjectRootPath === undefined) {
      delete process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH;
    } else {
      process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH = originalProjectRootPath;
    }
    fs.rmSync(projectRootPath, { force: true, recursive: true });
  });

  it('executes project local plugin tools through the shared local runtime path', async () => {
    writeLocalPlugin(projectRootPath);
    const builtinPluginRegistryService = new BuiltinPluginRegistryService();
    const projectPluginRegistryService = new ProjectPluginRegistryService(
      new ProjectWorktreeRootService(),
    );
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
      builtinPluginRegistryService,
      projectPluginRegistryService,
    );
    const runtimeGatewayConnectionLifecycleService =
      new RuntimeGatewayConnectionLifecycleService(pluginBootstrapService);
    const service = new PluginDispatchService(
      builtinPluginRegistryService,
      pluginBootstrapService,
      new RuntimeGatewayRemoteTransportService(
        runtimeGatewayConnectionLifecycleService,
      ),
    );

    service.registerHostCaller(async () => null);
    pluginBootstrapService.bootstrapProjectPlugins();

    await expect(
      service.executeTool({
        context: {
          conversationId: 'conversation-1',
          source: 'plugin',
          userId: 'user-1',
        },
        params: {
          text: '你好',
        },
        pluginId: 'local.echo',
        toolName: 'echo',
      }),
    ).resolves.toEqual({
      echoed: '你好',
    });
    expect(service.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'local.echo',
      }),
    ]);
  });
});

function writeLocalPlugin(projectRootPath: string): void {
  const pluginRootPath = path.join(
    projectRootPath,
    'config',
    'plugins',
    'local-echo',
  );
  fs.mkdirSync(path.join(pluginRootPath, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginRootPath, 'package.json'),
    JSON.stringify(
      {
        garlicClaw: {
          runtime: 'local',
        },
        main: 'dist/index.js',
        name: '@garlic-claw/local-echo',
      },
      null,
      2,
    ),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(pluginRootPath, 'dist/index.js'),
    [
      'module.exports.definition = {',
      "  manifest: {",
      "    id: 'local.echo',",
      "    name: 'Local Echo',",
      "    version: '1.0.0',",
      "    runtime: 'local',",
      '    permissions: [],',
      '    tools: [{ name: \'echo\', description: \'echo\', parameters: {} }],',
      '  },',
      '  tools: {',
      '    echo: async (params) => ({ echoed: params.text ?? null }),',
      '  },',
      '};',
      '',
    ].join('\n'),
    'utf-8',
  );
}
