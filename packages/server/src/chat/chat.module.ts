import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { CacheModule } from '../cache/cache.module';
import { McpModule } from '../mcp/mcp.module';
import { PluginModule } from '../plugin/plugin.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [PluginModule, AutomationModule, McpModule, CacheModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
