import type { ChatMessagePart, ConversationSubagentState, JsonObject, JsonValue, PluginCallContext, PluginConversationHistoryMessage, PluginLlmMessage, PluginSubagentCloseParams, PluginSubagentDetail, PluginSubagentExecutionResult, PluginSubagentHandle, PluginSubagentOverview, PluginSubagentRequest, PluginSubagentSendInputParams, PluginSubagentSpawnParams, PluginSubagentSummary, PluginSubagentWaitParams, PluginSubagentWaitResult, SSEEvent, SubagentAfterRunHookResult, SubagentBeforeRunHookResult } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException, Optional, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { uuidv7 } from 'uuidv7';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { normalizeAiSdkLanguageModelUsage } from '../../ai/ai-model-execution.service';
import {
  type ConversationCompactionContinuationState,
} from '../../conversation/conversation-compaction-continuation';
import {
  ConversationAfterResponseCompactionService,
  type AfterResponseCompactionContinuation,
  type AfterResponseCompactionResult,
} from '../../conversation/conversation-after-response-compaction.service';
import { buildConversationVisibleModelMessages } from '../../conversation/conversation-model-visible-history';
import { ContextGovernanceService, readCompactedConversationHistory } from '../../conversation/context-governance.service';
import { ProjectSubagentTypeRegistryService } from '../../execution/project/project-subagent-type-registry.service';
import { ToolRegistryService } from '../../execution/tool/tool-registry.service';
import { applyMutatingDispatchableHooks, runDispatchableHookChain } from '../kernel/runtime-plugin-hook-governance';
import { ConversationMessageService } from './conversation-message.service';
import { ConversationStoreService, serializeConversationMessage, type RuntimeConversationRecord } from './conversation-store.service';
import { PluginDispatchService } from './plugin-dispatch.service';
import { asJsonValue, cloneJsonValue, readAssistantStreamPart, readJsonObject, readJsonStringRecord, readPluginLlmMessages, readPositiveInteger } from './host-input.codec';

type ResolvedSubagentType = ReturnType<ProjectSubagentTypeRegistryService['getType']>;
type RuntimeSubagentExecutionState = {
  abortController: AbortController;
  completion: Promise<PluginSubagentWaitResult>;
};
type SubagentConversationEvent = Extract<SSEEvent, { type: 'finish' | 'message-patch' | 'message-start' | 'status' | 'text-delta' | 'tool-call' | 'tool-result' }>;
type ResolvedSubagentExecutionResult = {
  continuationState: ConversationCompactionContinuationState;
  result: PluginSubagentExecutionResult;
};

@Injectable()
export class SubagentRunnerService {
  private readonly activeExecutions = new Map<string, RuntimeSubagentExecutionState>();
  private readonly listeners = new Map<string, Set<(event: SubagentConversationEvent) => void>>();
  private readonly scheduledExecutionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly waiters = new Map<string, Set<() => void>>();

  constructor(
    private readonly aiModelExecutionService: AiModelExecutionService,
    private readonly conversationMessages: ConversationMessageService,
    @Inject(forwardRef(() => ToolRegistryService)) private readonly toolRegistryService: ToolRegistryService,
    @Inject(PluginDispatchService) private readonly pluginDispatch: PluginDispatchService,
    private readonly projectSubagentTypeRegistryService: ProjectSubagentTypeRegistryService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly conversationStore?: ConversationStoreService,
  ) {}

  resumePendingSubagents(pluginId?: string): void {
    for (const conversation of this.listRuntimeSubagentConversations(pluginId)) {
      const subagent = conversation.subagent;
      if (!subagent) {
        continue;
      }
      if (subagent.status === 'running') {
        const interruptedAt = new Date().toISOString();
        this.writeInterruptedAssistantMessage(conversation, '服务重启时中断了正在运行的子代理');
        this.conversationStore?.updateConversationSubagent(conversation.id, (currentSubagent) => ({
          nextSubagent: currentSubagent
            ? {
                ...currentSubagent,
                error: '服务重启时中断了正在运行的子代理',
                finishedAt: interruptedAt,
                activeAssistantMessageId: undefined,
                status: 'interrupted',
              }
            : null,
          result: null,
        }));
        continue;
      }
      if (subagent.status === 'queued') {
        this.scheduleSubagentExecution(conversation.id);
      }
    }
  }

  getSubagent(pluginId: string, conversationId: string): PluginSubagentDetail {
    return this.buildSubagentDetail(this.requireSubagentConversation(conversationId, pluginId));
  }

  getSubagentOrThrow(conversationId: string): PluginSubagentDetail {
    return this.buildSubagentDetail(this.requireSubagentConversation(conversationId));
  }

  listOverview(): PluginSubagentOverview {
    return {
      subagents: this.listRuntimeSubagentConversations().map((conversation) => this.buildSubagentSummary(conversation)),
    };
  }

  listSubagents(pluginId: string): PluginSubagentSummary[] {
    return this.listRuntimeSubagentConversations(pluginId).map((conversation) => this.buildSubagentSummary(conversation));
  }

  listTypes() {
    return this.projectSubagentTypeRegistryService.listTypes();
  }

