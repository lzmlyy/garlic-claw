import { request } from './base'
import type {
  ApiKeySummary,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from '@garlic-claw/shared'

export function listApiKeys() {
  return request<ApiKeySummary[]>('/auth/api-keys')
}

export function createApiKey(payload: CreateApiKeyRequest) {
  return request<CreateApiKeyResponse>('/auth/api-keys', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function revokeApiKey(id: string) {
  return request<ApiKeySummary>(`/auth/api-keys/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
  })
}
