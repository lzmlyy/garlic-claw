import type { AiModelUsage, JsonObject, PluginLlmMessage, PluginLlmTransportMode } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, isLoopFinished, streamText, type LanguageModel, type ModelMessage, type Tool } from 'ai';
import { createRequire } from 'node:module';
import { uuidv7 } from 'uuidv7';
import { AiProviderSettingsService } from '../ai-management/ai-provider-settings.service';
import type { StoredAiProviderConfig } from '../ai-management/ai-management.types';
import { stringifyInvalidToolInput } from '../execution/invalid/invalid-tool-result';
import { resolveKnownModelToolCallName } from '../execution/tool/model-tool-call-name';
import { readAssistantRawCustomBlocks, readAssistantResponseCustomBlocks, type AssistantCustomBlockEntry } from '../runtime/host/host-input.codec';

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
  tools?: Record<string, Tool>;
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

interface AiExecutionTarget { modelId: string; provider: StoredAiProviderConfig; }
export interface AiModelExecutionStreamResult {
  finishReason?: Promise<unknown> | unknown;
  fullStream: AsyncIterable<unknown>;
  modelId: string;
  providerId: string;
  usage?: Promise<AiModelUsage | undefined>;
}

type AiModelStreamRequest = AiModelExecutionRequest & { abortSignal?: AbortSignal; tools?: Record<string, Tool> };
type AiSdkStreamTextResult = ReturnType<typeof streamText>;
type NormalizedAiSdkStreamTextResult = {
  finishReason?: Promise<unknown> | unknown;
  fullStream: AsyncIterable<unknown>;
  totalUsage?: Promise<unknown> | unknown;
};
type OpenAiCompatibleToolCallIdState = { generatedIds: Map<string, string>; streamId: string };
type NormalizedOpenAiCompatibleToolCall = { changed: boolean; toolCall: Record<string, unknown> };

const localRequire = createRequire(__filename);

@Injectable()
export class AiModelExecutionService {
  constructor(private readonly aiProviderSettingsService: AiProviderSettingsService = new AiProviderSettingsService()) {}

  async generateText(input: AiModelExecutionRequest): Promise<AiModelExecutionResult> {
    return this.runAcrossTargets(input, 'AI 文本生成失败', (target) =>
      this.readTextExecutionResult(input, target, input.transportMode === 'stream-collect'));
  }

  streamText(input: AiModelStreamRequest): AiModelExecutionStreamResult {
    return this.runAcrossTargetsSync(input, 'AI 文本流式生成失败', (target) => {
      const result = this.startTextStream(input, target);
      return {
        finishReason: result.finishReason,
        fullStream: result.fullStream,
        modelId: target.modelId,
        providerId: target.provider.id,
        usage: readSdkUsagePromise(result.totalUsage),
      };
    });
  }

  private async runAcrossTargets<T>(input: AiModelExecutionRequest, fallbackMessage: string, run: (target: AiExecutionTarget) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (const target of this.buildExecutionTargets(input)) {
      try {
        return await run(target);
      } catch (error) {
        lastError = error;
      }
    }
    throw readExecutionError(lastError, fallbackMessage);
  }

  private runAcrossTargetsSync<T>(input: AiModelExecutionRequest, fallbackMessage: string, run: (target: AiExecutionTarget) => T): T {
    let lastError: unknown;
    for (const target of this.buildExecutionTargets(input)) {
      try {
        return run(target);
      } catch (error) {
        lastError = error;
      }
    }
    throw readExecutionError(lastError, fallbackMessage);
  }

  private buildExecutionTargets(input: AiModelExecutionRequest): AiExecutionTarget[] {
    const primary = this.resolveExecutionTarget(input.providerId, input.modelId);
    return input.allowFallbackChatModels ? [primary, ...this.aiProviderSettingsService.getHostModelRoutingConfig().fallbackChatModels.filter((target) => target.providerId !== primary.provider.id || target.modelId !== primary.modelId).map((target) => this.resolveExecutionTarget(target.providerId, target.modelId))] : [primary];
  }