  subscribe(conversationId: string, listener: (event: SubagentConversationEvent) => void): () => void {
    const listeners = this.listeners.get(conversationId) ?? new Set<(event: SubagentConversationEvent) => void>();
    listeners.add(listener);
    this.listeners.set(conversationId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(conversationId);
      }
    };
  }

  async spawnSubagent(pluginId: string, pluginDisplayName: string | undefined, context: PluginCallContext, params: JsonObject): Promise<JsonValue> {
    const request = this.resolveEffectiveSubagentRequest(readSubagentSpawnRequest(params));
    this.assertConversationSubagentCapacity(context, params);
    const timestamp = new Date().toISOString();
    const conversation = this.conversationStore?.createConversation({
      kind: 'subagent',
      parentId: context.conversationId,
      subagent: {
        closedAt: null,
        description: request.request.description,
        finishedAt: null,
        headers: request.request.headers,
        maxOutputTokens: request.request.maxOutputTokens,
        modelId: request.request.modelId,
        ...(request.request.name ? { name: request.request.name } : {}),
        ...(pluginDisplayName ? { pluginDisplayName } : {}),
        pluginId,
        providerId: request.request.providerId,
        providerOptions: request.request.providerOptions,
        requestPreview: readSubagentRequestPreview(request.request),
        requestedAt: timestamp,
        resultPreview: undefined,
        runtimeKind: 'local',
        startedAt: null,
        status: 'queued',
        subagentType: request.request.subagentType,
        ...(request.subagentType?.name ? { subagentTypeName: request.subagentType.name } : {}),
        system: request.request.system,
        toolNames: request.request.toolNames,
        variant: request.request.variant,
      },
      title: readSubagentConversationTitle(request.request, request.subagentType?.name),
      userId: context.userId,
    }) as { id: string };
    if (!conversation?.id) {
      throw new BadRequestException('创建子代理会话失败');
    }
    this.appendConversationMessages(conversation.id, request.request.messages);
    const assistantMessageId = this.appendConversationMessages(conversation.id, [{ content: '', role: 'assistant' }], 'pending')[0];
    this.conversationStore?.updateConversationSubagent(conversation.id, (currentSubagent) => ({
      nextSubagent: currentSubagent
        ? {
            ...currentSubagent,
            activeAssistantMessageId: assistantMessageId,
          }
        : null,
      result: null,
    }));
    this.scheduleSubagentExecution(conversation.id);
    return asJsonValue(this.buildSubagentHandle(this.requireSubagentConversation(conversation.id, pluginId)));
  }

  async waitSubagent(pluginId: string, params: PluginSubagentWaitParams): Promise<JsonValue> {
    const conversation = this.requireSubagentConversation(params.conversationId, pluginId);
    const subagent = requireConversationSubagent(conversation);
    if (subagent.status !== 'queued' && subagent.status !== 'running') {
      return asJsonValue(this.buildSubagentWaitResult(conversation));
    }
    const waitForStateChange = this.awaitSubagentStateChange(conversation.id, () => {
      const currentConversation = this.requireSubagentConversation(conversation.id, pluginId);
      const currentSubagent = requireConversationSubagent(currentConversation);
      return currentSubagent.status !== 'queued' && currentSubagent.status !== 'running';
    });
    this.scheduleSubagentExecution(conversation.id);
    const timeoutMs = typeof params.timeoutMs === 'number' && params.timeoutMs > 0 ? params.timeoutMs : null;
    if (timeoutMs === null) {
      await waitForStateChange;
      return asJsonValue(this.buildSubagentWaitResult(this.requireSubagentConversation(conversation.id, pluginId)));
    }
    await Promise.race([
      waitForStateChange,
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
    return asJsonValue(this.buildSubagentWaitResult(this.requireSubagentConversation(conversation.id, pluginId)));
  }

  async sendInputSubagent(pluginId: string, context: PluginCallContext, params: PluginSubagentSendInputParams): Promise<JsonValue> {
    const conversation = this.requireSubagentConversation(params.conversationId, pluginId, context.userId);
    const subagent = requireConversationSubagent(conversation);
    if (subagent.status === 'closed') {
      throw new BadRequestException(`子代理已关闭: ${params.conversationId}`);
    }
    if (subagent.status === 'queued' || subagent.status === 'running') {
      throw new BadRequestException('当前子代理仍在运行，请先等待或中断');
    }
    const request = this.resolveEffectiveSubagentRequest({
      messages: params.messages,
      ...(subagent.name ? { name: subagent.name } : {}),
      ...(params.name ? { name: params.name } : {}),
      ...(params.description ? { description: params.description } : {}),
      ...(params.providerId ? { providerId: params.providerId } : {}),
      ...(params.modelId ? { modelId: params.modelId } : {}),
      ...(params.system ? { system: params.system } : {}),
      ...(params.toolNames ? { toolNames: params.toolNames } : {}),
      ...(params.variant ? { variant: params.variant } : {}),
      ...(params.providerOptions ? { providerOptions: params.providerOptions } : {}),
      ...(params.headers ? { headers: params.headers } : {}),
      ...(typeof params.maxOutputTokens === 'number' ? { maxOutputTokens: params.maxOutputTokens } : {}),
      ...(subagent.subagentType ? { subagentType: subagent.subagentType } : {}),
    });
    this.appendConversationMessages(conversation.id, request.request.messages);
    const assistantMessageId = this.appendConversationMessages(conversation.id, [{ content: '', role: 'assistant' }], 'pending')[0];
    this.conversationStore?.updateConversationSubagent(conversation.id, (currentSubagent) => ({
      nextSubagent: currentSubagent
        ? {
            ...currentSubagent,
            activeAssistantMessageId: assistantMessageId,
            ...(params.name ? { name: params.name } : {}),
            ...(params.description ? { description: params.description } : {}),
            error: undefined,
            finishedAt: null,
            ...(request.request.headers ? { headers: cloneJsonValue(request.request.headers) as Record<string, string> } : {}),
            ...(typeof request.request.maxOutputTokens === 'number' ? { maxOutputTokens: request.request.maxOutputTokens } : {}),
            ...(request.request.modelId ? { modelId: request.request.modelId } : {}),
            ...(request.request.providerId ? { providerId: request.request.providerId } : {}),
            ...(request.request.providerOptions ? { providerOptions: cloneJsonValue(request.request.providerOptions) } : {}),
            requestPreview: readSubagentRequestPreview(request.request),
            requestedAt: new Date().toISOString(),
            resultPreview: undefined,
            startedAt: null,
            status: 'queued',
            ...(request.request.subagentType ? { subagentType: request.request.subagentType } : {}),
            ...(request.subagentType?.name ? { subagentTypeName: request.subagentType.name } : {}),
            ...(request.request.system ? { system: request.request.system } : {}),
            ...(request.request.toolNames ? { toolNames: cloneJsonValue(request.request.toolNames) as string[] } : {}),
            ...(request.request.variant ? { variant: request.request.variant } : {}),
          }
        : null,
      result: null,
    }), context.userId);
    this.conversationStore?.writeConversationTitle(
      conversation.id,
      readSubagentConversationTitle(request.request, request.subagentType?.name),
      context.userId,
    );
    this.scheduleSubagentExecution(conversation.id);
    return asJsonValue(this.buildSubagentHandle(this.requireSubagentConversation(conversation.id, pluginId, context.userId)));
  }

  async interruptSubagent(pluginId: string, conversationId: string, userId?: string): Promise<JsonValue> {
    const conversation = this.requireSubagentConversation(conversationId, pluginId, userId);
    const execution = this.activeExecutions.get(conversation.id);
    if (execution) {
      execution.abortController.abort();
      await execution.completion.catch(() => undefined);
      return asJsonValue(this.buildSubagentHandle(this.requireSubagentConversation(conversation.id, pluginId, userId)));
    }
    this.clearScheduledExecution(conversation.id);
    const interruptedAt = new Date().toISOString();
    this.writeInterruptedAssistantMessage(conversation, '子代理已被手动中断');
    this.conversationStore?.updateConversationSubagent(conversation.id, (currentSubagent) => ({
      nextSubagent: currentSubagent
        ? {
            ...currentSubagent,
            activeAssistantMessageId: undefined,
            error: '子代理已被手动中断',
            finishedAt: interruptedAt,
            status: 'interrupted',
          }
        : null,
      result: null,
    }), userId);
    this.notifyWaiters(conversation.id);
    return asJsonValue(this.buildSubagentHandle(this.requireSubagentConversation(conversation.id, pluginId, userId)));
  }

  async closeSubagent(pluginId: string, params: PluginSubagentCloseParams, userId?: string): Promise<JsonValue> {
    await this.interruptSubagent(pluginId, params.conversationId, userId).catch(() => undefined);
    this.conversationStore?.updateConversationSubagent(params.conversationId, (currentSubagent) => ({
      nextSubagent: currentSubagent
        ? {
            ...currentSubagent,
            activeAssistantMessageId: undefined,
            closedAt: new Date().toISOString(),
            finishedAt: currentSubagent.finishedAt ?? new Date().toISOString(),
            status: 'closed',
          }
        : null,
      result: null,
    }), userId);
    this.notifyWaiters(params.conversationId);
    return asJsonValue(this.buildSubagentHandle(this.requireSubagentConversation(params.conversationId, pluginId, userId)));
  }

  private listRuntimeSubagentConversations(pluginId?: string): RuntimeConversationRecord[] {
    return (this.conversationStore?.listSubagentConversationRecords() ?? [])
      .filter((conversation) => !pluginId || conversation.subagent?.pluginId === pluginId);
  }

  private requireSubagentConversation(conversationId: string, pluginId?: string, userId?: string): RuntimeConversationRecord {
    const conversation = this.conversationStore?.requireConversation(conversationId, userId);
    if (!conversation || conversation.kind !== 'subagent' || !conversation.subagent) {
      throw new NotFoundException(`Subagent conversation not found: ${conversationId}`);
    }
    if (pluginId && conversation.subagent.pluginId !== pluginId) {
      throw new NotFoundException(`Subagent conversation not found: ${conversationId}`);
    }
    return conversation;
  }

  private buildSubagentSummary(conversation: RuntimeConversationRecord): PluginSubagentSummary {
    const subagent = requireConversationSubagent(conversation);
    return {
      closedAt: subagent.closedAt,
      conversationId: conversation.id,
      description: subagent.description,
      error: subagent.error,
      finishedAt: subagent.finishedAt,
      messageCount: conversation.messages.length,
      modelId: subagent.modelId,
      parentConversationId: conversation.parentId,
      ...(subagent.pluginDisplayName ? { pluginDisplayName: subagent.pluginDisplayName } : {}),
      pluginId: subagent.pluginId,
      providerId: subagent.providerId,
      requestPreview: subagent.requestPreview,
      ...(subagent.resultPreview ? { resultPreview: subagent.resultPreview } : {}),
      requestedAt: subagent.requestedAt,
      runtimeKind: subagent.runtimeKind,
      startedAt: subagent.startedAt,
      status: subagent.status,
      ...(subagent.subagentType ? { subagentType: subagent.subagentType } : {}),
      ...(subagent.subagentTypeName ? { subagentTypeName: subagent.subagentTypeName } : {}),
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      ...(conversation.userId ? { userId: conversation.userId } : {}),
    };
  }

  private buildSubagentHandle(conversation: RuntimeConversationRecord): PluginSubagentHandle {
    const subagent = requireConversationSubagent(conversation);
    return {
      conversationId: conversation.id,
      ...(subagent.name ? { name: subagent.name } : {}),
      status: subagent.status,
      title: conversation.title,
    };
  }

  private buildSubagentWaitResult(conversation: RuntimeConversationRecord): PluginSubagentWaitResult {
    const executionResult = readConversationExecutionResult(conversation);
    const subagent = requireConversationSubagent(conversation);
    const resultText = executionResult?.text ?? subagent.resultPreview;
    return {
      ...this.buildSubagentHandle(conversation),
      ...(subagent.error ? { error: subagent.error } : {}),
      ...(typeof resultText === 'string' ? { result: resultText } : {}),
    };
  }

  private buildSubagentDetail(conversation: RuntimeConversationRecord): PluginSubagentDetail {
    return {
      ...this.buildSubagentSummary(conversation),
      context: createSubagentContext(conversation),
      request: {
        ...(conversation.subagent?.name ? { name: conversation.subagent.name } : {}),
        ...(conversation.subagent?.description ? { description: conversation.subagent.description } : {}),
        ...(conversation.subagent?.subagentType ? { subagentType: conversation.subagent.subagentType } : {}),
        ...(conversation.subagent?.providerId ? { providerId: conversation.subagent.providerId } : {}),
        ...(conversation.subagent?.modelId ? { modelId: conversation.subagent.modelId } : {}),
        ...(conversation.subagent?.system ? { system: conversation.subagent.system } : {}),
        messages: this.buildSubagentRequestMessages(conversation),
        ...(conversation.subagent?.toolNames ? { toolNames: cloneJsonValue(conversation.subagent.toolNames) as string[] } : {}),
        ...(conversation.subagent?.variant ? { variant: conversation.subagent.variant } : {}),
        ...(conversation.subagent?.providerOptions ? { providerOptions: cloneJsonValue(conversation.subagent.providerOptions) as JsonObject } : {}),
        ...(conversation.subagent?.headers ? { headers: cloneJsonValue(conversation.subagent.headers) as Record<string, string> } : {}),
        ...(typeof conversation.subagent?.maxOutputTokens === 'number' ? { maxOutputTokens: conversation.subagent.maxOutputTokens } : {}),
      },
      result: readConversationExecutionResult(conversation),
    };
  }

  private assertConversationSubagentCapacity(context: PluginCallContext, params: JsonObject): void {
    const maxConversationSubagents = readPositiveInteger(params, 'maxConversationSubagents');
    if (!context.conversationId || !maxConversationSubagents) {
      return;
    }
    const count = (this.conversationStore?.listChildConversations(context.conversationId) as Array<{ kind?: string }> | undefined)
      ?.filter((conversation) => conversation.kind === 'subagent')
      .length ?? 0;
    if (count >= maxConversationSubagents) {
      throw new BadRequestException(`当前会话最多允许 ${maxConversationSubagents} 个子代理会话，已达到上限`);
    }
  }

  private scheduleSubagentExecution(conversationId: string): void {
    if (this.activeExecutions.has(conversationId) || this.scheduledExecutionTimers.has(conversationId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.scheduledExecutionTimers.delete(conversationId);
      void this.executeSubagentConversation(conversationId).catch(() => undefined);
    }, 0);
    this.scheduledExecutionTimers.set(conversationId, timer);
  }

  private async executeSubagentConversation(conversationId: string): Promise<PluginSubagentWaitResult> {
    const active = this.activeExecutions.get(conversationId);
    if (active) {
      return active.completion;
    }
    const abortController = new AbortController();
    const completion = this.runSubagentConversation(conversationId, abortController.signal)
      .finally(() => {
        this.activeExecutions.delete(conversationId);
        this.notifyWaiters(conversationId);
      });
    this.activeExecutions.set(conversationId, { abortController, completion });
    return completion;
  }

  private async runSubagentConversation(conversationId: string, abortSignal: AbortSignal): Promise<PluginSubagentWaitResult> {
    const conversation = this.requireSubagentConversation(conversationId);
    const subagent = requireConversationSubagent(conversation);
    if (subagent.status === 'closed' || subagent.status === 'interrupted') {
      return this.buildSubagentWaitResult(conversation);
    }
    this.conversationStore?.updateConversationSubagent(conversation.id, (currentSubagent) => ({
      nextSubagent: currentSubagent
        ? {
            ...currentSubagent,
            error: undefined,
            finishedAt: null,
            startedAt: currentSubagent.startedAt ?? new Date().toISOString(),
            status: 'running',
          }
        : null,
      result: null,
    }));
    let assistantMessageId = requireConversationSubagent(this.requireSubagentConversation(conversation.id)).activeAssistantMessageId
      ?? this.appendConversationMessages(conversation.id, [{ content: '', role: 'assistant' }], 'pending')[0];
    try {
      while (true) {
        const refreshed = this.requireSubagentConversation(conversation.id);
        this.emit(refreshed.id, { messageId: assistantMessageId, status: 'streaming', type: 'status' });
        const execution = normalizeResolvedSubagentExecution(await this.executeSubagent({
          abortSignal,
          context: createSubagentContext(refreshed),
          pluginId: subagent.pluginId,
          request: this.buildSubagentDetail(refreshed).request,
          onTextDelta: ({ delta, text }) => {
            this.conversationMessages.writeMessage(refreshed.id, assistantMessageId, { content: `${text}…`, status: 'streaming' });
            this.emit(refreshed.id, { messageId: assistantMessageId, text: delta, type: 'text-delta' });
          },
          onToolCall: (toolCall) => {
            this.emit(refreshed.id, { ...toolCall, messageId: assistantMessageId, type: 'tool-call' });
          },
          onToolResult: (toolResult) => {
            this.emit(refreshed.id, { ...toolResult, messageId: assistantMessageId, type: 'tool-result' });
          },
        }));
        const { result } = execution;
        const nextParts = result.message.content ? [{ text: result.message.content, type: 'text' as const }] : [];
        this.conversationMessages.writeMessage(refreshed.id, assistantMessageId, {
          content: result.text,
          model: result.modelId,
          parts: nextParts,
          provider: result.providerId,
          status: 'completed',
          toolCalls: result.toolCalls as unknown as JsonValue[],
          toolResults: result.toolResults as unknown as JsonValue[],
        });
        this.emit(refreshed.id, {
          content: result.text,
          messageId: assistantMessageId,
          ...(nextParts.length > 0 ? { parts: nextParts } : {}),
          type: 'message-patch',
        });
        this.emit(refreshed.id, { messageId: assistantMessageId, status: 'completed', type: 'status' });
        this.emit(refreshed.id, { messageId: assistantMessageId, status: 'completed', type: 'finish' });
        const compaction = await this.runSubagentPostCompletionCompaction({
          conversationId: refreshed.id,
          continuationState: execution.continuationState,
          modelId: result.modelId,
          providerId: result.providerId,
          userId: refreshed.userId,
        });
        if (compaction.continuation) {
          assistantMessageId = this.queueSubagentAutoCompactionContinuation({
            conversationId: refreshed.id,
            continuation: compaction.continuation,
            modelId: result.modelId,
            providerId: result.providerId,
            userId: refreshed.userId,
          });
          continue;
        }
        await this.pruneSubagentToolOutputs(refreshed.id, refreshed.userId);
        this.conversationStore?.updateConversationSubagent(refreshed.id, (currentSubagent) => ({
          nextSubagent: currentSubagent
            ? {
                ...currentSubagent,
                activeAssistantMessageId: undefined,
                error: undefined,
                finishedAt: new Date().toISOString(),
                modelId: result.modelId,
                providerId: result.providerId,
                resultPreview: result.text,
                startedAt: currentSubagent.startedAt ?? new Date().toISOString(),
                status: 'completed',
              }
            : null,
          result: null,
        }));
        return this.buildSubagentWaitResult(this.requireSubagentConversation(refreshed.id, subagent.pluginId));
      }
    } catch (error) {
      const message = abortSignal.aborted
        ? '子代理已被手动中断'
        : error instanceof Error
          ? error.message
          : '子代理执行失败';
      this.conversationMessages.writeMessage(conversation.id, assistantMessageId, {
        content: message,
        error: message,
        status: abortSignal.aborted ? 'stopped' : 'error',
      });
      this.conversationStore?.updateConversationSubagent(conversation.id, (currentSubagent) => ({
        nextSubagent: currentSubagent
          ? {
              ...currentSubagent,
              activeAssistantMessageId: undefined,
              error: message,
              finishedAt: new Date().toISOString(),
              startedAt: currentSubagent.startedAt ?? new Date().toISOString(),
              status: abortSignal.aborted ? 'interrupted' : 'error',
            }
          : null,
        result: null,
      }));
      this.emit(conversation.id, {
        content: message,
        messageId: assistantMessageId,
        parts: [{ text: message, type: 'text' }],
        type: 'message-patch',
      });
      this.emit(conversation.id, {
        error: message,
        messageId: assistantMessageId,
        status: abortSignal.aborted ? 'stopped' : 'error',
        type: 'status',
      });
      this.emit(conversation.id, {
        messageId: assistantMessageId,
        status: abortSignal.aborted ? 'stopped' : 'error',
        type: 'finish',
      });
      return this.buildSubagentWaitResult(this.requireSubagentConversation(conversation.id, subagent.pluginId));
    }
  }

  private async runSubagentPostCompletionCompaction(input: {
    conversationId: string;
    continuationState: ConversationCompactionContinuationState;
    modelId: string;
    providerId: string;
    userId?: string;
  }): Promise<AfterResponseCompactionResult> {
    try {
      return await this.readAfterResponseCompactionService()?.run(input) ?? { compactionTriggered: false, continuation: null };
    } catch {
      // 上下文治理服务内部会自行记录失败并阻断后续轮次，这里不能把已完成子代理改写成错误态。
      return { compactionTriggered: false, continuation: null };
    }
  }

  private queueSubagentAutoCompactionContinuation(input: {
    conversationId: string;
    continuation: AfterResponseCompactionContinuation;
    modelId: string;
    providerId: string;
    userId?: string;
  }): string {
    const userMessage = this.conversationMessages.createMessage(input.conversationId, {
      content: input.continuation.content,
      metadata: input.continuation.metadata,
      model: input.modelId,
      parts: input.continuation.parts,
      provider: input.providerId,
      role: 'user',
      status: 'completed',
    });
    const assistantMessage = this.conversationMessages.createMessage(input.conversationId, {
      content: '',
      model: input.modelId,
      parts: [],
      provider: input.providerId,
      role: 'assistant',
      status: 'pending',
    });
    const assistantMessageId = typeof assistantMessage.id === 'string' ? assistantMessage.id : '';
    this.conversationStore?.updateConversationSubagent(input.conversationId, (currentSubagent) => ({
      nextSubagent: currentSubagent
        ? {
            ...currentSubagent,
            activeAssistantMessageId: assistantMessageId || currentSubagent.activeAssistantMessageId,
            error: undefined,
            finishedAt: null,
            modelId: input.modelId,
            providerId: input.providerId,
            resultPreview: undefined,
            startedAt: currentSubagent.startedAt ?? new Date().toISOString(),
            status: 'running',
          }
        : null,
      result: null,
    }), input.userId);
    if (!assistantMessageId) {
      throw new BadRequestException('创建自动续跑 assistant 消息失败');
    }
    const serializedAssistantMessage = serializeConversationMessage(assistantMessage as unknown as JsonObject) as unknown as Extract<
      SubagentConversationEvent,
      { type: 'message-start' }
    >['assistantMessage'];
    const serializedUserMessage = serializeConversationMessage(userMessage as unknown as JsonObject) as unknown as Extract<
      SubagentConversationEvent,
      { type: 'message-start' }
    >['userMessage'];
    this.emit(input.conversationId, {
      assistantMessage: serializedAssistantMessage,
      type: 'message-start',
      userMessage: serializedUserMessage,
    });
    return assistantMessageId;
  }

  private emit(conversationId: string, event: SubagentConversationEvent): void {
    for (const listener of this.listeners.get(conversationId) ?? []) {
      listener(event);
    }
  }

  private readAfterResponseCompactionService(): ConversationAfterResponseCompactionService | undefined {
    return this.moduleRef.get(ConversationAfterResponseCompactionService, { strict: false });
  }

  private readContextGovernanceService(): { isAboveAutoCompactionThreshold: (input: { modelId: string; providerId: string; totalTokens: number }) => boolean } | undefined {
    return this.moduleRef.get(ContextGovernanceService, { strict: false });
  }

  private buildSubagentRequestMessages(conversation: RuntimeConversationRecord): PluginLlmMessage[] {
    const history = this.conversationStore?.readConversationHistory(conversation.id, conversation.userId) as {
      messages?: PluginConversationHistoryMessage[];
    } | null | undefined;
    if (Array.isArray(history?.messages)) {
      return buildConversationVisibleModelMessages(
        readCompactedConversationHistory(history.messages, true),
      ).map((message) => ({
        content: Array.isArray(message.content)
          ? cloneJsonValue(message.content) as ChatMessagePart[]
          : message.content,
        role: message.role,
      }));
    }
    return conversation.messages.flatMap((message) => {
      const role = typeof message.role === 'string' ? message.role : '';
      if (role !== 'assistant' && role !== 'system' && role !== 'user') {
        return [];
      }
      const parts = Array.isArray(message.parts) ? cloneJsonValue(message.parts) as unknown as ChatMessagePart[] : [];
      const content = parts.length > 0 ? parts : typeof message.content === 'string' ? message.content : '';
      return [{ content, role }];
    });
  }

  private async pruneSubagentToolOutputs(conversationId: string, userId?: string): Promise<void> {
    try {
      await this.readAfterResponseCompactionService()?.pruneToolOutputs({ conversationId, userId });
    } catch {
      // 旧工具输出裁剪失败不应反写已完成子代理状态。
    }
  }

  private async executeSubagent(input: {
    abortSignal: AbortSignal;
    context: PluginCallContext;
    onTextDelta?: (entry: { delta: string; text: string }) => void;
    onToolCall?: (entry: { input: JsonValue; toolCallId: string; toolName: string }) => void;
    onToolResult?: (entry: { output: JsonValue; toolCallId: string; toolName: string }) => void;
    pluginId: string;
    request: PluginSubagentRequest;
  }): Promise<ResolvedSubagentExecutionResult> {
    const beforeHooks = await runDispatchableHookChain<PluginSubagentRequest, SubagentBeforeRunHookResult, PluginSubagentExecutionResult>({
      applyResponse: (request, response) => readSubagentBeforeRunResponse(request, response),
      hookName: 'subagent:before-run',
      kernel: this.pluginDispatch,
      mapPayload: (request) => asJsonValue({ context: input.context, pluginId: input.pluginId, request }) as JsonObject,
      initialState: cloneJsonValue(input.request) as PluginSubagentRequest,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
    });
    if ('shortCircuitResult' in beforeHooks) {
      return {
        continuationState: {
          hasAssistantTextOutput: false,
          hasToolActivity: false,
        },
        result: beforeHooks.shortCircuitResult,
      };
    }
    const request = beforeHooks.state;
    const stream = this.aiModelExecutionService.streamText({
      abortSignal: input.abortSignal,
      headers: request.headers,
      maxOutputTokens: request.maxOutputTokens,
      messages: request.messages,
      modelId: request.modelId,
      providerId: request.providerId,
      providerOptions: request.providerOptions,
      system: request.system,
      tools: await this.toolRegistryService.buildToolSet({ allowedToolNames: request.toolNames, context: input.context, excludedPluginId: input.pluginId, abortSignal: input.abortSignal }),
      variant: request.variant,
    });
    const collected = await collectSubagentRunResult({
      contextGovernanceService: this.readContextGovernanceService(),
      finishReason: stream.finishReason,
      fullStream: stream.fullStream,
      modelId: stream.modelId,
      onTextDelta: input.onTextDelta,
      onToolCall: input.onToolCall,
      onToolResult: input.onToolResult,
      providerId: stream.providerId,
      usage: stream.usage,
    });
    return {
      continuationState: collected.continuationState,
      result: await applyMutatingDispatchableHooks({
      applyMutation: (nextResult, response) => applySubagentAfterRunMutation(nextResult, response as unknown as Extract<SubagentAfterRunHookResult, { action: 'mutate' }>),
      hookName: 'subagent:after-run',
      kernel: this.pluginDispatch,
      payload: collected.result,
      mapPayload: (nextResult) => asJsonValue({ context: input.context, pluginId: input.pluginId, request, result: nextResult }) as JsonObject,
      readContext: () => input.context,
      excludedPluginId: input.pluginId,
      }),
    };
  }

  private appendConversationMessages(conversationId: string, messages: PluginLlmMessage[], status: 'completed' | 'pending' = 'completed'): string[] {
    if (messages.some((message) => message.role === 'tool')) {
      throw new BadRequestException('子代理会话暂不支持直接写入 tool 角色消息');
    }
    const conversation = this.conversationStore?.requireConversation(conversationId);
    if (!conversation) {
      throw new NotFoundException(`Conversation not found: ${conversationId}`);
    }
    const timestamp = new Date().toISOString();
    const nextMessages = [
      ...conversation.messages,
      ...messages.map((message) => createStoredConversationMessage(message, timestamp, status)),
    ];
    this.conversationStore?.replaceMessages(conversationId, nextMessages, conversation.userId);
    return nextMessages.slice(-messages.length).map((message) => String(message.id));
  }

  private awaitSubagentStateChange(conversationId: string, shouldResolveImmediately?: () => boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      const waiters = this.waiters.get(conversationId) ?? new Set<() => void>();
      const handler = () => {
        waiters.delete(handler);
        if (waiters.size === 0) {
          this.waiters.delete(conversationId);
        }
        resolve();
      };
      waiters.add(handler);
      this.waiters.set(conversationId, waiters);
      if (shouldResolveImmediately?.()) {
        handler();
      }
    });
  }

  private notifyWaiters(conversationId: string): void {
    for (const resolve of this.waiters.get(conversationId) ?? []) {
      resolve();
    }
  }

  private clearScheduledExecution(conversationId: string): void {
    const timer = this.scheduledExecutionTimers.get(conversationId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.scheduledExecutionTimers.delete(conversationId);
  }

  private writeInterruptedAssistantMessage(conversation: RuntimeConversationRecord, errorMessage: string): void {
    const targetMessageId = readConversationActiveAssistantMessageId(conversation);
    if (!targetMessageId) {
      return;
    }
    this.conversationMessages.writeMessage(conversation.id, targetMessageId, {
      error: errorMessage,
      status: 'stopped',
    });
  }

  private resolveEffectiveSubagentRequest(request: PluginSubagentRequest): { request: PluginSubagentRequest; subagentType: ResolvedSubagentType } {
    const nextRequest = cloneJsonValue(request) as PluginSubagentRequest;
    if (!request.subagentType) {
      return { request: nextRequest, subagentType: null };
    }
    const normalizedSubagentType = normalizeSubagentTypeId(request.subagentType);
    const subagentType = this.projectSubagentTypeRegistryService.getType(normalizedSubagentType);
    if (!subagentType) {
      throw new BadRequestException(`Unknown subagent type: ${request.subagentType}`);
    }
    return {
      request: {
        ...nextRequest,
        subagentType: normalizedSubagentType,
        ...(subagentType.providerId && !request.providerId ? { providerId: subagentType.providerId } : {}),
        ...(subagentType.modelId && !request.modelId ? { modelId: subagentType.modelId } : {}),
        ...(subagentType.system && !request.system ? { system: subagentType.system } : {}),
        ...(subagentType.toolNames && !request.toolNames ? { toolNames: cloneJsonValue(subagentType.toolNames) as string[] } : {}),
      },
      subagentType,
    };
  }
}

