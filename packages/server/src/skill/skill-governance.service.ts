import * as fs from 'node:fs';
import type {
  SkillGovernanceInfo,
  SkillTrustLevel,
  UpdateSkillGovernancePayload,
} from '@garlic-claw/shared';
import {
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { resolveConfigFilePath } from '../ai/config/config-path.util';

export const SKILL_GOVERNANCE_OPTIONS = 'SKILL_GOVERNANCE_OPTIONS';

export interface SkillGovernanceOptions {
  settingsPath?: string;
}

interface SkillGovernanceFile {
  version: number;
  skills: Record<string, SkillGovernanceInfo>;
}

const SKILL_GOVERNANCE_CURRENT_VERSION = 1;

@Injectable()
export class SkillGovernanceService {
  private readonly logger = new Logger(SkillGovernanceService.name);
  private readonly settingsPath: string;
  private settings: SkillGovernanceFile;

  constructor(
    @Optional()
    @Inject(SKILL_GOVERNANCE_OPTIONS)
    options: SkillGovernanceOptions = {},
  ) {
    this.settingsPath = options.settingsPath
      ?? resolveConfigFilePath(
        'GARLIC_CLAW_SKILL_GOVERNANCE_PATH',
        'skill-governance.json',
      );
    this.settings = this.loadSettings();
  }

  getSkillGovernance(skillId: string): SkillGovernanceInfo {
    return this.settings.skills[skillId] ?? buildDefaultGovernance();
  }

  updateSkillGovernance(
    skillId: string,
    patch: UpdateSkillGovernancePayload,
  ): SkillGovernanceInfo {
    const current = this.getSkillGovernance(skillId);
    const next: SkillGovernanceInfo = {
      enabled: patch.enabled ?? current.enabled,
      trustLevel: patch.trustLevel ?? current.trustLevel,
    };
    this.settings.skills[skillId] = next;
    this.saveSettings();
    return next;
  }

  private loadSettings(): SkillGovernanceFile {
    if (!fs.existsSync(this.settingsPath)) {
      return createEmptySettings();
    }

    try {
      const parsed = readUnknownObject(
        JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8')),
      );
      return {
        version: typeof parsed?.version === 'number'
          ? parsed.version
          : SKILL_GOVERNANCE_CURRENT_VERSION,
        skills: readGovernanceRecord(parsed?.skills),
      };
    } catch (error) {
      this.logger.warn(`skill 治理配置文件损坏，已重置为空配置: ${String(error)}`);
      const empty = createEmptySettings();
      fs.writeFileSync(this.settingsPath, JSON.stringify(empty, null, 2), 'utf-8');
      return empty;
    }
  }

  private saveSettings(): void {
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
  }
}

function buildDefaultGovernance(): SkillGovernanceInfo {
  return {
    enabled: true,
    trustLevel: 'prompt-only',
  };
}

function createEmptySettings(): SkillGovernanceFile {
  return {
    version: SKILL_GOVERNANCE_CURRENT_VERSION,
    skills: {},
  };
}

function readGovernanceRecord(value: unknown): Record<string, SkillGovernanceInfo> {
  const object = readUnknownObject(value);
  if (!object) {
    return {};
  }

  const entries = Object.entries(object)
    .flatMap(([skillId, entry]) => {
      const governance = readGovernanceInfo(entry);
      return governance ? [[skillId, governance] satisfies [string, SkillGovernanceInfo]] : [];
    });

  return Object.fromEntries(entries);
}

function readGovernanceInfo(value: unknown): SkillGovernanceInfo | null {
  const object = readUnknownObject(value);
  if (!object) {
    return null;
  }

  return typeof object.enabled === 'boolean' && isTrustLevel(object.trustLevel)
    ? {
        enabled: object.enabled,
        trustLevel: object.trustLevel,
      }
    : null;
}

function isTrustLevel(value: unknown): value is SkillTrustLevel {
  return value === 'prompt-only'
    || value === 'asset-read'
    || value === 'local-script';
}

function readUnknownObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}
