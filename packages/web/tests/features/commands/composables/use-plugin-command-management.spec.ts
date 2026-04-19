import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePluginCommandManagement } from '@/features/commands/composables/use-plugin-command-management'
import * as commandData from '@/features/commands/composables/plugin-command-management.data'

vi.mock('@/features/commands/composables/plugin-command-management.data', () => ({
  loadPluginCommandOverview: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

function createOverview() {
  return {
    commands: [
      {
        commandId: 'builtin.core-tools:/sys reload:command',
        pluginId: 'builtin.core-tools',
        pluginDisplayName: '核心工具',
        connected: true,
        runtimeKind: 'local' as const,
        defaultEnabled: true,
        source: 'manifest' as const,
        kind: 'command' as const,
        canonicalCommand: '/sys reload',
        path: ['sys', 'reload'],
        aliases: ['/sr'],
        variants: ['/sys reload', '/sr'],
        description: '重载系统命令',
        priority: -1,
        conflictTriggers: ['/sys reload'],
        governance: {
          canDisable: false,
          builtinRole: 'system-required' as const,
          disableReason: '核心工具属于必要系统插件，不能禁用',
        },
      },
      {
        commandId: 'remote.ops-helper:/ops status:hook-filter',
        pluginId: 'remote.ops-helper',
        pluginDisplayName: '运维助手',
        connected: false,
        runtimeKind: 'remote' as const,
        defaultEnabled: false,
        source: 'hook-filter' as const,
        kind: 'hook-filter' as const,
        canonicalCommand: '/ops status',
        path: ['ops', 'status'],
        aliases: [],
        variants: ['/ops status'],
        description: undefined,
        priority: 5,
        conflictTriggers: [],
        governance: {
          canDisable: true,
        },
      },
    ],
    conflicts: [
      {
        trigger: '/sys reload',
        commands: [
          {
            commandId: 'builtin.core-tools:/sys reload:command',
            pluginId: 'builtin.core-tools',
            pluginDisplayName: '核心工具',
            runtimeKind: 'local' as const,
            connected: true,
            defaultEnabled: true,
            kind: 'command' as const,
            canonicalCommand: '/sys reload',
            priority: -1,
          },
          {
            commandId: 'remote.ops-helper:/sys reload:hook-filter',
            pluginId: 'remote.ops-helper',
            pluginDisplayName: '运维助手',
            runtimeKind: 'remote' as const,
            connected: false,
            defaultEnabled: false,
            kind: 'hook-filter' as const,
            canonicalCommand: '/sys reload',
            priority: 5,
          },
        ],
      },
    ],
  }
}

describe('usePluginCommandManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(commandData.loadPluginCommandOverview).mockResolvedValue(createOverview())
  })

  it('loads command overview and filters commands by keyword and conflict state', async () => {
    let state!: ReturnType<typeof usePluginCommandManagement>
    const Harness = defineComponent({
      setup() {
        state = usePluginCommandManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.commandCount.value).toBe(2)
    expect(state.conflictCount.value).toBe(1)
    expect(state.pagedCommands.value.map((command) => command.commandId)).toEqual([
      'builtin.core-tools:/sys reload:command',
      'remote.ops-helper:/ops status:hook-filter',
    ])

    state.filter.value = 'conflict'
    await flushPromises()

    expect(state.filteredCommandCount.value).toBe(1)
    expect(state.pagedCommands.value.map((command) => command.commandId)).toEqual([
      'builtin.core-tools:/sys reload:command',
    ])

    state.filter.value = 'all'
    state.searchKeyword.value = '运维'
    await flushPromises()

    expect(state.filteredCommandCount.value).toBe(1)
    expect(state.pagedCommands.value.map((command) => command.commandId)).toEqual([
      'remote.ops-helper:/ops status:hook-filter',
    ])
  })
})
