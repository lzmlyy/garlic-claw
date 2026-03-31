import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApiKeyManagement } from './use-api-key-management'
import * as api from '../api'

vi.mock('../api', () => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}))

describe('useApiKeyManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listApiKeys).mockResolvedValue([
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
    ])
    vi.mocked(api.createApiKey).mockResolvedValue({
      id: 'key-2',
      name: 'Write Back Bot',
      keyPrefix: 'gca_22222222',
      token: 'gca_22222222-2222-4222-8222-222222222222_secret',
      scopes: ['conversation.message.write'],
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: '2026-03-31T09:00:00.000Z',
      updatedAt: '2026-03-31T09:00:00.000Z',
    })
    vi.mocked(api.revokeApiKey).mockResolvedValue({
      id: 'key-1',
      name: 'Route Bot',
      keyPrefix: 'gca_11111111',
      scopes: ['plugin.route.invoke'],
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: '2026-03-31T10:00:00.000Z',
      createdAt: '2026-03-31T08:00:00.000Z',
      updatedAt: '2026-03-31T10:00:00.000Z',
    })
  })

  it('loads keys, creates a new token, and revokes existing keys', async () => {
    let state!: ReturnType<typeof useApiKeyManagement>
    const Harness = defineComponent({
      setup() {
        state = useApiKeyManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.keys.value).toHaveLength(1)
    expect(state.activeCount.value).toBe(1)

    state.formName.value = 'Write Back Bot'
    state.selectedScopes.value = ['conversation.message.write']
    await state.submitCreate()
    await flushPromises()

    expect(api.createApiKey).toHaveBeenCalledWith({
      name: 'Write Back Bot',
      scopes: ['conversation.message.write'],
    })
    expect(state.createdToken.value).toBe(
      'gca_22222222-2222-4222-8222-222222222222_secret',
    )
    expect(state.keys.value.map((item) => item.id)).toEqual(['key-2', 'key-1'])

    await state.revoke('key-1')
    await flushPromises()

    expect(api.revokeApiKey).toHaveBeenCalledWith('key-1')
    expect(state.revokedCount.value).toBe(1)
    expect(state.keys.value.find((item) => item.id === 'key-1')?.revokedAt).toBe(
      '2026-03-31T10:00:00.000Z',
    )
  })
})
