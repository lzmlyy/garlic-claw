import { request } from './base'
import type {
  AiModelCapabilities,
  AiModelConfig,
  AiProviderConfig,
  AiProviderConnectionTestResult,
  AiProviderSummary,
  DiscoveredAiModel,
  OfficialProviderCatalogItem,
  VisionFallbackConfig,
} from '@garlic-claw/shared'

export function listOfficialProviderCatalog() {
  return request<OfficialProviderCatalogItem[]>('/ai/provider-catalog')
}

export function listAiProviders() {
  return request<AiProviderSummary[]>('/ai/providers')
}

export function getAiProvider(providerId: string) {
  return request<AiProviderConfig>(`/ai/providers/${providerId}`)
}

export function upsertAiProvider(
  providerId: string,
  payload: Omit<AiProviderConfig, 'id'>,
) {
  return request<AiProviderConfig>(`/ai/providers/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteAiProvider(providerId: string) {
  return request<{ success: boolean }>(`/ai/providers/${providerId}`, {
    method: 'DELETE',
  })
}

export function listAiModels(providerId: string) {
  return request<AiModelConfig[]>(`/ai/providers/${providerId}/models`)
}

export function discoverAiProviderModels(providerId: string) {
  return request<DiscoveredAiModel[]>(`/ai/providers/${providerId}/discover-models`, {
    method: 'POST',
  })
}

export function upsertAiModel(
  providerId: string,
  modelId: string,
  payload: { name?: string },
) {
  return request<AiModelConfig>(
    `/ai/providers/${providerId}/models/${encodeURIComponent(modelId)}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export function deleteAiModel(providerId: string, modelId: string) {
  return request<{ success: boolean }>(
    `/ai/providers/${providerId}/models/${encodeURIComponent(modelId)}`,
    {
      method: 'DELETE',
    },
  )
}

export function setAiProviderDefaultModel(providerId: string, modelId: string) {
  return request<AiProviderConfig>(`/ai/providers/${providerId}/default-model`, {
    method: 'PUT',
    body: JSON.stringify({ modelId }),
  })
}

export function updateAiModelCapabilities(
  providerId: string,
  modelId: string,
  payload: Partial<AiModelCapabilities>,
) {
  return request<AiModelConfig>(
    `/ai/providers/${providerId}/models/${encodeURIComponent(modelId)}/capabilities`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
}

export function testAiProviderConnection(
  providerId: string,
  payload: { modelId?: string } = {},
) {
  return request<AiProviderConnectionTestResult>(
    `/ai/providers/${providerId}/test-connection`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )
}

export function getVisionFallbackConfig() {
  return request<VisionFallbackConfig>('/ai/vision-fallback')
}

export function updateVisionFallbackConfig(payload: VisionFallbackConfig) {
  return request<VisionFallbackConfig>('/ai/vision-fallback', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
