import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { BootstrapAdminService } from '../../auth/bootstrap-admin.service';
import { PluginBootstrapService } from '../../plugin/bootstrap/plugin-bootstrap.service';

const DEFAULT_GLOBAL_PREFIX = 'api';
const DEFAULT_HTTP_PORT = 23331;

export async function bootstrapHttpApp(): Promise<void> {
  const { globalPrefix, port } = readHttpServerConfig();
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.get(PluginBootstrapService).bootstrapBuiltins();

  await app.listen(port);
  void app.get(BootstrapAdminService).runStartupWarmup();
}

export function readHttpServerConfig(env: NodeJS.ProcessEnv = process.env): {
  globalPrefix: string;
  port: number;
} {
  const rawPort = env.PORT?.trim();
  const port = rawPort ? Number(rawPort) : DEFAULT_HTTP_PORT;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer');
  }

  return {
    globalPrefix: env.HTTP_GLOBAL_PREFIX?.trim() || DEFAULT_GLOBAL_PREFIX,
    port,
  };
}
