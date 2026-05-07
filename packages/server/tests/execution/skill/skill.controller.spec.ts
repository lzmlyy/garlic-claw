import { SkillController } from '../../../src/modules/execution/skill/skill.controller';

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
        id: 'project/weather-query',
        name: '天气查询',
        description: '查询指定地点天气。',
      },
    ]);

    await expect(controller.listSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/weather-query',
      }),
    ]);
  });

  it('refreshes the discovered skill catalog', async () => {
    skillRegistryService.listSkills.mockResolvedValue([
      {
        id: 'project/weather-query',
        name: '天气查询',
        description: '查询指定地点天气。',
      },
    ]);

    await expect(controller.refreshSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/weather-query',
      }),
    ]);
    expect(skillRegistryService.listSkills).toHaveBeenCalledWith({ refresh: true });
  });

  it('updates governance for one skill', async () => {
    skillRegistryService.updateSkillGovernance.mockResolvedValue({
      id: 'project/weather-query',
      governance: {
        loadPolicy: 'deny',
      },
    });

    await expect(
      controller.updateSkillGovernance('project/weather-query', {
        loadPolicy: 'deny',
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        governance: {
          loadPolicy: 'deny',
        },
      }),
    );
  });
});
