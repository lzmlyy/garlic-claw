import { delete as del, get, post, put } from '@/api/http'
import type {
  AiHostModelRoutingConfig,
  AiModelCapabilities,
  AiModelConfig,
  AiProviderCatalogItem,
  AiProviderConfig,
  AiProviderConnectionTestResult,
  AiProviderSummary,
  DiscoveredAiModel,
  VisionFallbackConfig,
} from '@garlic-claw/shared'

export function listAiProviderCatalog() {
  return get<AiProviderCatalogItem[]>('/ai/provider-catalog')
}

export function listAiProviders() {
  return get<AiProviderSummary[]>('/ai/providers')
}

export function getAiProvider(providerId: string) {
  return get<AiProviderConfig>(`/ai/providers/${providerId}`)
}

export function upsertAiProvider(
  providerId: string,
  payload: Omit<AiProviderConfig, 'id'>,
) {
  return put<AiProviderConfig>(`/ai/providers/${providerId}`, payload)
}

export function deleteAiProvider(providerId: string) {
  return del<{ success: boolean }>(`/ai/providers/${providerId}`)
}

export function listAiModels(providerId: string) {
  return get<AiModelConfig[]>(`/ai/providers/${providerId}/models`)
}

export function discoverAiProviderModels(providerId: string) {
  return post<DiscoveredAiModel[]>(`/ai/providers/${providerId}/discover-models`)
}

export function upsertAiModel(
  providerId: string,
  modelId: string,
  payload: { name?: string; contextLength?: number },
) {
  return post<AiModelConfig>(
    `/ai/providers/${providerId}/models/${encodeURIComponent(modelId)}`,
    payload,
  )
}

export function deleteAiModel(providerId: string, modelId: string) {
  return del<{ success: boolean }>(
    `/ai/providers/${providerId}/models/${encodeURIComponent(modelId)}`,
  )
}

export function setAiProviderDefaultModel(providerId: string, modelId: string) {
  return put<AiProviderConfig>(`/ai/providers/${providerId}/default-model`, { modelId })
}

export function updateAiModelCapabilities(
  providerId: string,
  modelId: string,
  payload: Partial<AiModelCapabilities>,
) {
  return put<AiModelConfig>(
    `/ai/providers/${providerId}/models/${encodeURIComponent(modelId)}/capabilities`,
    payload,
  )
}

export function testAiProviderConnection(
  providerId: string,
  payload: { modelId?: string } = {},
) {
  return post<AiProviderConnectionTestResult>(
    `/ai/providers/${providerId}/test-connection`,
    payload,
  )
}

export function getVisionFallbackConfig() {
  return get<VisionFallbackConfig>('/ai/vision-fallback')
}

export function updateVisionFallbackConfig(payload: VisionFallbackConfig) {
  return put<VisionFallbackConfig>('/ai/vision-fallback', payload)
}

export function getHostModelRoutingConfig() {
  return get<AiHostModelRoutingConfig>('/ai/host-model-routing')
}

export function updateHostModelRoutingConfig(payload: AiHostModelRoutingConfig) {
  return put<AiHostModelRoutingConfig>('/ai/host-model-routing', payload)
}
