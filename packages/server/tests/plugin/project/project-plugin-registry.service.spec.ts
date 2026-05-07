import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { ProjectPluginRegistryService } from '../../../src/modules/plugin/project/project-plugin-registry.service';

describe('ProjectPluginRegistryService', () => {
  let projectRootPath: string;
  let originalProjectRootPath: string | undefined;

  beforeEach(() => {
    originalProjectRootPath = process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH;
    projectRootPath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gc-project-plugin-registry-'),
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

  it('loads local plugin author definitions from the project plugins directory', () => {
    writePluginPackage(projectRootPath, 'local-echo', {
      garlicClaw: {
        runtime: 'local',
      },
      main: 'dist/index.js',
      name: '@garlic-claw/local-echo',
    }, [
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
    ]);

    const service = new ProjectPluginRegistryService(
      new ProjectWorktreeRootService(),
    );

    expect(service.loadDefinitions()).toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({
          manifest: expect.objectContaining({
            id: 'local.echo',
          }),
        }),
      }),
    ]);
    expect(
      typeof service.getDefinition('local.echo').definition.tools?.echo,
    ).toBe('function');
  });

  it('skips remote plugin packages in the same plugins directory', () => {
    writePluginPackage(projectRootPath, 'plugin-pc', {
      garlicClaw: {
        runtime: 'remote',
      },
      main: 'dist/index.js',
      name: '@garlic-claw/plugin-pc',
    }, [
      'module.exports = {',
      "  ignored: true,",
      '};',
    ]);

    const service = new ProjectPluginRegistryService(
      new ProjectWorktreeRootService(),
    );

    expect(service.loadDefinitions()).toEqual([]);
  });

  it('skips broken local plugin directories without aborting other local plugins', () => {
    writePluginPackage(projectRootPath, 'broken-local', {
      garlicClaw: {
        runtime: 'local',
      },
      main: 'dist/index.js',
      name: '@garlic-claw/broken-local',
    }, [
      'module.exports = {',
      "  invalid: true,",
      '};',
    ]);
    fs.rmSync(
      path.join(projectRootPath, 'config', 'plugins', 'broken-local', 'dist', 'index.js'),
      { force: true },
    );
    writePluginPackage(projectRootPath, 'local-echo', {
      garlicClaw: {
        runtime: 'local',
      },
      main: 'dist/index.js',
      name: '@garlic-claw/local-echo',
    }, [
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
    ]);

    const service = new ProjectPluginRegistryService(
      new ProjectWorktreeRootService(),
    );

    expect(service.loadDefinitions()).toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({
          manifest: expect.objectContaining({
            id: 'local.echo',
          }),
        }),
      }),
    ]);
  });

  it('reloads local plugins after transitive dependency changes', async () => {
    writePluginPackage(projectRootPath, 'local-echo', {
      garlicClaw: {
        runtime: 'local',
      },
      main: 'dist/index.js',
      name: '@garlic-claw/local-echo',
    }, [
      "const message = require('./lib/message.js');",
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
      '    echo: async () => ({ echoed: message.readMessage() }),',
      '  },',
      '};',
    ]);
    const messageModulePath = path.join(
      projectRootPath,
      'config',
      'plugins',
      'local-echo',
      'dist',
      'lib',
      'message.js',
    );
    fs.mkdirSync(path.dirname(messageModulePath), { recursive: true });
    fs.writeFileSync(
      messageModulePath,
      "module.exports.readMessage = () => 'first';\n",
      'utf-8',
    );

    const service = new ProjectPluginRegistryService(
      new ProjectWorktreeRootService(),
    );

    service.loadDefinitions();
    expect(await service.getDefinition('local.echo').definition.tools?.echo?.({} as never, {} as never)).toEqual({
      echoed: 'first',
    });

    fs.writeFileSync(
      messageModulePath,
      "module.exports.readMessage = () => 'second';\n",
      'utf-8',
    );

    const reloaded = service.reloadDefinition('local.echo');
    expect(await reloaded.definition.tools?.echo?.({} as never, {} as never)).toEqual({
      echoed: 'second',
    });
  });

  it('keeps the first local plugin when two directories export the same manifest id', () => {
    writePluginPackage(projectRootPath, 'local-echo-a', {
      garlicClaw: {
        runtime: 'local',
      },
      main: 'dist/index.js',
      name: '@garlic-claw/local-echo-a',
    }, [
      'module.exports.definition = {',
      "  manifest: {",
      "    id: 'local.echo',",
      "    name: 'Local Echo A',",
      "    version: '1.0.0',",
      "    runtime: 'local',",
      '    permissions: [],',
      '    tools: [{ name: \'echo\', description: \'echo\', parameters: {} }],',
      '  },',
      '};',
    ]);
    writePluginPackage(projectRootPath, 'local-echo-b', {
      garlicClaw: {
        runtime: 'local',
      },
      main: 'dist/index.js',
      name: '@garlic-claw/local-echo-b',
    }, [
      'module.exports.definition = {',
      "  manifest: {",
      "    id: 'local.echo',",
      "    name: 'Local Echo B',",
      "    version: '1.0.0',",
      "    runtime: 'local',",
      '    permissions: [],',
      '    tools: [{ name: \'echo\', description: \'echo\', parameters: {} }],',
      '  },',
      '};',
    ]);

    const service = new ProjectPluginRegistryService(
      new ProjectWorktreeRootService(),
    );
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => null);

    expect(service.loadDefinitions()).toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({
          manifest: expect.objectContaining({
            id: 'local.echo',
            name: 'Local Echo A',
          }),
        }),
        directoryPath: path.join(projectRootPath, 'config', 'plugins', 'local-echo-a'),
      }),
    ]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('本地插件 manifest.id 冲突: local.echo'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(path.join(projectRootPath, 'config', 'plugins', 'local-echo-b')));
  });
});

function writePluginPackage(
  projectRootPath: string,
  directoryName: string,
  packageJson: {
    garlicClaw?: {
      runtime?: 'local' | 'remote';
    };
    main?: string;
    name: string;
  },
  entryLines: string[],
): void {
  const pluginRootPath = path.join(
    projectRootPath,
    'config',
    'plugins',
    directoryName,
  );
  fs.mkdirSync(path.join(pluginRootPath, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginRootPath, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(pluginRootPath, packageJson.main ?? 'dist/index.js'),
    `${entryLines.join('\n')}\n`,
    'utf-8',
  );
}
