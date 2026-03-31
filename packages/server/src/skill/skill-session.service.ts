import type {
  ConversationSkillState,
  SkillDetail,
  SkillSummary,
} from '@garlic-claw/shared';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SkillRegistryService } from './skill-registry.service';

interface ConversationSkillContext {
  activeSkills: SkillDetail[];
  systemPrompt: string;
  allowedToolNames: string[] | null;
  deniedToolNames: string[];
}

@Injectable()
export class SkillSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillRegistry: SkillRegistryService,
  ) {}

  async getConversationSkillStateForUser(
    userId: string,
    conversationId: string,
  ): Promise<ConversationSkillState> {
    const conversation = await this.getOwnedConversationRecord(userId, conversationId);
    return this.resolveConversationState(conversation.id, conversation.skillsJson, {
      persistCleanup: true,
    });
  }

  async updateConversationSkillStateForUser(
    userId: string,
    conversationId: string,
    activeSkillIds: string[],
  ): Promise<ConversationSkillState> {
    const conversation = await this.getOwnedConversationRecord(userId, conversationId);
    const skillSummaries = await this.skillRegistry.listSkillSummaries();
    const skillById = indexSkillsById(skillSummaries);
    const normalizedIds = normalizeSkillIds(activeSkillIds);
    const missingIds = normalizedIds.filter((id) => !skillById.has(id));
    const disabledIds = normalizedIds.filter((id) => skillById.get(id)?.governance.enabled === false);

    if (missingIds.length > 0) {
      throw new NotFoundException(`Unknown skills: ${missingIds.join(', ')}`);
    }
    if (disabledIds.length > 0) {
      throw new ForbiddenException(`Disabled skills: ${disabledIds.join(', ')}`);
    }

    await this.persistConversationSkills(conversation.id, normalizedIds);
    return buildConversationSkillState(
      normalizedIds,
      resolveSkillsById(normalizedIds, skillById),
    );
  }

  async getConversationSkillContext(conversationId: string): Promise<ConversationSkillContext> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        skillsJson: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const skills = await this.skillRegistry.listSkills();
    const { activeSkills } = resolveActiveSkills(
      parseSkillIds(conversation.skillsJson),
      indexSkillsById(skills),
    );
    const skillToolNames = collectSkillPackageToolNames(activeSkills);
    const allowedToolNames = collectAllowedToolNames(activeSkills, skillToolNames);
    const deniedToolNames = collectDeniedToolNames(activeSkills);

    return {
      activeSkills,
      systemPrompt: buildConversationSkillPrompt(activeSkills, skillToolNames),
      allowedToolNames,
      deniedToolNames,
    };
  }

  private async getOwnedConversationRecord(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        userId: true,
        skillsJson: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }

    return conversation;
  }

  private async resolveConversationState(
    conversationId: string,
    rawSkillIds: string | null,
    options?: { persistCleanup?: boolean },
  ): Promise<ConversationSkillState> {
    const skillSummaries = await this.skillRegistry.listSkillSummaries();
    const parsedIds = parseSkillIds(rawSkillIds);
    const { activeSkillIds, activeSkills } = resolveActiveSkills(
      parsedIds,
      indexSkillsById(skillSummaries),
    );

    if (
      options?.persistCleanup &&
      !areStringArraysEqual(parsedIds, activeSkillIds)
    ) {
      await this.persistConversationSkills(conversationId, activeSkillIds);
    }

    return buildConversationSkillState(activeSkillIds, activeSkills);
  }

  private async persistConversationSkills(
    conversationId: string,
    activeSkillIds: string[],
  ): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        skillsJson: JSON.stringify(activeSkillIds),
      },
    });
  }
}

function parseSkillIds(rawSkillIds: string | null): string[] {
  if (!rawSkillIds) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawSkillIds);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeSkillIds(skillIds: string[]): string[] {
  return [...new Set(
    skillIds
      .filter((skillId) => typeof skillId === 'string')
      .map((skillId) => skillId.trim())
      .filter(Boolean),
  )];
}

function indexSkillsById<T extends { id: string }>(skills: T[]): Map<string, T> {
  return new Map(skills.map((skill) => [skill.id, skill]));
}

