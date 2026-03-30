import { Module } from '@nestjs/common';
import { PersonaModule } from '../persona/persona.module';
import { PluginModule } from '../plugin/plugin.module';
import { ToolModule } from '../tool/tool.module';
import { ChatModelInvocationService } from './chat-model-invocation.service';
import { ChatMessageTransformService } from './chat-message-transform.service';
import { ChatMessageService } from './chat-message.service';
import { ChatTaskService } from './chat-task.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [PluginModule, PersonaModule, ToolModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatMessageService,
    ChatTaskService,
    ChatModelInvocationService,
    ChatMessageTransformService,
  ],
  exports: [
    ChatService,
    ChatMessageService,
    ChatTaskService,
    ChatModelInvocationService,
  ],
})
export class ChatModule {}
