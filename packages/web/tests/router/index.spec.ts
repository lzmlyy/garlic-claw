import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  isLoggedIn: true,
  ensureInitialized: vi.fn(async () => undefined),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authState,
}))

import router from '@/router/index'

describe('router', () => {
  beforeEach(() => {
    authState.isLoggedIn = true
    authState.ensureInitialized.mockClear()
  })

  it('mounts the chat route inside the admin console shell', () => {
    const resolved = router.resolve({ name: 'chat' })

    expect(resolved.matched[0]?.name).toBe('admin-shell')
  })

  it('keeps plugin、mcp 和 ai routes mounted inside the same shell', () => {
    expect(router.resolve({ name: 'plugins' }).matched[0]?.name).toBe('admin-shell')
    expect(router.resolve({ name: 'mcp' }).matched[0]?.name).toBe('admin-shell')
    expect(router.resolve({ name: 'ai-settings' }).matched[0]?.name).toBe('admin-shell')
  })

  it('removes the register and api key routes from the web console', () => {
    expect(router.hasRoute('register')).toBe(false)
    expect(router.hasRoute('api-keys')).toBe(false)
  })

  it('redirects unauthenticated users to login', async () => {
    authState.isLoggedIn = false

    const result = await router.push({ name: 'plugins' }).catch(() => undefined)

    expect(router.currentRoute.value.name).toBe('login')
    expect(result).toBeUndefined()
  })

  it('allows any authenticated user to access admin console routes', async () => {
    authState.isLoggedIn = true

    await router.push('/tools')

    expect(router.currentRoute.value.name).toBe('mcp')
  })
})
