import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {
  PluginCallContext,
  SkillAssetReadResult,
  SkillAssetRef,
  SkillDetail,
  SkillScriptRunResult,
  SkillTrustLevel,
} from '@garlic-claw/shared';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  SKILL_DISCOVERY_OPTIONS,
  type SkillDiscoveryOptions,
} from './skill-discovery.service';
import { resolveProjectSkillsRoot, resolveUserSkillsRoot } from './skill-path.util';
import { SkillSessionService } from './skill-session.service';

@Injectable()
export class SkillExecutionService {
  constructor(
    private readonly skillSession: SkillSessionService,
    @Optional()
    @Inject(SKILL_DISCOVERY_OPTIONS)
    private readonly options: SkillDiscoveryOptions = {},
  ) {}

  async getToolAccess(context?: Pick<PluginCallContext, 'conversationId'>): Promise<{
    availableSkillIds: string[];
    canReadAssets: boolean;
    canRunScripts: boolean;
  }> {
    if (!context?.conversationId) {
      return {
        availableSkillIds: [],
        canReadAssets: false,
        canRunScripts: false,
      };
    }

    const skillContext = await this.skillSession.getConversationSkillContext(context.conversationId);
    const activeSkills = skillContext.activeSkills;

    return {
      availableSkillIds: activeSkills.map((skill) => skill.id),
      canReadAssets: activeSkills.some((skill) =>
        canReadAssetsForTrust(skill.governance.trustLevel)
        && skill.assets.some((asset) => asset.textReadable)),
      canRunScripts: activeSkills.some((skill) =>
        skill.governance.trustLevel === 'local-script'
        && skill.assets.some((asset) => asset.executable)),
    };
  }

  async listAssetsForConversation(
    conversationId: string,
    skillId?: string,
  ): Promise<SkillAssetRef[]> {
    const activeSkills = await this.listTrustedActiveSkills(conversationId);
    const targetSkills = skillId
      ? activeSkills.filter((skill) => skill.id === skillId)
      : activeSkills;

    return targetSkills.flatMap((skill) =>
      skill.assets
        .filter((asset) => asset.textReadable)
        .map((asset) => ({
          skillId: skill.id,
          path: asset.path,
          kind: asset.kind,
          textReadable: asset.textReadable,
          executable: asset.executable,
        })));
  }

  async readAssetForConversation(input: {
    conversationId: string;
    skillId: string;
    assetPath: string;
    maxChars?: number;
  }): Promise<SkillAssetReadResult> {
    const skill = await this.requireActiveSkill(input.conversationId, input.skillId, 'asset-read');
    const asset = this.requireSkillAsset(skill, input.assetPath);
    if (!asset.textReadable) {
      throw new BadRequestException(`Asset is not text-readable: ${input.assetPath}`);
    }

    const raw = await fs.readFile(this.resolveAssetAbsolutePath(skill, asset.path), 'utf8');
    const normalized = raw.replace(/\r\n/g, '\n').trimEnd();
    const maxChars = clampMaxChars(input.maxChars);
    const truncated = normalized.length > maxChars;

    return {
      skillId: skill.id,
      path: asset.path,
      content: truncated ? normalized.slice(0, maxChars) : normalized,
      truncated,
    };
  }

