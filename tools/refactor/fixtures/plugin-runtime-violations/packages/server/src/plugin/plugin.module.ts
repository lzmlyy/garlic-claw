import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../../../auth/auth.module';
import { KbModule } from '../../../kb/kb.module';
import { PersonaModule } from '../../../persona/persona.module';
import { PluginAdminService } from './plugin-admin.service';
import { PluginChatRuntimeFacade } from './plugin-chat-runtime.facade';
import { PluginGateway } from './plugin.gateway';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginService } from './plugin.service';

@Module({
  imports: [
    JwtModule.register({}),
    AuthModule,
    KbModule,
    PersonaModule,
  ],
  exports: [
    PluginAdminService,
    PluginChatRuntimeFacade,
    PluginGateway,
    PluginRuntimeService,
    PluginService,
  ],
})
export class PluginModule {}
