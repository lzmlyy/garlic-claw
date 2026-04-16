import type {
  ChatMessagePart,
  ChatMessageStatus,
  JsonValue,
  PluginSubagentToolCall,
  PluginSubagentToolResult,
  SSEEvent,
} from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { RuntimeHostConversationMessageService } from '../runtime/host/runtime-host-conversation-message.service';
import { readAssistantStreamPart } from '../runtime/host/runtime-host-values';

export type ConversationTaskToolCall = PluginSubagentToolCall & Record<string, JsonValue>;
export type ConversationTaskToolResult = PluginSubagentToolResult & Record<string, JsonValue>;
export type ConversationTaskEvent = Extract<SSEEvent, {
  type: 'finish' | 'message-patch' | 'status' | 'text-delta' | 'tool-call' | 'tool-result';
}>;
export type ResolvedConversationTaskStreamSource = { modelId: string; providerId: string; stream: { finishReason?: Promise<unknown> | unknown; fullStream: AsyncIterable<unknown> } };
export interface CompletedConversationTaskResult { assistantMessageId: string; content: string; conversationId: string; modelId: string; parts: ChatMessagePart[]; providerId: string; toolCalls: ConversationTaskToolCall[]; toolResults: ConversationTaskToolResult[] }
export interface StartConversationTaskInput { assistantMessageId: string; conversationId: string; createStream: (abortSignal: AbortSignal) => Promise<ResolvedConversationTaskStreamSource> | ResolvedConversationTaskStreamSource; modelId: string; onComplete?: (result: CompletedConversationTaskResult) => Promise<CompletedConversationTaskResult | void> | CompletedConversationTaskResult | void; onSent?: (result: CompletedConversationTaskResult) => Promise<void> | void; providerId: string }

interface ConversationTaskHandle {
  abortController: AbortController;
  completion: Promise<void>;
  listeners: Set<(event: ConversationTaskEvent) => void>;
}

@Injectable()
export class ConversationTaskService {
  private readonly tasks = new Map<string, ConversationTaskHandle>();

  constructor(
    private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService,
  ) {}

