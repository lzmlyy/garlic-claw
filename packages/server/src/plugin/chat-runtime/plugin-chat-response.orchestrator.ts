import {
  createChatModelLifecycleContext,
  normalizeAssistantMessageOutput,
  type ChatMessagePart,
  type PluginResponseSource,
} from '@garlic-claw/shared';
import type { CompletedChatTaskResult } from '../../chat/chat-task.service';
import { PluginRuntimeService } from '../plugin-runtime.service';

export class PluginChatResponseOrchestrator {
  constructor(private readonly pluginRuntime: PluginRuntimeService) {}

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
    const hookContext = this.createResultHookContext(input);

    await this.pluginRuntime.runBroadcastHook({
      hookName: 'response:after-send',
      context: hookContext,
      payload: {
        context: hookContext,
        responseSource: input.responseSource,
        ...this.createAssistantHookPayload(input.result),
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
    const patchedPayload = await this.pluginRuntime.runHook({
      hookName: 'chat:after-model',
      context: this.createResultHookContext(input),
      payload: this.createAssistantHookPayload(input.result),
    }) as {
      providerId: string;
      modelId: string;
      assistantContent: string;
      assistantParts: ChatMessagePart[];
      toolCalls: CompletedChatTaskResult['toolCalls'];
      toolResults: CompletedChatTaskResult['toolResults'];
    };

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
    const hookContext = this.createResultHookContext(input);
    const patchedPayload = await this.pluginRuntime.runHook({
      hookName: 'response:before-send',
      context: hookContext,
      payload: {
        context: hookContext,
        responseSource: input.responseSource,
        ...this.createAssistantHookPayload(input.result),
      },
    }) as {
      providerId: string;
      modelId: string;
      assistantContent: string;
      assistantParts: ChatMessagePart[];
      toolCalls: CompletedChatTaskResult['toolCalls'];
      toolResults: CompletedChatTaskResult['toolResults'];
    };

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

  private createResultHookContext(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    result: CompletedChatTaskResult;
  }) {
    return createChatModelLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      modelConfig: {
        providerId: input.result.providerId,
        id: input.result.modelId,
      },
    });
  }

  private createAssistantHookPayload(result: CompletedChatTaskResult) {
    return {
      assistantMessageId: result.assistantMessageId,
      providerId: result.providerId,
      modelId: result.modelId,
      assistantContent: result.content,
      assistantParts: result.parts ?? [],
      toolCalls: result.toolCalls,
      toolResults: result.toolResults,
    };
  }
}
