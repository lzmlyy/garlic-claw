import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProjectWorktreeRootService {
  resolveRoot(startPath: string = process.cwd()): string {
    const configuredRoot = this.readConfiguredRoot();
    if (configuredRoot) {
      return configuredRoot;
    }
    return this.findRoot(startPath)
      ?? this.findRoot(__dirname)
      ?? process.cwd();
  }

  findRoot(startPath: string): string | null {
    let currentPath = path.resolve(startPath);

    while (true) {
      if (
        fs.existsSync(path.join(currentPath, 'package.json'))
        && fs.existsSync(path.join(currentPath, 'packages', 'server', 'package.json'))
      ) {
        return currentPath;
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        return null;
      }
      currentPath = parentPath;
    }
  }

  private readConfiguredRoot(): string | null {
    const configuredRoot = process.env.GARLIC_CLAW_PROJECT_WORKTREE_PATH?.trim();
    if (!configuredRoot) {
      return null;
    }
    return path.resolve(configuredRoot);
  }
}
