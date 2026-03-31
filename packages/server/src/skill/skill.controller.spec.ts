import { SkillController } from './skill.controller';

describe('SkillController', () => {
  const skillRegistry = {
    listSkills: jest.fn(),
    refreshSkills: jest.fn(),
    updateSkillGovernance: jest.fn(),
  };

  let controller: SkillController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SkillController(skillRegistry as never);
  });

  it('returns the discovered skill catalog', async () => {
    skillRegistry.listSkills.mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
      },
    ]);

    await expect(controller.listSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/planner',
      }),
    ]);
  });

  it('refreshes the discovered skill catalog', async () => {
    skillRegistry.refreshSkills.mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
      },
    ]);

    await expect(controller.refreshSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/planner',
      }),
    ]);
  });

  it('updates governance for one skill', async () => {
    skillRegistry.updateSkillGovernance.mockResolvedValue({
      id: 'project/planner',
      governance: {
        enabled: true,
        trustLevel: 'local-script',
      },
    });

    await expect(
      controller.updateSkillGovernance('project/planner', {
        trustLevel: 'local-script',
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        governance: {
          enabled: true,
          trustLevel: 'local-script',
        },
      }),
    );
  });
});
