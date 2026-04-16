import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PluginConversationSessionInfo,
  PluginHealthSnapshot,
  PluginInfo,
} from '@garlic-claw/shared'
import * as pluginManagementData from './plugin-management.data'
import { usePluginManagement } from './use-plugin-management'

vi.mock('./plugin-management.data', async () => {
  const actual = await vi.importActual<typeof import('./plugin-management.data')>('./plugin-management.data')
  return {
    ...actual,
    loadPlugins: vi.fn(),
    loadPluginDetailSnapshot: vi.fn(),
    finishPluginConversation: vi.fn(),
    savePluginScope: vi.fn(),
  }
})

function createPlugin(
  input: Partial<PluginInfo> & Pick<PluginInfo, 'id' | 'name'>,
): PluginInfo {
  return {
    id: input.id,
    name: input.name,
    displayName: input.displayName ?? input.name,
    description: input.description,
    deviceType: input.deviceType ?? 'builtin',
    status: input.status ?? 'online',
    connected: input.connected ?? true,
    defaultEnabled: input.defaultEnabled ?? true,
    runtimeKind: input.runtimeKind ?? 'builtin',
    manifest: input.manifest ?? {
      id: input.name,
      name: input.displayName ?? input.name,
      version: '1.0.0',
      runtime: input.runtimeKind ?? 'builtin',
      permissions: [],
      tools: [],
    },
    supportedActions: input.supportedActions,
    crons: input.crons ?? [],
    health: input.health,
    governance: input.governance,
    lastSeenAt: input.lastSeenAt ?? null,
    createdAt: input.createdAt ?? '2026-03-28T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-03-28T00:00:00.000Z',
  }
}

function createDetailSnapshot(input: {
  healthSnapshot?: PluginHealthSnapshot
  conversationSessions?: PluginConversationSessionInfo[]
  conversations?: Record<string, boolean>
}) {
  return {
    configSnapshot: {
      schema: null,
      values: {},
    },
    conversationSessions: input.conversationSessions ?? [],
    cronJobs: [],
    scopeSettings: {
      defaultEnabled: true,
      conversations: input.conversations ?? {},
    },
    healthSnapshot: input.healthSnapshot ?? {
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: null,
      lastCheckedAt: null,
    },
    eventResult: {
      items: [],
      nextCursor: null,
    },
    storageEntries: [],
  }
}

describe('usePluginManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('syncs refreshed health snapshots back into the sidebar plugin list', async () => {
    const initialPlugin: PluginInfo = createPlugin({
      id: 'plugin-1',
      name: 'builtin.demo',
      displayName: 'Demo Plugin',
      description: 'demo',
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
    })
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

    vi.mocked(pluginManagementData.loadPlugins).mockResolvedValue([initialPlugin])
    vi.mocked(pluginManagementData.loadPluginDetailSnapshot).mockResolvedValue(
      createDetailSnapshot({
        healthSnapshot: refreshedHealth,
      }),
    )

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
    const initialPlugin: PluginInfo = createPlugin({
      id: 'plugin-1',
      name: 'builtin.demo',
      displayName: 'Demo Plugin',
      description: 'demo',
      lastSeenAt: '2026-03-28T00:00:00.000Z',
    })
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

    vi.mocked(pluginManagementData.loadPlugins).mockResolvedValue([initialPlugin])
    vi.mocked(pluginManagementData.loadPluginDetailSnapshot).mockResolvedValue(
      createDetailSnapshot({
        conversationSessions: sessions,
        conversations: {
          'conversation-1': false,
        },
      }),
    )
    vi.mocked(pluginManagementData.finishPluginConversation).mockResolvedValue(true)
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

    expect(pluginManagementData.finishPluginConversation).toHaveBeenCalledWith(
      'builtin.demo',
      'conversation-1',
    )
    expect(pluginManagementData.loadPluginDetailSnapshot).toHaveBeenCalledWith(
      'builtin.demo',
      { limit: 50 },
      '',
    )
  })

  it('prefers a user-facing plugin instead of a system builtin on first load', async () => {
    vi.mocked(pluginManagementData.loadPlugins).mockResolvedValue([
      createPlugin({
        id: 'plugin-1',
        name: 'builtin.tool-audit',
        displayName: 'Tool Audit',
        description: 'system builtin',
        manifest: {
          id: 'builtin.tool-audit',
          name: 'Tool Audit',
          version: '1.0.0',
          runtime: 'builtin',
          permissions: ['storage:write'],
          tools: [],
        },
        lastSeenAt: null,
      }),
      createPlugin({
        id: 'plugin-2',
        name: 'builtin.provider-router',
        displayName: 'Provider Router',
        description: 'user-facing builtin',
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
      }),
    ] as PluginInfo[])
    vi.mocked(pluginManagementData.loadPluginDetailSnapshot).mockResolvedValue(
      createDetailSnapshot({}),
    )

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
    expect(pluginManagementData.loadPluginDetailSnapshot).toHaveBeenCalledWith(
      'builtin.provider-router',
      { limit: 50 },
      '',
    )
  })

  it('honors a preferred plugin name from a business-page deep link', async () => {
    const preferredPluginName = ref('builtin.persona-router')

    vi.mocked(pluginManagementData.loadPlugins).mockResolvedValue([
      createPlugin({
        id: 'plugin-1',
        name: 'builtin.provider-router',
        displayName: 'Provider Router',
        description: 'provider routing',
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
      }),
      createPlugin({
        id: 'plugin-2',
        name: 'builtin.persona-router',
        displayName: 'Persona Router',
        description: 'persona routing',
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
      }),
    ] as PluginInfo[])
    vi.mocked(pluginManagementData.loadPluginDetailSnapshot).mockResolvedValue(
      createDetailSnapshot({}),
    )

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
    expect(pluginManagementData.loadPluginDetailSnapshot).toHaveBeenCalledWith(
      'builtin.persona-router',
      { limit: 50 },
      '',
    )
  })

  it('saves conversation overrides without sending a private defaultEnabled toggle', async () => {
    const initialPlugin: PluginInfo = createPlugin({
      id: 'plugin-1',
      name: 'builtin.demo',
      displayName: 'Demo Plugin',
    })

    vi.mocked(pluginManagementData.loadPlugins).mockResolvedValue([initialPlugin])
    vi.mocked(pluginManagementData.loadPluginDetailSnapshot).mockResolvedValue(
      createDetailSnapshot({
        conversations: {
          'conversation-1': false,
        },
      }),
    )
    vi.mocked(pluginManagementData.savePluginScope).mockResolvedValue({
      defaultEnabled: true,
      conversations: {
        'conversation-1': false,
      },
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

    await state.saveScope({
      'conversation-1': false,
    })

    expect(pluginManagementData.savePluginScope).toHaveBeenCalledWith('builtin.demo', {
      'conversation-1': false,
    })
    expect(state.scopeSettings.value).toEqual({
      defaultEnabled: true,
      conversations: {
        'conversation-1': false,
      },
    })
  })
})
