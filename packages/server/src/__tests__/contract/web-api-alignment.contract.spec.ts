import {
  SERVER_CONTROLLER_WEB_API_COVERAGE,
  SERVER_ONLY_CONTROLLER_GROUPS,
  listServerControllerPaths,
  listWebApiUtilityFiles,
  listWebFeatureApiFiles,
  listWebFeatureApiRoots,
} from '../fixtures/api-contract.fixture';

describe('api contract freeze - web alignment', () => {
  it('keeps web feature api files aligned with controller resource groups', () => {
    expect(listWebApiUtilityFiles()).toEqual([
      'base.ts',
      'shared-contract.typecheck.ts',
    ]);

    expect(listWebFeatureApiRoots()).toEqual([
      'ai-settings',
      'api-keys',
      'auth',
      'automations',
      'chat',
      'commands',
      'personas',
      'plugins',
      'skills',
      'subagents',
      'tools',
    ]);

    expect(listWebFeatureApiFiles()).toEqual([
      'ai-settings/ai.ts',
      'api-keys/api-keys.ts',
      'auth/auth.ts',
      'automations/automations.ts',
      'chat/chat.ts',
      'commands/plugin-commands.ts',
      'personas/personas.ts',
      'plugins/plugins.ts',
      'skills/skills.ts',
      'subagents/plugin-subagent-tasks.ts',
      'tools/mcp.ts',
      'tools/tools.ts',
    ]);

    expect(listServerControllerPaths()).toEqual([
      ...Object.keys(SERVER_CONTROLLER_WEB_API_COVERAGE),
      ...SERVER_ONLY_CONTROLLER_GROUPS,
    ].sort());

    const claimedModules = [
      ...new Set(
        Object.values(SERVER_CONTROLLER_WEB_API_COVERAGE).flat(),
      ),
    ].sort();

    expect(claimedModules).toEqual(listWebFeatureApiRoots());
  });
});
