import { post } from '@/api/http'

function ensureRequiredText(value: string | null | undefined, field: 'secret') {
  const normalized = value?.trim() ?? ''
  if (!normalized) {
    throw new Error(`${field} is required`)
  }

  return normalized
}

export function login(secret: string) {
  return post<{ accessToken: string }>('/auth/login', {
    secret: ensureRequiredText(secret, 'secret'),
  })
}
