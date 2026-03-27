import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { PluginModule } from '../plugin/plugin.module';
import { ChatMessageTransformService } from './chat-message-transform.service';
import { ChatMessageService } from './chat-message.service';
import { ChatTaskService } from './chat-task.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [PluginModule, AutomationModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatMessageService,
    ChatTaskService,
    ChatMessageTransformService,
  ],
  exports: [ChatService, ChatMessageService, ChatTaskService],
})
export class ChatModule {}
