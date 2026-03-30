import * as fs from 'node:fs';
import * as path from 'node:path';

export function resolveMcpConfigFilePath(): string {
  const overridePath = process.env.GARLIC_CLAW_MCP_CONFIG_PATH?.trim();
  return overridePath
    ? path.resolve(overridePath)
    : path.join(findProjectRoot(), '.mcp', 'mcp.json');
}

export function resolveCityCoordinatesFilePath(): string {
  return path.join(findProjectRoot(), '.mcp', 'city-coordinates.json');
}

export function ensureParentDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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
