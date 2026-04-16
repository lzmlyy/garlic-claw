import { Module } from '@nestjs/common';
import { PluginModule } from '../../plugin/plugin.module';
import { RuntimeGatewayModule } from '../gateway/runtime-gateway.module';
import { RuntimePluginGovernanceService } from './runtime-plugin-governance.service';

@Module({
  imports: [PluginModule, RuntimeGatewayModule],
  providers: [RuntimePluginGovernanceService],
  exports: [RuntimePluginGovernanceService],
})
export class RuntimeKernelModule {}
