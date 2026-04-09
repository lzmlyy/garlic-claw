import { Global, Module } from "@nestjs/common";
import { CacheModule } from "../cache/cache.module";
import { AiController } from "./ai.controller";
import { AiModelExecutionService } from "./ai-model-execution.service";
import { AiProviderDiagnosticsService } from "./ai-provider-diagnostics.service";
import { AiManagementService } from "./ai-management.service";
import { AiProviderService } from "./ai-provider.service";
import { ConfigManagerService, ModelCapabilitiesStorage } from "./config";
import {
  ModelRegistryService,
  ProviderRegistryService,
  RuntimeProviderRegistryService,
} from "./registry";
import { CustomProviderService } from "./providers/custom-provider.service";
import {
  AiVisionService,
  ImageTranscriptionCacheService,
  ImageToTextService,
} from "./vision";

@Global()
@Module({
  imports: [CacheModule],
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
    RuntimeProviderRegistryService,
    CustomProviderService,
    AiVisionService,
    ImageToTextService,
    ImageTranscriptionCacheService,
  ],
  exports: [
    AiProviderService,
    AiModelExecutionService,
    AiManagementService,
    AiVisionService,
  ],
})
export class AiModule {}
