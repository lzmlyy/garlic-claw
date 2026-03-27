import { Global, Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiModelExecutionService } from './ai-model-execution.service';
import { AiProviderDiagnosticsService } from './ai-provider-diagnostics.service';
import { AiManagementService } from './ai-management.service';
import { AiProviderService } from './ai-provider.service';
import { ConfigManagerService, ModelCapabilitiesStorage } from './config';
import { ModelRegistryService, ProviderRegistryService } from './registry';
import { CustomProviderService } from './providers/custom-provider.service';
import { ImageTranscriptionCacheService, ImageToTextService } from './vision';

@Global()
@Module({
  controllers: [AiController],
  providers: [
    AiProviderService,
    AiModelExecutionService,
    AiProviderDiagnosticsService,
    AiManagementService,
    ConfigManagerService,
    ModelCapabilitiesStorage,
    ProviderRegistryService,
    ModelRegistryService,
    CustomProviderService,
    ImageToTextService,
    ImageTranscriptionCacheService,
  ],
  exports: [
    AiProviderService,
    AiModelExecutionService,
    AiProviderDiagnosticsService,
    AiManagementService,
    ConfigManagerService,
    ModelCapabilitiesStorage,
    ProviderRegistryService,
    ModelRegistryService,
    CustomProviderService,
    ImageToTextService,
    ImageTranscriptionCacheService,
  ],
})
export class AiModule {}
