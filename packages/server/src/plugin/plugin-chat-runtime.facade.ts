import {
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  createMessageCreatedHookPayload,
  createMessageReceivedHookPayload,
  createPluginMessageHookInfo,
  createPluginMessageHookInfoFromRecord,
  type ChatBeforeModelRequest,
  type ChatMessagePart,
  type MessageCreatedHookPayload,
  type PluginCallContext,
  type PluginLlmMessage,
  type PluginMessageHookInfo,
  type PluginResponseSource,
} from '@garlic-claw/shared';
import type { ModelConfig } from '../ai';
import type { ToolRegistryService } from '../tool/tool-registry.service';
import { PluginChatBeforeModelOrchestrator } from './chat-runtime/plugin-chat-before-model.orchestrator';
import {
  PluginChatBroadcastOrchestrator,
} from './chat-runtime/plugin-chat-broadcast.orchestrator';
import { PluginChatResponseOrchestrator } from './chat-runtime/plugin-chat-response.orchestrator';
import {
  CHAT_RUNTIME_DEPS,
  type ChatRuntimeDeps,
} from './plugin-chat-runtime.deps';
import { PluginRuntimeService } from './plugin-runtime.service';
import type { MessageReceivedExecutionResult } from './plugin-runtime.types';
import type { CompletedChatTaskResult } from '../chat/chat-task.service';

export type ChatToolSet = Awaited<ReturnType<ToolRegistryService['buildToolSet']>>;

export interface PluginChatMessageInput {
  role: PluginMessageHookInfo['role'];
  content: string;
  parts: ChatMessagePart[];
  status: PluginMessageHookInfo['status'];
  provider?: string | null;
  model?: string | null;
}

export interface AppliedChatBeforeModelContinueResult {
  action: 'continue';
  modelConfig: ModelConfig;
  request: ChatBeforeModelRequest;
  buildToolSet: (input: {
    context: PluginCallContext;
    allowedToolNames?: string[];
  }) => ChatToolSet;
}

export interface AppliedChatBeforeModelShortCircuitResult {
  action: 'short-circuit';
  request: ChatBeforeModelRequest;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  providerId: string;
  modelId: string;
  reason?: string;
}

export type AppliedChatBeforeModelResult =
  | AppliedChatBeforeModelContinueResult
  | AppliedChatBeforeModelShortCircuitResult;

@Injectable()
export class PluginChatRuntimeFacade {
  private readonly beforeModelOrchestrator: PluginChatBeforeModelOrchestrator;
  private readonly responseOrchestrator: PluginChatResponseOrchestrator;
  private readonly broadcastOrchestrator: PluginChatBroadcastOrchestrator;

  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
    @Inject(CHAT_RUNTIME_DEPS) private readonly deps: ChatRuntimeDeps,
  ) {
    this.beforeModelOrchestrator = new PluginChatBeforeModelOrchestrator(
      this.pluginRuntime,
      this.deps,
    );
    this.responseOrchestrator = new PluginChatResponseOrchestrator(this.pluginRuntime);
    this.broadcastOrchestrator = new PluginChatBroadcastOrchestrator(this.pluginRuntime);
  }

  async dispatchConversationCreated(input: {
    userId: string;
    conversation: {
      id: string;
      title: string;
      createdAt: Date;
      updatedAt: Date;
    };
  }): Promise<void> {
    return this.broadcastOrchestrator.dispatchConversationCreated(input);
  }

  async applyMessageReceived(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    modelConfig: {
      providerId: string;
      id: string;
    };
    message: {
      role: 'user';
      content: string | null;
      parts: ChatMessagePart[];
    };
    modelMessages: PluginLlmMessage[];
    skillCommandResult?: {
      assistantContent: string;
      assistantParts: ChatMessagePart[];
      providerId: string;
      modelId: string;
    } | null;
  }): Promise<MessageReceivedExecutionResult> {
    const hookContext = {
      source: 'chat-hook' as const,
      userId: input.userId,
      conversationId: input.conversationId,
      activeProviderId: input.modelConfig.providerId,
      activeModelId: input.modelConfig.id,
      activePersonaId: input.activePersonaId,
    };
    const payload = createMessageReceivedHookPayload({
      context: hookContext,
      conversationId: input.conversationId,
      providerId: input.modelConfig.providerId,
      modelId: input.modelConfig.id,
      message: input.message,
      modelMessages: input.modelMessages,
    });

    if (input.skillCommandResult) {
      return {
        action: 'short-circuit',
        payload,
        ...input.skillCommandResult,
      };
    }

    return this.pluginRuntime.runHook({
      hookName: 'message:received',
      context: hookContext,
      payload,
    }) as Promise<MessageReceivedExecutionResult>;
  }

  async applyMessageCreated(input: {
    hookContext: PluginCallContext;
    conversationId: string;
    message: PluginChatMessageInput;
    modelMessages?: PluginLlmMessage[];
  }): Promise<MessageCreatedHookPayload> {
    return this.pluginRuntime.runHook({
      hookName: 'message:created',
      context: input.hookContext,
      payload: createMessageCreatedHookPayload({
        context: input.hookContext,
        conversationId: input.conversationId,
        message: input.message,
        modelMessages: input.modelMessages ?? [{
          role: input.message.role as PluginLlmMessage['role'],
          content: input.message.parts,
        }],
      }),
    }) as Promise<MessageCreatedHookPayload>;
  }

  async applyMessageUpdated(input: {
    hookContext: PluginCallContext;
    conversationId: string;
    messageId: string;
    currentMessage: {
      id: string;
      role: string;
      content: string | null;
      partsJson?: string | null;
      provider?: string | null;
      model?: string | null;
      status?: string | null;
    };
    nextMessage: PluginChatMessageInput;
  }) {
    return this.pluginRuntime.runHook({
      hookName: 'message:updated',
      context: input.hookContext,
      payload: {
        context: input.hookContext,
        conversationId: input.conversationId,
        messageId: input.messageId,
        currentMessage: createPluginMessageHookInfoFromRecord(input.currentMessage),
        nextMessage: createPluginMessageHookInfo(input.nextMessage),
      },
    });
  }

  async dispatchMessageDeleted(input: {
    hookContext: PluginCallContext;
    conversationId: string;
    messageId: string;
    message: {
      id: string;
      role: string;
      content: string | null;
      partsJson?: string | null;
      provider?: string | null;
      model?: string | null;
      status?: string | null;
    };
  }): Promise<void> {
    return this.broadcastOrchestrator.dispatchMessageDeleted(input);
  }

  async applyChatBeforeModelHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    systemPrompt: string;
    modelConfig: { providerId: string; id: string };
    messages: import('../chat/chat-message-session').ChatRuntimeMessage[];
  }): Promise<AppliedChatBeforeModelResult> {
    return this.beforeModelOrchestrator.apply(input);
  }

  async dispatchChatWaitingModel(input: {
    assistantMessageId: string;
    userId: string;
    conversationId: string;
    request: ChatBeforeModelRequest;
    activeProviderId: string;
    activeModelId: string;
    activePersonaId: string;
  }): Promise<void> {
    return this.broadcastOrchestrator.dispatchChatWaitingModel(input);
  }

  async applyFinalResponseHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<CompletedChatTaskResult> {
    return this.responseOrchestrator.applyFinalResponseHooks(input);
  }

  async runResponseAfterSendHooks(input: {
    userId: string;
    conversationId: string;
    activePersonaId: string;
    responseSource: PluginResponseSource;
    result: CompletedChatTaskResult;
  }): Promise<void> {
    return this.responseOrchestrator.runResponseAfterSendHooks(input);
  }
}
