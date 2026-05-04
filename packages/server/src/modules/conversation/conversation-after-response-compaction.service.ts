import type { ChatMessageMetadata, ChatMessagePart, JsonObject } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { ConversationStoreService } from '../runtime/host/conversation-store.service';
import { asJsonObject } from '../runtime/host/host-input.codec';
import {
  AUTO_COMPACTION_CONTINUE_TEXT,
  createAutoCompactionContinuationMetadata,
  type ConversationCompactionContinuationState,
} from './conversation-compaction-continuation';
import {
  ContextGovernanceService,
  type ContextCompactionRunResult,
  type DeferredInternalCommandAction,
} from './context-governance.service';

const CONTEXT_COMPACTION_COMMANDS = ['/compact', '/compress'] as const;
const CONTEXT_COMPACTION_COMMAND_MODEL = 'context-compaction-command';
const CONTEXT_COMPACTION_COMMAND_PROVIDER = 'system';
const MANUAL_COMPACTION_FAILED_REPLY = '当前上下文压缩失败，本次未替换历史。可稍后重试 /compact，或先清理部分历史后再继续。';
const MANUAL_COMPACTION_REASON_LABELS: Readonly<Record<string, string>> = {
  disabled: '当前上下文治理已关闭压缩。',
  'empty-summary': '压缩模型没有返回有效摘要。',
  'invalid-history': '当前历史结构异常，暂时无法压缩。',
  'not-enough-history': '当前可压缩历史为空，本次未执行压缩。',
  'overflow-without-compaction': '当前可发送上下文本身已超预算，现有历史没有可压缩正文。',
  'still-over-budget': '压缩后的上下文仍超过预算，本次未替换历史。',
  'threshold-not-reached': '当前上下文还未达到自动压缩阈值。',
};
const PRUNED_TOOL_OUTPUT_PLACEHOLDER = '[旧工具输出已从当前上下文裁剪]';
const PRUNE_MINIMUM_TOKENS = 20_000;
const PRUNE_PROTECT_TOKENS = 40_000;
const PRUNE_PROTECTED_TOOLS = ['skill'] as const;

type ManualCommandInput = { hasUnexpectedArgs: boolean };
export type AfterResponseCompactionContinuation = {
  content: string;
  metadata: ChatMessageMetadata;
  parts: ChatMessagePart[];
};
export type AfterResponseCompactionResult = {
  compactionTriggered: boolean;
  continuation: AfterResponseCompactionContinuation | null;
};
type CompactionMessageReceivedResult =
  | { action: 'continue' }
  | { action: 'deferred-short-circuit'; deferred: DeferredInternalCommandAction; modelId: string; providerId: string; reason: string };

@Injectable()
export class ConversationAfterResponseCompactionService {
  constructor(
    private readonly contextGovernanceService: ContextGovernanceService,
    private readonly conversationStore: ConversationStoreService,
  ) {}

  async applyMessageReceived(input: {
    content: string;
    conversationId: string;
    modelId: string;
    parts: ChatMessagePart[];
    providerId: string;
    userId?: string;
  }): Promise<CompactionMessageReceivedResult> {
    const commandInput = readContextCompactionCommandInput(input.content, input.parts);
    if (!commandInput) {
      return { action: 'continue' };
    }
    return {
      action: 'deferred-short-circuit',
      deferred: {
        commandId: 'internal.context-governance:/compact:command',
        execute: async () => this.runManualCommand({
          commandInput,
          conversationId: input.conversationId,
          modelId: input.modelId,
          providerId: input.providerId,
          userId: input.userId,
        }),
      },
      modelId: CONTEXT_COMPACTION_COMMAND_MODEL,
      providerId: CONTEXT_COMPACTION_COMMAND_PROVIDER,
      reason: 'context-compaction:command',
    };
  }

  async run(input: {
    conversationId: string;
    continuationState?: ConversationCompactionContinuationState;
    modelId: string;
    providerId: string;
    userId?: string;
  }): Promise<AfterResponseCompactionResult> {
    const compactionTriggered = await this.contextGovernanceService.rewriteHistoryAfterCompletedResponse({
      ...input,
      force: input.continuationState?.reachedContextThreshold === true,
    });
    return {
      compactionTriggered,
      continuation: compactionTriggered
        ? {
            content: AUTO_COMPACTION_CONTINUE_TEXT,
            metadata: createAutoCompactionContinuationMetadata(),
            parts: [{ text: AUTO_COMPACTION_CONTINUE_TEXT, type: 'text' }],
          }
        : null,
    };
  }

