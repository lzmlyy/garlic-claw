import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PersonaModule } from '../persona/persona.module';
import { PluginModule } from '../plugin/plugin.module';
import { SkillModule } from '../skill/skill.module';
import { ToolModule } from '../tool/tool.module';
import { ChatModelInvocationService } from './chat-model-invocation.service';
import { ChatMessageCompletionService } from './chat-message-completion.service';
import { ChatMessageGenerationService } from './chat-message-generation.service';
import { ChatMessageMutationService } from './chat-message-mutation.service';
import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';
import { ChatMessagePluginTargetService } from './chat-message-plugin-target.service';
import { ChatMessageResponseHooksService } from './chat-message-response-hooks.service';
import { ChatMessageTransformService } from './chat-message-transform.service';
import { ChatTaskPersistenceService } from './chat-task-persistence.service';
import { ChatMessageService } from './chat-message.service';
import { ChatTaskService } from './chat-task.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { OpenApiMessageController } from './open-api-message.controller';

@Module({
  imports: [AuthModule, PluginModule, PersonaModule, SkillModule, ToolModule],
  controllers: [ChatController, OpenApiMessageController],
  providers: [
    ChatService,
    ChatMessageService,
    ChatMessageCompletionService,
    ChatMessageGenerationService,
    ChatMessageMutationService,
    ChatMessageOrchestrationService,
    ChatMessagePluginTargetService,
    ChatMessageResponseHooksService,
    ChatTaskPersistenceService,
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
