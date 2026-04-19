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

describe('BuiltinMemoryContextPlugin', () => {
  it('injects matched memories into the current system prompt before model execution', async () => {
    const fixture = createRuntimeFixture();
    fixture.pluginBootstrapService.bootstrapBuiltins();

    fixture.runtimeHostUserContextService.saveMemory(
      {
        source: 'plugin',
        userId: 'user-1',
      },
      {
        category: 'preference',
        content: '用户偏好手冲咖啡和浅烘豆。',
      },
    );

    await expect(
      fixture.runtimeHostPluginDispatchService.invokeHook({
        context: {
          activeModelId: 'gpt-5.4',
          activeProviderId: 'openai',
          conversationId: 'conversation-1',
          source: 'chat-hook',
          userId: 'user-1',
        },
        hookName: 'chat:before-model',
        payload: {
          context: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'chat-hook',
            userId: 'user-1',
          },
          request: {
            availableTools: [],
            messages: [
              {
                content: '手冲咖啡',
                role: 'user',
              },
            ],
            modelId: 'gpt-5.4',
            providerId: 'openai',
            systemPrompt: '你是默认助手。',
          },
        },
        pluginId: 'builtin.memory-context',
      }),
    ).resolves.toEqual({
      action: 'mutate',
      systemPrompt: [
        '你是默认助手。',
        '与此用户相关的记忆：\n- [preference] 用户偏好手冲咖啡和浅烘豆。',
      ].join('\n\n'),
    });
  });

  it('passes through when there is no matched memory for the latest user message', async () => {
    const fixture = createRuntimeFixture();
    fixture.pluginBootstrapService.bootstrapBuiltins();

    await expect(
      fixture.runtimeHostPluginDispatchService.invokeHook({
        context: {
          activeModelId: 'gpt-5.4',
          activeProviderId: 'openai',
          conversationId: 'conversation-1',
          source: 'chat-hook',
          userId: 'user-1',
        },
        hookName: 'chat:before-model',
        payload: {
          context: {
            activeModelId: 'gpt-5.4',
            activeProviderId: 'openai',
            conversationId: 'conversation-1',
            source: 'chat-hook',
            userId: 'user-1',
          },
          request: {
            availableTools: [],
            messages: [
              {
                content: '帮我写一段关于 MCP 的说明',
                role: 'user',
              },
            ],
            modelId: 'gpt-5.4',
            providerId: 'openai',
            systemPrompt: '你是默认助手。',
          },
        },
        pluginId: 'builtin.memory-context',
      }),
    ).resolves.toEqual({ action: 'pass' });
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
  const runtimeHostUserContextService = new RuntimeHostUserContextService();
  const aiManagementService = new AiManagementService(new AiProviderSettingsService());
  aiManagementService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    mode: 'protocol',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });
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
    {
      generateText: jest.fn(),
    } as never,
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
    runtimeHostUserContextService,
    new PersonaService(new PersonaStoreService(), runtimeHostConversationRecordService),
  );
  runtimeHostService.onModuleInit();

  return {
    pluginBootstrapService,
    runtimeHostPluginDispatchService,
    runtimeHostUserContextService,
  };
}