  private resolveExecutionTarget(providerId: string | undefined, modelId: string | undefined): AiExecutionTarget {
    const preferredProvider = providerId ? this.aiProviderSettingsService.getProvider(providerId) : this.aiProviderSettingsService.readPreferredProvider();
    if (!preferredProvider) {throw new Error('未配置可用的 provider');}
    const provider = preferredProvider, resolvedModelId = modelId ?? provider.defaultModel ?? provider.models[0];
    if (!resolvedModelId) {throw new Error(`provider "${provider.id}" 没有已配置模型`);}
    if (!provider.apiKey) {throw new Error(`provider "${provider.id}" 缺少 apiKey`);}
    if (!provider.baseUrl) {throw new Error(`provider "${provider.id}" 缺少 baseUrl`);}
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

  private buildToolExecutionOptions(tools?: Record<string, Tool>) { return tools ? { experimental_repairToolCall: this.createRepairToolCall(tools), stopWhen: isLoopFinished(), tools } : {}; }

  private async readTextExecutionResult(input: AiModelExecutionRequest, target: AiExecutionTarget, streamCollect: boolean): Promise<AiModelExecutionResult> {
    if (streamCollect) {
      const result = this.startTextStream(input, target);
      const collected = await collectAssistantStream(result.fullStream);
      return {
        ...(collected.customBlocks.length > 0 ? { customBlocks: collected.customBlocks } : {}),
        customBlockOrigin: 'ai-sdk.raw',
        finishReason: readFinishReason(await result.finishReason),
        modelId: target.modelId,
        providerId: target.provider.id,
        text: collected.text,
        usage: readModelUsage(await result.totalUsage, input, collected.text),
      };
    }
    const result = await generateText({
      ...this.buildExecutionInput(input, target),
      ...this.buildToolExecutionOptions(input.tools),
    } as Parameters<typeof generateText>[0]);
    const text = typeof result.text === 'string' ? result.text : '';
    const customBlocks = readAssistantResponseCustomBlocks(result.response?.body);
    return {
      ...(customBlocks.length > 0 ? { customBlocks } : {}),
      customBlockOrigin: 'ai-sdk.response-body',
      finishReason: readFinishReason(result.finishReason),
      modelId: target.modelId,
      providerId: target.provider.id,
      text,
      usage: readModelUsage(result.usage, input, text),
    };
  }

  private startTextStream(input: AiModelStreamRequest, target: AiExecutionTarget): NormalizedAiSdkStreamTextResult {
    return normalizeStreamResult(streamText({ ...this.buildExecutionInput(input, target), ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}), includeRawChunks: true, ...this.buildToolExecutionOptions(input.tools) } as Parameters<typeof streamText>[0]));
  }

  private createLanguageModel(target: AiExecutionTarget): LanguageModel {
    if (target.provider.driver === 'anthropic') {return createAnthropic({ apiKey: target.provider.apiKey as string, baseURL: target.provider.baseUrl })(target.modelId) as unknown as LanguageModel;}
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

  private createRepairToolCall(tools: Record<string, Tool>) {
    return async (input: { error: { message?: string; name?: string }; toolCall: { input: string; toolCallId: string; toolName: string } & Record<string, unknown> }) => {
      const repairedToolName = resolveKnownModelToolCallName(input.toolCall.toolName, Object.keys(tools));
      if (repairedToolName && repairedToolName !== input.toolCall.toolName) {
        return {
          ...input.toolCall,
          toolName: repairedToolName,
        };
      }
      if (!tools.invalid) {return null;}
      const inputText = stringifyInvalidToolInput(input.toolCall.input);
      return {
        ...input.toolCall,
        input: JSON.stringify({
          error: readRepairToolErrorMessage(input.error),
          ...(inputText ? { inputText } : {}),
          phase: readRepairToolPhase(input.error),
          tool: input.toolCall.toolName,
        }),
        toolName: 'invalid',
      };
    };
  }
}

async function collectAssistantStream(fullStream: AsyncIterable<unknown>): Promise<{ customBlocks: AssistantCustomBlockEntry[]; text: string }> {
  let text = '';
  let customBlocks: AssistantCustomBlockEntry[] = [];
  for await (const part of fullStream) {
    if (!isRecord(part) || typeof part.type !== 'string') {continue;}
    if (part.type === 'text-delta' && typeof part.text === 'string') {
      text += part.text;
      continue;
    }
    if (part.type === 'raw') {customBlocks = applyAssistantCustomBlockUpdates(customBlocks, readAssistantRawCustomBlocks(part));}
  }
  return { customBlocks, text };
}

