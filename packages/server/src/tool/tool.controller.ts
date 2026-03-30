import type {
  PluginActionName,
  ToolInfo,
  ToolSourceActionResult,
  ToolSourceInfo,
  ToolSourceKind,
} from '@garlic-claw/shared';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateToolEnabledDto } from './dto/update-tool-enabled.dto';
import { ToolAdminService } from './tool-admin.service';
import { ToolRegistryService } from './tool-registry.service';

@ApiTags('Tools')
@ApiBearerAuth()
@Controller('tools')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class ToolController {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolAdmin: ToolAdminService,
  ) {}

  @Get('sources')
  listSources(): Promise<ToolSourceInfo[]> {
    return this.toolRegistry.listSources();
  }

  @Get()
  listTools(): Promise<ToolInfo[]> {
    return this.toolRegistry.listToolInfos();
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
    return this.toolAdmin.runSourceAction(kind, sourceId, action);
  }
}
