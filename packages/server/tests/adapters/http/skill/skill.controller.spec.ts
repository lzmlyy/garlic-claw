import { SkillController } from '../../../../src/adapters/http/skill/skill.controller';

describe('SkillController', () => {
  const skillRegistryService = {
    listSkills: jest.fn(),
    updateSkillGovernance: jest.fn(),
  };

  let controller: SkillController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SkillController(skillRegistryService as never);
  });

  it('returns the discovered skill catalog', async () => {
    skillRegistryService.listSkills.mockResolvedValue([
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
    skillRegistryService.listSkills.mockResolvedValue([
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
    expect(skillRegistryService.listSkills).toHaveBeenCalledWith({ refresh: true });
  });

  it('updates governance for one skill', async () => {
    skillRegistryService.updateSkillGovernance.mockResolvedValue({
      id: 'project/planner',
      governance: {
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
          trustLevel: 'local-script',
        },
      }),
    );
  });
});
