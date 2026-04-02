import type { PluginCallContext } from '@garlic-claw/shared';
import {
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { deserializeMessageParts } from '../chat/message-parts';

export function toConversationSummary(input: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    title: input.title,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function requireHostConversationRecord(input: {
  conversation: {
    id: string;
    title: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  context: PluginCallContext;
  method: string;
}) {
  if (!input.conversation) {
    const conversationId = input.context.conversationId ?? 'unknown';
    throw new NotFoundException(`Conversation not found: ${conversationId}`);
  }

  if (
    input.context.userId
    && input.conversation.userId !== input.context.userId
  ) {
    throw new ForbiddenException(`${input.method} 无权访问当前会话`);
  }

  return input.conversation;
}

export function toMemorySummary(input: {
  id: string;
  content: string;
  category: string;
  createdAt: Date;
}) {
  return {
    id: input.id,
    content: input.content,
    category: input.category,
    createdAt: input.createdAt.toISOString(),
  };
}

export function toUserSummary(input: {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    username: input.username,
    email: input.email,
    role: input.role,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function requireHostUserSummary(input: {
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  userId: string;
}) {
  if (!input.user) {
    throw new NotFoundException(`User not found: ${input.userId}`);
  }

  return toUserSummary(input.user);
}

export function toConversationMessageSummary(input: {
  id: string;
  role: string;
  content: string | null;
  partsJson: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: input.id,
    role: input.role,
    content: input.content,
    parts: deserializeMessageParts(input.partsJson),
    status: input.status,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}

export function buildConversationMessageSummaries(
  messages: Array<{
    id: string;
    role: string;
    content: string | null;
    partsJson: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
) {
  return messages.map((message) => toConversationMessageSummary(message));
}
