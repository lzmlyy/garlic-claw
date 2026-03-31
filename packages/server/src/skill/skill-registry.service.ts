import type {
  SkillDetail,
  SkillGovernanceInfo,
  SkillSummary,
  UpdateSkillGovernancePayload,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { SkillDiscoveryService } from './skill-discovery.service';
import { SkillGovernanceService } from './skill-governance.service';

@Injectable()
export class SkillRegistryService {
  private cachedDiscoveredSkills: SkillDetail[] | null = null;

  constructor(
    private readonly discovery: SkillDiscoveryService,
    private readonly governance: SkillGovernanceService,
  ) {}

  async listSkills(options?: { refresh?: boolean }): Promise<SkillDetail[]> {
    if (options?.refresh || this.cachedDiscoveredSkills === null) {
      this.cachedDiscoveredSkills = await this.discovery.discoverSkills();
    }

    return this.cachedDiscoveredSkills.map((skill) =>
      cloneSkillDetail(applyGovernance(skill, this.governance.getSkillGovernance(skill.id))));
  }

  async refreshSkills(): Promise<SkillDetail[]> {
    return this.listSkills({ refresh: true });
  }

  async listSkillSummaries(options?: { refresh?: boolean }): Promise<SkillSummary[]> {
    const skills = await this.listSkills(options);
    return skills.map(toSkillSummary);
  }

  async getSkillById(
    skillId: string,
    options?: { refresh?: boolean },
  ): Promise<SkillDetail | null> {
    return (await this.listSkills(options)).find((skill) => skill.id === skillId) ?? null;
  }

  async updateSkillGovernance(
    skillId: string,
    patch: UpdateSkillGovernancePayload,
  ): Promise<SkillDetail> {
    const skill = await this.getSkillById(skillId);
    if (!skill) {
      throw new NotFoundException(`Unknown skill: ${skillId}`);
    }

    const governance = this.governance.updateSkillGovernance(skillId, patch);
    return cloneSkillDetail(applyGovernance(skill, governance));
  }
}

export function toSkillSummary(skill: SkillDetail): SkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: [...skill.tags],
    sourceKind: skill.sourceKind,
    entryPath: skill.entryPath,
    promptPreview: skill.promptPreview,
    toolPolicy: {
      allow: [...skill.toolPolicy.allow],
      deny: [...skill.toolPolicy.deny],
    },
    governance: {
      enabled: skill.governance.enabled,
      trustLevel: skill.governance.trustLevel,
    },
  };
}

function cloneSkillDetail(skill: SkillDetail): SkillDetail {
  return {
    ...toSkillSummary(skill),
    assets: skill.assets.map((asset) => ({
      path: asset.path,
      kind: asset.kind,
      textReadable: asset.textReadable,
      executable: asset.executable,
    })),
    content: skill.content,
  };
}

function applyGovernance(
  skill: SkillDetail,
  governance: SkillGovernanceInfo,
): SkillDetail {
  return {
    ...skill,
    governance: {
      enabled: governance.enabled,
      trustLevel: governance.trustLevel,
    },
  };
}