function readSubagentSpawnRequest(params: JsonObject): PluginSubagentSpawnParams {
  const providerOptions = readJsonObject(params.providerOptions);
  const headers = readJsonStringRecord(params.headers, 'subagent headers 必须是字符串键值对');
  return {
    ...(typeof params.name === 'string' && params.name.trim() ? { name: params.name.trim() } : {}),
    ...(typeof params.description === 'string' && params.description.trim() ? { description: params.description.trim() } : {}),
    ...(typeof params.subagentType === 'string' && params.subagentType.trim() ? { subagentType: params.subagentType.trim() } : {}),
    ...(typeof params.providerId === 'string' ? { providerId: params.providerId } : {}),
    ...(typeof params.modelId === 'string' ? { modelId: params.modelId } : {}),
    ...(typeof params.system === 'string' ? { system: params.system } : {}),
    ...(Array.isArray(params.toolNames) ? { toolNames: params.toolNames.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) } : {}),
    ...(typeof params.variant === 'string' ? { variant: params.variant } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
    ...(typeof params.maxOutputTokens === 'number' ? { maxOutputTokens: params.maxOutputTokens } : {}),
    ...(typeof params.maxConversationSubagents === 'number' ? { maxConversationSubagents: params.maxConversationSubagents } : {}),
    messages: readPluginLlmMessages(params.messages, 'subagent.spawn 需要非空 messages', undefined, 'subagent'),
  };
}

