import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { PluginInfo } from '@garlic-claw/shared'
import PluginsView from './PluginsView.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {},
  }),
}))

vi.mock('@/features/plugins/composables/use-plugin-management', () => {
  const plugin = ref<PluginInfo | null>({
    id: 'plugin-1',
    name: 'builtin.demo',
    displayName: 'Demo Plugin',
    description: 'demo',
    deviceType: 'builtin',
    status: 'online',
    connected: true,
    defaultEnabled: true,
    runtimeKind: 'builtin',
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
    manifest: {
      id: 'builtin.demo',
      name: 'Demo Plugin',
      version: '1.0.0',
      runtime: 'builtin',
      permissions: [
        'conversation:read',
        'memory:write',
        'storage:write',
        'log:write',
        'subagent:run',
      ],
      tools: [],
      hooks: [
        { name: 'conversation:created' },
        { name: 'message:received' },
        { name: 'message:created' },
        { name: 'automation:before-run' },
        { name: 'automation:after-run' },
        { name: 'tool:before-call' },
        { name: 'tool:after-call' },
        { name: 'response:before-send' },
        { name: 'response:after-send' },
        { name: 'plugin:loaded' },
        { name: 'plugin:unloaded' },
        { name: 'plugin:error' },
        { name: 'chat:before-model' },
        { name: 'chat:waiting-model' },
        { name: 'chat:after-model' },
      ],
      routes: [
        { path: 'inspect/context', methods: ['GET'] },
      ],
    },
    health: {
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: '2026-03-28T00:00:00.000Z',
      lastCheckedAt: '2026-03-28T00:00:00.000Z',
      runtimePressure: {
        activeExecutions: 2,
        maxConcurrentExecutions: 6,
      },
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
      finishingConversationId: ref(null),
      deleting: ref(false),
      error: ref(null),
      notice: ref(null),
      plugins: shallowRef(plugin.value ? [plugin.value] : []),
      selectedPluginName: ref(plugin.value?.name ?? null),
      selectedPlugin: computed(() => plugin.value),
      configSnapshot: shallowRef(null),
      conversationSessions: shallowRef([]),
      cronJobs: shallowRef([]),
      scopeSettings: shallowRef(null),
      healthSnapshot: shallowRef(plugin.value?.health ?? null),
      eventLogs: shallowRef([]),
      eventQuery: shallowRef({
        limit: 50,
      }),
      eventNextCursor: ref(null),
      storageEntries: shallowRef([]),
      storagePrefix: ref(''),
      deletingStorageKey: ref(null),
      canDeleteSelected: computed(() => false),
      refreshAll: vi.fn(),
      selectPlugin: vi.fn(),
      refreshSelectedDetails: vi.fn(),
      refreshPluginEvents: vi.fn(),
      loadMorePluginEvents: vi.fn(),
      refreshPluginStorage: vi.fn(),
      deleteCronJob: vi.fn(),
      finishConversationSession: vi.fn(),
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
          PluginAttentionPanel: { template: '<div />' },
          PluginSidebar: { template: '<div />' },
          PluginConfigForm: { template: '<div />' },
          PluginScopeEditor: { template: '<div />' },
          PluginEventLog: { template: '<div />' },
          PluginStoragePanel: {
            props: ['prefix'],
            template: '<div />',
          },
          PluginCronList: { template: '<div />' },
          PluginConversationSessionList: { template: '<div />' },
          PluginRouteList: { template: '<div />' },
        },
      },
    })

    expect(wrapper.text()).toContain('可读取会话上下文')
    expect(wrapper.text()).toContain('可写入用户记忆')
    expect(wrapper.text()).toContain('可读写持久化插件 KV')
    expect(wrapper.text()).toContain('可写入宿主事件日志')
    expect(wrapper.text()).toContain('可调用宿主子代理')
    expect(wrapper.text()).toContain('可监听会话创建')
    expect(wrapper.text()).toContain('可前置监听和过滤消息')
    expect(wrapper.text()).toContain('可改写消息草稿')
    expect(wrapper.text()).toContain('可拦截自动化执行')
    expect(wrapper.text()).toContain('可改写或记录自动化结果')
    expect(wrapper.text()).toContain('可拦截工具调用参数')
    expect(wrapper.text()).toContain('可观察或改写工具结果')
    expect(wrapper.text()).toContain('可改写最终发送内容')
    expect(wrapper.text()).toContain('可观察最终发送结果')
    expect(wrapper.text()).toContain('可监听插件加载')
    expect(wrapper.text()).toContain('可监听插件卸载')
    expect(wrapper.text()).toContain('可观察插件失败事件')
    expect(wrapper.text()).toContain('可改写模型上下文')
    expect(wrapper.text()).toContain('可观察模型等待态')
    expect(wrapper.text()).toContain('可消费并改写模型结果')
    expect(wrapper.text()).toContain('可定时执行任务')
    expect(wrapper.text()).toContain('可暴露宿主内 JSON Route')
    expect(wrapper.text()).toContain('最后检查')
    expect(wrapper.text()).toContain('并发占用')
    expect(wrapper.text()).toContain('2 / 6')
  })
})
