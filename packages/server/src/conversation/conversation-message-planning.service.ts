import type { ChatMessagePart, PluginCallContext } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { SkillSessionService } from '../execution/skill/skill-session.service';
import { ToolRegistryService } from '../execution/tool/tool-registry.service';
import { RuntimeHostConversationRecordService } from '../runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostPluginDispatchService } from '../runtime/host/runtime-host-plugin-dispatch.service';
import { asJsonValue, DEFAULT_PROVIDER_ID, DEFAULT_PROVIDER_MODEL_ID } from '../runtime/host/runtime-host-values';
import { applyMutatingDispatchableHooks, listDispatchableHookPluginIds, runDispatchableHookChain } from '../runtime/kernel/runtime-plugin-hook-governance';
import { AiVisionService } from '../vision/ai-vision.service';
import type { CompletedConversationTaskResult, ResolvedConversationTaskStreamSource } from './conversation-task.service';

export type ConversationResponseSource = 'model' | 'short-circuit';
export type ConversationStreamPlan = ResolvedConversationTaskStreamSource & {
  responseSource: ConversationResponseSource;
  shortCircuitParts: ChatMessagePart[] | null;
};

@Injectable()
export class ConversationMessagePlanningService {
  constructor(
    private readonly aiModelExecutionService: AiModelExecutionService,
    private readonly aiVisionService: AiVisionService,
    private readonly runtimeHostConversationRecordService: RuntimeHostConversationRecordService,
    private readonly skillSessionService: SkillSessionService,
    private readonly toolRegistryService: ToolRegistryService,
    @Inject(RuntimeHostPluginDispatchService)
    private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
  ) {}

  async applyMessageReceived(input: {
    activePersonaId?: string;
    content: string;
    conversationId: string;
    modelId: string;
    parts: ChatMessagePart[];
    providerId: string;
    userId?: string;
  }) {
    return this.applyConversationHooks(
      'message:received',
      createConversationHookContext(input),
      input,
      (payload, context) => ({
        context,
        conversationId: payload.conversationId,
        modelId: payload.modelId,
        providerId: payload.providerId,
        message: { content: payload.content, parts: payload.parts, role: 'user' },
        modelMessages: [payload.parts.length > 0 ? { content: payload.parts, role: 'user' } : { content: payload.content, role: 'user' }],
      }),
      (payload, mutation) => ({
        ...payload,
        ...(typeof mutation.content === 'string' ? { content: mutation.content } : {}),
        ...(Array.isArray(mutation.parts) ? { parts: mutation.parts as ChatMessagePart[] } : {}),
        ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
        ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
      }),
    );
  }

  async createStreamPlan(input: {
    activePersonaId?: string;
    abortSignal: AbortSignal;
    conversationId: string;
    messageId: string;
    modelId: string;
    providerId: string;
    userId?: string;
  }): Promise<ConversationStreamPlan> {
    const beforeModel = await this.applyBeforeModel({
      activePersonaId: input.activePersonaId,
      conversationId: input.conversationId,
      messages: await this.buildModelMessages(input.conversationId, input.messageId),
      modelId: input.modelId,
      providerId: input.providerId,
      userId: input.userId,
    });
    if (!beforeModel) {throw new BadRequestException('Invalid before-model hook result');}

    if (beforeModel.action === 'short-circuit') {
      return {
        modelId: beforeModel.modelId,
        providerId: beforeModel.providerId,
        responseSource: 'short-circuit',
        shortCircuitParts: beforeModel.assistantParts,
        stream: createShortCircuitStream(beforeModel.assistantContent),
      };
    }
    if (beforeModel.action !== 'continue') {throw new BadRequestException('Invalid before-model hook result');}

    const skillContext = await this.skillSessionService.getConversationSkillContext(input.conversationId);
    const tools = await this.toolRegistryService.buildToolSet({
      allowedToolNames: skillContext.allowedToolNames ?? undefined,
      context: createConversationHookContext({
        activePersonaId: input.activePersonaId,
        conversationId: input.conversationId,
        modelId: beforeModel.modelId,
        providerId: beforeModel.providerId,
        userId: input.userId,
      }),
    });
    const modelId = beforeModel.modelId === DEFAULT_PROVIDER_MODEL_ID ? undefined : beforeModel.modelId;
    const providerId = beforeModel.providerId === DEFAULT_PROVIDER_ID ? undefined : beforeModel.providerId;
    const stream = this.aiModelExecutionService.streamText({
      allowFallbackChatModels: true,
      abortSignal: input.abortSignal,
      ...(modelId ? { modelId } : {}),
      messages: beforeModel.messages,
      ...(providerId ? { providerId } : {}),
      ...((beforeModel.systemPrompt || skillContext.systemPrompt)
        ? { system: [skillContext.systemPrompt, beforeModel.systemPrompt].filter(Boolean).join('\n\n') }
        : {}),
      ...(tools ? { tools } : {}),
    });

    return {
      modelId: stream.modelId,
      providerId: stream.providerId,
      responseSource: 'model',
      shortCircuitParts: null,
      stream: {
        finishReason: stream.finishReason,
        fullStream: stream.fullStream,
      },
    };
  }

