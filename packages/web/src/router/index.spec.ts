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
})
