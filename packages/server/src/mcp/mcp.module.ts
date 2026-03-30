import { Module } from '@nestjs/common';
import { McpConfigService } from './mcp-config.service';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  controllers: [McpController],
  providers: [McpConfigService, McpService],
  exports: [McpConfigService, McpService],
})
export class McpModule {}
