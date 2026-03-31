import type {
  ChatMessagePart,
  SkillSummary,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { SkillRegistryService } from './skill-registry.service';
import { SkillSessionService } from './skill-session.service';

interface TryHandleSkillMessageInput {
  userId: string;
  conversationId: string;
  messageText: string;
}

interface SkillCommandResponse {
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  providerId: string;
  modelId: string;
}

@Injectable()
export class SkillCommandService {
  constructor(
    private readonly skillRegistry: SkillRegistryService,
    private readonly skillSession: SkillSessionService,
  ) {}

  async tryHandleMessage(
    input: TryHandleSkillMessageInput,
  ): Promise<SkillCommandResponse | null> {
    const tokens = tokenizeCommand(input.messageText);
    if (tokens[0] !== '/skill') {
      return null;
    }

    const subcommand = tokens[1]?.toLowerCase() ?? 'help';
    const args = tokens.slice(2);

    switch (subcommand) {
      case 'list':
      case 'show':
      case 'active':
        return this.buildTextResponse(
          await this.renderSkillList(input.userId, input.conversationId),
        );
      case 'use':
      case 'add':
        return this.buildTextResponse(
          await this.activateSkills(input.userId, input.conversationId, args),
        );
      case 'remove':
      case 'off':
        return this.buildTextResponse(
          await this.removeSkills(input.userId, input.conversationId, args),
        );
      case 'clear':
        await this.skillSession.updateConversationSkillStateForUser(
          input.userId,
          input.conversationId,
          [],
        );
        return this.buildTextResponse('已清空当前会话的所有 skills。');
      default:
        return this.buildTextResponse(buildSkillHelpText());
    }
  }

  private async renderSkillList(userId: string, conversationId: string): Promise<string> {
    const [skills, state] = await Promise.all([
      this.skillRegistry.listSkillSummaries(),
      this.skillSession.getConversationSkillStateForUser(userId, conversationId),
    ]);
    const activeIds = new Set(state.activeSkillIds);
    const lines = [
      `当前可用 skills（${skills.length}）：`,
      ...skills.map((skill: SkillSummary) => {
        const status = activeIds.has(skill.id) ? '已激活' : '未激活';
        const tags = skill.tags.length > 0 ? ` [${skill.tags.join(', ')}]` : '';
        return `- ${skill.id} · ${skill.name} · ${status}${tags}`;
      }),
      '',
      '可用命令：/skill list | /skill use <id> | /skill remove <id> | /skill clear',
    ];

    return lines.join('\n');
  }

  private async activateSkills(
    userId: string,
    conversationId: string,
    skillIds: string[],
  ): Promise<string> {
    if (skillIds.length === 0) {
      return buildSkillHelpText();
    }

    const currentState = await this.skillSession.getConversationSkillStateForUser(
      userId,
      conversationId,
    );
    const nextIds = [...new Set([
      ...currentState.activeSkillIds,
      ...skillIds,
    ])];
    const updatedState = await this.skillSession.updateConversationSkillStateForUser(
      userId,
      conversationId,
      nextIds,
    );

    return `已激活 ${updatedState.activeSkillIds.length} 个 skill：${updatedState.activeSkillIds.join(', ')}`;
  }

  private async removeSkills(
    userId: string,
    conversationId: string,
    skillIds: string[],
  ): Promise<string> {
    if (skillIds.length === 0) {
      return buildSkillHelpText();
    }

    const currentState = await this.skillSession.getConversationSkillStateForUser(
      userId,
      conversationId,
    );
    const removalSet = new Set(skillIds);
    const nextIds = currentState.activeSkillIds.filter(
      (skillId: string) => !removalSet.has(skillId),
    );
    const updatedState = await this.skillSession.updateConversationSkillStateForUser(
      userId,
      conversationId,
      nextIds,
    );

    return updatedState.activeSkillIds.length > 0
      ? `已更新当前会话 skills：${updatedState.activeSkillIds.join(', ')}`
      : '当前会话没有激活任何 skill。';
  }

  private buildTextResponse(text: string): SkillCommandResponse {
    return {
      assistantContent: text,
      assistantParts: [
        {
          type: 'text',
          text,
        },
      ],
      providerId: 'system',
      modelId: 'skill-command',
    };
  }
}

function tokenizeCommand(messageText: string): string[] {
  return messageText.trim().split(/\s+/).filter(Boolean);
}

function buildSkillHelpText(): string {
  return [
    'Skill 命令用法：',
    '/skill list',
    '/skill use <id>',
    '/skill remove <id>',
    '/skill clear',
  ].join('\n');
}
