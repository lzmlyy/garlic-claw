import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { KbModule } from '../kb/kb.module';
import { PersonaModule } from '../persona/persona.module';
import { ToolModule } from '../tool/tool.module';
import { BuiltinPluginLoader } from './builtin/builtin-plugin.loader';
import { PluginAdminService } from './plugin-admin.service';
import { PluginCommandController } from './plugin-command.controller';
import { PluginCommandService } from './plugin-command.service';
import { PluginCronService } from './plugin-cron.service';
import { PluginController } from './plugin.controller';
import { PluginGateway } from './plugin.gateway';
import { PluginHostService } from './plugin-host.service';
import { PluginHostAiFacade } from './plugin-host-ai.facade';
import { PluginHostConversationFacade } from './plugin-host-conversation.facade';
import { PluginHostStateFacade } from './plugin-host-state.facade';
import { PluginRouteController } from './plugin-route.controller';
import { PluginRuntimeGovernanceFacade } from './plugin-runtime-governance.facade';
import { PluginRuntimeHostFacade } from './plugin-runtime-host.facade';
import { PluginRuntimeOrchestratorService } from './plugin-runtime-orchestrator.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginStateService } from './plugin-state.service';
import { PluginSubagentTaskController } from './plugin-subagent-task.controller';
import { PluginSubagentTaskService } from './plugin-subagent-task.service';
import { PluginService } from './plugin.service';

@Module({
  imports: [
    JwtModule.register({}),
    AuthModule,
    KbModule,
    PersonaModule,
    forwardRef(() => ToolModule),
  ],
  providers: [
    PluginService,
    PluginGateway,
    PluginStateService,
    PluginHostAiFacade,
    PluginHostConversationFacade,
    PluginHostStateFacade,
    PluginHostService,
    PluginRuntimeGovernanceFacade,
    PluginRuntimeHostFacade,
    PluginCronService,
    PluginRuntimeService,
    PluginRuntimeOrchestratorService,
    BuiltinPluginLoader,
    PluginAdminService,
    PluginCommandService,
    PluginSubagentTaskService,
    {
      provide: 'PLUGIN_SUBAGENT_TASK_SERVICE',
      useExisting: PluginSubagentTaskService,
    },
  ],
  controllers: [
    PluginController,
    PluginRouteController,
    PluginCommandController,
    PluginSubagentTaskController,
  ],
  exports: [
    PluginService,
    PluginGateway,
    PluginHostService,
    PluginHostAiFacade,
    PluginHostConversationFacade,
    PluginHostStateFacade,
    PluginRuntimeGovernanceFacade,
    PluginRuntimeHostFacade,
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
