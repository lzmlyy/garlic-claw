import type {
  ChatMessagePart,
  ConversationSkillState,
  JsonObject,
  JsonValue,
  PluginActionName,
  PluginCallContext,
  SkillDetail,
  ToolInfo,
  ToolSourceActionResult,
  ToolSourceInfo,
} from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { RuntimeHostConversationRecordService } from '../../runtime/host/runtime-host-conversation-record.service';
import { SKILL_DISCOVERY_OPTIONS, SkillRegistryService, type SkillDiscoveryOptions } from './skill-registry.service';
import {
  describeSkillPackageToolAccess,
  runSkillPackageTool,
  SKILL_SOURCE_ID,
  SKILL_SOURCE_LABEL,
  SKILL_SUPPORTED_ACTIONS,
  type SkillPackageToolDefinition,
  type SkillPackageToolName,
} from './skill-package-tools';

export interface ConversationSkillContext {
  systemPrompt: string;
  allowedToolNames: string[] | null;
}

export interface ConversationSkillCommandResponse {
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  providerId: string;
  modelId: string;
}

const SKILL_HELP_TEXT = ['Skill 命令用法：', '/skill list', '/skill use <id>', '/skill remove <id>', '/skill clear'].join('\n');
const buildSkillCommandResponse = (text: string): ConversationSkillCommandResponse => ({ assistantContent: text, assistantParts: [{ type: 'text', text }], providerId: 'system', modelId: 'skill-command' });

@Injectable()
export class SkillSessionService {
  private skillPackageToolsEnabled = true;

  constructor(
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
    @Inject(SkillRegistryService)
    private readonly skillRegistryService: SkillRegistryService,
    @Optional()
    @Inject(SKILL_DISCOVERY_OPTIONS)
    private readonly discoveryOptions: SkillDiscoveryOptions = {},
  ) {}

  async getConversationSkillStateForUser(userId: string, conversationId: string): Promise<ConversationSkillState> {
    return toConversationSkillState(await this.readConversationSkillSelection({
      conversationId,
      userId,
      persistCleanup: true,
    }));
  }

  async updateConversationSkillStateForUser(userId: string, conversationId: string, activeSkillIds: string[]): Promise<ConversationSkillState> {
    this.runtimeHostConversationRecordService.requireConversation(conversationId, userId);
    const selection = resolveSkillSelection(activeSkillIds, await this.skillRegistryService.listSkills());
    if (selection.missingIds.length > 0) {throw new NotFoundException(`Unknown skills: ${selection.missingIds.join(', ')}`);}
    this.runtimeHostConversationRecordService.writeConversationSkillState(conversationId, selection.activeSkillIds, userId);
    return toConversationSkillState(selection);
  }

  async getConversationSkillContext(conversationId: string): Promise<ConversationSkillContext> {
    const activeSkills = await this.readConversationSkills(conversationId);
    return buildConversationSkillContext(activeSkills, describeSkillPackageToolAccess(activeSkills, this.skillPackageToolsEnabled));
  }

  async listToolSources(context?: Pick<PluginCallContext, 'conversationId'>): Promise<Array<{ source: ToolSourceInfo; tools: ToolInfo[] }>> {
    const activeSkills = context?.conversationId ? await this.readConversationSkills(context.conversationId) : [];
    const enabled = this.skillPackageToolsEnabled;
    const tools = describeSkillPackageToolAccess(activeSkills, enabled).map((tool) => ({
      toolId: `skill:${SKILL_SOURCE_ID}:${tool.name}`,
      name: tool.name,
      callName: tool.callName,
      description: `[Skill] ${tool.description}`,
      parameters: tool.parameters,
      enabled,
      sourceKind: 'skill' as const,
      sourceId: SKILL_SOURCE_ID,
      sourceLabel: SKILL_SOURCE_LABEL,
      health: 'healthy' as const,
      lastError: null,
      lastCheckedAt: null,
    }) satisfies ToolInfo);
    return [{
      source: {
        kind: 'skill',
        id: SKILL_SOURCE_ID,
        label: SKILL_SOURCE_LABEL,
        enabled,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: null,
        totalTools: tools.length,
        enabledTools: enabled ? tools.length : 0,
        supportedActions: SKILL_SUPPORTED_ACTIONS,
      },
      tools,
    }];
  }

