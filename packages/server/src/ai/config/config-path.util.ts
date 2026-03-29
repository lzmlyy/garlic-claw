import * as fs from 'node:fs';
import * as path from 'node:path';

export function resolveConfigFilePath(
  envKey: string,
  defaultFileName: string,
): string {
  const overridePath = process.env[envKey]?.trim();
  const filePath = overridePath
    ? path.resolve(overridePath)
    : path.join(findProjectRoot(), 'config', defaultFileName);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return filePath;
}

function findProjectRoot(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '..', '..', '..'),
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
