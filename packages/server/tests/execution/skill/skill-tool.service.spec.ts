import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { SkillRegistryService } from '../../../src/modules/execution/skill/skill-registry.service';
import { SkillToolService } from '../../../src/modules/execution/skill/skill-tool.service';

describe('SkillToolService', () => {
  let tempRoot: string;
  let registry: SkillRegistryService;
  let service: SkillToolService;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garlic-claw-skill-tool-'));
    await fs.mkdir(path.join(tempRoot, 'config', 'skills', 'definitions', 'weather-query', 'scripts'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'config', 'skills', 'definitions', 'weather-query', 'SKILL.md'), [
      '---',
      'name: weather-query',
      'description: 查询指定地点天气。',
      '---',
      '',
      '# weather-query',
      '',
      '请先确认地点，再查询天气。',
    ].join('\n'), 'utf8');
    await fs.writeFile(path.join(tempRoot, 'config', 'skills', 'definitions', 'weather-query', 'scripts', 'weather.js'), 'console.log("weather")\n', 'utf8');
    registry = new SkillRegistryService({
      skillsRoot: path.join(tempRoot, 'config', 'skills', 'definitions'),
    }, new ProjectWorktreeRootService());
    service = new SkillToolService(registry);
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('loads skill content with base directory and sampled files', async () => {
    await expect(service.loadSkill('weather-query')).resolves.toEqual(expect.objectContaining({
      name: 'weather-query',
      description: '查询指定地点天气。',
      entryPath: 'weather-query/SKILL.md',
      content: expect.stringContaining('# weather-query'),
      files: expect.arrayContaining([
        expect.objectContaining({
          executable: true,
          path: 'scripts/weather.js',
        }),
      ]),
      modelOutput: expect.stringContaining('<skill_content name="weather-query">'),
    }));
  });

  it('renders available_skills with repo-relative location metadata', async () => {
    await expect(service.listAvailableSkills()).resolves.toEqual([
      expect.objectContaining({
        entryPath: 'weather-query/SKILL.md',
        name: 'weather-query',
      }),
    ]);

    const description = service.buildToolDescription(await service.listAvailableSkills());
    expect(description).toContain('<available_skills>');
    expect(description).toContain('<name>weather-query</name>');
    expect(description).toContain('<location>config/skills/definitions/weather-query/SKILL.md</location>');
  });

  it('filters denied skills from the native skill catalog and blocks direct loading', async () => {
    const skill = await registry.getSkillByName('weather-query');
    expect(skill).toBeTruthy();
    await registry.updateSkillGovernance(skill!.id, {
      loadPolicy: 'deny',
    });

    await expect(service.listAvailableSkills()).resolves.toEqual([]);
    await expect(service.loadSkill('weather-query')).rejects.toThrow('denied by governance policy');
  });
});
