import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AiProviderService } from '../ai';
import { AuthModule } from '../auth/auth.module';
import { KbModule } from '../kb/kb.module';
import { PersonaModule } from '../persona/persona.module';
import { SkillModule } from '../skill/skill.module';
import { SkillSessionService } from '../skill/skill-session.service';
import { ToolModule } from '../tool/tool.module';
import { ToolRegistryService } from '../tool/tool-registry.service';
import { BuiltinPluginLoader } from './builtin/builtin-plugin.loader';
import { PluginAdminService } from './plugin-admin.service';
import {
  CHAT_RUNTIME_DEPS,
  type ChatRuntimeDeps,
} from './plugin-chat-runtime.deps';
import { PluginChatRuntimeFacade } from './plugin-chat-runtime.facade';
import { PluginCommandController } from './plugin-command.controller';
import { PluginCommandService } from './plugin-command.service';
import { PluginCronService } from './plugin-cron.service';
import { PluginCronSchedulerService } from './plugin-cron-scheduler.service';
import { PluginController } from './plugin.controller';
import { PluginEventWriteService } from './plugin-event-write.service';
import { PluginGateway } from './plugin.gateway';
import { PluginGovernanceWriteService } from './plugin-governance-write.service';
import { PluginHostService } from './plugin-host.service';
import { PluginHostAiFacade } from './plugin-host-ai.facade';
import { PluginHostConversationFacade } from './plugin-host-conversation.facade';
import { PluginHostStateFacade } from './plugin-host-state.facade';
import { PluginLifecycleWriteService } from './plugin-lifecycle-write.service';
import { PluginReadService } from './plugin-read.service';
import { PluginRemoteBootstrapService } from './plugin-remote-bootstrap.service';
import { PluginRouteController } from './plugin-route.controller';
import { PluginRuntimeBroadcastFacade } from './plugin-runtime-broadcast.facade';
import { PluginRuntimeAutomationFacade } from './plugin-runtime-automation.facade';
import { PluginRuntimeGovernanceFacade } from './plugin-runtime-governance.facade';
import { PluginRuntimeHostFacade } from './plugin-runtime-host.facade';
import { PluginRuntimeInboundHooksFacade } from './plugin-runtime-inbound-hooks.facade';
import { PluginRuntimeMessageHooksFacade } from './plugin-runtime-message-hooks.facade';
import { PluginRuntimeOperationHooksFacade } from './plugin-runtime-operation-hooks.facade';
import { PluginRuntimeSubagentFacade } from './plugin-runtime-subagent.facade';
import { PluginRuntimeTransportFacade } from './plugin-runtime-transport.facade';
import { PluginRuntimeOrchestratorService } from './plugin-runtime-orchestrator.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginStateService } from './plugin-state.service';
import { PluginStorageService } from './plugin-storage.service';
import { PluginSubagentTaskController } from './plugin-subagent-task.controller';
import { PluginSubagentTaskService } from './plugin-subagent-task.service';
import { PluginService } from './plugin.service';

@Module({
  imports: [
    JwtModule.register({}),
    AuthModule,
    KbModule,
    PersonaModule,
    ToolModule,
    SkillModule,
  ],
  providers: [
    {
      provide: CHAT_RUNTIME_DEPS,
      useFactory: (
        aiProvider: AiProviderService,
        toolRegistry: ToolRegistryService,
        skillService: SkillSessionService,
      ): ChatRuntimeDeps => ({
        aiProvider,
        toolRegistry,
        skillService,
      }),
      inject: [AiProviderService, ToolRegistryService, SkillSessionService],
    },
    PluginService,
    PluginChatRuntimeFacade,
    PluginEventWriteService,
    PluginGovernanceWriteService,
    PluginLifecycleWriteService,
    PluginReadService,
    PluginRemoteBootstrapService,
    PluginStorageService,
    PluginGateway,
    PluginStateService,
    PluginHostAiFacade,
    PluginHostConversationFacade,
    PluginHostStateFacade,
    PluginHostService,
    PluginRuntimeAutomationFacade,
    PluginRuntimeBroadcastFacade,
    PluginRuntimeGovernanceFacade,
    PluginRuntimeHostFacade,
    PluginRuntimeInboundHooksFacade,
    PluginRuntimeMessageHooksFacade,
    PluginRuntimeOperationHooksFacade,
    PluginRuntimeSubagentFacade,
    PluginRuntimeTransportFacade,
    PluginCronSchedulerService,
    PluginCronService,
    PluginRuntimeService,
    PluginRuntimeOrchestratorService,
    BuiltinPluginLoader,
    PluginAdminService,
    PluginCommandService,
    PluginSubagentTaskService,
  ],
  controllers: [
    PluginController,
    PluginRouteController,
    PluginCommandController,
    PluginSubagentTaskController,
  ],
  exports: [
    PluginService,
    PluginChatRuntimeFacade,
    PluginEventWriteService,
    PluginGovernanceWriteService,
    PluginLifecycleWriteService,
    PluginReadService,
    PluginRemoteBootstrapService,
    PluginStorageService,
    PluginGateway,
    PluginHostService,
    PluginHostAiFacade,
    PluginHostConversationFacade,
    PluginHostStateFacade,
    PluginRuntimeAutomationFacade,
    PluginRuntimeBroadcastFacade,
    PluginRuntimeGovernanceFacade,
    PluginRuntimeHostFacade,
    PluginRuntimeInboundHooksFacade,
    PluginRuntimeMessageHooksFacade,
    PluginRuntimeOperationHooksFacade,
    PluginRuntimeSubagentFacade,
    PluginRuntimeTransportFacade,
    PluginCronSchedulerService,
    PluginCronService,
    PluginRuntimeService,
    PluginRuntimeOrchestratorService,
    PluginStateService,
    PluginAdminService,
    PluginCommandService,
    PluginSubagentTaskService,
  ],
})
export class PluginModule {}
