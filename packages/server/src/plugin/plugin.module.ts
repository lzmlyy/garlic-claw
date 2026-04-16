import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PluginBootstrapService } from './bootstrap/plugin-bootstrap.service';
import { BuiltinPluginRegistryService } from './builtin/builtin-plugin-registry.service';
import { PluginGovernanceService } from './governance/plugin-governance.service';
import { PluginPersistenceService } from './persistence/plugin-persistence.service';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [
    BuiltinPluginRegistryService,
    PluginBootstrapService,
    PluginGovernanceService,
    PluginPersistenceService,
  ],
  exports: [
    BuiltinPluginRegistryService,
    PluginBootstrapService,
    PluginGovernanceService,
    PluginPersistenceService,
  ],
})
export class PluginModule {}
