import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function resolveProjectSkillsRoot(): string {
  return path.join(findProjectRoot(), 'skills');
}

export function resolveUserSkillsRoot(): string {
  return path.join(os.homedir(), '.garlic-claw', 'skills');
}

function findProjectRoot(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '..', '..'),
    path.resolve(process.cwd(), '..', '..'),
    path.resolve(process.cwd(), '..'),
    process.cwd(),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }

  return process.cwd();
}
