import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';

describe('PluginGovernanceService', () => {
  it('uses builtin defaults for builtin plugins', () => {
    const service = new PluginGovernanceService();

    expect(
      service.createState({
        manifest: {
          id: 'builtin.ping',
          name: 'Builtin Ping',
          permissions: [],
          runtime: 'builtin',
          tools: [],
          version: '1.0.0',
        },
      }),
    ).toEqual({
      defaultEnabled: true,
      governance: {
        builtinRole: 'system-optional',
        canDisable: true,
      },
    });
  });
});
