import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { PluginInfo } from '@garlic-claw/shared'
import PluginsView from './PluginsView.vue'

vi.mock('../composables/use-plugin-management', () => {
  const plugin = ref<PluginInfo | null>({
    id: 'plugin-1',
    name: 'builtin.demo',
    displayName: 'Demo Plugin',
    description: 'demo',
    deviceType: 'builtin',
    status: 'online',
    capabilities: [],
    connected: true,
    runtimeKind: 'builtin',
    permissions: [
      'conversation:read',
      'memory:write',
      'storage:write',
      'log:write',
      'subagent:run',
    ],
    supportedActions: ['health-check', 'reload'],
    crons: [
      {
        id: 'cron-1',
        pluginId: 'builtin.demo',
        name: 'heartbeat',
        cron: '10s',
        source: 'manifest',
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    ],
    hooks: [
      { name: 'chat:before-model' },
      { name: 'chat:after-model' },
    ],
    routes: [
      { path: 'inspect/context', methods: ['GET'] },
    ],
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
  })

  return {
    usePluginManagement: () => ({
      loading: ref(false),
      detailLoading: ref(false),
      savingConfig: ref(false),
      savingStorage: ref(false),
      savingScope: ref(false),
      eventLoading: ref(false),
      runningAction: ref(null),
      deletingCronJobId: ref(null),
      deleting: ref(false),
      error: ref(null),
      notice: ref(null),
      plugins: shallowRef(plugin.value ? [plugin.value] : []),
      selectedPluginName: ref(plugin.value?.name ?? null),
      selectedPlugin: computed(() => plugin.value),
      configSnapshot: shallowRef(null),
      cronJobs: shallowRef([]),
      scopeSettings: shallowRef(null),
      healthSnapshot: shallowRef(plugin.value?.health ?? null),
      eventLogs: shallowRef([]),
      eventLimit: ref(50),
      storageEntries: shallowRef([]),
      deletingStorageKey: ref(null),
      canDeleteSelected: computed(() => false),
      refreshAll: vi.fn(),
      selectPlugin: vi.fn(),
      refreshSelectedDetails: vi.fn(),
      refreshPluginEvents: vi.fn(),
      refreshPluginStorage: vi.fn(),
      deleteCronJob: vi.fn(),
      saveConfig: vi.fn(),
      saveStorageEntry: vi.fn(),
      saveScope: vi.fn(),
      runAction: vi.fn(),
      deleteStorageEntry: vi.fn(),
      deleteSelectedPlugin: vi.fn(),
    }),
  }
})

describe('PluginsView', () => {
  it('renders the richer plugin highlight labels for the selected plugin', () => {
    const wrapper = mount(PluginsView, {
      global: {
        stubs: {
          PluginSidebar: { template: '<div />' },
          PluginConfigForm: { template: '<div />' },
          PluginScopeEditor: { template: '<div />' },
          PluginEventLog: { template: '<div />' },
          PluginStoragePanel: { template: '<div />' },
          PluginCronList: { template: '<div />' },
          PluginRouteList: { template: '<div />' },
        },
      },
    })

    expect(wrapper.text()).toContain('可读取会话上下文')
    expect(wrapper.text()).toContain('可写入用户记忆')
    expect(wrapper.text()).toContain('可读写持久化插件 KV')
    expect(wrapper.text()).toContain('可写入宿主事件日志')
    expect(wrapper.text()).toContain('可调用宿主子代理')
    expect(wrapper.text()).toContain('可改写模型上下文')
    expect(wrapper.text()).toContain('可消费并改写模型结果')
    expect(wrapper.text()).toContain('可定时执行任务')
    expect(wrapper.text()).toContain('可暴露宿主内 JSON Route')
    expect(wrapper.text()).toContain('最后检查')
  })
})
