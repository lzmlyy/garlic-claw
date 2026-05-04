import { computed, ref, shallowRef } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import McpConfigPanel from '@/modules/tools/components/McpConfigPanel.vue'

const hoisted = vi.hoisted(() => ({
  state: null as ReturnType<typeof createManagementState> | null,
}))

vi.mock('@/modules/tools/composables/use-mcp-config-management', () => ({
  useMcpConfigManagement: () => hoisted.state,
}))

describe('McpConfigPanel', () => {
  it('renders MCP config summary and selected server fields', async () => {
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'weather-server',
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
          env: {},
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    hoisted.state.selectedServerName.value = 'weather-server'

    const wrapper = mount(McpConfigPanel, {
      props: {
        preferredServerName: 'weather-server',
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('MCP 配置')
    expect(wrapper.text()).toContain('MCP Server')
    expect(wrapper.text()).toContain('weather-server')
    expect(wrapper.find('[data-test="mcp-name-input"]').element).toHaveProperty('value', 'weather-server')
    expect(wrapper.find('[data-test="mcp-command-input"]').element).toHaveProperty('value', 'npx')
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('MCP 日志设置')
    expect(wrapper.text()).not.toContain('MCP 事件日志')
  })

  it('auto-saves a new server after the draft becomes valid', async () => {
    vi.useFakeTimers()
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [],
    }

    const wrapper = mount(McpConfigPanel)

    await wrapper.get('[data-test="mcp-name-input"]').setValue('tavily')
    await wrapper.get('[data-test="mcp-command-input"]').setValue('npx')
    await wrapper.get('[data-test="mcp-args-input"]').setValue('-y\ntavily-mcp@latest')
    await wrapper.get('[data-test="mcp-env-key-0"]').setValue('TAVILY_API_KEY')
    await wrapper.get('[data-test="mcp-env-value-0"]').setValue('${TAVILY_API_KEY}')
    await vi.runAllTimersAsync()

    expect(hoisted.state?.createServer).toHaveBeenCalledWith({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })
    expect(hoisted.state?.refresh).toHaveBeenCalledWith('tavily')
    vi.useRealTimers()
  })

  it('saves event log settings for the selected server', async () => {
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'weather-server',
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
          env: {},
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    hoisted.state.selectedServerName.value = 'weather-server'

    const wrapper = mount(McpConfigPanel, {
      props: {
        view: 'logs',
      },
    })
    await flushPromises()

    ;(wrapper.vm as unknown as { toggleLogSettings: () => void }).toggleLogSettings()
    await flushPromises()
    await wrapper.get('input[type="number"]').setValue('2')
    await wrapper.get('.action-row .el-button--primary').trigger('click')

    expect(hoisted.state?.saveServerEventLog).toHaveBeenCalledWith({
      maxFileSizeMb: 2,
    })
  })

  it('renders event logs in logs view without config editor', async () => {
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'weather-server',
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
          env: {},
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    hoisted.state.selectedServerName.value = 'weather-server'

    const wrapper = mount(McpConfigPanel, {
      props: {
        view: 'logs',
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('MCP 日志')
    expect(wrapper.text()).toContain('MCP 事件日志')
    expect(wrapper.text()).not.toContain('MCP Logs')
    expect(wrapper.find('[data-test="mcp-name-input"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('MCP 日志设置')
  })

  it('does not overwrite an edited env value with the stale selected server snapshot before auto-save catches up', async () => {
    vi.useFakeTimers()
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          env: {
            TAVILY_API_KEY: '${TAVILY_API_KEY}',
          },
          envEntries: [
            {
              key: 'TAVILY_API_KEY',
              source: 'env-ref',
              value: '${TAVILY_API_KEY}',
            },
          ],
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    hoisted.state.selectedServerName.value = 'tavily'

    const wrapper = mount(McpConfigPanel, {
      props: {
        preferredServerName: 'tavily',
      },
    })
    await flushPromises()

    await wrapper.get('[data-test="mcp-env-value-0"]').setValue('real-secret-key')

    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          env: {
            TAVILY_API_KEY: '${TAVILY_API_KEY}',
          },
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    await flushPromises()

    expect((wrapper.get('[data-test="mcp-env-value-0"]').element as HTMLInputElement).value).toBe('real-secret-key')

    await vi.runAllTimersAsync()

    expect(hoisted.state?.updateServer).toHaveBeenCalledWith('tavily', expect.objectContaining({
      env: {
        TAVILY_API_KEY: 'real-secret-key',
      },
    }))
    vi.useRealTimers()
  })

  it('retries auto-save for the same failed draft without requiring the user to edit again', async () => {
    vi.useFakeTimers()
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          env: {
            TAVILY_API_KEY: '${TAVILY_API_KEY}',
          },
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    hoisted.state.selectedServerName.value = 'tavily'
    hoisted.state.updateServer
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce(undefined)

    const wrapper = mount(McpConfigPanel, {
      props: {
        preferredServerName: 'tavily',
      },
    })
    await flushPromises()

    await wrapper.get('[data-test="mcp-env-value-0"]').setValue('failed-secret')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()

    expect(hoisted.state.updateServer).toHaveBeenCalledTimes(1)
    expect(hoisted.state.updateServer).toHaveBeenLastCalledWith('tavily', expect.objectContaining({
      env: {
        TAVILY_API_KEY: 'failed-secret',
      },
    }))

    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()

    expect(hoisted.state.updateServer).toHaveBeenCalledTimes(2)
    expect(hoisted.state.updateServer).toHaveBeenLastCalledWith('tavily', expect.objectContaining({
      env: {
        TAVILY_API_KEY: 'failed-secret',
      },
    }))
    vi.useRealTimers()
  })

  it('keeps the saved env value after an explicit refresh replay', async () => {
    vi.useFakeTimers()
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          env: {
            TAVILY_API_KEY: '${TAVILY_API_KEY}',
          },
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    hoisted.state.selectedServerName.value = 'tavily'
    hoisted.state.updateServer.mockImplementation(async (_name, payload) => payload)

    const wrapper = mount(McpConfigPanel, {
      props: {
        preferredServerName: 'tavily',
      },
    })
    await flushPromises()

    await wrapper.get('[data-test="mcp-env-value-0"]').setValue('persisted-secret')
    await vi.runAllTimersAsync()
    await flushPromises()

    expect(hoisted.state.updateServer).toHaveBeenCalledWith('tavily', expect.objectContaining({
      env: {
        TAVILY_API_KEY: 'persisted-secret',
      },
    }))
    expect(hoisted.state.refresh).toHaveBeenCalledWith('tavily')

    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          env: {
            TAVILY_API_KEY: '${TAVILY_API_KEY}',
          },
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    await flushPromises()

    expect((wrapper.get('[data-test="mcp-env-value-0"]').element as HTMLInputElement).value).toBe('persisted-secret')

    ;(wrapper.vm as unknown as { handleRefresh: () => void }).handleRefresh()
    expect(hoisted.state.refresh).toHaveBeenCalledTimes(2)

    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          env: {
            TAVILY_API_KEY: 'persisted-secret',
          },
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    await flushPromises()

    expect((wrapper.get('[data-test="mcp-env-value-0"]').element as HTMLInputElement).value).toBe('persisted-secret')
    vi.useRealTimers()
  })

  it('does not expose stored secret values and preserves the stored secret when editing another field', async () => {
    vi.useFakeTimers()
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'mcp/servers',
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          env: {
            TAVILY_API_KEY: '',
          },
          envEntries: [
            {
              key: 'TAVILY_API_KEY',
              source: 'stored-secret',
              value: '',
              hasStoredValue: true,
            },
          ],
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    }
    hoisted.state.selectedServerName.value = 'tavily'

    const wrapper = mount(McpConfigPanel, {
      props: {
        preferredServerName: 'tavily',
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('已保存本地 secret')
    expect((wrapper.get('[data-test="mcp-env-value-0"]').element as HTMLInputElement).value).toBe('')

    await wrapper.get('[data-test="mcp-args-input"]').setValue('-y\ntavily-mcp@latest\n--verbose')
    await vi.runAllTimersAsync()

    expect(hoisted.state?.updateServer).toHaveBeenCalledWith('tavily', expect.objectContaining({
      args: ['-y', 'tavily-mcp@latest', '--verbose'],
      envEntries: [
        {
          key: 'TAVILY_API_KEY',
          source: 'stored-secret',
          value: '',
          hasStoredValue: true,
        },
      ],
    }))
    vi.useRealTimers()
  })
})

function createManagementState() {
  const snapshot = ref({
    configPath: 'mcp/servers',
    servers: [] as Array<{
      name: string
      command: string
      args: string[]
      env: Record<string, string>
      envEntries?: Array<{
        key: string
        source: 'env-ref' | 'literal' | 'stored-secret'
        value: string
        hasStoredValue?: boolean
      }>
      eventLog: {
        maxFileSizeMb: number
      }
    }>,
  })
  const selectedServerName = ref<string | null>(null)
  const servers = computed(() => snapshot.value.servers)

  return {
    loading: ref(false),
    saving: ref(false),
    savingEventLog: ref(false),
    deleting: ref(false),
    error: ref<string | null>(null),
    notice: ref<string | null>(null),
    snapshot,
    servers,
    selectedServerName,
    eventLoading: ref(false),
    eventLogs: shallowRef([]),
    eventQuery: shallowRef({ limit: 50 }),
    eventNextCursor: ref<string | null>(null),
    selectedServer: computed(() =>
      servers.value.find((server) => server.name === selectedServerName.value) ?? null,
    ),
    refresh: vi.fn(),
    refreshServerEvents: vi.fn(),
    loadMoreServerEvents: vi.fn(),
    selectServer: vi.fn((name: string | null) => {
      selectedServerName.value = name
    }),
    createServer: vi.fn().mockResolvedValue(undefined),
    updateServer: vi.fn().mockResolvedValue(undefined),
    deleteServer: vi.fn().mockResolvedValue(undefined),
    saveServerEventLog: vi.fn().mockResolvedValue(undefined),
  }
}
