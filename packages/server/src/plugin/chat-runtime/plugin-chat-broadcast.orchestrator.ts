import {
  createChatModelLifecycleContext,
  createPluginMessageHookInfoFromRecord,
  type ChatBeforeModelRequest,
  type PluginCallContext,
} from '@garlic-claw/shared';
import { PluginRuntimeService } from '../plugin-runtime.service';

export class PluginChatBroadcastOrchestrator {
  constructor(private readonly pluginRuntime: PluginRuntimeService) {}

  async dispatchConversationCreated(input: {
    userId: string;
    conversation: {
      id: string;
      title: string;
      createdAt: Date;
      updatedAt: Date;
    };
  }): Promise<void> {
    const hookContext = {
      source: 'http-route' as const,
      userId: input.userId,
      conversationId: input.conversation.id,
    };

    await this.pluginRuntime.runBroadcastHook({
      hookName: 'conversation:created',
      context: hookContext,
      payload: {
        context: hookContext,
        conversation: {
          id: input.conversation.id,
          title: input.conversation.title,
          createdAt: input.conversation.createdAt.toISOString(),
          updatedAt: input.conversation.updatedAt.toISOString(),
        },
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
    await this.pluginRuntime.runBroadcastHook({
      hookName: 'message:deleted',
      context: input.hookContext,
      payload: {
        context: input.hookContext,
        conversationId: input.conversationId,
        messageId: input.messageId,
        message: createPluginMessageHookInfoFromRecord(input.message),
      },
    });
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
    const hookContext = createChatModelLifecycleContext({
      userId: input.userId,
      conversationId: input.conversationId,
      activePersonaId: input.activePersonaId,
      modelConfig: {
        providerId: input.activeProviderId,
        id: input.activeModelId,
      },
    });

    await this.pluginRuntime.runBroadcastHook({
      hookName: 'chat:waiting-model',
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
  }
}
