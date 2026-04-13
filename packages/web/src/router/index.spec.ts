import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  isLoggedIn: true,
  isAdmin: true,
  ensureInitialized: vi.fn(async () => undefined),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => authState,
}))

import router from './index'

describe('router', () => {
  beforeEach(() => {
    authState.isLoggedIn = true
    authState.isAdmin = true
    authState.ensureInitialized.mockClear()
  })

  it('mounts the chat route inside the admin console shell', () => {
    const resolved = router.resolve({ name: 'chat' })

    expect(resolved.matched[0]?.name).toBe('admin-shell')
  })

  it('mounts the plugin route inside the dedicated admin shell', () => {
    const resolved = router.resolve({ name: 'plugins' })

    expect(resolved.matched[0]?.name).toBe('admin-shell')
  })

  it('registers the persona settings route', () => {
    expect(router.hasRoute('persona-settings')).toBe(true)
    expect(router.resolve({ name: 'persona-settings' }).path).toBe('/personas')
  })

  it('registers the command governance route', () => {
    expect(router.hasRoute('commands')).toBe(true)
    expect(router.resolve({ name: 'commands' }).path).toBe('/commands')
  })

  it('registers the skills workspace route', () => {
    expect(router.hasRoute('skills')).toBe(true)
    expect(router.resolve({ name: 'skills' }).path).toBe('/skills')
  })

  it('registers the background subagent task route', () => {
    expect(router.hasRoute('subagent-tasks')).toBe(true)
    expect(router.resolve({ name: 'subagent-tasks' }).path).toBe('/subagents')
  })

  it('registers the scoped api key management route', () => {
    expect(router.hasRoute('api-keys')).toBe(true)
    expect(router.resolve({ name: 'api-keys' }).path).toBe('/api-keys')
  })

  it('redirects non-admin users away from admin routes', async () => {
    authState.isAdmin = false

    const result = await router.push({ name: 'plugins' }).catch(() => undefined)

    expect(router.currentRoute.value.name).toBe('chat')
    expect(result).toBeUndefined()
    authState.isAdmin = true
  })

  it('allows non-admin users to stay on the chat route', async () => {
    authState.isAdmin = false

    await router.push({ name: 'chat' })

    expect(router.currentRoute.value.name).toBe('chat')
    authState.isAdmin = true
  })
})
