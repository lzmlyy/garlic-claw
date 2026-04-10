import { ModuleRef } from '@nestjs/core';
import { ChatMessageGenerationService } from './chat-message-generation.service';
import { ChatMessageMutationService } from './chat-message-mutation.service';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';
import { ChatMessageService } from './chat-message.service';

export function createChatMessageSpecFixture() {
  const prisma = {
    message: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const chatService = {
    getConversation: jest.fn(),
  };

  const aiProvider = {
    getModelConfig: jest.fn(),
  };

  const personaService = {
    getCurrentPersona: jest.fn(),
  };

  const runMessageReceivedHooks = jest.fn();
  const runChatBeforeModelHooks = jest.fn();
  const runChatWaitingModelHooks = jest.fn();
  const runChatAfterModelHooks = jest.fn();
  const runMessageCreatedHooks = jest.fn();
  const runMessageUpdatedHooks = jest.fn();
  const runMessageDeletedHooks = jest.fn();
  const runResponseBeforeSendHooks = jest.fn();
  const runResponseAfterSendHooks = jest.fn();
  const pluginRuntime = {
    runMessageReceivedHooks,
    runChatBeforeModelHooks,
    runChatWaitingModelHooks,
    runChatAfterModelHooks,
    runMessageCreatedHooks,
    runMessageUpdatedHooks,
    runMessageDeletedHooks,
    runResponseBeforeSendHooks,
    runResponseAfterSendHooks,
    runHook: jest.fn(async ({ hookName, ...input }: { hookName: string }) =>
      hookName === 'chat:before-model'
        ? runChatBeforeModelHooks(input)
        : hookName === 'message:received'
          ? runMessageReceivedHooks(input)
          : hookName === 'chat:after-model'
            ? runChatAfterModelHooks(input)
            : hookName === 'message:created'
              ? runMessageCreatedHooks(input)
              : hookName === 'message:updated'
                ? runMessageUpdatedHooks(input)
                : runResponseBeforeSendHooks(input)),
    runBroadcastHook: jest.fn(async ({ hookName, ...input }: { hookName: string }) => {
      switch (hookName) {
        case 'chat:waiting-model':
          return runChatWaitingModelHooks(input);
        case 'message:deleted':
          return runMessageDeletedHooks(input);
        default:
          return runResponseAfterSendHooks(input);
      }
    }),
  };
  const createChatHookContext = (input: {
    userId: string;
    conversationId: string;
    activeProviderId: string;
    activeModelId: string;
    activePersonaId: string;
  }) => ({
    source: 'chat-hook' as const,
    userId: input.userId,
    conversationId: input.conversationId,
    activeProviderId: input.activeProviderId,
    activeModelId: input.activeModelId,
    activePersonaId: input.activePersonaId,
  });
  const parsePartsJson = (partsJson?: string | null) =>
    partsJson ? JSON.parse(partsJson) as unknown[] : [];
  const toHookMessage = (input: {
    id?: string;
    role: string;
    content: string | null;
    parts: unknown[];
    provider?: string | null;
    model?: string | null;
    status?: string | null;
  }) => ({
    ...(input.id ? { id: input.id } : {}),
    role: input.role,
    content: input.content,
    parts: input.parts,
    ...(typeof input.provider !== 'undefined' ? { provider: input.provider } : {}),
    ...(typeof input.model !== 'undefined' ? { model: input.model } : {}),
    ...(input.status ? { status: input.status } : {}),
  });
  const toHookMessageRecord = (input: {
    id: string;
    role: string;
    content: string | null;
    partsJson?: string | null;
    provider?: string | null;
    model?: string | null;
    status?: string | null;
  }) =>
    toHookMessage({
      id: input.id,
      role: input.role,
      content: input.content,
      parts: parsePartsJson(input.partsJson),
      ...(typeof input.provider !== 'undefined' ? { provider: input.provider } : {}),
      ...(typeof input.model !== 'undefined' ? { model: input.model } : {}),
      ...(input.status ? { status: input.status } : {}),
    });
  const normalizeAssistantOutput = (input: {
    content?: string | null;
    parts?: unknown[] | null;
  }) => {
    const normalizedParts = input.parts ? [...input.parts] : [];
    if (normalizedParts.length > 0) {
      return {
        content: normalizedParts
          .filter((part): part is { type: string; text?: string } =>
            Boolean(part) && typeof (part as { type?: unknown }).type === 'string',
          )
          .filter((part) => part.type === 'text')
          .map((part) => part.text ?? '')
          .join('\n'),
        parts: normalizedParts,
      };
    }

    const text = input.content?.trim() ?? '';
    return text
      ? {
          content: text,
          parts: [
            {
              type: 'text',
              text,
            },
          ],
        }
      : {
          content: '',
          parts: [],
        };
  };
  const pluginChatRuntime = {
    dispatchConversationCreated: jest.fn(),
    applyMessageReceived: jest.fn(async (input: {
      userId: string;
      conversationId: string;
      activePersonaId: string;
      modelConfig: { providerId: string; id: string };
      message: { role: 'user'; content: string | null; parts: unknown[] };
      modelMessages: unknown[];
      skillCommandResult?: {
        assistantContent: string;
        assistantParts: unknown[];
        providerId: string;
        modelId: string;
      } | null;
    }) => {
      const context = createChatHookContext({
        userId: input.userId,
        conversationId: input.conversationId,
        activeProviderId: input.modelConfig.providerId,
        activeModelId: input.modelConfig.id,
        activePersonaId: input.activePersonaId,
      });
      const payload = {
        context,
        conversationId: input.conversationId,
        providerId: input.modelConfig.providerId,
        modelId: input.modelConfig.id,
        message: toHookMessage({
          role: input.message.role,
          content: input.message.content,
          parts: input.message.parts,
        }),
        modelMessages: input.modelMessages,
      };
      if (input.skillCommandResult) {
        const normalizedAssistant = normalizeAssistantOutput({
          content: input.skillCommandResult.assistantContent,
          parts: input.skillCommandResult.assistantParts,
        });
        return {
          action: 'short-circuit' as const,
          payload,
          assistantContent: normalizedAssistant.content,
          assistantParts: normalizedAssistant.parts,
          providerId: input.skillCommandResult.providerId,
          modelId: input.skillCommandResult.modelId,
        };
      }

      return runMessageReceivedHooks({
        context,
        payload,
      });
    }),
    applyMessageCreated: jest.fn(async (input: {
      hookContext: unknown;
      conversationId: string;
      message: {
        id?: string;
        role: string;
        content: string | null;
        parts: unknown[];
        provider?: string | null;
        model?: string | null;
        status?: string | null;
      };
      modelMessages?: unknown[];
    }) => {
      const hookMessage = toHookMessage(input.message);
      return runMessageCreatedHooks({
        context: input.hookContext,
        payload: {
          context: input.hookContext,
          conversationId: input.conversationId,
          message: hookMessage,
          modelMessages: input.modelMessages ?? [
            {
              role: hookMessage.role,
              content: hookMessage.parts,
            },
          ],
        },
      });
    }),
    applyMessageUpdated: jest.fn(async (input: {
      hookContext: unknown;
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
      nextMessage: {
        id?: string;
        role: string;
        content: string | null;
        parts: unknown[];
        provider?: string | null;
        model?: string | null;
        status?: string | null;
      };
    }) => {
      const nextMessage = toHookMessage({
        role: input.nextMessage.role,
        content: input.nextMessage.content,
        parts: input.nextMessage.parts,
        ...(typeof input.nextMessage.provider !== 'undefined'
          ? { provider: input.nextMessage.provider }
          : {}),
        ...(typeof input.nextMessage.model !== 'undefined'
          ? { model: input.nextMessage.model }
          : {}),
        ...(input.nextMessage.status ? { status: input.nextMessage.status } : {}),
      });
      return runMessageUpdatedHooks({
        context: input.hookContext,
        payload: {
          context: input.hookContext,
          conversationId: input.conversationId,
          messageId: input.messageId,
          currentMessage: toHookMessageRecord(input.currentMessage),
          nextMessage,
        },
      });
    }),
    dispatchMessageDeleted: jest.fn(async (input: {
      hookContext: unknown;
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
    }) =>
      runMessageDeletedHooks({
        context: input.hookContext,
        payload: {
          context: input.hookContext,
          conversationId: input.conversationId,
          messageId: input.messageId,
          message: toHookMessageRecord(input.message),
        },
      })),
    applyChatBeforeModelHooks: jest.fn(async (input: {
      userId: string;
      conversationId: string;
      activePersonaId: string;
      systemPrompt: string;
      modelConfig: { providerId: string; id: string };
      messages: unknown[];
    }) => {
      const context = createChatHookContext({
        userId: input.userId,
        conversationId: input.conversationId,
        activeProviderId: input.modelConfig.providerId,
        activeModelId: input.modelConfig.id,
        activePersonaId: input.activePersonaId,
      });
      const request = {
        providerId: input.modelConfig.providerId,
        modelId: input.modelConfig.id,
        systemPrompt: input.systemPrompt,
        messages: input.messages,
        availableTools: await toolRegistry.listAvailableToolSummaries({
          context: {
            source: 'chat-tool',
            userId: input.userId,
            conversationId: input.conversationId,
            activeProviderId: input.modelConfig.providerId,
            activeModelId: input.modelConfig.id,
            activePersonaId: input.activePersonaId,
          },
        }),
      };
      const hookResult = await runChatBeforeModelHooks({
        context,
        payload: {
          context,
          request,
        },
      });
      if (hookResult.action === 'short-circuit') {
        const normalizedAssistant = normalizeAssistantOutput({
          content: hookResult.assistantContent,
          parts: hookResult.assistantParts,
        });
        return {
          ...hookResult,
          assistantContent: normalizedAssistant.content,
          assistantParts: normalizedAssistant.parts,
        };
      }

      return {
        action: 'continue' as const,
        request: hookResult.request,
        modelConfig: aiProvider.getModelConfig(
          hookResult.request.providerId,
          hookResult.request.modelId,
        ),
        buildToolSet: ({
          context: nextContext,
          allowedToolNames,
        }: {
          context: unknown;
          allowedToolNames?: string[];
        }) => toolRegistry.buildToolSet({
          context: nextContext,
          allowedToolNames,
        }),
      };
    }),
    dispatchChatWaitingModel: jest.fn(async (input: {
      assistantMessageId: string;
      userId: string;
      conversationId: string;
      request: unknown;
      activeProviderId: string;
      activeModelId: string;
      activePersonaId: string;
    }) =>
      runChatWaitingModelHooks({
        context: createChatHookContext({
          userId: input.userId,
          conversationId: input.conversationId,
          activeProviderId: input.activeProviderId,
          activeModelId: input.activeModelId,
          activePersonaId: input.activePersonaId,
        }),
        payload: {
          context: createChatHookContext({
            userId: input.userId,
            conversationId: input.conversationId,
            activeProviderId: input.activeProviderId,
            activeModelId: input.activeModelId,
            activePersonaId: input.activePersonaId,
          }),
          conversationId: input.conversationId,
          assistantMessageId: input.assistantMessageId,
          providerId: input.activeProviderId,
          modelId: input.activeModelId,
          request: input.request,
        },
      })),
    applyFinalResponseHooks: jest.fn(async (input: {
      userId: string;
      conversationId: string;
      activePersonaId: string;
      responseSource: string;
      result: {
        assistantMessageId: string;
        conversationId: string;
        providerId: string;
        modelId: string;
        content: string;
        parts: unknown[];
        toolCalls: unknown[];
        toolResults: unknown[];
      };
    }) => {
      const context = createChatHookContext({
        userId: input.userId,
        conversationId: input.conversationId,
        activeProviderId: input.result.providerId,
        activeModelId: input.result.modelId,
        activePersonaId: input.activePersonaId,
      });
      const afterModelPayload = await runChatAfterModelHooks({
        context,
        payload: {
          assistantMessageId: input.result.assistantMessageId,
          providerId: input.result.providerId,
          modelId: input.result.modelId,
          assistantContent: input.result.content,
          assistantParts: input.result.parts,
          toolCalls: input.result.toolCalls,
          toolResults: input.result.toolResults,
        },
      });
      const normalizedAfterModel = normalizeAssistantOutput({
        content: afterModelPayload.assistantContent,
        parts: afterModelPayload.assistantParts,
      });
      const afterModelResult = (
        normalizedAfterModel.content === input.result.content
        && JSON.stringify(normalizedAfterModel.parts) === JSON.stringify(input.result.parts ?? [])
      )
        ? input.result
        : {
            ...input.result,
            content: normalizedAfterModel.content,
            parts: normalizedAfterModel.parts,
          };
      const beforeSendPayload = await runResponseBeforeSendHooks({
        context,
        payload: {
          context,
          responseSource: input.responseSource,
          assistantMessageId: input.result.assistantMessageId,
          providerId: afterModelResult.providerId,
          modelId: afterModelResult.modelId,
          assistantContent: afterModelResult.content,
          assistantParts: afterModelResult.parts,
          toolCalls: afterModelResult.toolCalls,
          toolResults: afterModelResult.toolResults,
        },
      });
      const normalizedBeforeSend = normalizeAssistantOutput({
        content: beforeSendPayload.assistantContent,
        parts: beforeSendPayload.assistantParts,
      });
      return {
        ...afterModelResult,
        providerId: beforeSendPayload.providerId,
        modelId: beforeSendPayload.modelId,
        content: normalizedBeforeSend.content,
        parts: normalizedBeforeSend.parts,
        toolCalls: beforeSendPayload.toolCalls ?? [],
        toolResults: beforeSendPayload.toolResults ?? [],
      };
    }),
    runResponseAfterSendHooks: jest.fn(async (input: {
      userId: string;
      conversationId: string;
      activePersonaId: string;
      responseSource: string;
      result: {
        assistantMessageId: string;
        providerId: string;
        modelId: string;
        content: string;
        parts: unknown[];
        toolCalls: unknown[];
        toolResults: unknown[];
      };
    }) =>
      runResponseAfterSendHooks({
        context: {
          source: 'chat-hook',
          userId: input.userId,
          conversationId: input.conversationId,
          activeProviderId: input.result.providerId,
          activeModelId: input.result.modelId,
          activePersonaId: input.activePersonaId,
        },
        payload: {
          context: {
            source: 'chat-hook',
            userId: input.userId,
            conversationId: input.conversationId,
            activeProviderId: input.result.providerId,
            activeModelId: input.result.modelId,
            activePersonaId: input.activePersonaId,
          },
          responseSource: input.responseSource,
          assistantMessageId: input.result.assistantMessageId,
          providerId: input.result.providerId,
          modelId: input.result.modelId,
          assistantContent: input.result.content,
          assistantParts: input.result.parts,
          toolCalls: input.result.toolCalls,
          toolResults: input.result.toolResults,
        },
      })),
  };

  const toolRegistry = {
    prepareToolSelection: jest.fn(),
    buildToolSet: jest.fn(),
    listAvailableToolSummaries: jest.fn(),
  };

  const modelInvocation = {
    prepareResolved: jest.fn(),
    streamPrepared: jest.fn(),
  };

  const chatTaskService = {
    startTask: jest.fn(),
    stopTask: jest.fn(),
  };

  const skillSession = {
    getConversationSkillContext: jest.fn(),
  };

  const skillCommands = {
    tryHandleMessage: jest.fn(),
  };
  const chatModuleRef = {
    get: jest.fn(),
  };
  const orchestrationModuleRef = {
    get: jest.fn(),
  };
  const mutationModuleRef = {
    get: jest.fn(),
  };
  const generationModuleRef = {
    get: jest.fn(),
  };

  jest.clearAllMocks();
  chatModuleRef.get.mockImplementation((token: { name?: string }) =>
    token?.name === 'PluginChatRuntimeFacade' ? pluginChatRuntime : null);
  orchestrationModuleRef.get.mockImplementation((token: { name?: string }) =>
    token?.name === 'PluginChatRuntimeFacade' ? pluginChatRuntime : null);
  mutationModuleRef.get.mockImplementation((token: { name?: string }) =>
    token?.name === 'PluginChatRuntimeFacade' ? pluginChatRuntime : null);
  generationModuleRef.get.mockImplementation((token: { name?: string }) =>
    token?.name === 'PluginChatRuntimeFacade' ? pluginChatRuntime : null);
  personaService.getCurrentPersona.mockResolvedValue({
    source: 'default',
    personaId: 'builtin.default-assistant',
    name: 'Default Assistant',
    prompt: '你是 Garlic Claw',
    isDefault: true,
  });
  pluginRuntime.runMessageReceivedHooks.mockImplementation(
    async ({ payload }: { payload: unknown }) => ({
      action: 'continue',
      payload,
    }),
  );
  pluginRuntime.runChatBeforeModelHooks.mockImplementation(
    async ({ payload }: { payload: { request: unknown } }) => ({
      action: 'continue',
      request: payload.request,
    }),
  );
  pluginRuntime.runChatWaitingModelHooks.mockResolvedValue(undefined);
  pluginRuntime.runChatAfterModelHooks.mockImplementation(
    async ({ payload }: { payload: unknown }) => payload,
  );
  pluginRuntime.runMessageCreatedHooks.mockImplementation(
    async ({ payload }: { payload: unknown }) => payload,
  );
  pluginRuntime.runMessageUpdatedHooks.mockImplementation(
    async ({ payload }: { payload: unknown }) => payload,
  );
  pluginRuntime.runMessageDeletedHooks.mockResolvedValue(undefined);
  pluginRuntime.runResponseBeforeSendHooks.mockImplementation(
    async ({ payload }: { payload: unknown }) => payload,
  );
  pluginRuntime.runResponseAfterSendHooks.mockResolvedValue(undefined);
  skillSession.getConversationSkillContext.mockResolvedValue({
    activeSkills: [],
    systemPrompt: '',
    allowedToolNames: null,
    deniedToolNames: [],
  });
  skillCommands.tryHandleMessage.mockResolvedValue(null);
  toolRegistry.buildToolSet.mockReturnValue(undefined);
  toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);
  toolRegistry.prepareToolSelection.mockImplementation(
    async (input: {
      context: {
        source: 'chat-tool';
        userId: string;
        conversationId: string;
        activeProviderId: string;
        activeModelId: string;
        activePersonaId?: string;
      };
    }) => ({
      availableTools: await toolRegistry.listAvailableToolSummaries(input),
      buildToolSet: ({
        context,
        allowedToolNames,
      }: {
        context: {
          source: 'chat-tool';
          userId: string;
          conversationId: string;
          activeProviderId: string;
          activeModelId: string;
          activePersonaId?: string;
        };
        allowedToolNames?: string[];
      }) => toolRegistry.buildToolSet({
        ...input,
        context,
        allowedToolNames,
      }),
    }),
  );
  const orchestration = new ChatMessageOrchestrationService(
    modelInvocation as never,
    orchestrationModuleRef as unknown as ModuleRef,
  );
  const mutationService = new ChatMessageMutationService(
    prisma as never,
    chatService as never,
    orchestration as never,
    chatTaskService as never,
    mutationModuleRef as unknown as ModuleRef,
  );
  const generationService = new ChatMessageGenerationService(
    prisma as never,
    chatService as never,
    aiProvider as never,
    personaService as never,
    modelInvocation as never,
    orchestration as never,
    chatTaskService as never,
    mutationService as never,
    skillCommands as never,
    generationModuleRef as unknown as ModuleRef,
  );
  const service = new ChatMessageService(
    generationService as never,
    mutationService as never,
  );

  return {
    service,
    prisma,
    chatService,
    aiProvider,
    personaService,
    pluginRuntime,
    runMessageReceivedHooks,
    runChatBeforeModelHooks,
    runChatWaitingModelHooks,
    runChatAfterModelHooks,
    runMessageCreatedHooks,
    runMessageUpdatedHooks,
    runMessageDeletedHooks,
    runResponseBeforeSendHooks,
    runResponseAfterSendHooks,
    toolRegistry,
    modelInvocation,
    chatTaskService,
    skillCommands,
  };
}

export type ChatMessageSpecFixture = ReturnType<typeof createChatMessageSpecFixture>;
