import {
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import { filterAllowedToolNames as filterAuthorAllowedToolNames } from '@garlic-claw/plugin-sdk';
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
import { SkillSessionService } from '../skill/skill-session.service';
import {
  ChatModelInvocationService,
  type PreparedChatModelInvocation,
} from './chat-model-invocation.service';
import type { ChatRuntimeMessage } from './chat-message-session';
import { createChatLifecycleContext } from './chat-message-common.helpers';
import { normalizeAssistantMessageOutput } from './message-parts';
import type { CompletedChatTaskResult } from './chat-task.service';
import { ChatMessageResponseHooksService } from './chat-message-response-hooks.service';

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
    private readonly skillSession: SkillSessionService,
    private readonly responseHooks: ChatMessageResponseHooksService,
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
      const hookContext = createChatLifecycleContext({
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
    const skillContext = await this.skillSession.getConversationSkillContext(
      input.conversationId,
    );
    const hookContext = createChatLifecycleContext({
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
    const availableTools = filterAvailableTools(
      toolSelection.availableTools,
      skillContext.allowedToolNames,
      skillContext.deniedToolNames,
    );
    const hookResult = await this.pluginRuntime.runChatBeforeModelHooks({
      context: hookContext,
      payload: {
        context: hookContext,
        request: {
          providerId: input.modelConfig.providerId,
          modelId: input.modelConfig.id,
          systemPrompt: mergeSystemPrompts(input.systemPrompt, skillContext.systemPrompt),
          messages: input.messages,
          availableTools,
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
      buildToolSet: ({ context, allowedToolNames }) => {
        const availableToolNames = availableTools.map((tool) => tool.name);

        return toolSelection.buildToolSet({
          context,
          allowedToolNames:
            filterAuthorAllowedToolNames(allowedToolNames, availableToolNames)
            ?? availableToolNames,
        });
      },
    };
  }

  async applyFinalResponseHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    return this.responseHooks.applyFinalResponseHooks(input);
  }

  async runResponseAfterSendHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<void> {
    return this.responseHooks.runResponseAfterSendHooks(input);
  }
}

function mergeSystemPrompts(basePrompt: string, appendedPrompt: string): string {
  if (!appendedPrompt.trim()) {
    return basePrompt;
  }

  return basePrompt.trim()
    ? `${basePrompt}\n\n${appendedPrompt}`
    : appendedPrompt;
}

function filterAvailableTools(
  availableTools: ChatBeforeModelRequest['availableTools'],
  allowedToolNames: string[] | null,
  deniedToolNames: string[],
): ChatBeforeModelRequest['availableTools'] {
  const allowedSet = allowedToolNames ? new Set(allowedToolNames) : null;
  const deniedSet = new Set(deniedToolNames);

  return availableTools.filter((tool) => {
    if (deniedSet.has(tool.name)) {
      return false;
    }
    if (allowedSet && !allowedSet.has(tool.name)) {
      return false;
    }
    return true;
  });
}
