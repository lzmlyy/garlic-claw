import { computed, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import McpConfigPanel from './McpConfigPanel.vue'

const hoisted = vi.hoisted(() => ({
  state: null as ReturnType<typeof createManagementState> | null,
}))

vi.mock('../../composables/use-mcp-config-management', () => ({
  useMcpConfigManagement: () => hoisted.state,
}))

describe('McpConfigPanel', () => {
  it('renders MCP config summary and selected server fields', async () => {
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'D:/repo/.mcp/mcp.json',
      servers: [
        {
          name: 'weather-server',
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
          env: {},
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

    expect(wrapper.text()).toContain('MCP Config')
    expect(wrapper.text()).toContain('D:/repo/.mcp/mcp.json')
    expect(wrapper.text()).toContain('weather-server')
    expect(wrapper.find('[data-test="mcp-name-input"]').element).toHaveProperty('value', 'weather-server')
    expect(wrapper.find('[data-test="mcp-command-input"]').element).toHaveProperty('value', 'npx')
  })

  it('submits create requests with command args and env entries', async () => {
    hoisted.state = createManagementState()
    hoisted.state.snapshot.value = {
      configPath: 'D:/repo/.mcp/mcp.json',
      servers: [],
    }

    const wrapper = mount(McpConfigPanel)

    await wrapper.get('[data-test="mcp-new-button"]').trigger('click')
    await wrapper.get('[data-test="mcp-name-input"]').setValue('tavily')
    await wrapper.get('[data-test="mcp-command-input"]').setValue('npx')
    await wrapper.get('[data-test="mcp-args-input"]').setValue('-y\ntavily-mcp@latest')
    await wrapper.get('[data-test="mcp-env-key-0"]').setValue('TAVILY_API_KEY')
    await wrapper.get('[data-test="mcp-env-value-0"]').setValue('${TAVILY_API_KEY}')
    await wrapper.get('form').trigger('submit')

    expect(hoisted.state?.createServer).toHaveBeenCalledWith({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    })
  })
})

function createManagementState() {
  const snapshot = ref({
    configPath: 'D:/repo/.mcp/mcp.json',
    servers: [] as Array<{
      name: string
      command: string
      args: string[]
      env: Record<string, string>
    }>,
  })
  const selectedServerName = ref<string | null>(null)
  const servers = computed(() => snapshot.value.servers)

  return {
    loading: ref(false),
    saving: ref(false),
    deleting: ref(false),
    error: ref<string | null>(null),
    notice: ref<string | null>(null),
    snapshot,
    servers,
    selectedServerName,
    selectedServer: computed(() =>
      servers.value.find((server) => server.name === selectedServerName.value) ?? null,
    ),
    refresh: vi.fn(),
    selectServer: vi.fn((name: string | null) => {
      selectedServerName.value = name
    }),
    createServer: vi.fn().mockResolvedValue(undefined),
    updateServer: vi.fn().mockResolvedValue(undefined),
    deleteServer: vi.fn().mockResolvedValue(undefined),
  }
}