  async tryHandleMessage(input: { userId: string; conversationId: string; messageText: string }): Promise<ConversationSkillCommandResponse | null> {
    const tokens = input.messageText.trim().split(/\s+/).filter(Boolean);
    if (tokens[0] !== '/skill') {return null;}

    const subcommand = tokens[1]?.toLowerCase() ?? 'help';
    const args = tokens.slice(2);
    switch (subcommand) {
      case 'list':
      case 'show':
      case 'active':
        return buildSkillCommandResponse(await this.renderSkillList(input.userId, input.conversationId));
      case 'use':
      case 'add':
        return buildSkillCommandResponse(await this.updateSkillsFromCommand({ ...input, action: 'add', skillIds: args }));
      case 'remove':
      case 'off':
        return buildSkillCommandResponse(await this.updateSkillsFromCommand({ ...input, action: 'remove', skillIds: args }));
      case 'clear':
        return buildSkillCommandResponse(await this.updateSkillsFromCommand({ ...input, action: 'clear', skillIds: [] }));
      default:
        return buildSkillCommandResponse(SKILL_HELP_TEXT);
    }
  }

  async runPackageTool(input: { conversationId: string; toolName: SkillPackageToolName; params: JsonObject }): Promise<JsonValue> {
    return runSkillPackageTool({ activeSkills: await this.readConversationSkills(input.conversationId), discoveryOptions: this.discoveryOptions, params: input.params, toolName: input.toolName });
  }

  async runToolSourceAction(sourceId: string, action: PluginActionName): Promise<ToolSourceActionResult> {
    if (sourceId !== SKILL_SOURCE_ID) {throw new NotFoundException(`Tool source not found: skill:${sourceId}`);}
    if (!SKILL_SUPPORTED_ACTIONS.includes(action)) {throw new BadRequestException(`工具源 skill:${sourceId} 不支持治理动作 ${action}`);}
    await this.skillRegistryService.listSkills(action === 'reload' ? { refresh: true } : undefined);
    return {
      accepted: true,
      action,
      sourceKind: 'skill',
      sourceId,
      message: action === 'reload' ? 'Skill source reloaded' : 'Skill source health check passed',
    };
  }

  setSkillPackageToolsEnabled(enabled: boolean): void { this.skillPackageToolsEnabled = enabled; }

  private async readConversationSkillSelection(input: {
    conversationId: string;
    userId?: string;
    persistCleanup?: boolean;
  }): Promise<{ activeSkillIds: string[]; activeSkills: SkillDetail[] }> {
    const parsedIds = normalizeSkillIds((this.runtimeHostConversationRecordService.readConversationSkillState(input.conversationId, input.userId) as { activeSkillIds?: unknown[] }).activeSkillIds ?? []);
    const selection = resolveSkillSelection(parsedIds, await this.skillRegistryService.listSkills());
    if (input.persistCleanup && parsedIds.some((value, index) => value !== selection.activeSkillIds[index])) {
      this.runtimeHostConversationRecordService.writeConversationSkillState(input.conversationId, selection.activeSkillIds, input.userId);
    }
    return { activeSkillIds: selection.activeSkillIds, activeSkills: selection.activeSkills };
  }

  private async readConversationSkills(conversationId: string): Promise<SkillDetail[]> { return (await this.readConversationSkillSelection({ conversationId })).activeSkills; }

  private async renderSkillList(userId: string, conversationId: string): Promise<string> {
    const { activeSkills: skills } = await this.readConversationSkillSelection({
      conversationId,
      userId,
      persistCleanup: true,
    });
    return [
      `当前可用 skills（${skills.length}）：`,
      ...skills.map((skill) => `- ${skill.id} · ${skill.name} · 已激活${skill.tags.length > 0 ? ` [${skill.tags.join(', ')}]` : ''}`),
      '',
      '可用命令：/skill list | /skill use <id> | /skill remove <id> | /skill clear',
    ].join('\n');
  }

