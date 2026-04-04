import { Injectable } from '@nestjs/common';
import {
  normalizeAssistantMessageOutput,
  serializeMessageParts,
  type ChatMessagePart,
} from '@garlic-claw/shared';
import { PrismaService } from '../prisma/prisma.service';
import { touchConversationTimestamp } from './chat-message-common.helpers';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';

type MessageRecordWithMetadata = { id: string; metadataJson?: string | null } & Record<string, unknown>;

interface ChatVisionFallbackMetadataEntry { text: string; source: 'cache' | 'generated' }

type ShortCircuitedAssistantOutput = {
  assistantContent: string;
  assistantParts?: ChatMessagePart[];
  providerId: string;
  modelId: string;
};

@Injectable()
export class ChatMessageCompletionService {
  constructor(private readonly prisma: PrismaService, private readonly orchestration: ChatMessageOrchestrationService) {}

  async completeShortCircuitedAssistant(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    activePersonaId: string;
    completion: ShortCircuitedAssistantOutput;
  }) {
    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: input.completion.assistantContent,
      parts: input.completion.assistantParts,
    });
    const assistantMessage = await this.prisma.message.update({
      where: { id: input.assistantMessageId },
      data: {
        content: normalizedAssistant.content,
        partsJson: normalizedAssistant.parts.length
          ? serializeMessageParts(normalizedAssistant.parts)
          : null,
        provider: input.completion.providerId,
        model: input.completion.modelId,
        status: 'completed',
        error: null,
        toolCalls: null,
        toolResults: null,
      },
    });
    await touchConversationTimestamp(this.prisma, input.conversationId);
    const finalResult = await this.orchestration.applyFinalResponseHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: {
        assistantMessageId: input.assistantMessageId,
        conversationId: input.conversationId,
        providerId: input.completion.providerId,
        modelId: input.completion.modelId,
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
    await touchConversationTimestamp(this.prisma, input.conversationId);
    await this.orchestration.runResponseAfterSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: 'short-circuit',
      result: finalResult,
    });
    return finalAssistantMessage;
  }

  async applyVisionFallbackMetadata<
    TUserMessage extends MessageRecordWithMetadata,
    TAssistantMessage extends MessageRecordWithMetadata,
  >(input: {
    userMessage?: TUserMessage | null;
    assistantMessage: TAssistantMessage;
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[];
  }): Promise<{
    userMessage: TUserMessage | null;
    assistantMessage: TAssistantMessage;
  }> {
    const userMessage = input.userMessage ?? null;
    const metadataJson = await this.persistVisionFallbackMetadata(
      userMessage
        ? [userMessage.id, input.assistantMessage.id]
        : [input.assistantMessage.id],
      input.visionFallbackEntries,
    );
    if (!metadataJson) {
      return {
        userMessage,
        assistantMessage: input.assistantMessage,
      };
    }

    return {
      userMessage: userMessage
        ? {
            ...userMessage,
            metadataJson,
          } as TUserMessage
        : null,
      assistantMessage: {
        ...input.assistantMessage,
        metadataJson,
      } as TAssistantMessage,
    };
  }

  private async persistVisionFallbackMetadata(
    messageIds: readonly string[],
    visionFallbackEntries: ChatVisionFallbackMetadataEntry[],
  ): Promise<string | null> {
    if (visionFallbackEntries.length === 0) {
      return null;
    }

    const metadataJson = JSON.stringify({
      visionFallback: {
        state: 'completed',
        entries: visionFallbackEntries,
      },
    });
    await (messageIds.length === 1
      ? this.prisma.message.update({
          where: { id: messageIds[0] },
          data: { metadataJson },
        })
      : this.prisma.message.updateMany({
          where: {
            id: {
              in: [...messageIds],
            },
          },
          data: { metadataJson },
        }));

    return metadataJson;
  }
}
