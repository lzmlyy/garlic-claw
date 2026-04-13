import { get, post } from '@/api/http'

function ensureRequiredText(
  value: string | null | undefined,
  field: 'username' | 'email' | 'password',
  trim = true,
) {
  const normalized = trim ? value?.trim() ?? '' : value ?? ''
  if (!normalized) {
    throw new Error(`${field} is required`)
  }

  return normalized
}

export function login(username: string, password: string) {
  const payload = {
    username: ensureRequiredText(username, 'username'),
    password: ensureRequiredText(password, 'password', false),
  }

  return post<{ accessToken: string; refreshToken: string }>('/auth/login', payload)
}

export function devLogin(
  username: string,
  role: 'super_admin' | 'admin' | 'user',
) {
  const payload = {
    username: ensureRequiredText(username, 'username'),
    role,
  }

  return post<{ accessToken: string; refreshToken: string }>('/auth/dev-login', payload)
}

export function register(username: string, email: string, password: string) {
  const payload = {
    username: ensureRequiredText(username, 'username'),
    email: ensureRequiredText(email, 'email'),
    password: ensureRequiredText(password, 'password', false),
  }

  return post<{ accessToken: string; refreshToken: string }>('/auth/register', payload)
}

export function getMe() {
  return get<{ id: string; username: string; email: string; role: string }>('/users/me')
}