function resolveActiveSkills<T extends {
  id: string;
  governance: { enabled: boolean };
}>(
  rawSkillIds: string[],
  skillById: Map<string, T>,
): {
  activeSkillIds: string[];
  activeSkills: T[];
} {
  const activeSkillIds = normalizeSkillIds(rawSkillIds)
    .filter((id) => skillById.get(id)?.governance.enabled);

  return {
    activeSkillIds,
    activeSkills: resolveSkillsById(activeSkillIds, skillById),
  };
}

function resolveSkillsById<T extends { id: string }>(
  skillIds: string[],
  skillById: Map<string, T>,
): T[] {
  return skillIds
    .map((skillId) => skillById.get(skillId))
    .filter((skill): skill is T => Boolean(skill));
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function buildConversationSkillState(
  activeSkillIds: string[],
  activeSkills: SkillSummary[],
): ConversationSkillState {
  return {
    activeSkillIds: [...activeSkillIds],
    activeSkills: [...activeSkills],
  };
}

function collectAllowedToolNames(
  activeSkills: SkillDetail[],
  extraToolNames: string[] = [],
): string[] | null {
  const allowLists = activeSkills
    .map((skill) => skill.toolPolicy.allow)
    .filter((list) => list.length > 0);
  if (allowLists.length === 0) {
    return null;
  }

  return [...new Set([
    ...allowLists.flat(),
    ...extraToolNames,
  ])];
}

function collectDeniedToolNames(activeSkills: SkillDetail[]): string[] {
  return [...new Set(activeSkills.flatMap((skill) => skill.toolPolicy.deny))];
}

function buildConversationSkillPrompt(
  activeSkills: SkillDetail[],
  skillToolNames: string[],
): string {
  if (activeSkills.length === 0) {
    return '';
  }

  const sections = activeSkills.map((skill) => {
    const lines = [
      `### ${skill.name} (${skill.id})`,
    ];
    if (skill.description) {
      lines.push(skill.description);
    }
    if (skill.content.trim()) {
      lines.push(skill.content.trim());
    }
    if (skill.toolPolicy.allow.length > 0) {
      lines.push(`Allowed tools: ${skill.toolPolicy.allow.join(', ')}`);
    }
    if (skill.toolPolicy.deny.length > 0) {
      lines.push(`Denied tools: ${skill.toolPolicy.deny.join(', ')}`);
    }
    lines.push(`Trust level: ${skill.governance.trustLevel}`);
    return lines.join('\n');
  });

  const packageToolGuidance = buildSkillPackageToolGuidance(skillToolNames);

  return [
    '以下是当前会话已激活的 skills。它们属于高层工作流/提示资产，回答时必须同时遵守：',
    ...sections,
    ...(packageToolGuidance ? [packageToolGuidance] : []),
  ].join('\n\n');
}

function collectSkillPackageToolNames(activeSkills: SkillDetail[]): string[] {
  const names = new Set<string>();
  const canReadAssets = activeSkills.some((skill) =>
    (skill.governance.trustLevel === 'asset-read' || skill.governance.trustLevel === 'local-script')
    && skill.assets.some((asset) => asset.textReadable));
  const canRunScripts = activeSkills.some((skill) =>
    skill.governance.trustLevel === 'local-script'
    && skill.assets.some((asset) => asset.executable));

  if (canReadAssets) {
    names.add('skill__asset__list');
    names.add('skill__asset__read');
  }
  if (canRunScripts) {
    names.add('skill__script__run');
  }

  return [...names];
}

function buildSkillPackageToolGuidance(skillToolNames: string[]): string {
  if (skillToolNames.length === 0) {
    return '';
  }

  const lines = [
    '你还可以使用以下 skill package 专用工具来读取当前会话已激活 skill 的附属资产：',
  ];
  if (skillToolNames.includes('skill__asset__list')) {
    lines.push('- `skill__asset__list`: 列出当前会话 active skill 的可读资产');
  }
  if (skillToolNames.includes('skill__asset__read')) {
    lines.push('- `skill__asset__read`: 读取某个 active skill 的模板、参考资料或脚本文本');
  }
  if (skillToolNames.includes('skill__script__run')) {
    lines.push('- `skill__script__run`: 执行已信任 active skill 的脚本文件');
  }
  lines.push('这些工具都必须显式传入 `skillId` 与相对路径。');

  return lines.join('\n');
}