  private async updateSkillsFromCommand(input: { userId: string; conversationId: string; action: 'add' | 'remove' | 'clear'; skillIds: string[] }): Promise<string> {
    if (input.action !== 'clear' && input.skillIds.length === 0) {return SKILL_HELP_TEXT;}

    const activeSkillIds = input.action === 'clear' ? [] : (await this.getConversationSkillStateForUser(input.userId, input.conversationId)).activeSkillIds;
    const removalSet = new Set(input.skillIds);
    const nextSkillIds = input.action === 'add'
      ? [...new Set([...activeSkillIds, ...input.skillIds])]
      : input.action === 'remove'
        ? activeSkillIds.filter((skillId) => !removalSet.has(skillId))
        : [];
    const updatedState = await this.updateConversationSkillStateForUser(input.userId, input.conversationId, nextSkillIds);

    if (input.action === 'add') {return `已激活 ${updatedState.activeSkillIds.length} 个 skill：${updatedState.activeSkillIds.join(', ')}`;}
    if (input.action === 'clear') {return '已清空当前会话的所有 skills。';}
    return updatedState.activeSkillIds.length > 0 ? `已更新当前会话 skills：${updatedState.activeSkillIds.join(', ')}` : '当前会话没有激活任何 skill。';
  }
}

function buildConversationSkillContext(activeSkills: SkillDetail[], skillPackageTools: SkillPackageToolDefinition[]): ConversationSkillContext {
  const allowedToolNames = [...new Set([
    ...activeSkills.flatMap((skill) => skill.toolPolicy.allow),
    ...skillPackageTools.map((tool) => tool.callName),
  ].filter(Boolean))];
  if (activeSkills.length === 0) {return { allowedToolNames: allowedToolNames.length > 0 ? allowedToolNames : null, systemPrompt: '' };}
  const sections = activeSkills.map((skill) =>
    [
      `### ${skill.name} (${skill.id})`,
      skill.description,
      skill.content.trim() || undefined,
      ...(skill.toolPolicy.allow.length > 0 ? [`Allowed tools: ${skill.toolPolicy.allow.join(', ')}`] : []),
      ...(skill.toolPolicy.deny.length > 0 ? [`Denied tools: ${skill.toolPolicy.deny.join(', ')}`] : []),
      `Trust level: ${skill.governance.trustLevel}`,
    ].filter(Boolean).join('\n'),
  );
  const skillPackageGuidance = skillPackageTools.map((tool) => `- \`${tool.callName}\`: ${tool.description}`).join('\n');
  return {
    allowedToolNames: allowedToolNames.length > 0 ? allowedToolNames : null,
    systemPrompt: [
      '以下是当前会话已激活的 skills。它们属于高层工作流/提示资产，回答时必须同时遵守：',
      ...sections,
      ...(skillPackageGuidance ? [['你还可以使用以下 skill package 专用工具来读取当前会话已激活 skill 的附属资产：', skillPackageGuidance, '这些工具都必须显式传入 `skillId` 与相对路径。'].join('\n')] : []),
    ].join('\n\n'),
  };
}

function resolveSkillSelection<T extends { id: string }>(skillIds: string[], skills: T[]): { activeSkills: T[]; activeSkillIds: string[]; missingIds: string[] } {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const normalizedSkillIds = normalizeSkillIds(skillIds);
  const activeSkills = normalizedSkillIds.map((skillId) => skillById.get(skillId)).filter((skill): skill is T => Boolean(skill));
  return { activeSkillIds: activeSkills.map((skill) => skill.id), activeSkills, missingIds: normalizedSkillIds.filter((skillId) => !skillById.has(skillId)) };
}

function normalizeSkillIds(skillIds: readonly unknown[]): string[] {
  return [...new Set(skillIds.flatMap((rawSkillId) => {
    const skillId = typeof rawSkillId === 'string' ? rawSkillId.trim() : '';
    return skillId ? [skillId] : [];
  }))];
}

function toConversationSkillState(selection: { activeSkillIds: string[]; activeSkills: SkillDetail[] }): ConversationSkillState {
  return { activeSkillIds: selection.activeSkillIds, activeSkills: selection.activeSkills.map(({ content: _content, assets: _assets, ...summary }) => ({ ...summary, governance: { trustLevel: summary.governance.trustLevel } })) };
}
