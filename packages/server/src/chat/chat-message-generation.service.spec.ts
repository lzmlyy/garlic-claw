import { ModuleRef } from '@nestjs/core';
import { ChatMessageGenerationService } from './chat-message-generation.service';

describe('ChatMessageGenerationService', () => {
  const prisma = {
    message: {
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    conversation: {
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

  const pluginChatRuntime = {
    applyMessageReceived: jest.fn(),
  };

  const modelInvocation = {
    prepareResolved: jest.fn(),
  };

  const orchestration = {
    applyChatBeforeModelHooks: jest.fn(),
    buildStreamFactory: jest.fn(),
    applyFinalResponseHooks: jest.fn(),
    runResponseAfterSendHooks: jest.fn(),
  };

  const chatTaskService = {
    startTask: jest.fn(),
    stopTask: jest.fn(),
  };
  const mutationService = {
    startGenerationTurn: jest.fn(),
    createMessage: jest.fn(),
    createHookedMessage: jest.fn(),
    createPendingAssistantMessage: jest.fn(),
    completeShortCircuitedAssistant: jest.fn(),
    applyVisionFallbackMetadata: jest.fn(),
    markAssistantStopped: jest.fn(),
    resetAssistantForRetry: jest.fn(),
    markAssistantError: jest.fn(),
  };

  const skillCommands = {
    tryHandleMessage: jest.fn(),
  };
  const moduleRef = {
    get: jest.fn(),
  };

  let service: ChatMessageGenerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    moduleRef.get.mockImplementation((token: { name?: string }) =>
      token?.name === 'PluginChatRuntimeFacade' ? pluginChatRuntime : null);
    personaService.getCurrentPersona.mockResolvedValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: '默认助手',
      prompt: '你是 Garlic Claw',
      isDefault: true,
    });
    skillCommands.tryHandleMessage.mockResolvedValue(null);
    pluginChatRuntime.applyMessageReceived.mockImplementation(async ({ skillCommandResult, ...input }) =>
      skillCommandResult
        ? {
            action: 'short-circuit',
            payload: {
              context: {
                source: 'chat-hook',
                userId: input.userId,
                conversationId: input.conversationId,
                activeProviderId: input.modelConfig.providerId,
                activeModelId: input.modelConfig.id,
                activePersonaId: input.activePersonaId,
              },
              conversationId: input.conversationId,
              providerId: input.modelConfig.providerId,
              modelId: input.modelConfig.id,
              message: input.message,
              modelMessages: input.modelMessages,
            },
            ...skillCommandResult,
          }
        : {
            action: 'continue',
            payload: {
              context: {
                source: 'chat-hook',
                userId: input.userId,
                conversationId: input.conversationId,
                activeProviderId: input.modelConfig.providerId,
                activeModelId: input.modelConfig.id,
                activePersonaId: input.activePersonaId,
              },
              conversationId: input.conversationId,
              providerId: input.modelConfig.providerId,
              modelId: input.modelConfig.id,
              message: input.message,
              modelMessages: input.modelMessages,
            },
          });
    mutationService.markAssistantStopped.mockResolvedValue(undefined);
    mutationService.resetAssistantForRetry.mockResolvedValue({
      id: 'assistant-message-1',
      status: 'pending',
      provider: 'openai',
      model: 'gpt-5.2',
    });
    mutationService.markAssistantError.mockResolvedValue(undefined);
    service = new ChatMessageGenerationService(
      prisma as never,
      chatService as never,
      aiProvider as never,
      personaService as never,
      modelInvocation as never,
      orchestration as never,
      chatTaskService as never,
      mutationService as never,
      skillCommands as never,
      moduleRef as unknown as ModuleRef,
    );
  });

  it('rejects new generation when llm is disabled for the conversation', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      hostServicesJson: JSON.stringify({
        sessionEnabled: true,
        llmEnabled: false,
        ttsEnabled: true,
      }),
      messages: [],
    });

    await expect(
      service.startMessageGeneration('user-1', 'conversation-1', {
        content: '你好',
      } as never),
    ).rejects.toThrow('当前会话已关闭 LLM 自动回复');

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(chatTaskService.startTask).not.toHaveBeenCalled();
  });

  it('marks a pending assistant message as stopped when no active task exists', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'assistant-message-1',
          role: 'assistant',
          status: 'pending',
        },
      ],
    });
    chatTaskService.stopTask.mockResolvedValue(false);
    prisma.message.findUniqueOrThrow.mockResolvedValue({
      id: 'assistant-message-1',
      status: 'stopped',
    });
    prisma.conversation.update.mockResolvedValue(null);

    await expect(
      service.stopMessageGeneration('user-1', 'conversation-1', 'assistant-message-1'),
    ).resolves.toEqual({
      id: 'assistant-message-1',
      status: 'stopped',
    });

    expect(mutationService.markAssistantStopped).toHaveBeenCalledWith(
      'assistant-message-1',
      'conversation-1',
    );
  });

  it('rejects retry when provider and model are both missing', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      hostServicesJson: JSON.stringify({
        sessionEnabled: true,
        llmEnabled: true,
        ttsEnabled: true,
      }),
      messages: [
        {
          id: 'user-message-1',
          role: 'user',
          status: 'completed',
        },
        {
          id: 'assistant-message-1',
          role: 'assistant',
          provider: null,
          model: null,
          status: 'error',
        },
      ],
    });
    chatTaskService.stopTask.mockResolvedValue(false);

    await expect(
      service.retryMessageGeneration('user-1', 'conversation-1', 'assistant-message-1', {}),
    ).rejects.toThrow('缺少重试所需的 provider/model');

    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(chatTaskService.startTask).not.toHaveBeenCalled();
  });

  it('delegates message:received payload assembly to the plugin chat runtime facade', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      hostServicesJson: JSON.stringify({
        sessionEnabled: true,
        llmEnabled: true,
        ttsEnabled: true,
      }),
      messages: [],
    });
    aiProvider.getModelConfig.mockReturnValue({
      id: 'gpt-5.2',
      providerId: 'openai',
      capabilities: {
        toolCall: true,
      },
    });
    mutationService.startGenerationTurn = jest.fn().mockResolvedValue({
      userMessage: {
        id: 'user-message-1',
      },
      assistantMessage: {
        id: 'assistant-message-1',
        status: 'pending',
      },
      modelMessages: [],
    });
    orchestration.applyChatBeforeModelHooks.mockResolvedValue({
      action: 'short-circuit',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        systemPrompt: '你是 Garlic Claw',
        messages: [],
        availableTools: [],
      },
      assistantContent: '插件直接回复',
      assistantParts: [
        {
          type: 'text',
          text: '插件直接回复',
        },
      ],
      providerId: 'openai',
      modelId: 'gpt-5.2',
    });
    mutationService.completeShortCircuitedAssistant.mockResolvedValue({
      id: 'assistant-message-1',
      status: 'completed',
    });

    await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '你好',
      provider: 'openai',
      model: 'gpt-5.2',
    } as never);

    expect(pluginChatRuntime.applyMessageReceived).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      modelConfig: {
        id: 'gpt-5.2',
        providerId: 'openai',
        capabilities: {
          toolCall: true,
        },
      },
      message: {
        role: 'user',
        content: '你好',
        parts: [
          {
            type: 'text',
            text: '你好',
          },
        ],
      },
      modelMessages: [
        {
          role: 'user',
          content: '你好',
        },
      ],
      skillCommandResult: null,
    });
  });
});
