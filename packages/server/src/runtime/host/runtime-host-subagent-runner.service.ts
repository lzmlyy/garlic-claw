import type { JsonObject, JsonValue, PluginCallContext, PluginMessageTargetInfo, PluginSubagentRequest, PluginSubagentRunResult, PluginSubagentTaskDetail, PluginSubagentTaskOverview, PluginSubagentTaskSummary, SubagentAfterRunHookResult, SubagentBeforeRunHookResult } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { ToolRegistryService } from '../../execution/tool/tool-registry.service';
import { applyMutatingDispatchableHooks, runDispatchableHookChain } from '../kernel/runtime-plugin-hook-governance';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { asJsonValue, cloneJsonValue, readAssistantStreamPart, readJsonObject, readJsonStringRecord, readPluginLlmMessages } from './runtime-host-values';
import { RuntimeHostConversationMessageService } from './runtime-host-conversation-message.service';
import { RuntimeHostSubagentTaskStoreService, type RuntimeSubagentTaskRecord } from './runtime-host-subagent-task-store.service';

@Injectable()
export class RuntimeHostSubagentRunnerService {
  private readonly scheduledTaskIds = new Set<string>();

  constructor(private readonly aiModelExecutionService: AiModelExecutionService, private readonly runtimeHostConversationMessageService: RuntimeHostConversationMessageService, private readonly toolRegistryService: ToolRegistryService, @Inject(RuntimeHostPluginDispatchService) private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService, private readonly runtimeHostSubagentTaskStoreService: RuntimeHostSubagentTaskStoreService) {}

  resumePendingTasks(pluginId?: string): void {
    for (const task of this.runtimeHostSubagentTaskStoreService.listPendingTasks(pluginId)) {this.scheduleTaskExecution(task.id);}
  }

  getTask(pluginId: string, taskId: string): PluginSubagentTaskDetail { return this.runtimeHostSubagentTaskStoreService.getTask(pluginId, taskId); }

  getTaskOrThrow(taskId: string): PluginSubagentTaskDetail { return this.runtimeHostSubagentTaskStoreService.getTaskOrThrow(taskId); }

  listOverview(): PluginSubagentTaskOverview { return this.runtimeHostSubagentTaskStoreService.listOverview(); }

  listTasks(pluginId: string): PluginSubagentTaskSummary[] { return this.runtimeHostSubagentTaskStoreService.listTasks(pluginId); }

  async runSubagent(pluginId: string, context: PluginCallContext, params: JsonObject): Promise<JsonValue> { return asJsonValue(await this.executeSubagent({ context, pluginId, request: readSubagentRequest(params) })); }

  async startTask(pluginId: string, pluginDisplayName: string | undefined, context: PluginCallContext, params: JsonObject): Promise<JsonValue> {
    const request = readSubagentRequest(params);
    const writeBackTarget = readSubagentWriteBackTarget(params);
    const previewContent = request.messages.at(-1)?.content;
    const task = this.runtimeHostSubagentTaskStoreService.createTask({
      conversationRevision: writeBackTarget?.id ? this.runtimeHostConversationMessageService.readConversationRevision(writeBackTarget.id) ?? undefined : undefined,
      context,
      pluginDisplayName,
      pluginId,
      request,
      requestPreview: typeof previewContent === 'string' ? previewContent : 'structured subagent request',
      writeBackTarget,
    });
    this.scheduleTaskExecution(task.id);
    return asJsonValue(this.runtimeHostSubagentTaskStoreService.summarizeTask(task));
  }

  private async completeTaskAsync(taskId: string): Promise<void> {
    const snapshot = this.runtimeHostSubagentTaskStoreService.readTask(taskId);
    this.runtimeHostSubagentTaskStoreService.updateTask(snapshot.pluginId, taskId, markTaskRunning);
    try {
      const result = await this.executeSubagent({ context: snapshot.context, pluginId: snapshot.pluginId, request: snapshot.request });
      const writeBack = await this.writeBackResultIfNeeded(snapshot.context, result, snapshot.writeBackTarget ?? null, snapshot.writeBackConversationRevision);
      this.runtimeHostSubagentTaskStoreService.updateTask(snapshot.pluginId, taskId, (task, now) => markTaskCompleted(task, now, result, writeBack));
    } catch (error) {
      this.runtimeHostSubagentTaskStoreService.updateTask(snapshot.pluginId, taskId, (task, now) => markTaskFailed(task, now, error));
    }
  }

