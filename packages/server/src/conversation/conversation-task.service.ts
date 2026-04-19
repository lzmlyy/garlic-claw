import type {
  ChatMessageCustomBlock,
  ChatMessageMetadata,
  ChatMessagePart,
  ChatMessageStatus,
  JsonValue,
  PluginSubagentToolCall,
  PluginSubagentToolResult,
  SSEEvent,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { RuntimeHostConversationMessageService } from '../runtime/host/runtime-host-conversation-message.service';
import {
  cloneJsonValue,
  readAssistantRawCustomBlocks,
  readAssistantStreamPart,
} from '../runtime/host/runtime-host-values';

export type ConversationTaskToolCall =
  PluginSubagentToolCall & Record<string, JsonValue>;
export type ConversationTaskToolResult =
  PluginSubagentToolResult & Record<string, JsonValue>;
export type ConversationTaskEvent = Extract<
  SSEEvent,
  {
    type:
      | 'finish'
      | 'message-metadata'
      | 'message-patch'
      | 'status'
      | 'text-delta'
      | 'tool-call'
      | 'tool-result';
  }
>;
export type ResolvedConversationTaskStreamSource = {
  modelId: string;
  providerId: string;
  stream: {
    finishReason?: Promise<unknown> | unknown;
    fullStream: AsyncIterable<unknown>;
  };
};
export interface CompletedConversationTaskResult {
  assistantMessageId: string;
  content: string;
  conversationId: string;
  metadata?: ChatMessageMetadata;
  modelId: string;
  parts: ChatMessagePart[];
  providerId: string;
  toolCalls: ConversationTaskToolCall[];
  toolResults: ConversationTaskToolResult[];
}
export interface StartConversationTaskInput {
  assistantMessageId: string;
  conversationId: string;
  createStream:
    | ((abortSignal: AbortSignal) => Promise<ResolvedConversationTaskStreamSource>)
    | ((abortSignal: AbortSignal) => ResolvedConversationTaskStreamSource);
  modelId: string;
  onComplete?:
    | ((
        result: CompletedConversationTaskResult,
      ) => Promise<CompletedConversationTaskResult | void>)
    | ((result: CompletedConversationTaskResult) => CompletedConversationTaskResult | void);
  resolveErrorMessage?: ((error: unknown) => Promise<string | null>) | ((error: unknown) => string | null);
  onSent?: ((result: CompletedConversationTaskResult) => Promise<void>) | ((result: CompletedConversationTaskResult) => void);
  providerId: string;
}

interface ConversationTaskHandle {
  abortController: AbortController;
  completion: Promise<void>;
  listeners: Set<(event: ConversationTaskEvent) => void>;
}

interface ConversationTaskState {
  content: string;
  metadata?: ChatMessageMetadata;
  toolCalls: ConversationTaskToolCall[];
  toolResults: ConversationTaskToolResult[];
}

@Injectable()
export class ConversationTaskService {
  private readonly tasks = new Map<string, ConversationTaskHandle>();

  constructor(
    private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService,
  ) {}

  startTask(input: StartConversationTaskInput): void {
    if (this.tasks.has(input.assistantMessageId)) {
      throw new Error(
        `Conversation task already exists for message ${input.assistantMessageId}`,
      );
    }
    let resolveCompletion: () => void = () => undefined;
    const task: ConversationTaskHandle = {
      abortController: new AbortController(),
      completion: new Promise<void>((resolve) => {
        resolveCompletion = resolve;
      }),
      listeners: new Set(),
    };
    this.tasks.set(input.assistantMessageId, task);
    setTimeout(() => {
      void this.runTask(task, input).finally(() => {
        this.tasks.delete(input.assistantMessageId);
        resolveCompletion();
      });
    }, 0);
  }

  subscribe(
    messageId: string,
    listener: (event: ConversationTaskEvent) => void,
  ): () => void {
    const task = this.tasks.get(messageId);
    if (!task) {
      return () => undefined;
    }
    task.listeners.add(listener);
    return () => task.listeners.delete(listener);
  }

  async waitForTask(messageId: string): Promise<void> {
    await this.tasks.get(messageId)?.completion;
  }

  async stopTask(messageId: string): Promise<boolean> {
    const task = this.tasks.get(messageId);
    if (!task) {
      return false;
    }
    task.abortController.abort(new Error('用户主动停止了本次生成'));
    await task.completion;
    return true;
  }

  private async runTask(
    task: ConversationTaskHandle,
    input: StartConversationTaskInput,
  ): Promise<void> {
    const state: ConversationTaskState = {
      content: '',
      toolCalls: [],
      toolResults: [],
    };
    let resolvedInput = input;

    try {
      const streamSource = await input.createStream(task.abortController.signal);
      resolvedInput = {
        ...input,
        modelId: streamSource.modelId,
        providerId: streamSource.providerId,
      };
      await this.persist(resolvedInput, state, 'streaming', null);
      this.emit(task, {
        messageId: input.assistantMessageId,
        status: 'streaming',
        type: 'status',
      });

      for await (const rawPart of streamSource.stream.fullStream) {
        const events = consumePart(
          state,
          input.assistantMessageId,
          resolvedInput.providerId,
          rawPart,
        );
        if (events.length === 0) {
          continue;
        }
        await this.persist(resolvedInput, state, 'streaming', null);
        for (const event of events) {
          this.emit(task, event);
        }
      }

      if (task.abortController.signal.aborted) {
        await this.finish(task, resolvedInput, state, 'stopped');
        return;
      }

      await this.complete(task, resolvedInput, state);
    } catch (error) {
      if (task.abortController.signal.aborted) {
        await this.finish(task, resolvedInput, state, 'stopped');
        return;
      }
      const resolvedErrorMessage = await input.resolveErrorMessage?.(error);
      await this.finish(
        task,
        resolvedInput,
        state,
        'error',
        resolvedErrorMessage
          ?? (error instanceof Error
            ? error.message
            : 'Conversation generation failed'),
      );
    }
  }

  private async complete(
    task: ConversationTaskHandle,
    input: Pick<
      StartConversationTaskInput,
      | 'assistantMessageId'
      | 'conversationId'
      | 'modelId'
      | 'onComplete'
      | 'onSent'
      | 'providerId'
    >,
    state: ConversationTaskState,
  ): Promise<void> {
    await this.persist(input, state, 'completed', null);
    const completed = buildResult(input, state);
    const patched = await input.onComplete?.(completed);
    const finalResult = patched ?? completed;

    if (patched && hasPatchedResult(completed, patched)) {
      await this.runtimeHostConversationMessageService.writeMessage(
        input.conversationId,
        input.assistantMessageId,
        {
          content: patched.content,
          metadata: patched.metadata,
          model: patched.modelId,
          parts: patched.parts,
          provider: patched.providerId,
          status: 'completed',
          toolCalls: patched.toolCalls,
          toolResults: patched.toolResults,
        },
      );
      this.emit(task, {
        content: patched.content,
        messageId: input.assistantMessageId,
        ...(patched.parts.length > 0 ? { parts: patched.parts } : {}),
        type: 'message-patch',
      });
    }

    this.emit(task, {
      messageId: input.assistantMessageId,
      status: 'completed',
      type: 'finish',
    });
    await input.onSent?.(finalResult);
  }

  private async finish(
    task: ConversationTaskHandle,
    input: Pick<
      StartConversationTaskInput,
      'assistantMessageId' | 'conversationId' | 'modelId' | 'providerId'
    >,
    state: ConversationTaskState,
    status: 'error' | 'stopped',
    error?: string,
  ): Promise<void> {
    await this.persist(input, state, status, error ?? null);
    this.emit(task, {
      ...(error ? { error } : {}),
      messageId: input.assistantMessageId,
      status,
      type: 'status',
    });
    this.emit(task, {
      messageId: input.assistantMessageId,
      status,
      type: 'finish',
    });
  }

  private async persist(
    input: Pick<
      StartConversationTaskInput,
      'assistantMessageId' | 'conversationId' | 'modelId' | 'providerId'
    >,
    state: ConversationTaskState,
    status: ChatMessageStatus,
    error: string | null,
  ): Promise<void> {
    await this.runtimeHostConversationMessageService.writeMessage(
      input.conversationId,
      input.assistantMessageId,
      {
        content: state.content,
        error,
        metadata: finalizeCustomBlockMetadata(state.metadata, status),
        model: input.modelId,
        parts: toAssistantParts(state.content),
        provider: input.providerId,
        status,
        toolCalls: state.toolCalls,
        toolResults: state.toolResults,
      },
    );
  }

  private emit(task: ConversationTaskHandle, event: ConversationTaskEvent): void {
    for (const listener of task.listeners) {
      listener(event);
    }
  }
}

function consumePart(
  state: ConversationTaskState,
  messageId: string,
  providerId: string,
  rawPart: unknown,
): ConversationTaskEvent[] {
  const events: ConversationTaskEvent[] = [];
  const nextMetadata = applyCustomBlockUpdates(
    state.metadata,
    providerId,
    readAssistantRawCustomBlocks(rawPart),
  );
  if (nextMetadata !== state.metadata) {
    state.metadata = nextMetadata;
    if (nextMetadata) {
      events.push({
        messageId,
        metadata: cloneJsonValue(nextMetadata),
        type: 'message-metadata',
      });
    }
  }

  const part = readAssistantStreamPart(rawPart);
  if (!part) {
    return events;
  }
  if (part.type === 'text-delta') {
    state.content += part.text;
    events.push({ messageId, text: part.text, type: 'text-delta' });
    return events;
  }
  if (part.type === 'tool-call') {
    state.toolCalls.push({
      input: part.input,
      toolCallId: part.toolCallId,
      toolName: part.toolName,
    });
    events.push({
      input: part.input,
      messageId,
      toolName: part.toolName,
      type: 'tool-call',
    });
    return events;
  }
  state.toolResults.push({
    output: part.output,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
  });
  events.push({
    messageId,
    output: part.output,
    toolName: part.toolName,
    type: 'tool-result',
  });
  return events;
}

function applyCustomBlockUpdates(
  currentMetadata: ChatMessageMetadata | undefined,
  providerId: string,
  updates: Array<
    | { key: string; kind: 'json'; value: JsonValue }
    | { key: string; kind: 'text'; value: string }
  >,
): ChatMessageMetadata | undefined {
  if (updates.length === 0) {
    return currentMetadata;
  }

  const metadata = cloneJsonValue(currentMetadata ?? {}) as ChatMessageMetadata;
  const nextBlocks = [...(metadata.customBlocks ?? [])];
  let changed = false;

  for (const update of updates) {
    const blockId = `custom-field:${update.key}`;
    const blockIndex = nextBlocks.findIndex((entry) => entry.id === blockId);
    const nextBlock =
      update.kind === 'text'
        ? mergeTextCustomBlock(
            nextBlocks[blockIndex],
            blockId,
            providerId,
            update.key,
            update.value,
          )
        : createJsonCustomBlock(blockId, providerId, update.key, update.value);

    if (blockIndex >= 0) {
      if (JSON.stringify(nextBlocks[blockIndex]) !== JSON.stringify(nextBlock)) {
        nextBlocks[blockIndex] = nextBlock;
        changed = true;
      }
      continue;
    }
    nextBlocks.push(nextBlock);
    changed = true;
  }

  if (!changed) {
    return currentMetadata;
  }
  return {
    ...metadata,
    customBlocks: nextBlocks,
  };
}

function buildResult(
  input: Pick<
    StartConversationTaskInput,
    'assistantMessageId' | 'conversationId' | 'modelId' | 'providerId'
  >,
  state: ConversationTaskState,
): CompletedConversationTaskResult {
  return {
    assistantMessageId: input.assistantMessageId,
    content: state.content.trim(),
    conversationId: input.conversationId,
    ...(state.metadata
      ? { metadata: finalizeCustomBlockMetadata(state.metadata, 'completed') }
      : {}),
    modelId: input.modelId,
    parts: toAssistantParts(state.content),
    providerId: input.providerId,
    toolCalls: state.toolCalls.map((entry) => ({ ...entry })),
    toolResults: state.toolResults.map((entry) => ({ ...entry })),
  };
}

function createJsonCustomBlock(
  blockId: string,
  providerId: string,
  key: string,
  value: JsonValue,
): ChatMessageCustomBlock {
  return {
    data: cloneJsonValue(value),
    id: blockId,
    kind: 'json',
    source: {
      key,
      origin: 'ai-sdk.raw',
      providerId,
    },
    state: 'streaming',
    title: formatCustomBlockTitle(key),
  };
}

function finalizeCustomBlockMetadata(
  metadata: ChatMessageMetadata | undefined,
  status: ChatMessageStatus,
): ChatMessageMetadata | undefined {
  if (
    !metadata?.customBlocks?.length
    || status === 'pending'
    || status === 'streaming'
  ) {
    return metadata;
  }
  return {
    ...metadata,
    customBlocks: metadata.customBlocks.map((block) => ({
      ...block,
      state: 'done',
    })),
  };
}

function hasPatchedResult(
  original: CompletedConversationTaskResult,
  patched: CompletedConversationTaskResult,
): boolean {
  return original.content !== patched.content
    || JSON.stringify(original.metadata ?? null)
      !== JSON.stringify(patched.metadata ?? null)
    || original.providerId !== patched.providerId
    || original.modelId !== patched.modelId
    || JSON.stringify(original.parts) !== JSON.stringify(patched.parts)
    || JSON.stringify(original.toolCalls) !== JSON.stringify(patched.toolCalls)
    || JSON.stringify(original.toolResults)
      !== JSON.stringify(patched.toolResults);
}

function mergeTextCustomBlock(
  currentBlock: ChatMessageCustomBlock | undefined,
  blockId: string,
  providerId: string,
  key: string,
  value: string,
): ChatMessageCustomBlock {
  const existingText = currentBlock?.kind === 'text' ? currentBlock.text : '';
  return {
    id: blockId,
    kind: 'text',
    source: {
      key,
      origin: 'ai-sdk.raw',
      providerId,
    },
    state: 'streaming',
    text: `${existingText}${value}`,
    title: formatCustomBlockTitle(key),
  };
}

function formatCustomBlockTitle(key: string): string {
  const normalized = key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return key;
  }

  return normalized
    .split(' ')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function toAssistantParts(content: string): ChatMessagePart[] {
  const text = content.trim();
  return text ? [{ text, type: 'text' }] : [];
}
