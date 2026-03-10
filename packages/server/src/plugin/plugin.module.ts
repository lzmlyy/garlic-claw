import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PluginController } from './plugin.controller';
import { PluginGateway } from './plugin.gateway';
import { PluginService } from './plugin.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [PluginService, PluginGateway],
  controllers: [PluginController],
  exports: [PluginService, PluginGateway],
})
export class PluginModule {}
