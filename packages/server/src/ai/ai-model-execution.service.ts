import type { AiModelUsage, JsonObject, PluginLlmMessage, PluginLlmTransportMode } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, isLoopFinished, streamText, type LanguageModel, type ModelMessage, type Tool } from 'ai';
import { createRequire } from 'node:module';
import { AiProviderSettingsService } from '../ai-management/ai-provider-settings.service';
import type { StoredAiProviderConfig } from '../ai-management/ai-management.types';
import { readAssistantRawCustomBlocks, readAssistantResponseCustomBlocks, type AssistantCustomBlockEntry } from '../runtime/host/runtime-host-values';

export interface AiModelExecutionRequest {
  allowFallbackChatModels?: boolean;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
  messages: PluginLlmMessage[];
  modelId?: string;
  providerId?: string;
  providerOptions?: JsonObject;
  system?: string;
  transportMode?: PluginLlmTransportMode;
  variant?: string;
}

export interface AiModelExecutionResult {
  customBlocks?: AssistantCustomBlockEntry[];
  customBlockOrigin?: 'ai-sdk.raw' | 'ai-sdk.response-body';
  finishReason?: string | null;
  modelId: string;
  providerId: string;
  text: string;
  usage?: AiModelUsage;
}

interface AiExecutionTarget {
  modelId: string;
  provider: StoredAiProviderConfig;
}

export interface AiModelExecutionStreamResult { finishReason?: Promise<unknown> | unknown; fullStream: AsyncIterable<unknown>; modelId: string; providerId: string; }

type OpenAiCompatibleToolCallIdState = {
  generatedIds: Map<string, string>;
  streamId: string;
};

const localRequire = createRequire(__filename);

@Injectable()
export class AiModelExecutionService {
  constructor(private readonly aiProviderSettingsService: AiProviderSettingsService = new AiProviderSettingsService()) {}

