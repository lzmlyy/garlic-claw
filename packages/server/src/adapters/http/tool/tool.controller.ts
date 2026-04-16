import type {
  PluginActionName,
  ToolInfo,
  ToolOverview,
  ToolSourceActionResult,
  ToolSourceInfo,
  ToolSourceKind,
} from '@garlic-claw/shared';
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ToolRegistryService } from '../../../execution/tool/tool-registry.service';

interface UpdateToolEnabledDto {
  enabled: boolean;
}

@Controller('tools')
export class ToolController {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
  ) {}

  @Get('overview')
  listOverview(): Promise<ToolOverview> {
    return this.toolRegistry.listOverview();
  }

  @Put('sources/:kind/:sourceId/enabled')
  updateSourceEnabled(
    @Param('kind') kind: ToolSourceKind,
    @Param('sourceId') sourceId: string,
    @Body() dto: UpdateToolEnabledDto,
  ): Promise<ToolSourceInfo> {
    return this.toolRegistry.setSourceEnabled(kind, sourceId, dto.enabled);
  }

  @Put(':toolId/enabled')
  updateToolEnabled(
    @Param('toolId') toolId: string,
    @Body() dto: UpdateToolEnabledDto,
  ): Promise<ToolInfo> {
    return this.toolRegistry.setToolEnabled(toolId, dto.enabled);
  }

  @Post('sources/:kind/:sourceId/actions/:action')
  runSourceAction(
    @Param('kind') kind: ToolSourceKind,
    @Param('sourceId') sourceId: string,
    @Param('action') action: PluginActionName,
  ): Promise<ToolSourceActionResult> {
    return this.toolRegistry.runSourceAction(kind, sourceId, action);
  }
}
