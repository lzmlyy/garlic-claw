import type {
  AiUtilityModelRole,
  PluginCallContext,
  PluginLlmGenerateParams,
  PluginLlmGenerateResult,
  PluginProviderSummary,
} from '@garlic-claw/shared';
import { NotFoundException } from '@nestjs/common';
import type { JsonValue } from '../common/types/json-value';
import { toAiSdkMessages } from '../chat/sdk-message-converter';
import { toJsonValue } from '../common/utils/json-value';
import type { ModelConfig } from '../ai/types/provider.types';

export function buildCurrentHostProviderInfo(
  context: PluginCallContext,
  fallbackModelConfig: Pick<ModelConfig, 'providerId' | 'id'>,
) {
  if (context.activeProviderId && context.activeModelId) {
    return {
      source: 'context' as const,
      providerId: context.activeProviderId,
      modelId: context.activeModelId,
    };
  }

  return {
    source: 'default' as const,
    providerId: String(fallbackModelConfig.providerId),
    modelId: String(fallbackModelConfig.id),
  };
}

export function buildHostProviderModelSummary(
  model: Pick<ModelConfig, 'id' | 'providerId' | 'name' | 'capabilities' | 'status'>,
) {
  return {
    id: model.id,
    providerId: model.providerId,
    name: model.name,
    capabilities: model.capabilities,
    status: model.status,
  };
}

export function findHostProviderSummary(
  providers: PluginProviderSummary[],
  providerId: string,
): PluginProviderSummary | null {
  return providers.find((item) => item.id === providerId) ?? null;
}

export function findHostProviderSummaryOrThrow(input: {
  providers: PluginProviderSummary[];
  providerId: string;
  ensureExists?: (providerId: string) => unknown;
}): PluginProviderSummary {
  const provider = findHostProviderSummary(input.providers, input.providerId);
  if (provider) {
    return provider;
  }

  input.ensureExists?.(input.providerId);
  throw new NotFoundException(`Provider "${input.providerId}" not found`);
}

export function resolveHostProviderModelSummary(input: {
  registryModel?: Pick<ModelConfig, 'id' | 'providerId' | 'name' | 'capabilities' | 'status'>;
  listedModels: Array<
    Pick<ModelConfig, 'id' | 'providerId' | 'name' | 'capabilities' | 'status'>
  >;
  modelId: string;
}) {
  const model = input.registryModel
    ?? input.listedModels.find((item) => String(item.id) === input.modelId)
    ?? null;
  return model ? buildHostProviderModelSummary(model) : null;
}

export function buildHostGenerateResult(input: {
  modelConfig: Pick<ModelConfig, 'providerId' | 'id'>;
  result: {
    text: string;
    finishReason?: unknown;
    usage?: JsonValue;
  };
}): PluginLlmGenerateResult {
  return {
    providerId: String(input.modelConfig.providerId),
    modelId: String(input.modelConfig.id),
    text: input.result.text,
    message: {
      role: 'assistant',
      content: input.result.text,
    },
    ...(input.result.finishReason !== undefined
      ? { finishReason: String(input.result.finishReason) }
      : {}),
    ...(input.result.usage !== undefined
      ? { usage: toJsonValue(input.result.usage) }
      : {}),
  };
}

export function buildHostGenerateExecutionInput(input: {
  params: PluginLlmGenerateParams;
  utilityRole?: AiUtilityModelRole;
}) {
  return {
    ...(input.params.providerId ? { providerId: input.params.providerId } : {}),
    ...(input.params.modelId ? { modelId: input.params.modelId } : {}),
    ...(input.utilityRole ? { utilityRole: input.utilityRole } : {}),
    ...(input.params.system ? { system: input.params.system } : {}),
    ...(input.params.variant ? { variant: input.params.variant } : {}),
    ...(input.params.providerOptions ? { providerOptions: input.params.providerOptions } : {}),
    ...(input.params.headers ? { headers: input.params.headers } : {}),
    ...(typeof input.params.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.params.maxOutputTokens }
      : {}),
    sdkMessages: toAiSdkMessages(input.params.messages),
  };
}

export function buildHostGenerateTextResult(
  result: Pick<PluginLlmGenerateResult, 'providerId' | 'modelId' | 'text'>,
) {
  return {
    providerId: result.providerId,
    modelId: result.modelId,
    text: result.text,
  };
}
