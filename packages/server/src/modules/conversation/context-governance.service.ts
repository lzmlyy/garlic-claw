import {
  buildConversationTitlePrompt,
  normalizePositiveInteger,
  sanitizeConversationTitle,
  shouldGenerateConversationTitle,
} from '@garlic-claw/plugin-sdk/authoring';
import type {
  ChatMessageAnnotation,
  ChatMessageMetadata,
  ChatMessagePart,
  ConversationContextWindowPreview,
  JsonObject,
  JsonValue,
  PluginConversationHistoryMessage,
  PluginConversationHistoryPreviewResult,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { AiManagementService } from '../ai-management/ai-management.service';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { createServerLogger } from '../../core/logging/server-logger';
import { ConversationStoreService } from '../runtime/host/conversation-store.service';
import { asJsonObject } from '../runtime/host/host-input.codec';
import { buildConversationVisibleModelMessages, readConversationVisibleModelMessageText } from './conversation-model-visible-history';
import { ContextGovernanceSettingsService } from './context-governance-settings.service';

const CONTEXT_COMPACTION_ANNOTATION_TYPE = 'context-compaction';
const CONTEXT_COMPACTION_OWNER = 'conversation.context-governance';
const CONTEXT_COMPACTION_VERSION = '1';
const CONTEXT_COMPACTION_REASON_LABELS: Readonly<Record<string, string>> = { disabled: '当前上下文治理已关闭压缩。', 'empty-summary': '压缩模型没有返回有效摘要。', 'invalid-history': '当前历史结构异常，暂时无法压缩。', 'not-enough-history': '当前可压缩历史为空，本次未执行压缩。', 'overflow-without-compaction': '当前可发送上下文本身已超预算，现有历史没有可压缩正文。', 'still-over-budget': '压缩后的上下文仍超过预算，本次未替换历史。', 'threshold-not-reached': '当前上下文还未达到自动压缩阈值。' };
const CONTEXT_COMPACTION_ROLE_LABELS: Partial<Record<PluginConversationHistoryMessage['role'], string>> = { assistant: '助手', system: '系统' };

type ModelMessage = { content: string | ChatMessagePart[]; role: 'assistant' | 'system' | 'user' };
type ContextCompactionTrigger = 'after-response' | 'manual' | 'prepare-model';
type ContextWindowEntry = { candidate: boolean; hidden: boolean; id: string; modelMessage: PluginConversationHistoryMessage | null };
type ContextWindowCandidateMessage = ContextWindowEntry & { modelMessage: PluginConversationHistoryMessage };
type ContextCompactionSummaryMarker = { compactionId: string; role: 'summary' };
type ContextCompactionSummaryData = { afterPreview: PluginConversationHistoryPreviewResult; beforePreview: PluginConversationHistoryPreviewResult; compactionId: string; coveredCount: number; createdAt: string; modelId: string; providerId: string; role: 'summary'; trigger: ContextCompactionTrigger };
type ContextCompactionCoveredData = { compactionId: string; coveredAt: string; markerVisible: boolean; role: 'covered'; summaryMessageId: string };
type ContextCompactionAnnotationData = ContextCompactionCoveredData | ContextCompactionSummaryData | ContextCompactionSummaryMarker;
type ContextCompactionMessageState = { covered: ContextCompactionCoveredData[]; message: PluginConversationHistoryMessage; summaryId: string | null };
type ContextCompactionHistoryState = { messageStates: ContextCompactionMessageState[]; modelMessages: PluginConversationHistoryMessage[]; visibleMessages: PluginConversationHistoryMessage[] };
export type ContextCompactionRunResult = { afterPreview?: PluginConversationHistoryPreviewResult; beforePreview?: PluginConversationHistoryPreviewResult; compacted: boolean; coveredMessageCount?: number; reason?: string; revision?: string; summaryMessageId?: string; thresholdTokens?: number };
type ContextWindowTarget = { contextLength: number; modelId: string; providerId: string };
type ContextCompactionModelTarget = { modelId: string; providerId: string };
type ContextGovernanceMessageReceivedInput = { content: string; conversationId: string; modelId: string; parts: ChatMessagePart[]; providerId: string; userId?: string };
export type DeferredInternalCommandResolution = { assistantContent: string; assistantParts: ChatMessagePart[]; modelId: string; providerId: string; reason: string };
export type DeferredInternalCommandAction = { commandId: string; execute: (input: { assistantMessageId: string; conversationId: string; userId?: string; userMessageId: string }) => Promise<DeferredInternalCommandResolution> };
type ContextGovernanceMessageReceivedResult = { action: 'continue' };
type ContextGovernanceBeforeModelInput = { conversationId: string; messages: ModelMessage[]; modelId: string; providerId: string; systemPrompt: string; userId?: string };
type ContextGovernanceBeforeModelResult =
  | { action: 'continue'; messages: ModelMessage[]; modelId: string; providerId: string; systemPrompt: string }
  | { action: 'short-circuit'; assistantContent: string; assistantParts: ChatMessagePart[]; modelId: string; providerId: string; reason: string };

@Injectable()
export class ContextGovernanceService {
  private readonly pendingPreModelStops = new Map<string, string>();
  private readonly logger = createServerLogger(ContextGovernanceService.name);

  constructor(
    private readonly aiManagementService: AiManagementService,
    private readonly aiModelExecutionService: AiModelExecutionService,
    private readonly contextGovernanceSettingsService: ContextGovernanceSettingsService,
    private readonly conversationStore: ConversationStoreService,
  ) {}

  getConfigSnapshot() {
    return this.contextGovernanceSettingsService.getConfigSnapshot();
  }

  updateConfig(values: JsonObject) {
    return this.contextGovernanceSettingsService.updateConfig(values);
  }

  async applyMessageReceived(_input: ContextGovernanceMessageReceivedInput): Promise<ContextGovernanceMessageReceivedResult> {
    return { action: 'continue' };
  }

  async rewriteHistoryBeforeModel(input: { conversationId: string; modelId: string; providerId: string; userId?: string }): Promise<void> {
    const runtimeConfig = this.contextGovernanceSettingsService.readRuntimeConfig().contextCompaction;
    if (!runtimeConfig.enabled || runtimeConfig.strategy !== 'summary') {return;}
    try {
      const result = await this.runCompaction({ conversationId: input.conversationId, modelId: input.modelId, providerId: input.providerId, trigger: 'prepare-model', userId: input.userId });
      if (result.compacted) {
        this.clearPendingPreModelStop(input.conversationId);
        return;
      }
      if (result.reason && result.reason !== 'threshold-not-reached') {
        this.updatePendingPreModelStop(input.conversationId, result.reason);
        this.logCompactionFailure(input.conversationId, result.reason);
      } else {
        this.clearPendingPreModelStop(input.conversationId);
      }
    } catch (error) {
      this.clearPendingPreModelStop(input.conversationId);
      this.logCompactionFailure(input.conversationId, error);
    }
  }

  async rewriteHistoryAfterCompletedResponse(input: { conversationId: string; force?: boolean; modelId: string; providerId: string; userId?: string }): Promise<boolean> {
    const runtimeConfig = this.contextGovernanceSettingsService.readRuntimeConfig().contextCompaction;
    if (!runtimeConfig.enabled || runtimeConfig.strategy !== 'summary') {return false;}
    try {
      const result = await this.runCompaction({
        conversationId: input.conversationId,
        force: input.force === true,
        modelId: input.modelId,
        providerId: input.providerId,
        trigger: 'after-response',
        userId: input.userId,
      });
      if (result.compacted) {
        this.clearPendingPreModelStop(input.conversationId);
        return true;
      }
      if (result.reason && result.reason !== 'threshold-not-reached') {
        this.updatePendingPreModelStop(input.conversationId, result.reason);
        this.logCompactionFailure(input.conversationId, result.reason);
      } else {
        this.clearPendingPreModelStop(input.conversationId);
      }
      return false;
    } catch (error) {
      this.clearPendingPreModelStop(input.conversationId);
      this.logCompactionFailure(input.conversationId, error);
      return false;
    }
  }

  consumePendingPreModelStop(conversationId: string): string | null {
    const message = this.pendingPreModelStops.get(conversationId) ?? null;
    if (message !== null) {
      this.pendingPreModelStops.delete(conversationId);
    }
    return message;
  }

  async applyBeforeModel(input: ContextGovernanceBeforeModelInput): Promise<ContextGovernanceBeforeModelResult> {
    return {
      action: 'continue',
      messages: await this.applyContextWindowStrategy({ conversationId: input.conversationId, messages: input.messages, modelId: input.modelId, providerId: input.providerId, userId: input.userId }),
      modelId: input.modelId,
      providerId: input.providerId,
      systemPrompt: input.systemPrompt,
    };
  }

  async generateConversationTitleIfNeeded(input: { conversationId: string; userId?: string }): Promise<void> {
    const runtimeConfig = this.contextGovernanceSettingsService.readRuntimeConfig().conversationTitle;
    if (!runtimeConfig.enabled) {return;}
    const conversation = this.conversationStore.requireConversation(input.conversationId, input.userId);
    if (!shouldGenerateConversationTitle(conversation.title, runtimeConfig.defaultTitle)) {return;}
    const prompt = buildConversationTitlePrompt(
      conversation.messages.map((message) => ({
        content: typeof message.content === 'string' ? message.content : '',
        role: typeof message.role === 'string' ? message.role : 'user',
      })),
      normalizePositiveInteger(runtimeConfig.maxMessages, runtimeConfig.maxMessages),
    );
    if (!prompt) {return;}
    const generated = await this.aiModelExecutionService.generateText({
      allowFallbackChatModels: true,
      messages: [{ content: prompt, role: 'user' }],
      transportMode: 'stream-collect',
    });
    const nextTitle = sanitizeConversationTitle(generated.text);
    if (!nextTitle || nextTitle === conversation.title) {return;}
    this.conversationStore.writeConversationTitle(input.conversationId, nextTitle, input.userId);
  }

  async getContextWindowPreview(input: { conversationId: string; modelId?: string; providerId?: string; userId?: string }): Promise<ConversationContextWindowPreview> {
    this.conversationStore.requireConversation(input.conversationId, input.userId);
    const history = readConversationHistorySnapshot(this.conversationStore.readConversationHistory(input.conversationId, input.userId));
    const runtimeConfig = this.contextGovernanceSettingsService.readRuntimeConfig().contextCompaction;
    const windowTarget = this.readContextWindowTarget(input.providerId, input.modelId);
    const contextLength = windowTarget.contextLength;
    const windowBudgetTokens = readContextWindowBudget(windowTarget, runtimeConfig.reservedTokens, runtimeConfig.strategy === 'sliding' ? runtimeConfig.slidingWindowUsagePercent : 100);
    if (!runtimeConfig.enabled) {
      const includedMessages = omitTrailingPendingAssistant(history.messages).filter(isConversationHistoryModelMessage);
      const preview = this.previewHistoryMessages(input.conversationId, includedMessages, windowTarget.modelId, windowTarget.providerId, input.userId, 'latest-provider');
      return createContextWindowPreview(runtimeConfig, { contextLength, enabled: false, estimatedTokens: preview.estimatedTokens, includedMessageIds: includedMessages.map((message) => message.id), source: preview.source, strategy: runtimeConfig.strategy });
    }
    return runtimeConfig.strategy === 'sliding' ? this.readSlidingContextWindowPreview(input.conversationId, history.messages, runtimeConfig, windowBudgetTokens, contextLength, windowTarget.modelId, windowTarget.providerId, input.userId) : this.readSummaryContextWindowPreview(input.conversationId, history.messages, runtimeConfig, contextLength, windowTarget.modelId, windowTarget.providerId, input.userId);
  }

  isAboveAutoCompactionThreshold(input: {
    modelId: string;
    providerId: string;
    totalTokens: number;
  }): boolean {
    const runtimeConfig = this.contextGovernanceSettingsService.readRuntimeConfig().contextCompaction;
    if (!runtimeConfig.enabled || runtimeConfig.strategy !== 'summary') {
      return false;
    }
    const windowTarget = this.readContextWindowTarget(input.providerId, input.modelId);
    const thresholdTokens = readContextWindowBudget(windowTarget, runtimeConfig.reservedTokens, runtimeConfig.compressionThreshold);
    return input.totalTokens >= thresholdTokens;
  }

  listCommandCatalogEntries(): Array<{ aliases: string[]; canonicalCommand: string; commandId: string; conflictTriggers: string[]; connected: boolean; defaultEnabled: boolean; description: string; kind: 'command'; path: string[]; pluginDisplayName: string; pluginId: string; runtimeKind: 'local'; source: 'manifest'; variants: string[] }> {
    return [{ aliases: ['/compress'], canonicalCommand: '/compact', commandId: 'internal.context-governance:/compact:command', conflictTriggers: [], connected: true, defaultEnabled: true, description: '手动触发当前会话的上下文压缩', kind: 'command', path: ['compact'], pluginDisplayName: '上下文治理', pluginId: 'internal.context-governance', runtimeKind: 'local', source: 'manifest', variants: ['/compact', '/compress'] }];
  }

  private async applyContextWindowStrategy(input: {
    conversationId: string;
    messages: ModelMessage[];
    modelId: string;
    providerId: string;
    userId?: string;
  }): Promise<ModelMessage[]> {
    const runtimeConfig = this.contextGovernanceSettingsService.readRuntimeConfig().contextCompaction;
    if (!runtimeConfig.enabled) {return input.messages;}
    const history = readConversationHistorySnapshot(this.conversationStore.readConversationHistory(input.conversationId, input.userId));
    if (runtimeConfig.strategy === 'sliding') {
      const nextMessages = this.readSlidingBeforeModelMessages({ conversationId: input.conversationId, history, modelId: input.modelId, providerId: input.providerId, requestMessages: input.messages, runtimeConfig, userId: input.userId });
      return nextMessages ?? input.messages;
    }
    const historyState = readContextCompactionHistoryState(history.messages, true);
    const rawHistoryModelMessages = omitTrailingPendingAssistant(history.messages).filter(isConversationHistoryModelMessage);
    const rawVisibleHistoryMessages = buildConversationVisibleModelMessages(rawHistoryModelMessages);
    const rewrittenVisibleHistoryMessages = buildConversationVisibleModelMessages(historyState.modelMessages);
    if (JSON.stringify(rewrittenVisibleHistoryMessages) === JSON.stringify(rawVisibleHistoryMessages)) {
      return input.messages;
    }
    const prefixCount = Math.max(input.messages.length - rawVisibleHistoryMessages.length, 0);
    return [...input.messages.slice(0, prefixCount), ...rewrittenVisibleHistoryMessages];
  }

  async runCompaction(input: {
    conversationId: string;
    force?: boolean;
    modelId?: string;
    providerId?: string;
    trigger: ContextCompactionTrigger;
    userId?: string;
  }): Promise<ContextCompactionRunResult> {
    const runtimeConfig = this.contextGovernanceSettingsService.readRuntimeConfig().contextCompaction;
    if (!runtimeConfig.enabled || runtimeConfig.strategy !== 'summary') {return { compacted: false, reason: 'disabled' };}
    const history = readConversationHistorySnapshot(this.conversationStore.readConversationHistory(input.conversationId, input.userId));
    const omitTrailingPendingAssistant = input.trigger === 'prepare-model';
    const beforeState = readContextCompactionHistoryState(history.messages, omitTrailingPendingAssistant);
    const windowTarget = this.readContextWindowTarget(input.providerId, input.modelId);
    const compactionModelTarget = this.readContextCompactionModelTarget(windowTarget.providerId, windowTarget.modelId, runtimeConfig);
    const thresholdTokens = readContextWindowBudget(windowTarget, runtimeConfig.reservedTokens, runtimeConfig.compressionThreshold);
    const beforePreview = this.previewHistoryMessages(
      input.conversationId,
      beforeState.modelMessages,
      windowTarget.modelId,
      windowTarget.providerId,
      input.userId,
      'exact',
    );
    if (!input.force && input.trigger !== 'manual' && beforePreview.estimatedTokens < thresholdTokens) {
      return { beforePreview, compacted: false, reason: 'threshold-not-reached', thresholdTokens };
    }
    let lastAfterPreview: PluginConversationHistoryPreviewResult | undefined;
    let lastReason: string = beforePreview.estimatedTokens >= thresholdTokens
      ? 'overflow-without-compaction'
      : 'not-enough-history';
    for (const keepRecentMessages of readDescendingKeepRecentCounts(runtimeConfig.keepRecentMessages, beforeState.modelMessages.length)) {
      const candidateMessages = beforeState.modelMessages.slice(0, Math.max(0, beforeState.modelMessages.length - keepRecentMessages));
      const summarySource = buildSummarySource(candidateMessages);
      if (!candidateMessages.length || !summarySource) {
        continue;
      }
      const summaryText = (await this.aiModelExecutionService.generateText({
        allowFallbackChatModels: true,
        messages: [{ content: [runtimeConfig.summaryPrompt, '', '历史对话：', summarySource].join('\n'), role: 'user' }],
        modelId: compactionModelTarget.modelId,
        providerId: compactionModelTarget.providerId,
        transportMode: 'stream-collect',
      })).text.trim();
      if (!summaryText) {return { beforePreview, compacted: false, reason: 'empty-summary' };}
      const compactionId = uuidv7();
      const summaryMessageId = `context-compaction:${uuidv7()}`;
      const createdAt = new Date().toISOString();
      const coveredMessageIds = new Set(candidateMessages.map((message) => message.id));
      const lastCoveredIndex = beforeState.messageStates.reduce((coveredIndex, { message }, index) => coveredMessageIds.has(message.id) ? index : coveredIndex, -1);
      if (lastCoveredIndex < 0) {return { beforePreview, compacted: false, reason: 'invalid-history' };}
      const predictedMessages = applyContextCompaction({ compactionId, coveredMessageIds, createdAt, historyMessages: history.messages, markerVisible: runtimeConfig.showCoveredMarker, summaryMessageId, summaryText });
      const afterState = readContextCompactionHistoryState(predictedMessages, omitTrailingPendingAssistant);
      const afterPreview = this.previewHistoryMessages(input.conversationId, afterState.modelMessages, windowTarget.modelId, windowTarget.providerId, input.userId);
      if (!input.force && afterPreview.estimatedTokens >= thresholdTokens) {
        lastAfterPreview = afterPreview;
        lastReason = 'still-over-budget';
        continue;
      }
      const nextMessages = finalizeContextCompactionMessages({ afterPreview, beforePreview, compactionId, coveredCount: coveredMessageIds.size, createdAt, messages: predictedMessages, modelId: compactionModelTarget.modelId, providerId: compactionModelTarget.providerId, showCoveredMarker: runtimeConfig.showCoveredMarker, summaryMessageId, trigger: input.trigger });
      const replaced = this.conversationStore.replaceConversationHistory(input.conversationId, asJsonObject({ expectedRevision: history.revision, messages: nextMessages }), input.userId) as { changed?: boolean; revision?: string };
      return { afterPreview, beforePreview, compacted: true, coveredMessageCount: coveredMessageIds.size, revision: typeof replaced.revision === 'string' ? replaced.revision : undefined, summaryMessageId };
    }
    return {
      ...(lastAfterPreview ? { afterPreview: lastAfterPreview } : {}),
      beforePreview,
      compacted: false,
      reason: lastReason,
      thresholdTokens,
    };
  }

  private previewHistoryMessages(
    conversationId: string,
    messages: PluginConversationHistoryMessage[],
    modelId: string,
    providerId: string,
    userId?: string,
    usagePreference: 'exact' | 'latest-provider' = 'exact',
  ): PluginConversationHistoryPreviewResult {
    return this.conversationStore.previewConversationHistory(conversationId, asJsonObject({
      messages: sanitizeContextWindowPreviewMessages(messages),
      modelId,
      providerId,
      usagePreference,
    }), userId) as unknown as PluginConversationHistoryPreviewResult;
  }

  private readContextWindowTarget(providerId?: string, modelId?: string): ContextWindowTarget {
    const resolvedProviderId = providerId ?? this.aiManagementService.getDefaultProviderSelection().providerId ?? this.aiManagementService.listProviders()[0]?.id ?? null;
    if (!resolvedProviderId) {throw new NotFoundException('当前没有可用的 AI 供应商');}
    const provider = this.aiManagementService.getProvider(resolvedProviderId);
    const resolvedModelId = modelId ?? provider.defaultModel ?? provider.models[0] ?? null;
    if (!resolvedModelId) {throw new NotFoundException(`Provider "${resolvedProviderId}" 没有可用模型`);}
    const model = this.aiManagementService.getProviderModel(resolvedProviderId, resolvedModelId);
    return { contextLength: model.contextLength, modelId: resolvedModelId, providerId: resolvedProviderId };
  }

  private readContextCompactionModelTarget(
    activeProviderId: string,
    activeModelId: string,
    runtimeConfig: ReturnType<ContextGovernanceSettingsService['readRuntimeConfig']>['contextCompaction'],
  ): ContextCompactionModelTarget {
    if (!runtimeConfig.compressionModel) {
      return { modelId: activeModelId, providerId: activeProviderId };
    }
    const target = runtimeConfig.compressionModel;
    this.aiManagementService.getProviderModel(target.providerId, target.modelId);
    return { modelId: target.modelId, providerId: target.providerId };
  }

  private readSlidingBeforeModelMessages(input: {
    conversationId: string;
    history: { messages: PluginConversationHistoryMessage[] };
    modelId: string;
    providerId: string;
    requestMessages: ModelMessage[];
    runtimeConfig: ReturnType<ContextGovernanceSettingsService['readRuntimeConfig']>['contextCompaction'];
    userId?: string;
  }): ModelMessage[] | null {
    const historyState = readContextCompactionHistoryState(input.history.messages, true);
    const historyMessages = buildConversationVisibleModelMessages(historyState.modelMessages);
    if (historyMessages.length === 0) {return null;}
    const requestHistoryCount = Math.min(input.requestMessages.length, historyMessages.length);
    const prefixMessages = input.requestMessages.slice(0, input.requestMessages.length - requestHistoryCount);
    const requestHistoryMessages = input.requestMessages.slice(input.requestMessages.length - requestHistoryCount);
    const target = this.readContextWindowTarget(input.providerId, input.modelId);
    const maxWindowTokens = readContextWindowBudget(target, input.runtimeConfig.reservedTokens, input.runtimeConfig.slidingWindowUsagePercent);
    const nextMessages = [
      ...prefixMessages,
      ...selectMessagesForWindow(requestHistoryMessages, input.runtimeConfig.keepRecentMessages, maxWindowTokens, (selectedMessages) => (
        this.previewHistoryMessages(
          input.conversationId,
          [...prefixMessages, ...selectedMessages].map((message, index) => toContextWindowPreviewMessage(message, index)),
          target.modelId,
          target.providerId,
          input.userId,
        )
      )).selected,
    ];
    return nextMessages.length === input.requestMessages.length ? null : nextMessages;
  }

  private readSlidingContextWindowPreview(
    conversationId: string,
    historyMessages: PluginConversationHistoryMessage[],
    runtimeConfig: ReturnType<ContextGovernanceSettingsService['readRuntimeConfig']>['contextCompaction'],
    windowBudgetTokens: number,
    contextLength: number,
    modelId: string,
    providerId: string,
    userId?: string,
  ): ConversationContextWindowPreview {
    const candidates = readContextWindowCompactedHistory(historyMessages).filter((entry): entry is ContextWindowCandidateMessage => entry.modelMessage !== null);
    const { preview, selected } = selectMessagesForWindow(candidates, runtimeConfig.keepRecentMessages, windowBudgetTokens, (selectedEntries) => (
      this.previewHistoryMessages(conversationId, selectedEntries.map((entry) => entry.modelMessage), modelId, providerId, userId)
    ));
    const includedMessageIds = selected.map((entry) => entry.id);
    return createContextWindowPreview(runtimeConfig, { contextLength, enabled: true, estimatedTokens: preview.estimatedTokens, excludedMessageIds: candidates.map((entry) => entry.id).filter((id) => !includedMessageIds.includes(id)), includedMessageIds, source: preview.source, strategy: 'sliding' });
  }

  private readSummaryContextWindowPreview(
    conversationId: string,
    historyMessages: PluginConversationHistoryMessage[],
    runtimeConfig: ReturnType<ContextGovernanceSettingsService['readRuntimeConfig']>['contextCompaction'],
    contextLength: number,
    modelId: string,
    providerId: string,
    userId?: string,
  ): ConversationContextWindowPreview {
    const entries = readContextWindowCompactedHistory(historyMessages);
    const includedEntries = entries.filter((entry): entry is ContextWindowCandidateMessage => !entry.hidden && entry.modelMessage !== null);
    const includedMessageIds = includedEntries.map((entry) => entry.id);
    const preview = this.previewHistoryMessages(conversationId, includedEntries.map((entry) => entry.modelMessage), modelId, providerId, userId, 'latest-provider');
    return createContextWindowPreview(runtimeConfig, { contextLength, enabled: true, estimatedTokens: preview.estimatedTokens, excludedMessageIds: entries.filter((entry) => entry.candidate).map((entry) => entry.id).filter((id) => !includedMessageIds.includes(id)), includedMessageIds, source: preview.source, strategy: runtimeConfig.strategy });
  }

  private logCompactionFailure(conversationId: string, failure: string | unknown): void {
    const detail = this.readCompactionFailureDetail(failure);
    this.logger.warn(`会话 ${conversationId} 自动压缩失败，继续保留当前历史: ${detail || 'unknown'}`);
  }

  private updatePendingPreModelStop(conversationId: string, failure: string): void {
    const stopMessage = readPendingPreModelStopMessage(failure);
    if (stopMessage) {
      this.pendingPreModelStops.set(conversationId, stopMessage);
      return;
    }
    this.pendingPreModelStops.delete(conversationId);
  }

  private clearPendingPreModelStop(conversationId: string): void {
    this.pendingPreModelStops.delete(conversationId);
  }

  private readCompactionFailureDetail(failure: string | unknown): string {
    if (typeof failure === 'string') {
      return CONTEXT_COMPACTION_REASON_LABELS[failure] ?? failure;
    }
    if (failure instanceof Error) {
      return failure.message.trim() || '压缩模型请求失败';
    }
    return '压缩模型请求失败';
  }
}

function createContextWindowPreview(
  runtimeConfig: ReturnType<ContextGovernanceSettingsService['readRuntimeConfig']>['contextCompaction'],
  input: Pick<ConversationContextWindowPreview, 'contextLength' | 'enabled' | 'estimatedTokens' | 'includedMessageIds' | 'source' | 'strategy'> & { excludedMessageIds?: string[] },
): ConversationContextWindowPreview {
  return {
    ...input,
    excludedMessageIds: input.excludedMessageIds ?? [],
    frontendMessageWindowSize: runtimeConfig.frontendMessageWindowSize,
    keepRecentMessages: runtimeConfig.keepRecentMessages,
    slidingWindowUsagePercent: runtimeConfig.slidingWindowUsagePercent,
  };
}

function selectMessagesForWindow<T>(
  messages: T[],
  keepRecentMessages: number,
  maxWindowTokens: number,
  previewMessages: (messages: T[]) => PluginConversationHistoryPreviewResult,
): { preview: PluginConversationHistoryPreviewResult; selected: T[] } {
  const keepRecentCount = Math.min(keepRecentMessages, messages.length);
  const maxTrimStart = Math.max(0, messages.length - keepRecentCount);
  let preview = previewMessages(messages);
  if (preview.estimatedTokens <= maxWindowTokens) {
    return { preview, selected: messages };
  }
  let selected = messages.slice(maxTrimStart);
  for (let trimStart = 1; trimStart <= messages.length; trimStart += 1) {
    const candidate = messages.slice(trimStart);
    const candidatePreview = previewMessages(candidate);
    preview = candidatePreview;
    selected = candidate;
    if (candidatePreview.estimatedTokens <= maxWindowTokens) {
      break;
    }
  }
  return { preview, selected };
}

function readContextWindowBudget(target: ContextWindowTarget, reservedTokens: number, usagePercent: number): number {
  void reservedTokens;
  const normalizedUsagePercent = Number.isFinite(usagePercent) ? Math.max(0, usagePercent) : 100;
  return Math.max(1, Math.floor((target.contextLength * normalizedUsagePercent) / 100));
}

function readDescendingKeepRecentCounts(preferredKeepRecentMessages: number, messageCount: number): number[] {
  const maxKeepRecentMessages = Math.min(Math.max(0, preferredKeepRecentMessages), messageCount);
  return Array.from({ length: maxKeepRecentMessages + 1 }, (_, index) => maxKeepRecentMessages - index);
}

function readPendingPreModelStopMessage(reason: string): string | null {
  if (reason === 'overflow-without-compaction') {
    return '当前可发送上下文本身已超预算，现有历史没有可压缩正文。请新开会话，或先删减最近长回复后再继续。';
  }
  if (reason === 'still-over-budget') {
    return '压缩后的上下文仍超过预算，无法继续当前请求。请新开会话，或先删减最近长回复后再继续。';
  }
  return null;
}

function readConversationHistorySnapshot(value: unknown): { messages: PluginConversationHistoryMessage[]; revision: string } {
  const record = value as { messages?: PluginConversationHistoryMessage[]; revision?: string } | null;
  return {
    messages: Array.isArray(record?.messages)
      ? record.messages.filter((message): message is PluginConversationHistoryMessage => isRecord(message) && typeof message.id === 'string' && typeof message.role === 'string')
      : [],
    revision: typeof record?.revision === 'string' ? record.revision : '',
  };
}

export function readCompactedConversationHistory(
  messages: PluginConversationHistoryMessage[],
  omitTrailingPendingAssistant = false,
): PluginConversationHistoryMessage[] {
  return readContextCompactionHistoryState(messages, omitTrailingPendingAssistant).visibleMessages;
}

function readContextCompactionHistoryState(messages: PluginConversationHistoryMessage[], omitTrailingPendingAssistant = false): ContextCompactionHistoryState {
  const messageStates = messages.map((message) => ({ message, ...readContextCompactionAnnotationState(message) }));
  const orderedStates = orderContextCompactionStates(messageStates);
  const activeSummaryIds = new Set(messageStates.flatMap(({ summaryId }) => summaryId ? [summaryId] : []));
  const visibleStates = orderedStates.filter(({ covered }) => !covered.some(({ compactionId }) => activeSummaryIds.has(compactionId)));
  const lastVisibleState = visibleStates.at(-1);
  const settledStates = omitTrailingPendingAssistant && lastVisibleState && isTransientPendingAssistant(lastVisibleState.message) ? visibleStates.slice(0, -1) : visibleStates;
  return { messageStates, modelMessages: settledStates.flatMap(({ message, summaryId }) => message.role === 'display' ? (summaryId ? [{ ...message, role: 'assistant' as const }] : []) : (isConversationHistoryModelMessage(message) ? [message] : [])), visibleMessages: settledStates.map(({ message }) => message) };
}

function applyContextCompaction(input: {
  compactionId: string;
  coveredMessageIds: ReadonlySet<string>;
  createdAt: string;
  historyMessages: PluginConversationHistoryMessage[];
  markerVisible: boolean;
  summaryMessageId: string;
  summaryText: string;
}): PluginConversationHistoryMessage[] {
  const nextMessages = input.historyMessages.map((message) => input.coveredMessageIds.has(message.id) ? writeContextCompactionCoveredAnnotation(message, { compactionId: input.compactionId, coveredAt: input.createdAt, markerVisible: input.markerVisible, role: 'covered', summaryMessageId: input.summaryMessageId }) : message);
  return [...nextMessages, { content: input.summaryText, createdAt: input.createdAt, id: input.summaryMessageId, metadata: { annotations: [createContextCompactionAnnotation({ compactionId: input.compactionId, role: 'summary' })] }, model: null, parts: [{ text: input.summaryText, type: 'text' }], provider: null, role: 'display', status: 'completed', updatedAt: input.createdAt }];
}

function finalizeContextCompactionMessages(input: {
  afterPreview: PluginConversationHistoryPreviewResult;
  beforePreview: PluginConversationHistoryPreviewResult;
  compactionId: string;
  coveredCount: number;
  createdAt: string;
  messages: PluginConversationHistoryMessage[];
  modelId: string;
  providerId: string;
  showCoveredMarker: boolean;
  summaryMessageId: string;
  trigger: ContextCompactionTrigger;
}): PluginConversationHistoryMessage[] {
  const summaryAnnotation = createContextCompactionAnnotation({ afterPreview: input.afterPreview, beforePreview: input.beforePreview, compactionId: input.compactionId, coveredCount: input.coveredCount, createdAt: input.createdAt, modelId: input.modelId, providerId: input.providerId, role: 'summary', trigger: input.trigger });
  return input.messages.map((message) => {
    if (message.id === input.summaryMessageId) {return { ...message, metadata: { ...(message.metadata ?? {}), annotations: [summaryAnnotation] }, model: input.modelId, provider: input.providerId };}
    const annotations = message.metadata?.annotations ?? [];
    let changed = false;
    const nextAnnotations = annotations.map((annotation) => {
      if (!(isContextCompactionOwnedAnnotation(annotation) && isContextCompactionCoveredData(annotation.data))) {return annotation;}
      changed = true;
      return annotation.data.markerVisible === input.showCoveredMarker ? annotation : { ...annotation, data: { ...annotation.data, markerVisible: input.showCoveredMarker } as JsonValue };
    });
    return changed ? { ...message, metadata: { ...(message.metadata ?? {}), annotations: nextAnnotations } } : message;
  });
}

function writeContextCompactionCoveredAnnotation(message: PluginConversationHistoryMessage, data: ContextCompactionCoveredData): PluginConversationHistoryMessage {
  return {
    ...message,
    metadata: {
      ...(message.metadata ?? {}),
      annotations: [
        ...(message.metadata?.annotations ?? []).filter((annotation) => !isContextCompactionOwnedAnnotation(annotation)),
        createContextCompactionAnnotation(data),
      ],
    },
  };
}

function createContextCompactionAnnotation(data: ContextCompactionAnnotationData): ChatMessageAnnotation {
  return {
    data: data as unknown as JsonValue,
    owner: CONTEXT_COMPACTION_OWNER,
    type: CONTEXT_COMPACTION_ANNOTATION_TYPE,
    version: CONTEXT_COMPACTION_VERSION,
  };
}

function readContextCompactionAnnotationState(message: PluginConversationHistoryMessage): { covered: ContextCompactionCoveredData[]; summaryId: string | null } {
  const covered: ContextCompactionCoveredData[] = [];
  let summaryId: string | null = null;
  for (const annotation of message.metadata?.annotations ?? []) {
    if (!isContextCompactionOwnedAnnotation(annotation)) {continue;}
    if (summaryId === null && isContextCompactionSummaryMarker(annotation.data)) { summaryId = annotation.data.compactionId; continue; }
    if (isContextCompactionCoveredData(annotation.data)) {covered.push(annotation.data);}
  }
  return { covered, summaryId };
}

function buildSummarySource(messages: PluginConversationHistoryMessage[]): string {
  return buildConversationVisibleModelMessages(messages)
    .map((message) => {
      const content = readConversationVisibleModelMessageText(message);
      return content ? `${CONTEXT_COMPACTION_ROLE_LABELS[message.role] ?? '用户'}: ${content}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

function readMessageText(message: PluginConversationHistoryMessage): string { return ((message.parts ?? []).flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n') || message.content || '').trim(); }
function isTransientPendingAssistant(message: PluginConversationHistoryMessage): boolean { return message.role === 'assistant' && message.status === 'pending' && readMessageText(message).length === 0 && !(message.toolCalls?.length) && !(message.toolResults?.length); }

function readContextWindowCompactedHistory(messages: PluginConversationHistoryMessage[]): ContextWindowEntry[] {
  const entries = messages.map((message) => ({ coveredCompactionIds: readCoveredCompactionIds(message), id: message.id, summaryCompactionId: readSummaryCompactionId(message), modelMessage: isConversationHistoryModelMessage(message) ? message : readSummaryCompactionId(message) ? { ...message, role: 'assistant' } : null }));
  const orderedEntries = orderContextWindowEntries(entries);
  const activeSummaryIds = new Set(entries.flatMap(({ summaryCompactionId }) => summaryCompactionId ? [summaryCompactionId] : []));
  const visibleIds = new Set(omitTrailingPendingContextEntries(orderedEntries.filter((entry) => !entry.coveredCompactionIds.some((compactionId) => activeSummaryIds.has(compactionId)))).map(({ id }) => id));
  return entries.map(({ coveredCompactionIds, id, modelMessage, summaryCompactionId }) => ({ candidate: modelMessage !== null || summaryCompactionId !== null, hidden: coveredCompactionIds.some((compactionId) => activeSummaryIds.has(compactionId)) || !visibleIds.has(id), id, modelMessage: visibleIds.has(id) ? modelMessage : null }));
}

function orderContextCompactionStates(states: ContextCompactionMessageState[]): ContextCompactionMessageState[] {
  const orderMap = buildContextCompactionLogicalOrder(
    states.map((state) => ({
      coveredCompactionIds: state.covered.map(({ compactionId }) => compactionId),
      id: state.message.id,
      summaryCompactionId: state.summaryId,
    })),
  );
  return [...states].sort((left, right) => (
    (orderMap.get(left.message.id) ?? 0) - (orderMap.get(right.message.id) ?? 0)
  ));
}

function orderContextWindowEntries<T extends { coveredCompactionIds: string[]; id: string; summaryCompactionId: string | null }>(entries: T[]): T[] {
  const orderMap = buildContextCompactionLogicalOrder(entries);
  return [...entries].sort((left, right) => (
    (orderMap.get(left.id) ?? 0) - (orderMap.get(right.id) ?? 0)
  ));
}

function buildContextCompactionLogicalOrder<T extends { coveredCompactionIds: string[]; id: string; summaryCompactionId: string | null }>(entries: T[]): Map<string, number> {
  const lastCoveredIndexBySummaryId = new Map<string, number>();
  entries.forEach((entry, index) => {
    entry.coveredCompactionIds.forEach((compactionId) => lastCoveredIndexBySummaryId.set(compactionId, index));
  });
  return new Map(entries.map((entry, index) => {
    if (entry.summaryCompactionId) {
      const logicalAnchor = lastCoveredIndexBySummaryId.get(entry.summaryCompactionId);
      if (typeof logicalAnchor === 'number') {
        return [entry.id, logicalAnchor + 0.5];
      }
    }
    return [entry.id, index];
  }));
}

function isConversationHistoryModelMessage(message: PluginConversationHistoryMessage): boolean {
  return message.role === 'assistant' || message.role === 'system' || message.role === 'user';
}

function omitTrailingPendingAssistant<T extends { role: string; status?: string }>(messages: T[]): T[] {
  const lastMessage = messages.at(-1);
  return lastMessage && lastMessage.role === 'assistant' && lastMessage.status === 'pending'
    ? messages.slice(0, -1)
    : messages;
}

function omitTrailingPendingContextEntries<T extends { id: string; modelMessage: PluginConversationHistoryMessage | null }>(entries: T[]): T[] {
  const lastEntry = entries.at(-1);
  return lastEntry?.modelMessage && isTransientPendingAssistant(lastEntry.modelMessage)
    ? entries.slice(0, -1)
    : entries;
}

function sanitizeContextWindowPreviewMessages(messages: PluginConversationHistoryMessage[]): PluginConversationHistoryMessage[] {
  return messages.map((message, index) => {
    const createdAt = readContextWindowPreviewTimestamp(message.createdAt);
    const updatedAt = readContextWindowPreviewTimestamp(message.updatedAt, createdAt);
    const metadata = sanitizeContextWindowPreviewObject(message.metadata);
    const toolCalls = sanitizeContextWindowPreviewList(message.toolCalls);
    const toolResults = sanitizeContextWindowPreviewList(message.toolResults);
    return {
      content: typeof message.content === 'string' ? message.content : null,
      createdAt,
      ...(typeof message.error === 'string' ? { error: message.error } : {}),
      id: typeof message.id === 'string' && message.id.trim().length > 0 ? message.id : `context-window-preview-${index}`,
      ...(metadata ? { metadata: metadata as ChatMessageMetadata } : {}),
      ...(typeof message.model === 'string' ? { model: message.model } : {}),
      parts: sanitizeContextWindowPreviewParts(message.parts),
      ...(typeof message.provider === 'string' ? { provider: message.provider } : {}),
      role: typeof message.role === 'string' ? message.role : 'assistant',
      status: normalizeContextWindowPreviewStatus(message.status),
      ...(toolCalls ? { toolCalls } : {}),
      ...(toolResults ? { toolResults } : {}),
      updatedAt,
    };
  });
}

function sanitizeContextWindowPreviewParts(parts: unknown): ChatMessagePart[] {
  return Array.isArray(parts) ? parts.flatMap<ChatMessagePart>((part) => !isRecord(part) || typeof part.type !== 'string' ? [] : part.type === 'text' && typeof part.text === 'string' ? [{ text: part.text, type: 'text' }] : part.type === 'image' && typeof part.image === 'string' ? [{ image: part.image, ...(typeof part.mimeType === 'string' ? { mimeType: part.mimeType } : {}), type: 'image' }] : []) : [];
}

function sanitizeContextWindowPreviewList(value: unknown): JsonValue[] | null {
  if (!Array.isArray(value)) {return null;}
  const sanitized = value.flatMap((entry) => { const normalized = sanitizeContextWindowPreviewJsonValue(entry); return normalized === null ? [] : [normalized]; });
  return sanitized.length > 0 ? sanitized : null;
}

function sanitizeContextWindowPreviewJsonValue(value: unknown): JsonValue | null {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === 'string' ? JSON.parse(encoded) as JsonValue : null;
  } catch {
    return null;
  }
}

function sanitizeContextWindowPreviewObject(value: unknown): JsonObject | null { const normalized = sanitizeContextWindowPreviewJsonValue(value); return isRecord(normalized) ? normalized as JsonObject : null; }
function readContextWindowPreviewTimestamp(value: unknown, fallback = new Date(0).toISOString()): string { return typeof value === 'string' && value.trim().length > 0 ? value : fallback; }
function normalizeContextWindowPreviewStatus(value: unknown): PluginConversationHistoryMessage['status'] { return value === 'pending' || value === 'streaming' || value === 'completed' || value === 'stopped' || value === 'error' ? value : 'completed'; }

function readSummaryCompactionId(message: PluginConversationHistoryMessage): string | null {
  const match = readContextCompactionAnnotationData(message).find((data) => data.role === 'summary' && typeof data.compactionId === 'string');
  return typeof match?.compactionId === 'string' ? match.compactionId : null;
}

function readCoveredCompactionIds(message: PluginConversationHistoryMessage): string[] {
  return readContextCompactionAnnotationData(message).flatMap((data) => (
    data.role === 'covered' && typeof data.compactionId === 'string' ? [data.compactionId] : []
  ));
}

function readContextCompactionAnnotationData(message: PluginConversationHistoryMessage): Array<Record<string, unknown>> {
  return (message.metadata?.annotations ?? []).flatMap((annotation) => annotation.type === CONTEXT_COMPACTION_ANNOTATION_TYPE && annotation.owner === CONTEXT_COMPACTION_OWNER && isRecord(annotation.data) ? [annotation.data] : []);
}

function toContextWindowPreviewMessage(message: ModelMessage, index: number): PluginConversationHistoryMessage { return { content: Array.isArray(message.content) ? null : message.content, createdAt: `preview-${index}`, id: `preview-${index}`, parts: Array.isArray(message.content) ? message.content : [{ text: message.content, type: 'text' }], role: message.role, status: 'completed', updatedAt: `preview-${index}` }; }

function isContextCompactionOwnedAnnotation(annotation: ChatMessageAnnotation): boolean {
  return annotation.type === CONTEXT_COMPACTION_ANNOTATION_TYPE && annotation.owner === CONTEXT_COMPACTION_OWNER;
}

function isContextCompactionSummaryMarker(value: unknown): value is ContextCompactionSummaryMarker {
  return isRecord(value) && value.role === 'summary' && typeof value.compactionId === 'string';
}

function isContextCompactionCoveredData(value: unknown): value is ContextCompactionCoveredData {
  return isRecord(value)
    && value.role === 'covered'
    && typeof value.compactionId === 'string'
    && typeof value.summaryMessageId === 'string'
    && typeof value.coveredAt === 'string'
    && typeof value.markerVisible === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
