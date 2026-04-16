import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AiController } from './adapters/http/ai/ai.controller';
import { ApiKeyController } from './adapters/http/auth/api-key.controller';
import { AuthController } from './adapters/http/auth/auth.controller';
import { AutomationController } from './adapters/http/automation/automation.controller';
import { ConversationController } from './adapters/http/conversation/conversation.controller';
import { OpenApiMessageController } from './adapters/http/conversation/open-api-message.controller';
import { HealthController } from './adapters/http/health/health.controller';
import { McpController } from './adapters/http/mcp/mcp.controller';
import { MemoryController } from './adapters/http/memory/memory.controller';
import { PersonaController } from './adapters/http/persona/persona.controller';
import { PluginController } from './adapters/http/plugin/plugin.controller';
import { SkillController } from './adapters/http/skill/skill.controller';
import { ToolController } from './adapters/http/tool/tool.controller';
import { UserController } from './adapters/http/user/user.controller';
import { AdminIdentityService } from './auth/admin-identity.service';
import { ApiKeyService } from './auth/api-key.service';
import { AuthService } from './auth/auth.service';
import { BootstrapAdminService } from './auth/bootstrap-admin.service';
import { ApiKeyAuthGuard, AuthScopeGuard, JwtAuthGuard, RolesGuard } from './auth/http-auth';
import { RequestAuthService } from './auth/request-auth.service';
import { PluginGatewayWsModule } from './adapters/ws/plugin-gateway/plugin-gateway.module';
import { ConversationMessagePlanningService } from './conversation/conversation-message-planning.service';
import { ConversationMessageLifecycleService } from './conversation/conversation-message-lifecycle.service';
import { ConversationTaskService } from './conversation/conversation-task.service';
import { PluginModule } from './plugin/plugin.module';
import { RuntimeHostModule } from './runtime/host/runtime-host.module';
import { RuntimeKernelModule } from './runtime/kernel/runtime-kernel.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    JwtModule.register({}),
    PluginGatewayWsModule,
    PluginModule,
    RuntimeHostModule,
    RuntimeKernelModule,
  ],
  controllers: [AiController, ApiKeyController, AuthController, AutomationController, ConversationController, HealthController, McpController, MemoryController, OpenApiMessageController, PersonaController, PluginController, SkillController, ToolController, UserController],
  providers: [AdminIdentityService, ApiKeyAuthGuard, ApiKeyService, AuthScopeGuard, AuthService, BootstrapAdminService, ConversationMessageLifecycleService, ConversationMessagePlanningService, ConversationTaskService, JwtAuthGuard, Reflector, RequestAuthService, RolesGuard],
})
export class AppModule {}