function applyAssistantCustomBlockUpdates(currentBlocks: AssistantCustomBlockEntry[], updates: AssistantCustomBlockEntry[]): AssistantCustomBlockEntry[] {
  if (updates.length === 0) {return currentBlocks;}
  const nextBlocks = [...currentBlocks];
  for (const update of updates) {
    const blockIndex = nextBlocks.findIndex((entry) => entry.key === update.key);
    nextBlocks[blockIndex < 0 ? nextBlocks.length : blockIndex] = blockIndex < 0 || update.kind !== 'text' ? update : { key: update.key, kind: 'text', value: `${nextBlocks[blockIndex]?.kind === 'text' ? nextBlocks[blockIndex].value : ''}${update.value}` };
  }
  return nextBlocks;
}

function readFinishReason(value: unknown): string | null { return typeof value === 'string' ? value : null; }

function buildExecutionMessages(messages: PluginLlmMessage[]): ModelMessage[] { return messages.map((message) => ({ content: buildExecutionMessageContent(message.content), role: message.role })) as unknown as ModelMessage[]; }

function buildExecutionMessageContent(content: PluginLlmMessage['content']): string | Array<{ image?: ArrayBuffer | string; mimeType?: string; text?: string; type: 'image' | 'text' }> {
  return typeof content === 'string' ? content : content.map((part) => part.type === 'text' ? { text: part.text, type: 'text' as const } : { image: toAiSdkImageInput(part.image), ...(part.mimeType ? { mimeType: part.mimeType } : {}), type: 'image' as const });
}

function buildProviderOptions(input: AiModelExecutionRequest): JsonObject | undefined { return input.variant ? { ...(input.providerOptions ?? {}), variant: input.variant } : input.providerOptions; }

function readModelUsage(value: unknown, input: AiModelExecutionRequest, text: string): AiModelUsage {
  const providerUsage = normalizeAiSdkLanguageModelUsage(value);
  if (providerUsage) {return providerUsage;}
  const inputTokens = estimateTokenCount([input.system ?? '', ...input.messages.map((message) => readMessageText(message.content))].join('\n'));
  const outputTokens = estimateTokenCount(text);
  return { inputTokens, outputTokens, source: 'estimated', totalTokens: inputTokens + outputTokens };
}

function readExecutionError(error: unknown, fallback: string): Error { return error instanceof Error ? error : new Error(fallback); }

export function normalizeAiSdkLanguageModelUsage(value: unknown): AiModelUsage | null {
  const usage = readSdkUsageRecord(value);
  if (!usage) {return null;}
  const cachedInputTokens = readTokenPath(usage, [
    ['cachedInputTokens'],
    ['cacheReadInputTokens'],
    ['cache_read_input_tokens'],
    ['inputTokenDetails', 'cacheReadTokens'],
    ['inputTokenDetails', 'cachedTokens'],
    ['promptTokenDetails', 'cachedTokens'],
    ['prompt_tokens_details', 'cached_tokens'],
  ]);
  const totalTokens = readTokenPath(usage, [
    ['totalTokens'],
    ['total_tokens'],
    ['total'],
  ]);
  let inputTokens = readTokenPath(usage, [
    ['inputTokens'],
    ['input_tokens'],
    ['promptTokens'],
    ['prompt_tokens'],
  ]);
  let outputTokens = readTokenPath(usage, [
    ['outputTokens'],
    ['output_tokens'],
    ['completionTokens'],
    ['completion_tokens'],
  ]);
  if (totalTokens !== null && inputTokens !== null && outputTokens === null) {outputTokens = Math.max(totalTokens - inputTokens, 0);}
  if (totalTokens !== null && outputTokens !== null && inputTokens === null) {inputTokens = Math.max(totalTokens - outputTokens, 0);}
  if (inputTokens === null || outputTokens === null) {
    return null;
  }
  const resolvedTotalTokens = totalTokens ?? inputTokens + outputTokens;
  return {
    ...(cachedInputTokens === null ? {} : { cachedInputTokens }),
    inputTokens,
    outputTokens,
    source: 'provider',
    totalTokens: resolvedTotalTokens,
  };
}

