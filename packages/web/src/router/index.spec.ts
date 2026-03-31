import { describe, expect, it, vi } from 'vitest'

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    isLoggedIn: true,
  }),
}))

import router from './index'

describe('router', () => {
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
})
