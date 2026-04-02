import {
  Inject,
  Injectable,
  forwardRef,
} from '@nestjs/common';
import type { PluginResponseSource } from '@garlic-claw/shared';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { createChatLifecycleContext } from './chat-message-common.helpers';
import { normalizeAssistantMessageOutput } from './message-parts';
import type { CompletedChatTaskResult } from './chat-task.service';

@Injectable()
export class ChatMessageResponseHooksService {
  constructor(
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
  ) {}

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
    const hookContext = createChatLifecycleContext({
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
    const hookContext = createChatLifecycleContext({
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
}
