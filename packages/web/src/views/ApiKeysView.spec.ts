import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ApiKeysView from './ApiKeysView.vue'

vi.mock('../composables/use-api-key-management', () => ({
  useApiKeyManagement: () => ({
    loading: ref(false),
    submitting: ref(false),
    error: ref(null),
    createdToken: ref('gca_22222222-2222-4222-8222-222222222222_secret'),
    keys: shallowRef([
      {
        id: 'key-1',
        name: 'Route Bot',
        keyPrefix: 'gca_11111111',
        scopes: ['plugin.route.invoke'],
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: '2026-03-31T08:00:00.000Z',
        updatedAt: '2026-03-31T08:00:00.000Z',
      },
    ]),
    formName: ref(''),
    formExpiresAt: ref(''),
    selectedScopes: ref(['plugin.route.invoke']),
    scopeOptions: [
      {
        value: 'plugin.route.invoke',
        label: '插件路由调用',
        description: '允许外部系统进入 plugin-routes。',
      },
    ],
    activeCount: computed(() => 1),
    revokedCount: computed(() => 0),
    refreshAll: vi.fn(),
    submitCreate: vi.fn(),
    revoke: vi.fn(),
    toggleScope: vi.fn(),
    clearCreatedToken: vi.fn(),
  }),
}))

describe('ApiKeysView', () => {
  it('renders the key governance hero, token reveal, and key ledger', () => {
    const wrapper = mount(ApiKeysView)

    expect(wrapper.text()).toContain('API Key 治理')
    expect(wrapper.text()).toContain('新 token 仅显示一次')
    expect(wrapper.text()).toContain('Route Bot')
    expect(wrapper.text()).toContain('插件路由调用')
    expect(wrapper.text()).toContain('撤销')
  })
})