  async generateText(input: AiModelExecutionRequest): Promise<AiModelExecutionResult> {
    if (input.transportMode === 'stream-collect') {
      return this.collectStreamedTextResult(input);
    }
    let lastError: unknown;
    for (const target of this.buildExecutionTargets(input)) {
      try {
        const result = await generateText(this.buildExecutionInput(input, target) as Parameters<typeof generateText>[0]);
        return {
          ...(result.response?.body
            ? { customBlocks: readAssistantResponseCustomBlocks(result.response.body) }
            : {}),
          customBlockOrigin: 'ai-sdk.response-body',
          finishReason: typeof result.finishReason === 'string' ? result.finishReason : null,
          modelId: target.modelId,
          providerId: target.provider.id,
          text: typeof result.text === 'string' ? result.text : '',
          usage: readModelUsage(result.usage, input, typeof result.text === 'string' ? result.text : ''),
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw readExecutionError(lastError, 'AI text generation failed');
  }

  streamText(input: AiModelExecutionRequest & {
    abortSignal?: AbortSignal;
    tools?: Record<string, Tool>;
  }): AiModelExecutionStreamResult {
    let lastError: unknown;
    for (const target of this.buildExecutionTargets(input)) {
      try {
        const result = this.startTextStream(input, target);

        return {
          finishReason: result.finishReason,
          fullStream: result.fullStream,
          modelId: target.modelId,
          providerId: target.provider.id,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw readExecutionError(lastError, 'AI text streaming failed');
  }

  private async collectStreamedTextResult(input: AiModelExecutionRequest): Promise<AiModelExecutionResult> {
    let lastError: unknown;
    for (const target of this.buildExecutionTargets(input)) {
      try {
        const result = this.startTextStream(input, target);
        let text = '';
        let customBlocks: AssistantCustomBlockEntry[] = [];

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            text += part.text;
            continue;
          }
          if (part.type === 'raw') {
            customBlocks = applyAssistantCustomBlockUpdates(
              customBlocks,
              readAssistantRawCustomBlocks(part),
            );
          }
        }

        const usage = readModelUsage(await result.totalUsage, input, text);

        return {
          ...(customBlocks.length > 0 ? { customBlocks } : {}),
          customBlockOrigin: 'ai-sdk.raw',
          finishReason: readFinishReason(await result.finishReason),
          modelId: target.modelId,
          providerId: target.provider.id,
          text,
          usage,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw readExecutionError(lastError, 'AI text generation failed');
  }

  private buildExecutionTargets(input: AiModelExecutionRequest): AiExecutionTarget[] {
    const primary = this.resolveExecutionTarget(input.providerId, input.modelId);
    if (!input.allowFallbackChatModels) {return [primary];}
    return [primary, ...this.aiProviderSettingsService.getHostModelRoutingConfig().fallbackChatModels
      .filter((target) => target.providerId !== primary.provider.id || target.modelId !== primary.modelId)
      .map((target) => this.resolveExecutionTarget(target.providerId, target.modelId))];
  }

  private resolveExecutionTarget(
    providerId: string | undefined,
    modelId: string | undefined,
  ): AiExecutionTarget {
    const resolvedProviderId = providerId ?? this.aiProviderSettingsService.listProviders()[0]?.id;
    if (!resolvedProviderId) {throw new Error('No provider configured');}

    const provider = this.aiProviderSettingsService.getProvider(resolvedProviderId);
    const resolvedModelId = modelId ?? provider.defaultModel ?? provider.models[0];
    if (!resolvedModelId) {throw new Error(`Provider "${provider.id}" does not have any configured model`);}
    if (!provider.apiKey) {throw new Error(`Provider "${provider.id}" is missing apiKey`);}
    if (!provider.baseUrl) {throw new Error(`Provider "${provider.id}" is missing baseUrl`);}
    return { modelId: resolvedModelId, provider };
  }

  private buildExecutionInput(input: AiModelExecutionRequest, target: AiExecutionTarget) {
    const providerOptions = buildProviderOptions(input);
    return {
      ...(input.headers ? { headers: input.headers } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
      messages: buildExecutionMessages(input.messages),
      model: this.createLanguageModel(target),
      ...(providerOptions ? { providerOptions } : {}),
      ...(input.system ? { system: input.system } : {}),
    };
  }

  private startTextStream(
    input: AiModelExecutionRequest & {
      abortSignal?: AbortSignal;
      tools?: Record<string, Tool>;
    },
    target: AiExecutionTarget,
  ): ReturnType<typeof streamText> {
    return streamText({
      ...this.buildExecutionInput(input, target),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      includeRawChunks: true,
      ...(input.tools ? { stopWhen: isLoopFinished() } : {}),
      ...(input.tools ? { tools: input.tools } : {}),
    } as Parameters<typeof streamText>[0]);
  }

  private createLanguageModel(target: AiExecutionTarget): LanguageModel {
    if (target.provider.driver === 'anthropic') {
      return createAnthropic({ apiKey: target.provider.apiKey as string, baseURL: target.provider.baseUrl })(target.modelId) as unknown as LanguageModel;
    }
    if (target.provider.driver === 'gemini') {
      const { createGoogleGenerativeAI } = localRequire('@ai-sdk/google') as {
        createGoogleGenerativeAI: (options: { apiKey: string; baseURL?: string }) => (modelId: string) => unknown;
      };
      return createGoogleGenerativeAI({ apiKey: target.provider.apiKey as string, baseURL: target.provider.baseUrl })(target.modelId) as unknown as LanguageModel;
    }
    return createOpenAI({
      apiKey: target.provider.apiKey as string,
      baseURL: target.provider.baseUrl,
      fetch: createOpenAiCompatibleFetch(target.provider.id),
      name: target.provider.id,
    }).chat(target.modelId) as unknown as LanguageModel;
  }
}

function applyAssistantCustomBlockUpdates(
  currentBlocks: AssistantCustomBlockEntry[],
  updates: AssistantCustomBlockEntry[],
): AssistantCustomBlockEntry[] {
  if (updates.length === 0) {
    return currentBlocks;
  }

  const nextBlocks = [...currentBlocks];
  for (const update of updates) {
    const blockIndex = nextBlocks.findIndex((entry) => entry.key === update.key);
    if (blockIndex < 0) {
      nextBlocks.push(update);
      continue;
    }
    nextBlocks[blockIndex] = update.kind === 'text'
      ? {
          key: update.key,
          kind: 'text',
          value: `${nextBlocks[blockIndex]?.kind === 'text' ? nextBlocks[blockIndex].value : ''}${update.value}`,
        }
      : update;
  }
  return nextBlocks;
}

function readFinishReason(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function buildExecutionMessages(messages: PluginLlmMessage[]): ModelMessage[] {
  return messages.map((message) => ({ content: buildExecutionMessageContent(message.content), role: message.role })) as unknown as ModelMessage[];
}

function buildExecutionMessageContent(
  content: PluginLlmMessage['content'],
): string | Array<{ image?: ArrayBuffer | string; mimeType?: string; text?: string; type: 'image' | 'text' }> {
  if (typeof content === 'string') {return content;}
  return content.map((part) =>
    part.type === 'text'
      ? {
          text: part.text,
          type: 'text' as const,
        }
      : {
          image: toAiSdkImageInput(part.image),
          ...(part.mimeType ? { mimeType: part.mimeType } : {}),
          type: 'image' as const,
        });
}

function buildProviderOptions(
  input: AiModelExecutionRequest,
): JsonObject | undefined {
  return input.variant ? { ...(input.providerOptions ?? {}), variant: input.variant } : input.providerOptions;
}

function readModelUsage(
  value: unknown,
  input: AiModelExecutionRequest,
  text: string,
): AiModelUsage {
  const providerUsage = readProviderUsage(value);
  if (providerUsage) {
    return providerUsage;
  }

  const inputTokens = estimateTokenCount([
    input.system ?? '',
    ...input.messages.map((message) => readMessageText(message.content)),
  ].join('\n'));
  const outputTokens = estimateTokenCount(text);
  return {
    inputTokens,
    outputTokens,
    source: 'estimated',
    totalTokens: inputTokens + outputTokens,
  };
}

function readExecutionError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function readProviderUsage(value: unknown): AiModelUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const totalTokens = readTokenNumber(value.totalTokens);
  let inputTokens = readTokenNumber(value.inputTokens);
  let outputTokens = readTokenNumber(value.outputTokens);

  if (totalTokens !== null && inputTokens !== null && outputTokens === null) {
    outputTokens = Math.max(totalTokens - inputTokens, 0);
  }
  if (totalTokens !== null && outputTokens !== null && inputTokens === null) {
    inputTokens = Math.max(totalTokens - outputTokens, 0);
  }

  if (inputTokens === null || outputTokens === null) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    source: 'provider',
    totalTokens: totalTokens ?? inputTokens + outputTokens,
  };
}

function readTokenNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.ceil(value)
    : null;
}

function readMessageText(content: PluginLlmMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((part): part is { text: string; type: 'text' } => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function estimateTokenCount(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
}

function toAiSdkImageInput(image: string): string | ArrayBuffer {
  if (!image.startsWith('data:')) {return image;}
  const matched = /^data:([^;]+);base64,(.+)$/u.exec(image);
  if (!matched) {throw new Error('Unsupported image data URL');}
  const binary = Buffer.from(matched[2], 'base64');
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}

function createOpenAiCompatibleFetch(providerId: string): typeof fetch {
  const baseFetch = globalThis.fetch.bind(globalThis);
  return async (input, init) => {
    const response = await baseFetch(input, init);
    return normalizeOpenAiCompatibleStreamResponse(response, providerId);
  };
}

function normalizeOpenAiCompatibleStreamResponse(
  response: Response,
  providerId: string,
): Response {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!response.body || !contentType.includes('text/event-stream')) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');

  const state: OpenAiCompatibleToolCallIdState = {
    generatedIds: new Map<string, string>(),
    streamId: sanitizeOpenAiCompatibleIdFragment(`${providerId}-${crypto.randomUUID()}`),
  };
  const reader = response.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = '';

  const transformedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = buffered + decoder.decode();
        if (tail.length > 0) {
          controller.enqueue(encoder.encode(normalizeOpenAiCompatibleSseLines(tail, state, true)));
        }
        controller.close();
        return;
      }

      buffered += decoder.decode(value, { stream: true });
      const lastNewlineIndex = buffered.lastIndexOf('\n');
      if (lastNewlineIndex < 0) {
        return;
      }

      const completeChunk = buffered.slice(0, lastNewlineIndex + 1);
      buffered = buffered.slice(lastNewlineIndex + 1);
      controller.enqueue(
        encoder.encode(normalizeOpenAiCompatibleSseLines(completeChunk, state, false)),
      );
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  return new Response(transformedBody, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function normalizeOpenAiCompatibleSseLines(
  chunk: string,
  state: OpenAiCompatibleToolCallIdState,
  flushTail: boolean,
): string {
  const lines = chunk.split('\n');
  if (!flushTail && !chunk.endsWith('\n')) {
    lines.pop();
  }

  return lines.map((line) => normalizeOpenAiCompatibleSseLine(line, state)).join('\n');
}

function normalizeOpenAiCompatibleSseLine(
  line: string,
  state: OpenAiCompatibleToolCallIdState,
): string {
  const trimmedLine = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (!trimmedLine.startsWith('data:')) {
    return trimmedLine;
  }

  const payload = trimmedLine.slice(5).trimStart();
  if (!payload || payload === '[DONE]') {
    return `data: ${payload}`;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return trimmedLine;
  }

  const normalized = normalizeOpenAiCompatibleChunkPayload(parsed, state);
  return normalized === parsed
    ? trimmedLine
    : `data: ${JSON.stringify(normalized)}`;
}

function normalizeOpenAiCompatibleChunkPayload(
  payload: unknown,
  state: OpenAiCompatibleToolCallIdState,
): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return payload;
  }

  let changed = false;
  const nextChoices = payload.choices.map((choice, choiceIndex) => {
    if (!isRecord(choice) || !isRecord(choice.delta) || !Array.isArray(choice.delta.tool_calls)) {
      return choice;
    }

    let choiceChanged = false;
    const nextToolCalls = choice.delta.tool_calls.map((toolCall, toolIndex) => {
      if (!isRecord(toolCall)) {
        return toolCall;
      }

      let nextToolCall = toolCall;
      const nextIndex = typeof nextToolCall.index === 'number' ? nextToolCall.index : toolIndex;
      if (nextToolCall.index !== nextIndex) {
        nextToolCall = { ...nextToolCall, index: nextIndex };
        choiceChanged = true;
      }

      if (isRecord(nextToolCall.function) && nextToolCall.type !== 'function') {
        nextToolCall = nextToolCall === toolCall
          ? { ...nextToolCall, type: 'function' }
          : { ...nextToolCall, type: 'function' };
        choiceChanged = true;
      }

      if (typeof nextToolCall.id !== 'string' || nextToolCall.id.trim().length === 0) {
        const toolCallKey = `${choiceIndex}:${nextIndex}`;
        const nextId = state.generatedIds.get(toolCallKey)
          ?? `gc-openai-tool-call-${state.streamId}-${choiceIndex}-${nextIndex}`;
        state.generatedIds.set(toolCallKey, nextId);
        nextToolCall = nextToolCall === toolCall
          ? { ...nextToolCall, id: nextId }
          : { ...nextToolCall, id: nextId };
        choiceChanged = true;
      }

      return nextToolCall;
    });

    if (!choiceChanged) {
      return choice;
    }

    changed = true;
    return {
      ...choice,
      delta: {
        ...choice.delta,
        tool_calls: nextToolCalls,
      },
    };
  });

  return changed
    ? {
        ...payload,
        choices: nextChoices,
      }
    : payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeOpenAiCompatibleIdFragment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-');
}
