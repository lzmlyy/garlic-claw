import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { PluginModule } from '../plugin/plugin.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';

@Module({
  imports: [PluginModule, ChatModule],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
