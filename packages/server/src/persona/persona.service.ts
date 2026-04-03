import type {
  PluginPersonaCurrentInfo,
  PluginPersonaSummary,
} from '@garlic-claw/shared';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_PERSONA_DESCRIPTION,
  DEFAULT_PERSONA_ID,
  DEFAULT_PERSONA_NAME,
  DEFAULT_PERSONA_PROMPT,
} from './default-persona';

type PersonaRecord = {
  id: string;
  name: string;
  prompt: string;
  description: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Persona 宿主服务。
 *
 * 输入:
 * - 会话 ID
 * - persona ID
 *
 * 输出:
 * - 插件可见的人设摘要
 * - 当前会话的人设上下文
 *
 * 预期行为:
 * - 保障默认 persona 始终存在
 * - 统一处理“当前 persona / persona 列表 / 会话激活态”
 * - 不把 Prisma 细节暴露给插件层
 */
@Injectable()
export class PersonaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 读取当前用户在指定会话下的人设上下文。
   * @param userId 当前用户 ID
   * @param input 可选会话 ID
   * @returns 当前 persona 摘要
   */
  async getCurrentPersonaForUser(
    userId: string,
    input: {
      conversationId?: string;
    },
  ): Promise<PluginPersonaCurrentInfo> {
    if (!input.conversationId) {
      return this.getCurrentPersona({});
    }

    await this.getOwnedConversationOrThrow(userId, input.conversationId);
    return this.getCurrentPersona({
      conversationId: input.conversationId,
    });
  }

  /**
   * 列出宿主当前可用的 persona。
   * @returns persona 摘要列表
   */
  async listPersonas(): Promise<PluginPersonaSummary[]> {
    await this.ensureDefaultPersona();
    const personas = await this.prisma.persona.findMany({
      orderBy: [
        {
          isDefault: 'desc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });

    return personas.map((persona: PersonaRecord) => this.toPersonaSummary(persona));
  }

  /**
   * 读取单个 persona 摘要。
   * @param personaId persona ID
   * @returns persona 摘要
   */
  async getPersona(personaId: string): Promise<PluginPersonaSummary> {
    const persona = await this.getPersonaRecordOrThrow(personaId);
    return this.toPersonaSummary(persona);
  }

  /**
   * 读取当前上下文的人设。
   * @param input 可选会话 ID 与上下文 active persona ID
   * @returns 当前 persona 摘要
   */
  async getCurrentPersona(input: {
    conversationId?: string;
    activePersonaId?: string;
  }): Promise<PluginPersonaCurrentInfo> {
    const contextPersona = input.activePersonaId
      ? await this.getPersonaRecordOrNull(input.activePersonaId)
      : null;
    if (contextPersona) {
      return this.toCurrentPersonaInfo('context', contextPersona);
    }

    const conversationPersonaId = input.conversationId
      ? await this.getConversationActivePersonaId(input.conversationId)
      : null;
    const conversationPersona = conversationPersonaId
      ? await this.getPersonaRecordOrNull(conversationPersonaId)
      : null;
    if (conversationPersona) {
      return this.toCurrentPersonaInfo('conversation', conversationPersona);
    }

    const defaultPersona = await this.ensureDefaultPersona();
    return this.toCurrentPersonaInfo('default', defaultPersona);
  }

  /**
   * 为指定会话激活一个 persona。
   * @param conversationId 会话 ID
   * @param personaId persona ID
   * @returns 激活后的当前 persona 摘要
   */
  async activateConversationPersona(
    conversationId: string,
    personaId: string,
  ): Promise<PluginPersonaCurrentInfo> {
    const persona = await this.getPersonaRecordOrThrow(personaId);
    await this.prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        activePersonaId: persona.id,
      },
    });

    return this.toCurrentPersonaInfo('conversation', persona);
  }

  /**
   * 为当前用户拥有的会话激活一个 persona。
   * @param userId 当前用户 ID
   * @param conversationId 会话 ID
   * @param personaId persona ID
   * @returns 激活后的当前 persona 摘要
   */
  async activateConversationPersonaForUser(
    userId: string,
    conversationId: string,
    personaId: string,
  ): Promise<PluginPersonaCurrentInfo> {
    await this.getOwnedConversationOrThrow(userId, conversationId);
    return this.activateConversationPersona(conversationId, personaId);
  }

  /**
   * 读取会话当前激活的 persona ID。
   * @param conversationId 会话 ID
   * @returns persona ID；未设置时返回 null
   */
  private async getConversationActivePersonaId(
    conversationId: string,
  ): Promise<string | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        activePersonaId: true,
      },
    });

    return conversation?.activePersonaId ?? null;
  }

  /**
   * 校验会话归属，避免通过 HTTP 路由读写其他用户的 persona 状态。
   * @param userId 当前用户 ID
   * @param conversationId 会话 ID
   * @returns 会话最小信息
   */
  private async getOwnedConversationOrThrow(
    userId: string,
    conversationId: string,
  ): Promise<{
    id: string;
    userId: string;
  }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        id: true,
        userId: true,
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

  /**
   * 保障默认 persona 存在。
   * @returns 默认 persona 记录
   */
  private async ensureDefaultPersona() {
    const existing = await this.prisma.persona.findUnique({
      where: {
        id: DEFAULT_PERSONA_ID,
      },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.persona.upsert({
      where: {
        id: DEFAULT_PERSONA_ID,
      },
      update: {},
      create: {
        id: DEFAULT_PERSONA_ID,
        name: DEFAULT_PERSONA_NAME,
        prompt: DEFAULT_PERSONA_PROMPT,
        description: DEFAULT_PERSONA_DESCRIPTION,
        isDefault: true,
      },
    });
  }

  /**
   * 读取一个 persona 记录；不存在时返回 null。
   * @param personaId persona ID
   * @returns persona 记录或 null
   */
  private async getPersonaRecordOrNull(personaId: string) {
    if (personaId === DEFAULT_PERSONA_ID) {
      return this.ensureDefaultPersona();
    }

    return this.prisma.persona.findUnique({
      where: {
        id: personaId,
      },
    });
  }

  /**
   * 读取一个 persona 记录；不存在时抛错。
   * @param personaId persona ID
   * @returns persona 记录
   */
  private async getPersonaRecordOrThrow(personaId: string) {
    const persona = await this.getPersonaRecordOrNull(personaId);
    if (persona) {
      return persona;
    }

    throw new NotFoundException(`Persona not found: ${personaId}`);
  }

  /**
   * 将持久化 persona 记录裁剪成插件摘要。
   * @param persona 原始 persona 记录
   * @returns 插件可见摘要
   */
  private toPersonaSummary(persona: {
    id: string;
    name: string;
    prompt: string;
    description: string | null;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): PluginPersonaSummary {
    return {
      id: persona.id,
      name: persona.name,
      prompt: persona.prompt,
      ...(persona.description ? { description: persona.description } : {}),
      isDefault: persona.isDefault,
      createdAt: persona.createdAt.toISOString(),
      updatedAt: persona.updatedAt.toISOString(),
    };
  }

  /**
   * 将持久化 persona 记录转成“当前 persona”摘要。
   * @param source 来源
   * @param persona 原始 persona 记录
   * @returns 当前 persona 摘要
   */
  private toCurrentPersonaInfo(
    source: PluginPersonaCurrentInfo['source'],
    persona: {
      id: string;
      name: string;
      prompt: string;
      description: string | null;
      isDefault: boolean;
    },
  ): PluginPersonaCurrentInfo {
    return {
      source,
      personaId: persona.id,
      name: persona.name,
      prompt: persona.prompt,
      ...(persona.description ? { description: persona.description } : {}),
      isDefault: persona.isDefault,
    };
  }
}
