import type { PluginCallContext } from '@garlic-claw/shared';
import { SkillToolProvider } from './skill-tool.provider';

describe('SkillToolProvider', () => {
  const context: PluginCallContext = {
    source: 'chat-tool',
    userId: 'user-1',
    conversationId: 'conversation-1',
    activeProviderId: 'openai',
    activeModelId: 'gpt-5.2',
  };

  it('exposes generic skill asset/script tools for active trusted skills and delegates execution', async () => {
    const skillExecution = {
      getToolAccess: jest.fn().mockResolvedValue({
        availableSkillIds: ['project/planner'],
        canReadAssets: true,
        canRunScripts: true,
      }),
      listAssetsForConversation: jest.fn().mockResolvedValue([
        {
          skillId: 'project/planner',
          path: 'templates/task.md',
        },
      ]),
      readAssetForConversation: jest.fn().mockResolvedValue({
        skillId: 'project/planner',
        path: 'templates/task.md',
        content: '# task template',
        truncated: false,
      }),
      runScriptForConversation: jest.fn().mockResolvedValue({
        skillId: 'project/planner',
        path: 'scripts/echo.mjs',
        exitCode: 0,
        stdout: 'ok',
        stderr: '',
        timedOut: false,
      }),
    };
    const provider = new SkillToolProvider(skillExecution as never);

    const tools = await provider.listTools(context);

    expect(tools).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({
          kind: 'skill',
          id: 'active-packages',
        }),
        name: 'asset.list',
      }),
      expect.objectContaining({
        name: 'asset.read',
      }),
      expect.objectContaining({
        name: 'script.run',
      }),
    ]);

    await expect(
      provider.executeTool({
        tool: tools[0],
        params: {
          skillId: 'project/planner',
        },
        context,
      }),
    ).resolves.toEqual([
      {
        skillId: 'project/planner',
        path: 'templates/task.md',
      },
    ]);

    await expect(
      provider.executeTool({
        tool: tools[2],
        params: {
          skillId: 'project/planner',
          path: 'scripts/echo.mjs',
          args: ['alpha'],
        },
        context,
      }),
    ).resolves.toEqual({
      skillId: 'project/planner',
      path: 'scripts/echo.mjs',
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      timedOut: false,
    });
  });
});
