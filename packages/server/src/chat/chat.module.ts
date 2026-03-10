import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { PluginModule } from '../plugin/plugin.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [PluginModule, AutomationModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