  startTask(input: StartConversationTaskInput): void {
    if (this.tasks.has(input.assistantMessageId)) {
      throw new Error(`Conversation task already exists for message ${input.assistantMessageId}`);
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

  subscribe(messageId: string, listener: (event: ConversationTaskEvent) => void): () => void {
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
    if (!task) {return false;}
    task.abortController.abort(new Error('用户主动停止了本次生成'));
    await task.completion;
    return true;
  }

  private async runTask(task: ConversationTaskHandle, input: StartConversationTaskInput): Promise<void> {
    const state = { content: '', toolCalls: [] as ConversationTaskToolCall[], toolResults: [] as ConversationTaskToolResult[] };
    let resolvedInput = input;

    try {
      const streamSource = await input.createStream(task.abortController.signal);
      resolvedInput = { ...input, modelId: streamSource.modelId, providerId: streamSource.providerId };
      await this.persist(resolvedInput, state, 'streaming', null);
      this.emit(task, { messageId: input.assistantMessageId, status: 'streaming', type: 'status' });

      for await (const rawPart of streamSource.stream.fullStream) {
        const event = consumePart(state, input.assistantMessageId, rawPart);
        if (!event) {continue;}
        await this.persist(resolvedInput, state, 'streaming', null);
        this.emit(task, event);
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
      await this.finish(
        task,
        resolvedInput,
        state,
        'error',
        error instanceof Error ? error.message : 'Conversation generation failed',
      );
    }
  }

  private async complete(
    task: ConversationTaskHandle,
    input: Pick<StartConversationTaskInput, 'assistantMessageId' | 'conversationId' | 'modelId' | 'onComplete' | 'onSent' | 'providerId'>,
    state: { content: string; toolCalls: ConversationTaskToolCall[]; toolResults: ConversationTaskToolResult[] },
  ): Promise<void> {
    await this.persist(input, state, 'completed', null);
    const completed = buildResult(input, state);
    const patched = await input.onComplete?.(completed);
    const finalResult = patched ?? completed;

    if (patched && hasPatchedResult(completed, patched)) {
      await this.runtimeHostConversationMessageService.writeMessage(input.conversationId, input.assistantMessageId, {
        content: patched.content,
        model: patched.modelId,
        parts: patched.parts,
        provider: patched.providerId,
        status: 'completed',
        toolCalls: patched.toolCalls,
        toolResults: patched.toolResults,
      });
      this.emit(task, {
        content: patched.content,
        messageId: input.assistantMessageId,
        ...(patched.parts.length > 0 ? { parts: patched.parts } : {}),
        type: 'message-patch',
      });
    }

    this.emit(task, { messageId: input.assistantMessageId, status: 'completed', type: 'finish' });
    await input.onSent?.(finalResult);
  }

  private async finish(
    task: ConversationTaskHandle,
    input: Pick<StartConversationTaskInput, 'assistantMessageId' | 'conversationId' | 'modelId' | 'providerId'>,
    state: { content: string; toolCalls: ConversationTaskToolCall[]; toolResults: ConversationTaskToolResult[] },
    status: 'error' | 'stopped',
    error?: string,
  ): Promise<void> {
    await this.persist(input, state, status, error ?? null);
    this.emit(task, { ...(error ? { error } : {}), messageId: input.assistantMessageId, status, type: 'status' });
    this.emit(task, { messageId: input.assistantMessageId, status, type: 'finish' });
  }

  private async persist(
    input: Pick<StartConversationTaskInput, 'assistantMessageId' | 'conversationId' | 'modelId' | 'providerId'>,
    state: { content: string; toolCalls: ConversationTaskToolCall[]; toolResults: ConversationTaskToolResult[] },
    status: ChatMessageStatus,
    error: string | null,
  ): Promise<void> {
    await this.runtimeHostConversationMessageService.writeMessage(input.conversationId, input.assistantMessageId, {
      content: state.content,
      error,
      model: input.modelId,
      parts: toAssistantParts(state.content),
      provider: input.providerId,
      status,
      toolCalls: state.toolCalls,
      toolResults: state.toolResults,
    });
  }

  private emit(task: ConversationTaskHandle, event: ConversationTaskEvent): void {
    for (const listener of task.listeners) {
      listener(event);
    }
  }
}

function consumePart(
  state: { content: string; toolCalls: ConversationTaskToolCall[]; toolResults: ConversationTaskToolResult[] },
  messageId: string,
  rawPart: unknown,
): ConversationTaskEvent | null {
  const part = readAssistantStreamPart(rawPart);
  if (!part) {return null;}
  if (part.type === 'text-delta') {
    state.content += part.text;
    return { messageId, text: part.text, type: 'text-delta' };
  }
  if (part.type === 'tool-call') {
    state.toolCalls.push({ input: part.input, toolCallId: part.toolCallId, toolName: part.toolName });
    return { input: part.input, messageId, toolName: part.toolName, type: 'tool-call' };
  }
  state.toolResults.push({ output: part.output, toolCallId: part.toolCallId, toolName: part.toolName });
  return { messageId, output: part.output, toolName: part.toolName, type: 'tool-result' };
}

function buildResult(
  input: Pick<StartConversationTaskInput, 'assistantMessageId' | 'conversationId' | 'modelId' | 'providerId'>,
  state: { content: string; toolCalls: ConversationTaskToolCall[]; toolResults: ConversationTaskToolResult[] },
): CompletedConversationTaskResult {
  return {
    assistantMessageId: input.assistantMessageId,
    content: state.content.trim(),
    conversationId: input.conversationId,
    modelId: input.modelId,
    parts: toAssistantParts(state.content),
    providerId: input.providerId,
    toolCalls: state.toolCalls.map((entry) => ({ ...entry })),
    toolResults: state.toolResults.map((entry) => ({ ...entry })),
  };
}

function hasPatchedResult(original: CompletedConversationTaskResult, patched: CompletedConversationTaskResult): boolean {
  return original.content !== patched.content
    || original.providerId !== patched.providerId
    || original.modelId !== patched.modelId
    || JSON.stringify(original.parts) !== JSON.stringify(patched.parts)
    || JSON.stringify(original.toolCalls) !== JSON.stringify(patched.toolCalls)
    || JSON.stringify(original.toolResults) !== JSON.stringify(patched.toolResults);
}

function toAssistantParts(content: string): ChatMessagePart[] {
  const text = content.trim();
  return text ? [{ text, type: 'text' }] : [];
}