function createSubagentContext(conversation: RuntimeConversationRecord): PluginCallContext {
  return {
    ...(conversation.activePersonaId ? { activePersonaId: conversation.activePersonaId } : {}),
    ...(conversation.subagent?.modelId ? { activeModelId: conversation.subagent.modelId } : {}),
    ...(conversation.subagent?.providerId ? { activeProviderId: conversation.subagent.providerId } : {}),
    conversationId: conversation.id,
    source: 'http-route',
    userId: conversation.userId,
  };
}

function readConversationExecutionResult(conversation: RuntimeConversationRecord): PluginSubagentExecutionResult | null {
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (message.role !== 'assistant') {
      continue;
    }
    return {
      ...(message.finishReason !== undefined ? { finishReason: message.finishReason === null ? null : String(message.finishReason) } : {}),
      message: { content: typeof message.content === 'string' ? message.content : '', role: 'assistant' },
      modelId: typeof message.model === 'string' ? message.model : conversation.subagent?.modelId ?? 'unknown-model',
      providerId: typeof message.provider === 'string' ? message.provider : conversation.subagent?.providerId ?? 'unknown-provider',
      text: typeof message.content === 'string' ? message.content : '',
      toolCalls: readStoredToolCalls(message.toolCalls),
      toolResults: readStoredToolResults(message.toolResults),
    };
  }
  return null;
}

