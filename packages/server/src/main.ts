import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { StartupWarmupService } from './startup/startup-warmup.service';

function validateEnv() {
  const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 23330;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Server running on http://localhost:${port}`);

  setImmediate(() => {
    void app.get(StartupWarmupService).runPostListenWarmups();
  });
  setImmediate(() => {
    void setupSwaggerDocs(app, logger, String(port));
  });
}

bootstrap();

async function setupSwaggerDocs(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  logger: Logger,
  port: string,
): Promise<void> {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Garlic Claw API')
    .setDescription('AI 秘书系统 — 设备控制与自动化')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