  private scheduleTaskExecution(taskId: string): void {
    if (this.scheduledTaskIds.has(taskId)) {return;}
    this.scheduledTaskIds.add(taskId);
    setTimeout(() => {
      this.scheduledTaskIds.delete(taskId);
      void this.completeTaskAsync(taskId);
    }, 0);
  }

  private async writeBackResultIfNeeded(context: PluginCallContext, result: PluginSubagentRunResult, target: PluginMessageTargetInfo | null, conversationRevision?: string) {
    if (!target) {return { error: null, messageId: null, status: 'skipped' as const };}
    try {
      if (conversationRevision && this.runtimeHostConversationMessageService.readConversationRevision(target.id) !== conversationRevision) {throw new Error(`Conversation revision changed: ${target.id}`);}
      const sent = await this.runtimeHostConversationMessageService.sendMessage(context, { content: result.text, model: result.modelId, provider: result.providerId, target: { id: target.id, type: target.type } });
      const messageId = readJsonObject(sent)?.id;
      return { error: null, messageId: typeof messageId === 'string' ? messageId : null, status: 'sent' as const };
    } catch (error) {
      return { error: error instanceof Error ? error.message : '后台子代理结果回写失败', messageId: null, status: 'failed' as const };
    }
  }

  private async executeSubagent(input: { context: PluginCallContext; pluginId: string; request: PluginSubagentRequest }): Promise<PluginSubagentRunResult> {
    const beforeHooks = await runDispatchableHookChain<PluginSubagentRequest, SubagentBeforeRunHookResult, PluginSubagentRunResult>({
      applyResponse: (request, response) => readSubagentBeforeRunResponse(request, response),
      hookName: 'subagent:before-run',
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (request) => asJsonValue({ context: input.context, pluginId: input.pluginId, request }) as JsonObject,
      initialState: input.request,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
    });
    if ('shortCircuitResult' in beforeHooks) {return beforeHooks.shortCircuitResult;}
    const request = beforeHooks.state;
    const tools = await this.toolRegistryService.buildToolSet({ allowedToolNames: request.toolNames, context: input.context, excludedPluginId: input.pluginId });
    const stream = this.aiModelExecutionService.streamText({
      headers: request.headers,
      maxOutputTokens: request.maxOutputTokens,
      messages: request.messages,
      modelId: request.modelId,
      providerId: request.providerId,
      providerOptions: request.providerOptions,
      system: request.system,
      tools,
      variant: request.variant,
    });
    const result = await collectSubagentRunResult({ finishReason: stream.finishReason, fullStream: stream.fullStream, modelId: stream.modelId, providerId: stream.providerId });
    return applyMutatingDispatchableHooks({
      applyMutation: (nextResult, response) => applySubagentAfterRunMutation(nextResult, response as unknown as Extract<SubagentAfterRunHookResult, { action: 'mutate' }>),
      hookName: 'subagent:after-run',
      kernel: this.runtimeHostPluginDispatchService,
      payload: result,
      mapPayload: (nextResult) => asJsonValue({ context: input.context, pluginId: input.pluginId, request, result: nextResult }) as JsonObject,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
    });
  }
}

