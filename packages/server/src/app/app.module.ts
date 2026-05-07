import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AiManagementModule } from '../modules/ai-management/ai-management.module';
import { AuthModule } from '../modules/auth/auth.module';
import { JwtAuthGuard } from '../modules/auth/http-auth';
import { CoreRuntimeModule } from '../core/runtime/core-runtime.module';
import { ConversationModule } from '../modules/conversation/conversation.module';
import { ExecutionApiModule } from '../modules/execution/execution-api.module';
import { HealthModule } from '../modules/health/health.module';
import { PersonaModule } from '../modules/persona/persona.module';
import { PluginApiModule } from '../modules/plugin/plugin-api.module';
import { PluginWsModule } from '../modules/plugin/ws/plugin-ws.module';
import { HostApiModule } from '../modules/runtime/host/host-api.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    AiManagementModule,
    AuthModule,
    CoreRuntimeModule,
    ConversationModule,
    ExecutionApiModule,
    HealthModule,
    PersonaModule,
    PluginApiModule,
    PluginWsModule,
    HostApiModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
