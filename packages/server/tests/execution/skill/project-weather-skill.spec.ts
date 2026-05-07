import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const skillPath = path.join(
  projectRoot,
  'config',
  'skills',
  'definitions',
  'weather-query',
  'SKILL.md',
);

describe('project weather skill', () => {

  it('uses the repository script as the default execution path', async () => {
    const content = await fs.readFile(skillPath, 'utf8');

    expect(content).toContain('默认通过仓库内脚本执行');
    expect(content).toContain('node scripts/weather.js "上海"');
    expect(content).not.toContain('curl --fail --silent --show-error');
  });
});