  async pruneToolOutputs(input: {
    conversationId: string;
    userId?: string;
  }): Promise<void> {
    const conversation = this.conversationStore.requireConversation(input.conversationId, input.userId);
    const nextMessages = conversation.messages.map((message) => structuredClone(message));
    let retainedToolOutputTokens = 0;
    let prunedToolOutputTokens = 0;
    let userTurns = 0;
    const toPrune: Array<{ message: Record<string, unknown>; resultIndex: number }> = [];

    loop: for (let messageIndex = nextMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const message = nextMessages[messageIndex] as Record<string, unknown>;
      if (message.role === 'user') {
        userTurns += 1;
      }
      if (userTurns < 2) {
        continue;
      }
      if (isCompactionSummaryDisplayMessage(message)) {
        break;
      }
      if (message.role !== 'assistant' || !Array.isArray(message.toolResults)) {
        continue;
      }
      const toolResults = message.toolResults as unknown[];
      for (let resultIndex = toolResults.length - 1; resultIndex >= 0; resultIndex -= 1) {
        const toolResult = toolResults[resultIndex];
        if (!isRecord(toolResult)) {
          continue;
        }
        if (isProtectedToolResult(toolResult)) {
          continue;
        }
        if (isPrunedToolOutput(toolResult.output)) {
          break loop;
        }
        const estimate = estimateToolOutputTokens(toolResult.output);
        retainedToolOutputTokens += estimate;
        if (retainedToolOutputTokens <= PRUNE_PROTECT_TOKENS) {
          continue;
        }
        prunedToolOutputTokens += estimate;
        toPrune.push({ message, resultIndex });
      }
    }

    if (toPrune.length === 0 || prunedToolOutputTokens < PRUNE_MINIMUM_TOKENS) {
      return;
    }
    for (const entry of toPrune) {
      if (!Array.isArray(entry.message.toolResults)) {
        continue;
      }
      const toolResults = entry.message.toolResults as unknown[];
      const toolResult = toolResults[entry.resultIndex];
      if (!isRecord(toolResult)) {
        continue;
      }
      toolResults[entry.resultIndex] = {
        ...toolResult,
        output: {
          kind: 'tool:text',
          value: PRUNED_TOOL_OUTPUT_PLACEHOLDER,
        },
      };
    }

    this.conversationStore.replaceMessages(
      input.conversationId,
      nextMessages.map((message) => asJsonObject(message as JsonObject)),
      input.userId,
    );
  }

  private async runManualCommand(input: {
    commandInput: ManualCommandInput;
    conversationId: string;
    modelId: string;
    providerId: string;
    userId?: string;
  }) {
    let result: ContextCompactionRunResult | null = null;
    let failureReason: string | null = null;
    if (!input.commandInput.hasUnexpectedArgs) {
      try {
        result = await this.contextGovernanceService.runCompaction({
          conversationId: input.conversationId,
          modelId: input.modelId,
          providerId: input.providerId,
          trigger: 'manual',
          userId: input.userId,
        });
      } catch (error) {
        failureReason = this.readFailureDetail(error);
      }
    }
    const assistantContent = input.commandInput.hasUnexpectedArgs
      ? '上下文压缩命令不接受额外参数。\n可用命令：/compact 或 /compress'
      : failureReason ? `${MANUAL_COMPACTION_FAILED_REPLY}\n原因：${failureReason}`
      : !result ? '本次未执行上下文压缩。'
        : result.compacted ? (result.coveredMessageCount ? `已压缩上下文，覆盖 ${result.coveredMessageCount} 条历史消息。` : '已完成上下文压缩。')
          : (MANUAL_COMPACTION_REASON_LABELS[result.reason ?? ''] ?? '本次未执行上下文压缩。');
    return {
      assistantContent,
      assistantParts: [{ text: assistantContent, type: 'text' as const }],
      modelId: CONTEXT_COMPACTION_COMMAND_MODEL,
      providerId: CONTEXT_COMPACTION_COMMAND_PROVIDER,
      reason: 'context-compaction:command',
    };
  }

  private readFailureDetail(error: unknown): string {
    return typeof error === 'string'
      ? MANUAL_COMPACTION_REASON_LABELS[error] ?? error
      : error instanceof Error
        ? MANUAL_COMPACTION_REASON_LABELS[error.message] ?? error.message
        : 'unknown';
  }
}

function readContextCompactionCommandInput(content: string, parts: ChatMessagePart[]): ManualCommandInput | null {
  if (parts.some((part) => part.type !== 'text')) {
    return null;
  }
  const normalized = content.trim();
  if (!normalized) {
    return null;
  }
  if (CONTEXT_COMPACTION_COMMANDS.includes(normalized as typeof CONTEXT_COMPACTION_COMMANDS[number])) {
    return { hasUnexpectedArgs: false };
  }
  return CONTEXT_COMPACTION_COMMANDS.some((command) => normalized.startsWith(`${command} `))
    ? { hasUnexpectedArgs: true }
    : null;
}

function estimateToolOutputTokens(output: unknown): number {
  try {
    const serialized = typeof output === 'string' ? output : JSON.stringify(output);
    return Math.max(1, Math.ceil(serialized.length / 4));
  } catch {
    return 1;
  }
}

function isPrunedToolOutput(output: unknown): boolean {
  return isRecord(output) &&
    output.kind === 'tool:text' &&
    output.value === PRUNED_TOOL_OUTPUT_PLACEHOLDER;
}

function isProtectedToolResult(toolResult: Record<string, unknown>): boolean {
  return typeof toolResult.toolName === 'string'
    && PRUNE_PROTECTED_TOOLS.includes(toolResult.toolName as typeof PRUNE_PROTECTED_TOOLS[number]);
}

function isCompactionSummaryDisplayMessage(message: Record<string, unknown>): boolean {
  if (message.role !== 'display') {
    return false;
  }
  const annotations = readMessageAnnotations(message);
  return annotations.some((annotation) => (
    annotation.owner === 'conversation.context-governance' &&
    annotation.type === 'context-compaction' &&
    isRecord(annotation.data) &&
    annotation.data.role === 'summary'
  ));
}

function readMessageAnnotations(message: Record<string, unknown>): Array<Record<string, unknown>> {
  if (isRecord(message.metadata) && Array.isArray(message.metadata.annotations)) {
    return message.metadata.annotations.filter(isRecord);
  }
  if (typeof message.metadataJson !== 'string' || !message.metadataJson.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(message.metadataJson) as unknown;
    return isRecord(parsed) && Array.isArray(parsed.annotations)
      ? parsed.annotations.filter(isRecord)
      : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