function readSdkUsagePromise(value: unknown): Promise<AiModelUsage | undefined> | undefined { return value === undefined ? undefined : Promise.resolve(value).then((usage) => normalizeAiSdkLanguageModelUsage(usage) ?? undefined).catch(() => undefined); }
function normalizeStreamResult(result: AiSdkStreamTextResult): NormalizedAiSdkStreamTextResult {
  const finishReason = readOptionalStreamResultValue(result, 'finishReason');
  const totalUsage = readOptionalStreamResultValue(result, 'totalUsage');
  return {
    fullStream: result.fullStream,
    ...(finishReason === undefined ? {} : { finishReason: readSafeAsyncValue(finishReason) }),
    ...(totalUsage === undefined ? {} : { totalUsage: readSafeAsyncValue(totalUsage) }),
  };
}

function readSafeAsyncValue<T>(value: PromiseLike<T> | T | undefined): Promise<T | undefined> | T | undefined {
  return value === undefined ? undefined : Promise.resolve(value).catch(() => undefined);
}

function readTokenNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.ceil(value) : null; }

function readMessageText(content: PluginLlmMessage['content']): string { return typeof content === 'string' ? content : content.filter((part): part is { text: string; type: 'text' } => part.type === 'text').map((part) => part.text).join('\n'); }

function estimateTokenCount(text: string): number { return Math.ceil(Buffer.byteLength(text, 'utf8') / 4); }

function toAiSdkImageInput(image: string): string | ArrayBuffer {
  if (!image.startsWith('data:')) {return image;}
  const matched = /^data:([^;]+);base64,(.+)$/u.exec(image);
  if (!matched) {throw new Error('不支持的图片 data URL');}
  const binary = Buffer.from(matched[2], 'base64');
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
}

function createOpenAiCompatibleFetch(providerId: string): typeof fetch { const baseFetch = globalThis.fetch.bind(globalThis); return async (input, init) => normalizeOpenAiCompatibleStreamResponse(await baseFetch(input, init), providerId); }

function normalizeOpenAiCompatibleStreamResponse(response: Response, providerId: string): Response {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!response.body || !contentType.includes('text/event-stream')) {return response;}
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  const state: OpenAiCompatibleToolCallIdState = { generatedIds: new Map<string, string>(), streamId: sanitizeOpenAiCompatibleIdFragment(`${providerId}-${uuidv7()}`) };
  const reader = response.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffered = '';
  const transformedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) { flushNormalizedSseChunk(controller, encoder, buffered + decoder.decode(), state, true); controller.close(); return; }
      buffered += decoder.decode(value, { stream: true });
      const lastNewlineIndex = buffered.lastIndexOf('\n');
      if (lastNewlineIndex < 0) {return;}
      flushNormalizedSseChunk(controller, encoder, buffered.slice(0, lastNewlineIndex + 1), state, false);
      buffered = buffered.slice(lastNewlineIndex + 1);
    },
    async cancel(reason) { await reader.cancel(reason); },
  });
  return new Response(transformedBody, { headers, status: response.status, statusText: response.statusText });
}

function flushNormalizedSseChunk(controller: ReadableStreamDefaultController<Uint8Array>, encoder: InstanceType<typeof TextEncoder>, chunk: string, state: OpenAiCompatibleToolCallIdState, flushTail: boolean): void { if (chunk.length === 0) {return;} controller.enqueue(encoder.encode(normalizeOpenAiCompatibleSseLines(chunk, state, flushTail))); }

function normalizeOpenAiCompatibleSseLines(chunk: string, state: OpenAiCompatibleToolCallIdState, flushTail: boolean): string { const lines = chunk.split('\n'); if (!flushTail && !chunk.endsWith('\n')) {lines.pop();} return lines.map((line) => normalizeOpenAiCompatibleSseLine(line, state)).join('\n'); }

function normalizeOpenAiCompatibleSseLine(line: string, state: OpenAiCompatibleToolCallIdState): string {
  const trimmedLine = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (!trimmedLine.startsWith('data:')) {return trimmedLine;}
  const payload = trimmedLine.slice(5).trimStart();
  if (!payload || payload === '[DONE]') {return `data: ${payload}`;}
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return trimmedLine;
  }
  const normalized = normalizeOpenAiCompatibleChunkPayload(parsed, state);
  return normalized === parsed ? trimmedLine : `data: ${JSON.stringify(normalized)}`;
}