function readSubagentRequest(params: JsonObject): PluginSubagentRequest {
  const providerOptions = readJsonObject(params.providerOptions);
  const headers = readJsonStringRecord(params.headers, 'subagent headers must be string record');
  return {
    ...(typeof params.providerId === 'string' ? { providerId: params.providerId } : {}),
    ...(typeof params.modelId === 'string' ? { modelId: params.modelId } : {}),
    ...(typeof params.system === 'string' ? { system: params.system } : {}),
    ...(Array.isArray(params.toolNames) ? { toolNames: params.toolNames.filter(isNonEmptyString) } : {}),
    ...(typeof params.variant === 'string' ? { variant: params.variant } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
    ...(typeof params.maxOutputTokens === 'number' ? { maxOutputTokens: params.maxOutputTokens } : {}),
    messages: readPluginLlmMessages(params.messages, 'subagent request requires non-empty messages'),
  };
}

function readSubagentWriteBackTarget(params: JsonObject): PluginMessageTargetInfo | null {
  const target = readJsonObject(readJsonObject(params.writeBack)?.target);
  if (!target) {return null;}
  if (target.type !== 'conversation' || typeof target.id !== 'string') {throw new BadRequestException('subagent writeBack.target is invalid');}
  return { id: target.id, ...(typeof target.label === 'string' ? { label: target.label } : {}), type: 'conversation' };
}

function applySubagentAfterRunMutation(
  nextResult: PluginSubagentRunResult,
  mutation: Extract<SubagentAfterRunHookResult, { action: 'mutate' }>,
): PluginSubagentRunResult {
  const text = typeof mutation.text === 'string' ? mutation.text : nextResult.text;
  return {
    ...cloneJsonValue(nextResult) as PluginSubagentRunResult,
    ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
    ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
    ...('finishReason' in mutation ? { finishReason: mutation.finishReason ?? undefined } : {}),
    ...(Array.isArray(mutation.toolCalls) ? { toolCalls: mutation.toolCalls } : {}),
    ...(Array.isArray(mutation.toolResults) ? { toolResults: mutation.toolResults } : {}),
    ...(typeof mutation.text === 'string' ? { message: { ...nextResult.message, content: text }, text } : {}),
  };
}

function readSubagentBeforeRunResponse(request: PluginSubagentRequest, response: SubagentBeforeRunHookResult) {
  if (response.action === 'short-circuit') {
    return {
      shortCircuitResult: {
        ...(response.finishReason !== undefined ? { finishReason: response.finishReason } : {}),
        message: { content: response.text, role: 'assistant' as const },
        modelId: response.modelId ?? request.modelId ?? 'unknown-model',
        providerId: response.providerId ?? request.providerId ?? 'unknown-provider',
        text: response.text,
        toolCalls: response.toolCalls ?? [],
        toolResults: response.toolResults ?? [],
      },
    };
  }
  if (response.action === 'pass') {return { state: cloneJsonValue(request) as PluginSubagentRequest };}
  return {
    state: {
      ...(cloneJsonValue(request) as PluginSubagentRequest),
      ...(typeof response.providerId === 'string' ? { providerId: response.providerId } : {}),
      ...(typeof response.modelId === 'string' ? { modelId: response.modelId } : {}),
      ...('system' in response ? { system: response.system ?? undefined } : {}),
      ...(Array.isArray(response.messages) ? { messages: response.messages } : {}),
      ...('toolNames' in response ? { toolNames: response.toolNames ?? undefined } : {}),
      ...('variant' in response ? { variant: response.variant ?? undefined } : {}),
      ...('providerOptions' in response ? { providerOptions: response.providerOptions ?? undefined } : {}),
      ...('headers' in response ? { headers: response.headers ?? undefined } : {}),
      ...('maxOutputTokens' in response && typeof response.maxOutputTokens === 'number' ? { maxOutputTokens: response.maxOutputTokens } : {}),
    },
  };
}

async function collectSubagentRunResult(input: { finishReason?: Promise<unknown> | unknown; fullStream: AsyncIterable<unknown>; modelId: string; providerId: string }): Promise<PluginSubagentRunResult> {
  let text = '';
  const toolCalls: PluginSubagentRunResult['toolCalls'] = [];
  const toolResults: PluginSubagentRunResult['toolResults'] = [];
  for await (const rawPart of input.fullStream) {
    const part = readAssistantStreamPart(rawPart);
    if (!part) {continue;}
    if (part.type === 'text-delta') {text += part.text; continue;}
    if (part.type === 'tool-call') {toolCalls.push({ input: asJsonValue(part.input), toolCallId: part.toolCallId, toolName: part.toolName }); continue;}
    toolResults.push({ output: asJsonValue(part.output), toolCallId: part.toolCallId, toolName: part.toolName });
  }
  const finishReason = await input.finishReason;
  return {
    ...(finishReason !== undefined ? { finishReason: finishReason === null ? null : String(finishReason) } : {}),
    message: { content: text, role: 'assistant' },
    modelId: input.modelId,
    providerId: input.providerId,
    text,
    toolCalls,
    toolResults,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function markTaskRunning(task: RuntimeSubagentTaskRecord, now: string): void { task.startedAt = task.startedAt ?? now; task.status = 'running'; }
function markTaskCompleted(task: RuntimeSubagentTaskRecord, now: string, result: PluginSubagentRunResult, writeBack: { error: string | null; messageId: string | null; status: 'failed' | 'sent' | 'skipped' }): void { task.startedAt = task.startedAt ?? now; task.status = 'completed'; task.finishedAt = now; task.error = undefined; task.result = result; task.resultPreview = result.text; task.writeBackError = writeBack.error ?? undefined; task.writeBackMessageId = writeBack.messageId ?? undefined; task.writeBackStatus = writeBack.status; }
function markTaskFailed(task: RuntimeSubagentTaskRecord, now: string, error: unknown): void { task.startedAt = task.startedAt ?? now; task.status = 'error'; task.error = error instanceof Error ? error.message : '后台子代理任务执行失败'; task.finishedAt = now; task.result = null; task.resultPreview = undefined; task.writeBackError = undefined; task.writeBackMessageId = undefined; task.writeBackStatus = 'skipped'; }