function readConversationActiveAssistantMessageId(conversation: RuntimeConversationRecord): string | null {
  if (typeof conversation.subagent?.activeAssistantMessageId === 'string' && conversation.subagent.activeAssistantMessageId.trim()) {
    return conversation.subagent.activeAssistantMessageId;
  }
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    const message = conversation.messages[index];
    if (message.role !== 'assistant') {
      continue;
    }
    if (message.status === 'pending' || message.status === 'streaming') {
      return typeof message.id === 'string' ? message.id : null;
    }
  }
  return null;
}

function createStoredConversationMessage(message: PluginLlmMessage, timestamp: string, status: 'completed' | 'pending'): JsonObject {
  const normalizedContent = normalizePluginMessageContent(message.content);
  return {
    content: normalizedContent.content,
    createdAt: timestamp,
    id: uuidv7(),
    ...(normalizedContent.parts.length > 0 ? { parts: asJsonValue(normalizedContent.parts) as unknown as JsonObject['parts'] } : {}),
    role: message.role,
    status,
    updatedAt: timestamp,
  };
}

function normalizePluginMessageContent(content: string | ChatMessagePart[]): { content: string; parts: ChatMessagePart[] } {
  if (Array.isArray(content)) {
    return {
      content: content.filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text').map((part) => part.text).join('\n'),
      parts: cloneJsonValue(content) as ChatMessagePart[],
    };
  }
  return {
    content,
    parts: content.trim() ? [{ text: content, type: 'text' }] : [],
  };
}

