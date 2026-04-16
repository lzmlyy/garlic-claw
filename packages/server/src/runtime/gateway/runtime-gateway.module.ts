import { Module } from '@nestjs/common';
import { PluginModule } from '../../plugin/plugin.module';
import { RuntimeGatewayConnectionLifecycleService } from './runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from './runtime-gateway-remote-transport.service';

@Module({
  imports: [PluginModule],
  providers: [
    RuntimeGatewayConnectionLifecycleService,
    RuntimeGatewayRemoteTransportService,
  ],
  exports: [
    RuntimeGatewayConnectionLifecycleService,
    RuntimeGatewayRemoteTransportService,
  ],
})
export class RuntimeGatewayModule {}
