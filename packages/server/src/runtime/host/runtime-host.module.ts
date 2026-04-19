import { Module, OnModuleInit } from '@nestjs/common';
import { AiModelExecutionService } from '../../ai/ai-model-execution.service';
import { AiManagementService } from '../../ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../execution/automation/automation-execution.service';
import { AutomationService } from '../../execution/automation/automation.service';
import { McpConfigStoreService } from '../../execution/mcp/mcp-config-store.service';
import { McpService } from '../../execution/mcp/mcp.service';
import { SKILL_DISCOVERY_OPTIONS, SkillRegistryService } from '../../execution/skill/skill-registry.service';
import { SkillSessionService } from '../../execution/skill/skill-session.service';
import { ToolRegistryService } from '../../execution/tool/tool-registry.service';
import { PersonaService } from '../../persona/persona.service';
import { PersonaStoreService } from '../../persona/persona-store.service';
import { PluginModule } from '../../plugin/plugin.module';
import { RuntimeGatewayModule } from '../gateway/runtime-gateway.module';
import { RuntimeKernelModule } from '../kernel/runtime-kernel.module';
import { AiVisionService } from '../../vision/ai-vision.service';
import { RuntimeHostConversationMessageService } from './runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from './runtime-host-conversation-record.service';
import { RuntimeHostKnowledgeService } from './runtime-host-knowledge.service';
import { RuntimeHostPluginDispatchService } from './runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from './runtime-host-plugin-runtime.service';
import { RuntimeHostService } from './runtime-host.service';
import { RuntimeHostSubagentRunnerService } from './runtime-host-subagent-runner.service';
import { RuntimeHostSubagentTaskStoreService } from './runtime-host-subagent-task-store.service';
import { RuntimeHostUserContextService } from './runtime-host-user-context.service';

@Module({
  imports: [PluginModule, RuntimeGatewayModule, RuntimeKernelModule],
  providers: [
    AiModelExecutionService,
    AiManagementService,
    AiProviderSettingsService,
    AutomationExecutionService,
    AutomationService,
    McpConfigStoreService,
    McpService,
    PersonaService,
    PersonaStoreService,
    {
      provide: SKILL_DISCOVERY_OPTIONS,
      useValue: {},
    },
    AiVisionService,
    RuntimeHostConversationMessageService,
    RuntimeHostConversationRecordService,
    RuntimeHostKnowledgeService,
    RuntimeHostPluginDispatchService,
    RuntimeHostPluginRuntimeService,
    RuntimeHostService,
    RuntimeHostSubagentRunnerService,
    RuntimeHostSubagentTaskStoreService,
    RuntimeHostUserContextService,
    SkillRegistryService,
    SkillSessionService,
    ToolRegistryService,
  ],
  exports: [AiModelExecutionService, AiManagementService, AiProviderSettingsService, AiVisionService, AutomationService, McpService, PersonaService, PersonaStoreService, RuntimeHostConversationMessageService, RuntimeHostConversationRecordService, RuntimeHostKnowledgeService, RuntimeHostPluginDispatchService, RuntimeHostPluginRuntimeService, RuntimeHostSubagentRunnerService, RuntimeHostService, RuntimeHostUserContextService, SkillRegistryService, SkillSessionService, ToolRegistryService],
})
export class RuntimeHostModule implements OnModuleInit {
  constructor(private readonly runtimeHostSubagentRunnerService: RuntimeHostSubagentRunnerService) {}

  onModuleInit(): void {
    this.runtimeHostSubagentRunnerService.resumePendingTasks();
  }
}