  async finalizeTaskResult(
    result: CompletedConversationTaskResult,
    responseSource: ConversationResponseSource,
    shortCircuitParts: ChatMessagePart[] | null,
  ): Promise<CompletedConversationTaskResult> {
    const conversation = this.runtimeHostConversationRecordService.requireConversation(result.conversationId);
    const assistantResult = responseSource === 'short-circuit'
      ? { ...result, parts: shortCircuitParts ?? result.parts }
      : await this.applyAssistantMutation(
          'chat:after-model',
          { activePersonaId: conversation.activePersonaId, conversationId: result.conversationId, userId: conversation.userId },
          result,
        );

    return this.applyAssistantMutation(
      'response:before-send',
      { activePersonaId: conversation.activePersonaId, conversationId: result.conversationId, userId: conversation.userId },
      assistantResult,
      responseSource,
    );
  }

  async broadcastAfterSend(
    contextInput: { activePersonaId?: string; conversationId: string; userId?: string },
    result: CompletedConversationTaskResult,
    responseSource: ConversationResponseSource,
  ): Promise<void> {
    const context = createConversationResultContext(contextInput, result);
    const payload = buildAssistantHookPayload(result, {
      context,
      conversationId: result.conversationId,
      responseSource,
      sentAt: new Date().toISOString(),
    });
    for (const pluginId of listDispatchableHookPluginIds({ context, hookName: 'response:after-send', kernel: this.runtimeHostPluginDispatchService })) {
      await this.runtimeHostPluginDispatchService.invokeHook({
        context,
        hookName: 'response:after-send',
        payload: asJsonValue(payload),
        pluginId,
      });
    }
  }

  private async buildModelMessages(
    conversationId: string,
    messageId: string,
  ): Promise<Array<{ content: string | ChatMessagePart[]; role: 'assistant' | 'user' }>> {
    return Promise.all(
      this.runtimeHostConversationRecordService.requireConversation(conversationId).messages
        .filter((entry) => entry.id !== messageId && (entry.role === 'assistant' || entry.role === 'user'))
        .map(async (message) => ({
          content: Array.isArray(message.parts)
            ? await this.aiVisionService.resolveMessageParts(
                conversationId,
                message.parts as unknown as ChatMessagePart[],
              )
            : typeof message.content === 'string'
              ? message.content
              : '',
          role: message.role === 'assistant' ? 'assistant' : 'user',
        })),
    );
  }

  private async applyBeforeModel(input: {
    activePersonaId?: string;
    conversationId: string;
    messages: Array<{ content: string | ChatMessagePart[]; role: 'assistant' | 'user' }>;
    modelId: string;
    providerId: string;
    userId?: string;
  }) {
    const context = createConversationHookContext(input);
    const availableTools = await this.toolRegistryService.listAvailableTools({ context });
    const result = await runDispatchableHookChain({
      applyResponse: (payload, mutation: Record<string, unknown>) => mutation.action === 'short-circuit' && typeof mutation.assistantContent === 'string'
        ? {
            shortCircuitResult: {
              action: 'short-circuit' as const,
              assistantContent: mutation.assistantContent,
              assistantParts: Array.isArray(mutation.assistantParts) ? mutation.assistantParts as ChatMessagePart[] : [],
              modelId: typeof mutation.modelId === 'string' ? mutation.modelId : payload.modelId,
              providerId: typeof mutation.providerId === 'string' ? mutation.providerId : payload.providerId,
            },
          }
        : {
            state: {
              ...payload,
              ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
              ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
              ...(Array.isArray(mutation.messages) ? { messages: mutation.messages as typeof payload.messages } : {}),
              ...(typeof mutation.systemPrompt === 'string' ? { systemPrompt: mutation.systemPrompt } : {}),
            },
          },
      hookName: 'chat:before-model',
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: (payload) => asJsonValue({
        context,
        request: {
          availableTools,
          messages: payload.messages,
          modelId: payload.modelId,
          providerId: payload.providerId,
          systemPrompt: payload.systemPrompt,
        },
      }),
      initialState: { action: 'continue' as const, ...input, systemPrompt: '' },
      readContext: () => context,
    });
    return 'shortCircuitResult' in result ? result.shortCircuitResult : result.state;
  }

