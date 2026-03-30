import { Module, forwardRef } from '@nestjs/common';
import { McpModule } from '../mcp/mcp.module';
import { PluginModule } from '../plugin/plugin.module';
import { McpToolProvider } from './mcp-tool.provider';
import { PluginToolProvider } from './plugin-tool.provider';
import { ToolAdminService } from './tool-admin.service';
import { ToolController } from './tool.controller';
import { ToolGovernanceService } from './tool-governance.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolSettingsService } from './tool-settings.service';

@Module({
  imports: [forwardRef(() => PluginModule), McpModule],
  controllers: [ToolController],
  providers: [
    ToolGovernanceService,
    ToolSettingsService,
    PluginToolProvider,
    McpToolProvider,
    ToolRegistryService,
    ToolAdminService,
  ],
  exports: [
    ToolGovernanceService,
    ToolSettingsService,
    ToolRegistryService,
    ToolAdminService,
  ],
})
export class ToolModule {}
