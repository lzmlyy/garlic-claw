import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app/app.module';
import { BootstrapUserService } from '../modules/auth/bootstrap-user.service';
import { ToolManagementSettingsService } from '../modules/execution/tool/tool-management-settings.service';
import { PluginBootstrapService } from '../modules/plugin/bootstrap/plugin-bootstrap.service';
import { ConversationStoreService } from '../modules/runtime/host/conversation-store.service';
import { PluginRuntimeService } from '../modules/runtime/host/plugin-runtime.service';
import { RuntimePluginGovernanceService } from '../modules/runtime/kernel/runtime-plugin-governance.service';

const DEFAULT_GLOBAL_PREFIX = 'api';
const DEFAULT_HTTP_PORT = 23330;

export async function bootstrapHttpApp(): Promise<void> {
  const { globalPrefix, port } = readHttpServerConfig();
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const pluginBootstrapService = app.get(PluginBootstrapService);
  const conversationStore = app.get(ConversationStoreService);
  const pluginRuntime = app.get(PluginRuntimeService);
  const runtimePluginGovernanceService = app.get(RuntimePluginGovernanceService);
  const toolManagementSettingsService = app.get(ToolManagementSettingsService);
  const bootstrapUserService = app.get(BootstrapUserService);
  bootstrapUserService.validateStartupAuthConfig();
  pluginBootstrapService.bootstrapBuiltins();
  pluginBootstrapService.bootstrapProjectPlugins((pluginId) => {
    pluginRuntime.deletePluginRuntimeState(pluginId);
    conversationStore.deletePluginConversationSessions(pluginId);
    runtimePluginGovernanceService.deletePluginRuntimeState(pluginId);
    toolManagementSettingsService.deleteSourceOverrides(`plugin:${pluginId}`);
  });

  await app.listen(port);
  bootstrapUserService.runStartupWarmup();
}

export function readHttpServerConfig(env: NodeJS.ProcessEnv = process.env): {
  globalPrefix: string;
  port: number;
} {
  const rawPort = env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : DEFAULT_HTTP_PORT;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT 必须是正整数');
  }

  return {
    globalPrefix: env.HTTP_GLOBAL_PREFIX?.trim() || DEFAULT_GLOBAL_PREFIX,
    port,
  };
}
