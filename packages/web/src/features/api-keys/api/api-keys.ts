import { get, post } from '@/api/http'
import type {
  ApiKeySummary,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from '@garlic-claw/shared'

export function listApiKeys() {
  return get<ApiKeySummary[]>('/auth/api-keys')
}

export function createApiKey(payload: CreateApiKeyRequest) {
  return post<CreateApiKeyResponse>('/auth/api-keys', payload)
}

export function revokeApiKey(id: string) {
  return post<ApiKeySummary>(`/auth/api-keys/${encodeURIComponent(id)}/revoke`)
}
