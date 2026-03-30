import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PluginConversationSessionInfo,
  PluginHealthSnapshot,
  PluginInfo,
} from '@garlic-claw/shared'
import { usePluginManagement } from './use-plugin-management'
import * as api from '../api'

vi.mock('../api', () => ({
  listPlugins: vi.fn(),
  finishPluginConversationSession: vi.fn(),
  getPluginConfig: vi.fn(),
  getPluginCrons: vi.fn(),
  getPluginScope: vi.fn(),
  getPluginHealth: vi.fn(),
  listPluginConversationSessions: vi.fn(),
  listPluginEvents: vi.fn(),
  listPluginStorage: vi.fn(),
}))

describe('usePluginManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('syncs refreshed health snapshots back into the sidebar plugin list', async () => {
    const initialPlugin: PluginInfo = {
      id: 'plugin-1',
      name: 'builtin.demo',
      displayName: 'Demo Plugin',
      description: 'demo',
      deviceType: 'builtin',
      status: 'online',
      capabilities: [],
      connected: true,
      runtimeKind: 'builtin',
      health: {
        status: 'healthy',
        failureCount: 0,
        consecutiveFailures: 0,
        lastError: null,
        lastErrorAt: null,
        lastSuccessAt: '2026-03-28T00:00:00.000Z',
        lastCheckedAt: '2026-03-28T00:00:00.000Z',
      },
      lastSeenAt: '2026-03-28T00:00:00.000Z',
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
    }
    const refreshedHealth: PluginHealthSnapshot = {
      status: 'degraded',
      failureCount: 3,
      consecutiveFailures: 2,
      lastError: 'tool overloaded',
      lastErrorAt: '2026-03-28T00:05:00.000Z',
      lastSuccessAt: '2026-03-28T00:04:00.000Z',
      lastCheckedAt: '2026-03-28T00:05:00.000Z',
      runtimePressure: {
        activeExecutions: 2,
        maxConcurrentExecutions: 6,
      },
    }

    vi.mocked(api.listPlugins).mockResolvedValue([initialPlugin])
    vi.mocked(api.getPluginConfig).mockResolvedValue({
      schema: null,
      values: {},
    })
    vi.mocked(api.getPluginCrons).mockResolvedValue([])
    vi.mocked(api.getPluginScope).mockResolvedValue({
      defaultEnabled: true,
      conversations: {},
    })
    vi.mocked(api.getPluginHealth).mockResolvedValue(refreshedHealth)
    vi.mocked(api.listPluginEvents).mockResolvedValue({
      items: [],
      nextCursor: null,
    })
    vi.mocked(api.listPluginStorage).mockResolvedValue([])

    let state!: ReturnType<typeof usePluginManagement>
    const Harness = defineComponent({
      setup() {
        state = usePluginManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.healthSnapshot.value).toEqual(refreshedHealth)
    expect(state.plugins.value[0]?.health).toEqual(refreshedHealth)
  })

  it('loads and force-finishes selected plugin conversation sessions', async () => {
    const initialPlugin: PluginInfo = {
      id: 'plugin-1',
      name: 'builtin.demo',
      displayName: 'Demo Plugin',
      description: 'demo',
      deviceType: 'builtin',
      status: 'online',
      capabilities: [],
      connected: true,
      runtimeKind: 'builtin',
      lastSeenAt: '2026-03-28T00:00:00.000Z',
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
    }
    const sessions: PluginConversationSessionInfo[] = [
      {
        pluginId: 'builtin.demo',
        conversationId: 'conversation-1',
        timeoutMs: 45000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:00:45.000Z',
        lastMatchedAt: '2026-03-28T12:00:10.000Z',
        captureHistory: true,
        historyMessages: [
          {
            role: 'user',
            content: '成语接龙',
            parts: [
              {
                type: 'text',
                text: '成语接龙',
              },
            ],
          },
        ],
        metadata: {
          flow: 'idiom',
        },
      },
    ]

    vi.mocked(api.listPlugins).mockResolvedValue([initialPlugin])
    vi.mocked(api.getPluginConfig).mockResolvedValue({
      schema: null,
      values: {},
    })
    vi.mocked(api.getPluginCrons).mockResolvedValue([])
    vi.mocked(api.getPluginScope).mockResolvedValue({
      defaultEnabled: true,
      conversations: {},
    })
    vi.mocked(api.getPluginHealth).mockResolvedValue({
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: '2026-03-28T00:00:00.000Z',
      lastCheckedAt: '2026-03-28T00:00:00.000Z',
    })
    vi.mocked(api.listPluginConversationSessions).mockResolvedValue(sessions)
    vi.mocked(api.listPluginEvents).mockResolvedValue({
      items: [],
      nextCursor: null,
    })
    vi.mocked(api.listPluginStorage).mockResolvedValue([])
    vi.mocked(api.finishPluginConversationSession).mockResolvedValue(true)
    vi.stubGlobal('window', {
      confirm: vi.fn(() => true),
    })

    let state!: ReturnType<typeof usePluginManagement>
    const Harness = defineComponent({
      setup() {
        state = usePluginManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.conversationSessions.value).toEqual(sessions)

    await state.finishConversationSession('conversation-1')

    expect(api.finishPluginConversationSession).toHaveBeenCalledWith(
      'builtin.demo',
      'conversation-1',
    )
    expect(api.listPluginConversationSessions).toHaveBeenCalledWith('builtin.demo')
  })

  it('prefers a user-facing plugin instead of a system builtin on first load', async () => {
    vi.mocked(api.listPlugins).mockResolvedValue([
      {
        id: 'plugin-1',
        name: 'builtin.tool-audit',
        displayName: 'Tool Audit',
        description: 'system builtin',
        deviceType: 'builtin',
        status: 'online',
        capabilities: [],
        connected: true,
        runtimeKind: 'builtin',
        manifest: {
          id: 'builtin.tool-audit',
          name: 'Tool Audit',
          version: '1.0.0',
          runtime: 'builtin',
          permissions: ['storage:write'],
          tools: [],
        },
        lastSeenAt: null,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 'plugin-2',
        name: 'builtin.provider-router',
        displayName: 'Provider Router',
        description: 'user-facing builtin',
        deviceType: 'builtin',
        status: 'online',
        capabilities: [],
        connected: true,
        runtimeKind: 'builtin',
        manifest: {
          id: 'builtin.provider-router',
          name: 'Provider Router',
          version: '1.0.0',
          runtime: 'builtin',
          permissions: ['config:read', 'provider:read'],
          tools: [],
          config: {
            fields: [
              {
                key: 'targetProviderId',
                type: 'string',
              },
            ],
          },
        },
        lastSeenAt: null,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    ] as PluginInfo[])
    vi.mocked(api.getPluginConfig).mockResolvedValue({
      schema: null,
      values: {},
    })
    vi.mocked(api.getPluginCrons).mockResolvedValue([])
    vi.mocked(api.getPluginScope).mockResolvedValue({
      defaultEnabled: true,
      conversations: {},
    })
    vi.mocked(api.getPluginHealth).mockResolvedValue({
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: null,
      lastCheckedAt: null,
    })
    vi.mocked(api.listPluginConversationSessions).mockResolvedValue([])
    vi.mocked(api.listPluginEvents).mockResolvedValue({
      items: [],
      nextCursor: null,
    })
    vi.mocked(api.listPluginStorage).mockResolvedValue([])

    let state!: ReturnType<typeof usePluginManagement>
    const Harness = defineComponent({
      setup() {
        state = usePluginManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.selectedPluginName.value).toBe('builtin.provider-router')
    expect(api.getPluginConfig).toHaveBeenCalledWith('builtin.provider-router')
  })

  it('honors a preferred plugin name from a business-page deep link', async () => {
    const preferredPluginName = ref('builtin.persona-router')

    vi.mocked(api.listPlugins).mockResolvedValue([
      {
        id: 'plugin-1',
        name: 'builtin.provider-router',
        displayName: 'Provider Router',
        description: 'provider routing',
        deviceType: 'builtin',
        status: 'online',
        capabilities: [],
        connected: true,
        runtimeKind: 'builtin',
        manifest: {
          id: 'builtin.provider-router',
          name: 'Provider Router',
          version: '1.0.0',
          runtime: 'builtin',
          permissions: ['config:read', 'provider:read'],
          tools: [],
          config: {
            fields: [
              {
                key: 'targetProviderId',
                type: 'string',
              },
            ],
          },
        },
        lastSeenAt: null,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 'plugin-2',
        name: 'builtin.persona-router',
        displayName: 'Persona Router',
        description: 'persona routing',
        deviceType: 'builtin',
        status: 'online',
        capabilities: [],
        connected: true,
        runtimeKind: 'builtin',
        manifest: {
          id: 'builtin.persona-router',
          name: 'Persona Router',
          version: '1.0.0',
          runtime: 'builtin',
          permissions: ['config:read', 'persona:read', 'persona:write'],
          tools: [],
          config: {
            fields: [
              {
                key: 'targetPersonaId',
                type: 'string',
              },
            ],
          },
        },
        lastSeenAt: null,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    ] as PluginInfo[])
    vi.mocked(api.getPluginConfig).mockResolvedValue({
      schema: null,
      values: {},
    })
    vi.mocked(api.getPluginCrons).mockResolvedValue([])
    vi.mocked(api.getPluginScope).mockResolvedValue({
      defaultEnabled: true,
      conversations: {},
    })
    vi.mocked(api.getPluginHealth).mockResolvedValue({
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: null,
      lastCheckedAt: null,
    })
    vi.mocked(api.listPluginConversationSessions).mockResolvedValue([])
    vi.mocked(api.listPluginEvents).mockResolvedValue({
      items: [],
      nextCursor: null,
    })
    vi.mocked(api.listPluginStorage).mockResolvedValue([])

    let state!: ReturnType<typeof usePluginManagement>
    const Harness = defineComponent({
      setup() {
        state = usePluginManagement({
          preferredPluginName,
        })
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.selectedPluginName.value).toBe('builtin.persona-router')
    expect(api.getPluginConfig).toHaveBeenCalledWith('builtin.persona-router')
  })
})