function normalizeOpenAiCompatibleChunkPayload(payload: unknown, state: OpenAiCompatibleToolCallIdState): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {return payload;}
  let changed = false;
  const nextChoices = payload.choices.map((choice, choiceIndex) => {
    if (!isRecord(choice) || !isRecord(choice.delta) || !Array.isArray(choice.delta.tool_calls)) {return choice;}
    let choiceChanged = false;
    const nextToolCalls = choice.delta.tool_calls.map((toolCall, toolIndex) => { const normalized = normalizeOpenAiCompatibleToolCall(toolCall, choiceIndex, toolIndex, state); choiceChanged ||= normalized.changed; return normalized.toolCall; });
    if (!choiceChanged) {return choice;}
    changed = true;
    return { ...choice, delta: { ...choice.delta, tool_calls: nextToolCalls } };
  });
  return changed ? { ...payload, choices: nextChoices } : payload;
}

function normalizeOpenAiCompatibleToolCall(toolCall: unknown, choiceIndex: number, toolIndex: number, state: OpenAiCompatibleToolCallIdState): NormalizedOpenAiCompatibleToolCall {
  if (!isRecord(toolCall)) {return { changed: false, toolCall: toolCall as Record<string, unknown> };}
  let changed = false;
  let nextToolCall = toolCall;
  const nextIndex = typeof nextToolCall.index === 'number' ? nextToolCall.index : toolIndex;
  if (nextToolCall.index !== nextIndex) {
    nextToolCall = { ...nextToolCall, index: nextIndex };
    changed = true;
  }
  if (isRecord(nextToolCall.function) && nextToolCall.type !== 'function') {
    nextToolCall = { ...nextToolCall, type: 'function' };
    changed = true;
  }
  if (typeof nextToolCall.id !== 'string' || nextToolCall.id.trim().length === 0) {
    const toolCallKey = `${choiceIndex}:${nextIndex}`;
    const nextId = state.generatedIds.get(toolCallKey) ?? `gc-openai-tool-call-${state.streamId}-${choiceIndex}-${nextIndex}`;
    state.generatedIds.set(toolCallKey, nextId);
    nextToolCall = { ...nextToolCall, id: nextId };
    changed = true;
  }
  return { changed, toolCall: nextToolCall };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function sanitizeOpenAiCompatibleIdFragment(value: string): string { return value.replace(/[^a-zA-Z0-9_-]+/g, '-'); }

function readRepairToolErrorMessage(error: { message?: string } | null | undefined): string { return typeof error?.message === 'string' && error.message.trim().length > 0 ? error.message.trim() : '工具调用不合法'; }

function readRepairToolPhase(error: { name?: string } | null | undefined): 'resolve' | 'validate' { return error?.name === 'AI_NoSuchToolError' ? 'resolve' : 'validate'; }

function readSdkUsageRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {return null;}
  const candidates: Record<string, unknown>[] = [value];
  for (const key of ['usage', 'tokenUsage', 'totalUsage']) {
    const nested = value[key];
    if (isRecord(nested)) {
      candidates.push(nested);
    }
  }
  for (const candidate of candidates) {
    if (readTokenPath(candidate, [
      ['totalTokens'],
      ['total_tokens'],
      ['inputTokens'],
      ['input_tokens'],
      ['promptTokens'],
      ['prompt_tokens'],
      ['outputTokens'],
      ['output_tokens'],
      ['completionTokens'],
      ['completion_tokens'],
    ]) !== null) {
      return candidate;
    }
  }
  return null;
}

function readTokenPath(
  record: Record<string, unknown>,
  paths: string[][],
): number | null {
  for (const path of paths) {
    let current: unknown = record;
    let resolved = true;
    for (const segment of path) {
      if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
        resolved = false;
        break;
      }
      current = current[segment];
    }
    if (!resolved) {
      continue;
    }
    const token = readTokenNumber(current);
    if (token !== null) {
      return token;
    }
  }
  return null;
}

function readOptionalStreamResultValue<
  TKey extends 'finishReason' | 'totalUsage',
>(
  result: AiSdkStreamTextResult,
  key: TKey,
): unknown {
  try {
    return (result as unknown as Record<TKey, unknown>)[key];
  } catch {
    return undefined;
  }
}