  async runScriptForConversation(input: {
    conversationId: string;
    skillId: string;
    assetPath: string;
    args?: string[];
    timeoutMs?: number;
  }): Promise<SkillScriptRunResult> {
    const skill = await this.requireActiveSkill(input.conversationId, input.skillId, 'local-script');
    const asset = this.requireSkillAsset(skill, input.assetPath);
    if (!asset.executable) {
      throw new BadRequestException(`Asset is not executable: ${input.assetPath}`);
    }

    const absolutePath = this.resolveAssetAbsolutePath(skill, asset.path);
    const runner = resolveScriptRunner(absolutePath);
    const timeoutMs = clampTimeoutMs(input.timeoutMs);

    return new Promise<SkillScriptRunResult>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;

      const child = spawn(
        runner.command,
        [...runner.prefixArgs, absolutePath, ...(input.args ?? [])],
        {
          cwd: this.resolveSkillRoot(skill),
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        if (settled) {
          return;
        }
        settled = true;
        reject(new BadRequestException(`Failed to start script runner: ${error.message}`));
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        if (settled) {
          return;
        }
        settled = true;
        resolve({
          skillId: skill.id,
          path: asset.path,
          exitCode,
          stdout: stdout.trimEnd(),
          stderr: stderr.trimEnd(),
          timedOut,
        });
      });
    });
  }

  private async listTrustedActiveSkills(conversationId: string): Promise<SkillDetail[]> {
    const skillContext = await this.skillSession.getConversationSkillContext(conversationId);
    return skillContext.activeSkills.filter((skill) =>
      canReadAssetsForTrust(skill.governance.trustLevel)
      && skill.assets.some((asset) => asset.textReadable));
  }

  private async requireActiveSkill(
    conversationId: string,
    skillId: string,
    requiredTrust: SkillTrustLevel,
  ): Promise<SkillDetail> {
    const skillContext = await this.skillSession.getConversationSkillContext(conversationId);
    const skill = skillContext.activeSkills.find((entry) => entry.id === skillId);
    if (!skill) {
      throw new NotFoundException(`Skill is not active for this conversation: ${skillId}`);
    }
    if (!hasRequiredTrust(skill.governance.trustLevel, requiredTrust)) {
      throw new ForbiddenException(`Skill trust level is insufficient: ${skillId}`);
    }

    return skill;
  }

  private requireSkillAsset(skill: SkillDetail, assetPath: string) {
    const normalizedPath = normalizeRelativePath(assetPath);
    const asset = skill.assets.find((entry) => entry.path === normalizedPath);
    if (!asset) {
      throw new NotFoundException(`Unknown skill asset: ${assetPath}`);
    }

    return asset;
  }

  private resolveSkillRoot(skill: Pick<SkillDetail, 'sourceKind' | 'entryPath'>): string {
    const sourceRoot = skill.sourceKind === 'project'
      ? (this.options.projectSkillsRoot ?? resolveProjectSkillsRoot())
      : (this.options.userSkillsRoot ?? resolveUserSkillsRoot());
    return path.join(sourceRoot, path.dirname(skill.entryPath));
  }

  private resolveAssetAbsolutePath(skill: SkillDetail, assetPath: string): string {
    const skillRoot = this.resolveSkillRoot(skill);
    const absolutePath = path.resolve(skillRoot, assetPath);
    const normalizedRoot = path.resolve(skillRoot);

    if (
      absolutePath !== normalizedRoot
      && !absolutePath.startsWith(`${normalizedRoot}${path.sep}`)
    ) {
      throw new BadRequestException(`Illegal asset path: ${assetPath}`);
    }

    return absolutePath;
  }
}

function canReadAssetsForTrust(trustLevel: SkillTrustLevel): boolean {
  return trustLevel === 'asset-read' || trustLevel === 'local-script';
}

function hasRequiredTrust(
  actual: SkillTrustLevel,
  required: SkillTrustLevel,
): boolean {
  const rank: Record<SkillTrustLevel, number> = {
    'prompt-only': 0,
    'asset-read': 1,
    'local-script': 2,
  };

  return rank[actual] >= rank[required];
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function clampMaxChars(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 12000;
  }

  return Math.max(1, Math.min(200000, Math.floor(value)));
}

function clampTimeoutMs(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 15000;
  }

  return Math.max(1000, Math.min(120000, Math.floor(value)));
}

function resolveScriptRunner(absolutePath: string): {
  command: string;
  prefixArgs: string[];
} {
  const extension = path.extname(absolutePath).toLowerCase();

  switch (extension) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return {
        command: process.execPath,
        prefixArgs: [],
      };
    case '.py':
      return {
        command: 'python',
        prefixArgs: [],
      };
    case '.ps1':
      return {
        command: process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
        prefixArgs: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File'],
      };
    case '.sh':
      return {
        command: 'bash',
        prefixArgs: [],
      };
    case '.cmd':
    case '.bat':
      if (process.platform !== 'win32') {
        throw new BadRequestException(`Unsupported script type on this platform: ${extension}`);
      }
      return {
        command: 'cmd.exe',
        prefixArgs: ['/d', '/c'],
      };
    default:
      throw new BadRequestException(`Unsupported script type: ${extension}`);
  }
}