  private async applyAssistantMutation(
    hookName: 'chat:after-model' | 'response:before-send',
    contextInput: { activePersonaId?: string; conversationId: string; userId?: string },
    result: CompletedConversationTaskResult,
    responseSource?: ConversationResponseSource,
  ): Promise<CompletedConversationTaskResult> {
    const context = createConversationResultContext(contextInput, result);
    return this.applyConversationHooks(
      hookName,
      context,
      result,
      (payload, nextContext) => buildAssistantHookPayload(payload, {
        ...(responseSource ? { responseSource } : {}),
        ...(hookName === 'response:before-send' ? { context: nextContext } : {}),
        ...(hookName === 'chat:after-model' ? { conversationId: payload.conversationId } : {}),
      }),
      (payload, mutation) => ({
        ...payload,
        ...(typeof mutation.assistantContent === 'string' ? { content: mutation.assistantContent } : {}),
        ...(Array.isArray(mutation.assistantParts) ? { parts: mutation.assistantParts as ChatMessagePart[] } : {}),
        ...(typeof mutation.modelId === 'string' ? { modelId: mutation.modelId } : {}),
        ...(typeof mutation.providerId === 'string' ? { providerId: mutation.providerId } : {}),
        ...(Array.isArray(mutation.toolCalls) ? { toolCalls: mutation.toolCalls as CompletedConversationTaskResult['toolCalls'] } : {}),
        ...(Array.isArray(mutation.toolResults) ? { toolResults: mutation.toolResults as CompletedConversationTaskResult['toolResults'] } : {}),
      }),
    );
  }

  private async applyConversationHooks<TPayload>(
    hookName: 'chat:after-model' | 'chat:before-model' | 'message:received' | 'response:before-send',
    context: PluginCallContext,
    payload: TPayload,
    mapPayload: (payload: TPayload, context: PluginCallContext) => Record<string, unknown> | Promise<Record<string, unknown>>,
    applyMutation: (payload: TPayload, mutation: Record<string, unknown>) => TPayload,
  ): Promise<TPayload> {
    return applyMutatingDispatchableHooks({
      applyMutation,
      hookName,
      kernel: this.runtimeHostPluginDispatchService,
      mapPayload: async (nextPayload, nextContext) => asJsonValue(await mapPayload(nextPayload, nextContext)),
      payload,
      readContext: () => context,
    });
  }
}

function createShortCircuitStream(content: string) {
  const normalized = content.trim();
  return {
    finishReason: 'short-circuit',
    fullStream: (async function* () { if (normalized) {yield { text: normalized, type: 'text-delta' as const };} })(),
  };
}

function createConversationResultContext(
  input: { activePersonaId?: string; conversationId: string; userId?: string },
  result: Pick<CompletedConversationTaskResult, 'modelId' | 'providerId'>,
): PluginCallContext {
  return createConversationHookContext({
    ...input,
    modelId: result.modelId,
    providerId: result.providerId,
  });
}

function buildAssistantHookPayload(
  result: CompletedConversationTaskResult,
  extra: {
    context?: PluginCallContext;
    conversationId?: string;
    responseSource?: ConversationResponseSource;
    sentAt?: string;
  } = {},
): Record<string, unknown> {
  return {
    assistantContent: result.content,
    assistantMessageId: result.assistantMessageId,
    assistantParts: result.parts,
    modelId: result.modelId,
    providerId: result.providerId,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
    ...extra,
  };
}

function createConversationHookContext(input: {
  activePersonaId?: string;
  conversationId?: string;
  modelId?: string;
  providerId?: string;
  userId?: string;
}): PluginCallContext {
  return {
    ...(input.modelId ? { activeModelId: input.modelId } : {}),
    ...(input.providerId ? { activeProviderId: input.providerId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.activePersonaId ? { activePersonaId: input.activePersonaId } : {}),
    source: 'http-route',
  };
}
