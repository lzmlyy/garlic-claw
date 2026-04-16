import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AiManagementService } from '../../../ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../ai-management/ai-provider-settings.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiManagementService: AiManagementService,
    private readonly aiProviderSettingsService: AiProviderSettingsService,
  ) {}

  @Get('provider-catalog')
  listProviderCatalog() {
    return this.aiManagementService.listProviderCatalog();
  }

  @Get('providers')
  listProviders() {
    return this.aiManagementService.listProviders();
  }

  @Get('providers/:providerId')
  getProvider(@Param('providerId') providerId: string) {
    return this.aiManagementService.getProvider(providerId);
  }

  @Put('providers/:providerId')
  upsertProvider(@Param('providerId') providerId: string, @Body() dto: Record<string, unknown>) {
    return this.aiManagementService.upsertProvider(providerId, dto as never);
  }

  @Delete('providers/:providerId')
  deleteProvider(@Param('providerId') providerId: string) {
    this.aiManagementService.deleteProvider(providerId);
    return { success: true };
  }

  @Get('providers/:providerId/models')
  listModels(@Param('providerId') providerId: string) {
    return this.aiManagementService.listModels(providerId);
  }

  @Post('providers/:providerId/discover-models')
  discoverModels(@Param('providerId') providerId: string) {
    return this.aiManagementService.discoverModels(providerId);
  }

  @Post('providers/:providerId/models/:modelId')
  upsertModel(@Param('providerId') providerId: string, @Param('modelId') modelId: string, @Body() dto: Record<string, unknown>) {
    return this.aiManagementService.upsertModel(providerId, modelId, dto as never);
  }

  @Delete('providers/:providerId/models/:modelId')
  deleteModel(@Param('providerId') providerId: string, @Param('modelId') modelId: string) {
    this.aiManagementService.deleteModel(providerId, modelId);
    return { success: true };
  }

  @Put('providers/:providerId/default-model')
  setDefaultModel(@Param('providerId') providerId: string, @Body() dto: { modelId: string }) {
    return this.aiManagementService.setDefaultModel(providerId, dto.modelId);
  }

  @Put('providers/:providerId/models/:modelId/capabilities')
  updateModelCapabilities(@Param('providerId') providerId: string, @Param('modelId') modelId: string, @Body() dto: Record<string, unknown>) {
    return this.aiManagementService.updateModelCapabilities(providerId, modelId, dto as never);
  }

  @Post('providers/:providerId/test-connection')
  testConnection(@Param('providerId') providerId: string, @Body() dto: { modelId?: string }) {
    return this.aiManagementService.testConnection(providerId, dto.modelId);
  }

  @Get('vision-fallback')
  getVisionFallbackConfig() {
    return this.aiProviderSettingsService.getVisionFallbackConfig();
  }

  @Put('vision-fallback')
  updateVisionFallbackConfig(@Body() dto: Record<string, unknown>) {
    return this.aiProviderSettingsService.updateVisionFallbackConfig(dto as never);
  }

  @Get('host-model-routing')
  getHostModelRoutingConfig() {
    return this.aiProviderSettingsService.getHostModelRoutingConfig();
  }

  @Put('host-model-routing')
  updateHostModelRoutingConfig(@Body() dto: Record<string, unknown>) {
    return this.aiProviderSettingsService.updateHostModelRoutingConfig(dto as never);
  }
}