function requireConversationSubagent(conversation: RuntimeConversationRecord): ConversationSubagentState {
  if (!conversation.subagent) {
    throw new NotFoundException(`Subagent conversation not found: ${conversation.id}`);
  }
  return conversation.subagent;
}

function normalizeSubagentTypeId(subagentType: string): string {
  const normalized = subagentType.trim();
  return normalized === 'default' ? 'general' : normalized;
}

function readSubagentRequestPreview(request: Pick<PluginSubagentRequest, 'description' | 'messages'>): string {
  const content = request.messages.at(-1)?.content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    if (text) {
      return text;
    }
  }
  return request.description ?? 'structured subagent request';
}

function readSubagentConversationTitle(
  request: Pick<PluginSubagentRequest, 'name' | 'description'>,
  subagentTypeName?: string,
): string {
  return request.name?.trim()
    || request.description?.trim()
    || subagentTypeName?.trim()
    || '子代理';
}

function readStoredToolCalls(value: unknown): PluginSubagentExecutionResult['toolCalls'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const object = readJsonObject(entry);
    return object && typeof object.toolCallId === 'string' && typeof object.toolName === 'string'
      ? [{ input: asJsonValue(object.input ?? null), toolCallId: object.toolCallId, toolName: object.toolName }]
      : [];
  });
}

