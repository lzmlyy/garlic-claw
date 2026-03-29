import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { AutomationModule } from './automation/automation.module';
import { ChatModule } from './chat/chat.module';
import { MemoryModule } from './memory/memory.module';
import { PersonaModule } from './persona/persona.module';
import { PluginModule } from './plugin/plugin.module';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60,
    }]),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
      },
    }),
    PrismaModule,
    AiModule,
    AuthModule,
    UserModule,
    ChatModule,
    PluginModule,
    MemoryModule,
    PersonaModule,
    AutomationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
