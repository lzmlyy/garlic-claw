import { BuiltinPluginRegistryService } from '../../../src/modules/plugin/builtin/builtin-plugin-registry.service';
import { PluginBootstrapService } from '../../../src/modules/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/modules/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/modules/plugin/persistence/plugin-persistence.service';

describe('PluginBootstrapService remote access', () => {
  it('exposes builtin registry in constructor metadata for Nest injection', () => {
    expect(
      Reflect.getMetadata('design:paramtypes', PluginBootstrapService).map((entry: unknown) =>
        typeof entry === 'function' ? entry.name : String(entry),
      ),
    ).toEqual([
      'PluginGovernanceService',
      'PluginPersistenceService',
      'BuiltinPluginRegistryService',
      'ProjectPluginRegistryService',
    ]);
  });

  it('upserts a remote plugin slot and persists static access config', () => {
    const service = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
      new BuiltinPluginRegistryService(),
    );

    const record = service.upsertRemotePlugin({
      access: {
        accessKey: 'smoke-access-key',
        serverUrl: 'ws://127.0.0.1:23331',
      },
      displayName: 'Remote Echo',
      pluginName: 'remote.echo',
      remote: {
        auth: {
          mode: 'required',
        },
        capabilityProfile: 'query',
        remoteEnvironment: 'api',
      },
      version: '1.0.0',
    });

    expect(record).toMatchObject({
      connected: false,
      manifest: {
        id: 'remote.echo',
        name: 'Remote Echo',
        remote: {
          auth: {
            mode: 'required',
          },
          capabilityProfile: 'query',
          remoteEnvironment: 'api',
        },
        runtime: 'remote',
        version: '1.0.0',
      },
      pluginId: 'remote.echo',
      remote: {
        access: {
          accessKey: 'smoke-access-key',
          serverUrl: 'ws://127.0.0.1:23331',
        },
        descriptor: {
          auth: {
            mode: 'required',
          },
          capabilityProfile: 'query',
          remoteEnvironment: 'api',
        },
        metadataCache: {
          lastSyncedAt: null,
          manifestHash: null,
          status: 'empty',
        },
      },
      status: 'offline',
    });
    expect(service.getPlugin('remote.echo')).toMatchObject({
      manifest: {
        id: 'remote.echo',
        name: 'Remote Echo',
        remote: {
          auth: {
            mode: 'required',
          },
          capabilityProfile: 'query',
          remoteEnvironment: 'api',
        },
        runtime: 'remote',
      },
      pluginId: 'remote.echo',
    });
  });
});
