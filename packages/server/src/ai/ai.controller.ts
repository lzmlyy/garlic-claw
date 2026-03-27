import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiProviderDiagnosticsService } from './ai-provider-diagnostics.service';
import { AiManagementService } from './ai-management.service';
import {
  SetDefaultModelDto,
  TestAiProviderConnectionDto,
  UpdateModelCapabilitiesDto,
  UpdateVisionFallbackDto,
  UpsertAiModelDto,
  UpsertAiProviderDto,
} from './dto/ai-management.dto';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly managementService: AiManagementService,
    private readonly diagnosticsService: AiProviderDiagnosticsService,
  ) {}

  @Get('provider-catalog')
  listOfficialProviderCatalog() {
    return this.managementService.listOfficialProviderCatalog();
  }

  @Get('providers')
  listProviders() {
    return this.managementService.listProviders();
  }

  @Get('providers/:providerId')
  getProvider(@Param('providerId') providerId: string) {
    return this.managementService.getProvider(providerId);
  }

  @Put('providers/:providerId')
  upsertProvider(
    @Param('providerId') providerId: string,
    @Body() dto: UpsertAiProviderDto,
  ) {
    return this.managementService.upsertProvider(providerId, dto);
  }

  @Delete('providers/:providerId')
  deleteProvider(@Param('providerId') providerId: string) {
    this.managementService.deleteProvider(providerId);
    return { success: true };
  }

  @Get('providers/:providerId/models')
  listModels(@Param('providerId') providerId: string) {
    return this.managementService.listModels(providerId);
  }

  @Post('providers/:providerId/discover-models')
  discoverModels(@Param('providerId') providerId: string) {
    return this.diagnosticsService.discoverModels(providerId);
  }

  @Post('providers/:providerId/models/:modelId')
  upsertModel(
    @Param('providerId') providerId: string,
    @Param('modelId') modelId: string,
    @Body() dto: UpsertAiModelDto,
  ) {
    return this.managementService.upsertModel(providerId, modelId, dto);
  }

  @Delete('providers/:providerId/models/:modelId')
  deleteModel(
    @Param('providerId') providerId: string,
    @Param('modelId') modelId: string,
  ) {
    this.managementService.deleteModel(providerId, modelId);
    return { success: true };
  }

  @Put('providers/:providerId/default-model')
  setDefaultModel(
    @Param('providerId') providerId: string,
    @Body() dto: SetDefaultModelDto,
  ) {
    return this.managementService.setDefaultModel(providerId, dto.modelId);
  }

  @Put('providers/:providerId/models/:modelId/capabilities')
  updateModelCapabilities(
    @Param('providerId') providerId: string,
    @Param('modelId') modelId: string,
    @Body() dto: UpdateModelCapabilitiesDto,
  ) {
    return this.managementService.updateModelCapabilities(providerId, modelId, dto);
  }

  @Post('providers/:providerId/test-connection')
  testConnection(
    @Param('providerId') providerId: string,
    @Body() dto: TestAiProviderConnectionDto,
  ) {
    return this.diagnosticsService.testConnection(providerId, dto.modelId);
  }

  @Get('vision-fallback')
  getVisionFallbackConfig() {
    return this.managementService.getVisionFallbackConfig();
  }

  @Put('vision-fallback')
  updateVisionFallbackConfig(@Body() dto: UpdateVisionFallbackDto) {
    return this.managementService.updateVisionFallbackConfig(dto);
  }
}
