import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PluginBootstrapService } from '../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';
import { DEVICE_TYPE } from '../../../src/plugin/plugin.constants';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';

describe('PluginBootstrapService remote bootstrap', () => {
  it('exposes ConfigService and JwtService in constructor metadata for Nest injection', () => {
    expect(
      Reflect.getMetadata('design:paramtypes', PluginBootstrapService).map((entry: unknown) =>
        typeof entry === 'function' ? entry.name : String(entry),
      ),
    ).toEqual([
      'PluginGovernanceService',
      'PluginPersistenceService',
      'BuiltinPluginRegistryService',
      'ConfigService',
      'JwtService',
    ]);
  });

  it('issues a remote bootstrap token and registers a placeholder remote plugin', () => {
    const service = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
      undefined,
      {
        get: (key: string, fallback?: unknown) => {
          switch (key) {
            case 'JWT_SECRET':
              return 'secret';
            case 'REMOTE_PLUGIN_TOKEN_EXPIRES_IN':
              return '30d';
            case 'REMOTE_PLUGIN_WS_URL':
              return 'ws://127.0.0.1:23331';
            default:
              return fallback;
          }
        },
      } as ConfigService,
      {
        sign: () => 'signed-token',
      } as unknown as JwtService,
    );

    expect(service.issueRemoteBootstrap({
      deviceType: DEVICE_TYPE.PC,
      displayName: 'Remote Echo',
      pluginName: 'remote.echo',
    })).toEqual({
      deviceType: DEVICE_TYPE.PC,
      pluginName: 'remote.echo',
      serverUrl: 'ws://127.0.0.1:23331',
      token: 'signed-token',
      tokenExpiresIn: '30d',
    });
    expect(service.getPlugin('remote.echo')).toMatchObject({
      manifest: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      pluginId: 'remote.echo',
    });
  });
});
