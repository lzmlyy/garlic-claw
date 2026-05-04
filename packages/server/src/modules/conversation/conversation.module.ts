import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HostModule } from '../runtime/host/host.module';
import { RuntimeKernelModule } from '../runtime/kernel/runtime-kernel.module';
import { CommandCatalogController } from './command-catalog.controller';
import { ConversationAfterResponseCompactionService } from './conversation-after-response-compaction.service';
import { ContextCommandCatalogService } from './context-command-catalog.service';
import { ContextGovernanceSettingsService } from './context-governance-settings.service';
import { ContextGovernanceService } from './context-governance.service';
import { ConversationController } from './conversation.controller';
import { ConversationMessageLifecycleService } from './conversation-message-lifecycle.service';
import { ConversationMessagePlanningService } from './conversation-message-planning.service';
import { ConversationTaskService } from './conversation-task.service';

@Module({
  imports: [AuthModule, forwardRef(() => HostModule), RuntimeKernelModule],
  controllers: [CommandCatalogController, ConversationController],
  providers: [
    ContextCommandCatalogService,
    ConversationAfterResponseCompactionService,
    ContextGovernanceSettingsService,
    ContextGovernanceService,
    ConversationMessageLifecycleService,
    ConversationMessagePlanningService,
    ConversationTaskService,
  ],
  exports: [
    ContextCommandCatalogService,
    ConversationAfterResponseCompactionService,
    ContextGovernanceSettingsService,
    ContextGovernanceService,
    ConversationMessageLifecycleService,
    ConversationMessagePlanningService,
    ConversationTaskService,
  ],
})
export class ConversationModule {}
