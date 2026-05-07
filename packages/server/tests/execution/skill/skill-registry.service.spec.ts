import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { SkillRegistryService } from '../../../src/modules/execution/skill/skill-registry.service';

describe('SkillRegistryService', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'garlic-claw-skill-registry-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('scans skills only from the configured skills directory', async () => {
    const skillsRoot = path.join(tempRoot, 'config', 'skills', 'definitions');
    const externalRoot = path.join(tempRoot, 'external-skills');
    await fs.mkdir(path.join(skillsRoot, 'weather-query', 'scripts'), { recursive: true });
    await fs.mkdir(path.join(externalRoot, 'ignored'), { recursive: true });
    await fs.writeFile(path.join(skillsRoot, 'weather-query', 'SKILL.md'), [
      '---',
      'name: weather-query',
      'description: 查询指定地点天气。',
      '---',
      '',
      '# weather-query',
    ].join('\n'), 'utf8');
    await fs.writeFile(path.join(skillsRoot, 'weather-query', 'scripts', 'weather.js'), 'console.log("weather")\n', 'utf8');
    await fs.writeFile(path.join(externalRoot, 'ignored', 'SKILL.md'), [
      '---',
      'name: ignored',
      'description: 不应被扫描到。',
      '---',
      '',
      '# ignored',
    ].join('\n'), 'utf8');

    const service = new SkillRegistryService({
      skillsRoot,
    }, new ProjectWorktreeRootService());

    await expect(service.listSkills()).resolves.toEqual([
      expect.objectContaining({
        description: '查询指定地点天气。',
        entryPath: 'weather-query/SKILL.md',
        id: 'project/weather-query',
        name: 'weather-query',
        sourceKind: 'project',
      }),
    ]);
  });

  it('sorts discovered skills by name before exposing them', async () => {
    const skillsRoot = path.join(tempRoot, 'config', 'skills', 'definitions');
    await fs.mkdir(path.join(skillsRoot, 'zeta'), { recursive: true });
    await fs.mkdir(path.join(skillsRoot, 'alpha'), { recursive: true });
    await fs.writeFile(path.join(skillsRoot, 'zeta', 'SKILL.md'), [
      '---',
      'name: zeta',
      'description: zeta skill',
      '---',
      '',
      '# zeta',
    ].join('\n'), 'utf8');
    await fs.writeFile(path.join(skillsRoot, 'alpha', 'SKILL.md'), [
      '---',
      'name: alpha',
      'description: alpha skill',
      '---',
      '',
      '# alpha',
    ].join('\n'), 'utf8');

    const service = new SkillRegistryService({
      skillsRoot,
    }, new ProjectWorktreeRootService());

    await expect(service.listSkills()).resolves.toEqual([
      expect.objectContaining({
        id: 'project/alpha',
        name: 'alpha',
      }),
      expect.objectContaining({
        id: 'project/zeta',
        name: 'zeta',
      }),
    ]);
  });

  it('resolves skill directories relative to the configured skills root', () => {
    const skillsRoot = path.join(tempRoot, 'config', 'skills', 'definitions');
    const service = new SkillRegistryService({
      skillsRoot,
    }, new ProjectWorktreeRootService());

    expect(service.resolveSkillDirectory({
      entryPath: 'weather-query/SKILL.md',
      sourceKind: 'project',
    })).toBe(path.join(skillsRoot, 'weather-query'));
  });

  it('marks shell scripts as executable skill assets', async () => {
    const skillsRoot = path.join(tempRoot, 'config', 'skills', 'definitions');
    await fs.mkdir(path.join(skillsRoot, 'weather-query', 'scripts'), { recursive: true });
    await fs.writeFile(path.join(skillsRoot, 'weather-query', 'SKILL.md'), [
      '---',
      'name: weather-query',
      'description: 查询指定地点天气。',
      '---',
      '',
      '# weather-query',
    ].join('\n'), 'utf8');
    await fs.writeFile(path.join(skillsRoot, 'weather-query', 'scripts', 'weather.js'), 'console.log("weather")\n', 'utf8');

    const service = new SkillRegistryService({
      skillsRoot,
    }, new ProjectWorktreeRootService());

    const [skill] = await service.listSkills();
    expect(skill?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        executable: true,
        kind: 'script',
        path: 'scripts/weather.js',
        textReadable: true,
      }),
    ]));
  });
});
