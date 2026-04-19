import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CommandsView from '@/features/commands/views/CommandsView.vue'

vi.mock('@/features/commands/composables/use-plugin-command-management', () => ({
  usePluginCommandManagement: () => ({
    loading: ref(false),
    error: ref(null),
    commands: shallowRef([
      {
        commandId: 'builtin.core-tools:/sys reload:command',
        pluginId: 'builtin.core-tools',
        pluginDisplayName: '核心工具',
        connected: true,
        runtimeKind: 'local',
        defaultEnabled: true,
        source: 'manifest',
        kind: 'command',
        canonicalCommand: '/sys reload',
        path: ['sys', 'reload'],
        aliases: ['/sr'],
        variants: ['/sys reload', '/sr'],
        description: '重载系统命令',
        priority: -1,
        conflictTriggers: ['/sys reload'],
        governance: {
          canDisable: false,
          builtinRole: 'system-required',
          disableReason: '核心工具属于必要系统插件，不能禁用',
        },
      },
    ]),
    conflicts: shallowRef([
      {
        trigger: '/sys reload',
        commands: [
          {
            commandId: 'builtin.core-tools:/sys reload:command',
            pluginId: 'builtin.core-tools',
            pluginDisplayName: '核心工具',
            runtimeKind: 'local',
            connected: true,
            defaultEnabled: true,
            kind: 'command',
            canonicalCommand: '/sys reload',
            priority: -1,
          },
          {
            commandId: 'remote.ops-helper:/sys reload:hook-filter',
            pluginId: 'remote.ops-helper',
            pluginDisplayName: '运维助手',
            runtimeKind: 'remote',
            connected: false,
            defaultEnabled: false,
            kind: 'hook-filter',
            canonicalCommand: '/sys reload',
            priority: 5,
          },
        ],
      },
    ]),
    searchKeyword: ref(''),
    filter: ref('all'),
    pagedCommands: computed(() => [
      {
        commandId: 'builtin.core-tools:/sys reload:command',
        pluginId: 'builtin.core-tools',
        pluginDisplayName: '核心工具',
        connected: true,
        runtimeKind: 'local',
        defaultEnabled: true,
        source: 'manifest',
        kind: 'command',
        canonicalCommand: '/sys reload',
        path: ['sys', 'reload'],
        aliases: ['/sr'],
        variants: ['/sys reload', '/sr'],
        description: '重载系统命令',
        priority: -1,
        conflictTriggers: ['/sys reload'],
        governance: {
          canDisable: false,
          builtinRole: 'system-required',
          disableReason: '核心工具属于必要系统插件，不能禁用',
        },
      },
    ]),
    page: ref(1),
    pageCount: ref(1),
    rangeStart: ref(1),
    rangeEnd: ref(1),
    canGoPrevPage: ref(false),
    canGoNextPage: ref(false),
    goPrevPage: vi.fn(),
    goNextPage: vi.fn(),
    commandCount: computed(() => 1),
    filteredCommandCount: computed(() => 1),
    conflictCount: computed(() => 1),
    attentionCommandCount: computed(() => 1),
    refreshAll: vi.fn(),
  }),
}))

describe('CommandsView', () => {
  it('renders command governance overview, conflicts, and plugin deep-links', () => {
    const wrapper = mount(CommandsView, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="typeof to === \'string\' ? to : to.path || to.name"><slot /></a>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('命令治理')
    expect(wrapper.text()).toContain('/sys reload')
    expect(wrapper.text()).toContain('冲突触发词')
    expect(wrapper.text()).toContain('核心工具')
    expect(wrapper.text()).toContain('打开插件治理')
  })
})
