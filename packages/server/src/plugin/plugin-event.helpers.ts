import type {
  JsonObject,
  ListPluginEventOptions,
  PluginEventLevel,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { uuidv7 } from '@garlic-claw/shared';

export function readPluginEventQuery(raw: {
  limit?: string;
  level?: string;
  type?: string;
  keyword?: string;
  cursor?: string;
}): ListPluginEventOptions {
  const limit = raw.limit ? Number(raw.limit) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    throw new BadRequestException('limit 必须是正整数');
  }

  if (raw.level && !['info', 'warn', 'error'].includes(raw.level)) {
    throw new BadRequestException('level 必须是 info / warn / error');
  }

  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(raw.level ? { level: raw.level as PluginEventLevel } : {}),
    ...(raw.type?.trim() ? { type: raw.type.trim() } : {}),
    ...(raw.keyword?.trim() ? { keyword: raw.keyword.trim() } : {}),
    ...(raw.cursor?.trim() ? { cursor: raw.cursor.trim() } : {}),
  };
}

export async function resolvePluginEventCursor(input: {
  prisma: PrismaService;
  pluginId: string;
  cursor: string;
}): Promise<{ id: string; createdAt: Date }> {
  const event = await input.prisma.pluginEvent.findUnique({
    where: {
      id: input.cursor,
    },
  });
  if (!event || event.pluginId !== input.pluginId) {
    throw new BadRequestException('无效的事件游标');
  }

  return {
    id: event.id,
    createdAt: event.createdAt,
  };
}

export async function createPluginEvent(input: {
  prisma: PrismaService;
  pluginId: string;
  type: string;
  level: PluginEventLevel;
  message: string;
  metadata?: JsonObject;
}): Promise<void> {
  await input.prisma.pluginEvent.create({
    data: {
      id: uuidv7(),
      pluginId: input.pluginId,
      type: input.type,
      level: input.level,
      message: input.message,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}
