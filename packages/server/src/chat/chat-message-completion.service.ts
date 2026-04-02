import { Injectable } from '@nestjs/common';
import type { ChatMessagePart } from '@garlic-claw/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';
import {
  normalizeAssistantMessageOutput,
  serializeMessageParts,
} from './message-parts';

type MessageRecordWithMetadata = {
  id: string;
  metadataJson?: string | null;
} & Record<string, unknown>;

interface ChatMessageMetadataValue {
  visionFallback?: {
    state: 'transcribing' | 'completed';
    entries: Array<{
      text: string;
      source: 'cache' | 'generated';
    }>;
  };
}

interface ChatVisionFallbackMetadataEntry {
  text: string;
  source: 'cache' | 'generated';
}

@Injectable()
export class ChatMessageCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestration: ChatMessageOrchestrationService,
  ) {}

  async completeShortCircuitedAssistant(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    providerId: string;
    modelId: string;
    activePersonaId: string;
    assistantContent: string;
    assistantParts?: ChatMessagePart[];
  }) {
    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.assistantContent,
      parts: input.assistantParts,
    });
    const assistantMessage = await this.prisma.message.update({
      where: { id: input.assistantMessageId },
      data: {
        content: normalizedAssistant.content,
        partsJson: normalizedAssistant.parts.length
          ? serializeMessageParts(normalizedAssistant.parts)
          : null,
        provider: input.providerId,
        model: input.modelId,
        status: 'completed',
        error: null,
        toolCalls: null,
        toolResults: null,
      },
    });
    await this.touchConversation(input.conversationId);
    const finalResult = await this.orchestration.applyFinalResponseHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: {
        assistantMessageId: input.assistantMessageId,
        conversationId: input.conversationId,
        providerId: input.providerId,
        modelId: input.modelId,
        content: normalizedAssistant.content,
        parts: normalizedAssistant.parts,
        toolCalls: [],
        toolResults: [],
      },
    });

    const serializedFinalParts = finalResult.parts.length
      ? serializeMessageParts(finalResult.parts)
      : null;
    const finalAssistantMessage = finalResult.content === assistantMessage.content
      && serializedFinalParts === ((assistantMessage as { partsJson?: string | null }).partsJson ?? null)
      && finalResult.providerId === assistantMessage.provider
      && finalResult.modelId === assistantMessage.model
      ? assistantMessage
      : await this.prisma.message.update({
        where: { id: input.assistantMessageId },
        data: {
          content: finalResult.content,
          partsJson: serializedFinalParts,
          provider: finalResult.providerId,
          model: finalResult.modelId,
          status: 'completed',
          error: null,
          toolCalls: finalResult.toolCalls.length
            ? JSON.stringify(finalResult.toolCalls)
            : null,
          toolResults: finalResult.toolResults.length
            ? JSON.stringify(finalResult.toolResults)
            : null,
        },
      });
    await this.touchConversation(input.conversationId);
    await this.orchestration.runResponseAfterSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: finalResult,
    });
    return finalAssistantMessage;
  }

  async applyVisionFallbackMetadata(input: {
    userMessage: MessageRecordWithMetadata;
    assistantMessage: MessageRecordWithMetadata;
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[];
  }) {
    if (input.visionFallbackEntries.length === 0) {
      return input;
    }

    const metadataJson = serializeChatMessageMetadata({
      visionFallback: {
        state: 'completed',
        entries: input.visionFallbackEntries,
      },
    });
    await this.prisma.message.updateMany({
      where: {
        id: {
          in: [input.userMessage.id, input.assistantMessage.id],
        },
      },
      data: {
        metadataJson,
      },
    });

    return {
      userMessage: {
        ...input.userMessage,
        metadataJson,
      },
      assistantMessage: {
        ...input.assistantMessage,
        metadataJson,
      },
    };
  }

  async applyVisionFallbackMetadataToAssistant(input: {
    assistantMessage: MessageRecordWithMetadata;
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[];
  }) {
    if (input.visionFallbackEntries.length === 0) {
      return input.assistantMessage;
    }

    const metadataJson = serializeChatMessageMetadata({
      visionFallback: {
        state: 'completed',
        entries: input.visionFallbackEntries,
      },
    });
    await this.prisma.message.update({
      where: {
        id: input.assistantMessage.id,
      },
      data: {
        metadataJson,
      },
    });

    return {
      ...input.assistantMessage,
      metadataJson,
    };
  }

  private async touchConversation(conversationId: string) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
      },
    });
  }
}

function serializeChatMessageMetadata(
  metadata: ChatMessageMetadataValue,
): string {
  return JSON.stringify(metadata);
}
