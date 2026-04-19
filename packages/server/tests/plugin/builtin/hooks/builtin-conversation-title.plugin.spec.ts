import { AiManagementService } from '../../../../src/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../../src/ai-management/ai-provider-settings.service';
import { BuiltinPluginRegistryService } from '../../../../src/plugin/builtin/builtin-plugin-registry.service';
import { PluginBootstrapService } from '../../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../../src/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../../src/plugin/persistence/plugin-persistence.service';
import { PersonaService } from '../../../../src/persona/persona.service';
import { PersonaStoreService } from '../../../../src/persona/persona-store.service';
import { RuntimeGatewayConnectionLifecycleService } from '../../../../src/runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from '../../../../src/runtime/gateway/runtime-gateway-remote-transport.service';
import { RuntimeHostConversationMessageService } from '../../../../src/runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostKnowledgeService } from '../../../../src/runtime/host/runtime-host-knowledge.service';
import { RuntimeHostPluginDispatchService } from '../../../../src/runtime/host/runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from '../../../../src/runtime/host/runtime-host-plugin-runtime.service';
import { RuntimeHostSubagentRunnerService } from '../../../../src/runtime/host/runtime-host-subagent-runner.service';
import { RuntimeHostService } from '../../../../src/runtime/host/runtime-host.service';
import { RuntimeHostUserContextService } from '../../../../src/runtime/host/runtime-host-user-context.service';

describe('BuiltinConversationTitlePlugin', () => {
  it('updates the conversation title after the main assistant reply completes', async () => {
    const fixture = createRuntimeFixture();
    fixture.pluginBootstrapService.bootstrapBuiltins();

    const conversationId = (
      fixture.runtimeHostConversationRecordService.createConversation({
        title: 'New Chat',
        userId: 'user-1',
      }) as { id: string }
    ).id;

    fixture.runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '帮我整理一下 MCP 报错',
      role: 'user',
      status: 'completed',
    });
    const assistantMessage = fixture.runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '先检查 launcher 和 stdio transport。',
      model: 'gpt-5.4',
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
    });

    await expect(
      fixture.runtimeHostPluginDispatchService.invokeHook({
        context: {
          activeModelId: 'gpt-5.4',
          activeProviderId: 'openai',
          conversationId,
          source: 'chat-hook',
          userId: 'user-1',
        },
        hookName: 'chat:after-model',
        payload: {
          assistantContent: '先检查 launcher 和 stdio transport。',
          assistantMessageId: String((assistantMessage as { id?: unknown }).id),
          assistantParts: [{ text: '先检查 launcher 和 stdio transport。', type: 'text' }],
          modelId: 'gpt-5.4',
          providerId: 'openai',
          toolCalls: [],
          toolResults: [],
        },
        pluginId: 'builtin.conversation-title',
      }),
    ).resolves.toEqual({ action: 'pass' });

    expect(fixture.aiModelExecutionService.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        allowFallbackChatModels: true,
        messages: [{ content: expect.stringContaining('用户: 帮我整理一下 MCP 报错'), role: 'user' }],
        transportMode: 'stream-collect',
      }),
    );
    expect(
      fixture.runtimeHostConversationRecordService.requireConversation(conversationId, 'user-1').title,
    ).toBe('MCP 启动报错排查');
  });

  it('skips title generation when the conversation title is already customized', async () => {
    const fixture = createRuntimeFixture();
    fixture.pluginBootstrapService.bootstrapBuiltins();

    const conversationId = (
      fixture.runtimeHostConversationRecordService.createConversation({
        title: '我的排障记录',
        userId: 'user-1',
      }) as { id: string }
    ).id;

    fixture.runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '帮我整理一下 MCP 报错',
      role: 'user',
      status: 'completed',
    });
    const assistantMessage = fixture.runtimeHostConversationMessageService.createMessage(conversationId, {
      content: '先检查 launcher 和 stdio transport。',
      model: 'gpt-5.4',
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
    });

    await expect(
      fixture.runtimeHostPluginDispatchService.invokeHook({
        context: {
          activeModelId: 'gpt-5.4',
          activeProviderId: 'openai',
          conversationId,
          source: 'chat-hook',
          userId: 'user-1',
        },
        hookName: 'chat:after-model',
        payload: {
          assistantContent: '先检查 launcher 和 stdio transport。',
          assistantMessageId: String((assistantMessage as { id?: unknown }).id),
          assistantParts: [{ text: '先检查 launcher 和 stdio transport。', type: 'text' }],
          modelId: 'gpt-5.4',
          providerId: 'openai',
          toolCalls: [],
          toolResults: [],
        },
        pluginId: 'builtin.conversation-title',
      }),
    ).resolves.toEqual({ action: 'pass' });

    expect(fixture.aiModelExecutionService.generateText).not.toHaveBeenCalled();
    expect(
      fixture.runtimeHostConversationRecordService.requireConversation(conversationId, 'user-1').title,
    ).toBe('我的排障记录');
  });
});

function createRuntimeFixture() {
  const builtinPluginRegistryService = new BuiltinPluginRegistryService();
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    new PluginPersistenceService(),
    builtinPluginRegistryService,
  );
  const runtimeGatewayConnectionLifecycleService = new RuntimeGatewayConnectionLifecycleService(
    pluginBootstrapService,
  );
  const runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
  const runtimeHostConversationMessageService = new RuntimeHostConversationMessageService(
    runtimeHostConversationRecordService,
  );
  const aiManagementService = new AiManagementService(new AiProviderSettingsService());
  aiManagementService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    mode: 'protocol',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });
  const aiModelExecutionService = {
    generateText: jest.fn(async () => ({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'MCP 启动报错排查',
    })),
  };
  const runtimeHostPluginDispatchService = new RuntimeHostPluginDispatchService(
    builtinPluginRegistryService,
    pluginBootstrapService,
    new RuntimeGatewayRemoteTransportService(runtimeGatewayConnectionLifecycleService),
  );
  const runtimeHostService = new RuntimeHostService(
    pluginBootstrapService,
    {
      create: jest.fn(),
      emitEvent: jest.fn(),
      listByUser: jest.fn(),
      run: jest.fn(),
      toggle: jest.fn(),
    } as never,
    runtimeHostConversationMessageService,
    runtimeHostConversationRecordService,
    aiModelExecutionService as never,
    aiManagementService,
    new RuntimeHostKnowledgeService(),
    runtimeHostPluginDispatchService,
    new RuntimeHostPluginRuntimeService(),
    {
      getTask: jest.fn(),
      listTasks: jest.fn(),
      listOverview: jest.fn(),
      runSubagent: jest.fn(),
      startTask: jest.fn(),
    } as unknown as RuntimeHostSubagentRunnerService,
    new RuntimeHostUserContextService(),
    new PersonaService(new PersonaStoreService(), runtimeHostConversationRecordService),
  );
  runtimeHostService.onModuleInit();

  return {
    aiModelExecutionService,
    pluginBootstrapService,
    runtimeHostConversationMessageService,
    runtimeHostConversationRecordService,
    runtimeHostPluginDispatchService,
  };
}
