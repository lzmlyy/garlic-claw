import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { KbModule } from '../kb/kb.module';
import { PersonaModule } from '../persona/persona.module';
import { ToolModule } from '../tool/tool.module';
import { BuiltinPluginLoader } from './builtin/builtin-plugin.loader';
import { PluginAdminService } from './plugin-admin.service';
import { PluginCronService } from './plugin-cron.service';
import { PluginController } from './plugin.controller';
import { PluginGateway } from './plugin.gateway';
import { PluginHostService } from './plugin-host.service';
import { PluginRouteController } from './plugin-route.controller';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginStateService } from './plugin-state.service';
import { PluginService } from './plugin.service';

@Module({
  imports: [JwtModule.register({}), KbModule, PersonaModule, forwardRef(() => ToolModule)],
  providers: [
    PluginService,
    PluginGateway,
    PluginStateService,
    PluginHostService,
    PluginCronService,
    PluginRuntimeService,
    BuiltinPluginLoader,
    PluginAdminService,
  ],
  controllers: [PluginController, PluginRouteController],
  exports: [
    PluginService,
    PluginGateway,
    PluginHostService,
    PluginCronService,
    PluginRuntimeService,
    PluginStateService,
    PluginAdminService,
  ],
})
export class PluginModule {}