function readStoredToolResults(value: unknown): PluginSubagentExecutionResult['toolResults'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const object = readJsonObject(entry);
    return object && typeof object.toolCallId === 'string' && typeof object.toolName === 'string'
      ? [{ output: asJsonValue(object.output ?? null), toolCallId: object.toolCallId, toolName: object.toolName }]
      : [];
  });
}

function readSubagentBeforeRunResponse(request: PluginSubagentRequest, response: SubagentBeforeRunHookResult): { shortCircuitResult: PluginSubagentExecutionResult } | { state: PluginSubagentRequest } {
  if (response.action === 'short-circuit') {
    return {
      shortCircuitResult: {
        ...(response.finishReason !== undefined ? { finishReason: response.finishReason } : {}),
        message: { content: response.text, role: 'assistant' },
        modelId: response.modelId ?? request.modelId ?? 'unknown-model',
        providerId: response.providerId ?? request.providerId ?? 'unknown-provider',
        text: response.text,
        toolCalls: response.toolCalls ?? [],
        toolResults: response.toolResults ?? [],
      },
    };
  }
  if (response.action === 'pass') {
    return { state: cloneJsonValue(request) as PluginSubagentRequest };
  }
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

function applySubagentAfterRunMutation(nextResult: PluginSubagentExecutionResult, mutation: Extract<SubagentAfterRunHookResult, { action: 'mutate' }>): PluginSubagentExecutionResult {
  const text = typeof mutation.text === 'string' ? mutation.text : nextResult.text;
  return {
    ...(cloneJsonValue(nextResult) as PluginSubagentExecutionResult),
    ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
    ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
    ...('finishReason' in mutation ? { finishReason: mutation.finishReason ?? undefined } : {}),
    ...(Array.isArray(mutation.toolCalls) ? { toolCalls: mutation.toolCalls } : {}),
    ...(Array.isArray(mutation.toolResults) ? { toolResults: mutation.toolResults } : {}),
    ...(typeof mutation.text === 'string' ? { message: { ...nextResult.message, content: text }, text } : {}),
  };
}

function normalizeResolvedSubagentExecution(
  value: ResolvedSubagentExecutionResult | PluginSubagentExecutionResult,
): ResolvedSubagentExecutionResult {
  if ('result' in value && 'continuationState' in value) {
    return value;
  }
  return {
    continuationState: {
      hasAssistantTextOutput: typeof value.text === 'string' && value.text.trim().length > 0,
      hasToolActivity: value.toolCalls.length > 0 || value.toolResults.length > 0,
    },
    result: value,
  };
}

async function collectSubagentRunResult(input: {
  contextGovernanceService?: { isAboveAutoCompactionThreshold: (entry: { modelId: string; providerId: string; totalTokens: number }) => boolean };
  finishReason?: Promise<unknown> | unknown;
  fullStream: AsyncIterable<unknown>;
  modelId: string;
  onTextDelta?: (entry: { delta: string; text: string }) => void;
  onToolCall?: (entry: { input: JsonValue; toolCallId: string; toolName: string }) => void;
  onToolResult?: (entry: { output: JsonValue; toolCallId: string; toolName: string }) => void;
  providerId: string;
  usage?: Promise<unknown> | unknown;
}): Promise<ResolvedSubagentExecutionResult> {
  let text = '';
  const toolCalls: PluginSubagentExecutionResult['toolCalls'] = [];
  const toolResults: PluginSubagentExecutionResult['toolResults'] = [];
  let reachedContextThreshold = false;
  for await (const rawPart of input.fullStream) {
    if (isRecord(rawPart) && rawPart.type === 'finish-step') {
      const usage = normalizeAiSdkLanguageModelUsage(rawPart.usage);
      if (
        usage
        && input.contextGovernanceService?.isAboveAutoCompactionThreshold({
          modelId: input.modelId,
          providerId: input.providerId,
          totalTokens: usage.totalTokens,
        })
      ) {
        reachedContextThreshold = true;
        break;
      }
    }
    const part = readAssistantStreamPart(rawPart);
    if (!part) {
      continue;
    }
    if (part.type === 'text-delta') {
      text += part.text;
      input.onTextDelta?.({ delta: part.text, text });
      continue;
    }
    const payload = { toolCallId: part.toolCallId, toolName: part.toolName };
    if (part.type === 'tool-call') {
      const toolCall = { ...payload, input: asJsonValue(part.input) };
      toolCalls.push(toolCall);
      input.onToolCall?.(toolCall);
    } else {
      const toolResult = { ...payload, output: compactSubagentToolResultOutput(part.output) };
      toolResults.push(toolResult);
      input.onToolResult?.(toolResult);
    }
  }
  if (!reachedContextThreshold) {
    const usage = normalizeAiSdkLanguageModelUsage(await readSubagentUsage(input.usage));
    if (
      usage
      && input.contextGovernanceService?.isAboveAutoCompactionThreshold({
        modelId: input.modelId,
        providerId: input.providerId,
        totalTokens: usage.totalTokens,
      })
    ) {
      reachedContextThreshold = true;
    }
  }
  const finishReason = await input.finishReason;
  return {
    continuationState: {
      hasAssistantTextOutput: text.trim().length > 0,
      hasToolActivity: toolCalls.length > 0 || toolResults.length > 0,
      ...(reachedContextThreshold ? { reachedContextThreshold: true } : {}),
    },
    result: {
      ...(finishReason !== undefined ? { finishReason: finishReason === null ? null : String(finishReason) } : {}),
      message: { content: text, role: 'assistant' },
      modelId: input.modelId,
      providerId: input.providerId,
      text,
      toolCalls,
      toolResults,
    },
  };
}

async function readSubagentUsage(value: Promise<unknown> | unknown): Promise<unknown> {
  try {
    return await value;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactSubagentToolResultOutput(value: unknown): JsonValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return asJsonValue(value);
  }
  const record = value as Record<string, unknown>;
  if ((record.kind === 'tool:text' && typeof record.value === 'string') || record.kind === 'tool:json') {
    return asJsonValue({
      kind: record.kind,
      value: asJsonValue(record.value ?? null),
    });
  }
  return asJsonValue(value);
}
