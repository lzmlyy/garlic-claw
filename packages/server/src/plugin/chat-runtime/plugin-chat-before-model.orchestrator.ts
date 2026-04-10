import { filterAllowedToolNames as filterAuthorAllowedToolNames } from '@garlic-claw/plugin-sdk';
import {
  createChatModelLifecycleContext,
  filterChatAvailableTools,
  mergeChatSystemPrompts,
  normalizeAssistantMessageOutput,
  type ChatBeforeModelRequest,
  type ChatMessagePart,
  type PluginCallContext,
} from '@garlic-claw/shared';
import type { ModelConfig } from '../../ai';
import type { ChatRuntimeDeps } from '../plugin-chat-runtime.deps';
import { PluginRuntimeService } from '../plugin-runtime.service';
import type { ChatBeforeModelExecutionResult } from '../plugin-runtime.types';

type ChatToolSet = Awaited<ReturnType<ChatRuntimeDeps['toolRegistry']['buildToolSet']>>;

export type ChatBeforeModelOrchestratorResult =
  | {
      action: 'continue';
      modelConfig: ModelConfig;
      request: ChatBeforeModelRequest;
      buildToolSet: (input: {
        context: PluginCallContext;
        allowedToolNames?: string[];
      }) => ChatToolSet;
    }
  | {
      action: 'short-circuit';
      request: ChatBeforeModelRequest;
      assistantContent: string;
      assistantParts: ChatMessagePart[];
      providerId: string;
      modelId: string;
      reason?: string;
    };

export class PluginChatBeforeModelOrchestrator {
  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly deps: ChatRuntimeDeps,
  ) {}

  async apply(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    systemPrompt: string;
    modelConfig: { providerId: string; id: string };
    messages: import('../../chat/chat-message-session').ChatRuntimeMessage[];
  }): Promise<ChatBeforeModelOrchestratorResult> {
    const {
      skillService: skillSession,
      toolRegistry,
      aiProvider,
    } = this.deps;
    const skillContext = await skillSession.getConversationSkillContext(
      input.conversationId,
    );
    const hookContext = createChatModelLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      modelConfig: input.modelConfig,
    });
    const toolSelection = await toolRegistry.prepareToolSelection({
      context: createChatModelLifecycleContext({
        source: 'chat-tool',
        userId: input.userId,
        conversationId: input.conversationId,
        activePersonaId: input.activePersonaId,
        modelConfig: input.modelConfig,
      }),
    });
    const availableTools = filterChatAvailableTools(
      toolSelection.availableTools,
      skillContext.allowedToolNames,
      skillContext.deniedToolNames,
    );
    const hookResult = await this.pluginRuntime.runHook({
      hookName: 'chat:before-model',
      context: hookContext,
      payload: {
        context: hookContext,
        request: {
          providerId: input.modelConfig.providerId,
          modelId: input.modelConfig.id,
          systemPrompt: mergeChatSystemPrompts(
            input.systemPrompt,
            skillContext.systemPrompt,
          ),
          messages: input.messages,
          availableTools,
        },
      },
    }) as ChatBeforeModelExecutionResult;

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
      modelConfig: aiProvider.getModelConfig(
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
}
