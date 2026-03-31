import {
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import type {
  ChatBeforeModelRequest,
  ChatMessagePart,
  PluginCallContext,
  PluginResponseSource,
} from '@garlic-claw/shared';
import { AiProviderService } from '../ai/ai-provider.service';
import { createStepLimit } from '../ai/sdk-adapter';
import type { ModelConfig } from '../ai/types/provider.types';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { ToolRegistryService } from '../tool/tool-registry.service';
import {
  ChatModelInvocationService,
  type PreparedChatModelInvocation,
} from './chat-model-invocation.service';
import type { ChatRuntimeMessage } from './chat-message-session';
import {
  normalizeAssistantMessageOutput,
} from './message-parts';
import type { CompletedChatTaskResult } from './chat-task.service';

/** 模型前 Hook 继续执行结果。 */
export interface AppliedChatBeforeModelContinueResult {
  action: 'continue';
  modelConfig: ModelConfig;
  request: ChatBeforeModelRequest;
  buildToolSet: (input: {
    context: PluginCallContext;
    allowedToolNames?: string[];
  }) => ChatToolSet;
}

/** 模型前 Hook 短路结果。 */
export interface AppliedChatBeforeModelShortCircuitResult {
  action: 'short-circuit';
  request: ChatBeforeModelRequest;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  providerId: string;
  modelId: string;
  reason?: string;
}

/** 模型前 Hook 的服务内结果。 */
export type AppliedChatBeforeModelResult =
  | AppliedChatBeforeModelContinueResult
  | AppliedChatBeforeModelShortCircuitResult;

export type ChatToolSet = Awaited<ReturnType<ToolRegistryService['buildToolSet']>>;

@Injectable()
export class ChatMessageOrchestrationService {
  constructor(
    private readonly aiProvider: AiProviderService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly modelInvocation: ChatModelInvocationService,
  ) {}

  buildStreamFactory(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    request: ChatBeforeModelRequest;
    preparedInvocation: PreparedChatModelInvocation;
    activeProviderId: string;
    activeModelId: string;
    activePersonaId: string;
    tools: ChatToolSet;
  }) {
    return (abortSignal: AbortSignal) => {
      const hookContext = this.createChatLifecycleContext({
        userId: input.userId,
        conversationId: input.conversationId,
        activeProviderId: input.activeProviderId,
        activeModelId: input.activeModelId,
        activePersonaId: input.activePersonaId,
      });

      void this.pluginRuntime.runChatWaitingModelHooks({
        context: hookContext,
        payload: {
          context: hookContext,
          conversationId: input.conversationId,
          assistantMessageId: input.assistantMessageId,
          providerId: input.activeProviderId,
          modelId: input.activeModelId,
          request: input.request,
        },
      });

      const streamed = this.modelInvocation.streamPrepared({
        prepared: input.preparedInvocation,
        system: input.request.systemPrompt,
        tools: input.tools,
        variant: input.request.variant,
        providerOptions: input.request.providerOptions,
        headers: input.request.headers,
        maxOutputTokens: input.request.maxOutputTokens,
        stopWhen: createStepLimit(5),
        abortSignal,
      });

      return {
        providerId: String(streamed.modelConfig.providerId),
        modelId: String(streamed.modelConfig.id),
        stream: streamed.result,
      };
    };
  }

  async applyChatBeforeModelHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    systemPrompt: string;
    modelConfig: { providerId: string; id: string };
    messages: ChatRuntimeMessage[];
  }): Promise<AppliedChatBeforeModelResult> {
    const hookContext = this.createChatLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activeProviderId: input.modelConfig.providerId,
      activeModelId: input.modelConfig.id,
      activePersonaId: input.activePersonaId,
    });
    const toolSelection = await this.toolRegistry.prepareToolSelection({
      context: {
        source: 'chat-tool',
        userId: input.userId,
        conversationId: input.conversationId,
        activeProviderId: input.modelConfig.providerId,
        activeModelId: input.modelConfig.id,
        activePersonaId: input.activePersonaId,
      },
    });
    const hookResult = await this.pluginRuntime.runChatBeforeModelHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        request: {
          providerId: input.modelConfig.providerId,
          modelId: input.modelConfig.id,
          systemPrompt: input.systemPrompt,
          messages: input.messages,
          availableTools: toolSelection.availableTools,
        },
      },
    });

    if (hookResult.action === 'short-circuit') {
      const normalizedAssistant = normalizeAssistantMessageOutput({
        content: hookResult.assistantContent,
        parts: hookResult.assistantParts,
      });

      return {
        action: 'short-circuit',
        request: hookResult.request,
        assistantContent: normalizedAssistant.content,
        assistantParts: normalizedAssistant.parts,
        providerId: hookResult.providerId,
        modelId: hookResult.modelId,
        ...(hookResult.reason ? { reason: hookResult.reason } : {}),
      };
    }

    return {
      action: 'continue',
      request: hookResult.request,
      modelConfig: this.aiProvider.getModelConfig(
        hookResult.request.providerId,
        hookResult.request.modelId,
      ),
      buildToolSet: toolSelection.buildToolSet,
    };
  }

  async applyFinalResponseHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    const afterModelResult = await this.applyChatAfterModelHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      result: input.result,
    });

    return this.applyResponseBeforeSendHooks({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      responseSource: input.responseSource,
      result: afterModelResult,
    });
  }

  async runResponseAfterSendHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<void> {
    const currentParts = input.result.parts ?? [];
    const hookContext = this.createChatLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activeProviderId: input.result.providerId,
      activeModelId: input.result.modelId,
      activePersonaId: input.activePersonaId,
    });

    await this.pluginRuntime.runResponseAfterSendHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        responseSource: input.responseSource,
        assistantMessageId: input.result.assistantMessageId,
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        assistantContent: input.result.content,
        assistantParts: currentParts,
        toolCalls: input.result.toolCalls,
        toolResults: input.result.toolResults,
        sentAt: new Date().toISOString(),
      },
    });
  }

  private async applyChatAfterModelHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    const currentParts = input.result.parts ?? [];
    const patchedPayload = await this.pluginRuntime.runChatAfterModelHooks({
      context: {
        source: 'chat-hook',
        userId: input.userId,
        conversationId: input.conversationId,
        activeProviderId: input.result.providerId,
        activeModelId: input.result.modelId,
        activePersonaId: input.activePersonaId,
      },
      payload: {
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        assistantMessageId: input.result.assistantMessageId,
        assistantContent: input.result.content,
        assistantParts: currentParts,
        toolCalls: input.result.toolCalls,
        toolResults: input.result.toolResults,
      },
    });

    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: patchedPayload.assistantContent,
      parts: patchedPayload.assistantParts,
    });

    if (
      normalizedAssistant.content === input.result.content
      && JSON.stringify(normalizedAssistant.parts) === JSON.stringify(currentParts)
    ) {
      return input.result;
    }

    return {
      ...input.result,
      content: normalizedAssistant.content,
      parts: normalizedAssistant.parts,
    };
  }

  private async applyResponseBeforeSendHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    const currentParts = input.result.parts ?? [];
    const hookContext = this.createChatLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activeProviderId: input.result.providerId,
      activeModelId: input.result.modelId,
      activePersonaId: input.activePersonaId,
    });
    const patchedPayload = await this.pluginRuntime.runResponseBeforeSendHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        responseSource: input.responseSource,
        assistantMessageId: input.result.assistantMessageId,
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        assistantContent: input.result.content,
        assistantParts: currentParts,
        toolCalls: input.result.toolCalls,
        toolResults: input.result.toolResults,
      },
    });

    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: patchedPayload.assistantContent,
      parts: patchedPayload.assistantParts,
    });

    return {
      ...input.result,
      providerId: patchedPayload.providerId,
      modelId: patchedPayload.modelId,
      content: normalizedAssistant.content,
      parts: normalizedAssistant.parts,
      toolCalls: patchedPayload.toolCalls,
      toolResults: patchedPayload.toolResults,
    };
  }

  private createChatLifecycleContext(input: {
    source?: PluginCallContext['source'];
    userId?: string;
    conversationId: string;
    activeProviderId?: string;
    activeModelId?: string;
    activePersonaId?: string;
  }) {
    return {
      source: input.source ?? ('chat-hook' as const),
      ...(input.userId ? { userId: input.userId } : {}),
      conversationId: input.conversationId,
      ...(input.activeProviderId ? { activeProviderId: input.activeProviderId } : {}),
      ...(input.activeModelId ? { activeModelId: input.activeModelId } : {}),
      ...(input.activePersonaId ? { activePersonaId: input.activePersonaId } : {}),
    };
  }
}
