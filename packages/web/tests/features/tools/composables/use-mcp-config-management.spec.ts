import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMcpConfigManagement } from '@/features/tools/composables/use-mcp-config-management'
import * as mcpData from '@/features/tools/composables/mcp-config-management.data'

vi.mock('@/features/tools/composables/mcp-config-management.data', () => ({
  loadMcpConfigSnapshot: vi.fn(),
  createMcpServerConfig: vi.fn(),
  updateMcpServerConfig: vi.fn(),
  deleteMcpServerConfig: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

describe('useMcpConfigManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mcpData.loadMcpConfigSnapshot).mockResolvedValue({
      configPath: 'mcp/mcp.json',
      servers: [
        {
          name: 'weather-server',
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
          env: {},
        },
      ],
    })
    vi.mocked(mcpData.createMcpServerConfig).mockResolvedValue({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    })
    vi.mocked(mcpData.updateMcpServerConfig).mockResolvedValue({
      name: 'weather-server',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        WEATHER_TOKEN: '${WEATHER_TOKEN}',
      },
    })
    vi.mocked(mcpData.deleteMcpServerConfig).mockResolvedValue({
      deleted: true,
      name: 'weather-server',
    })
  })

  it('loads MCP config snapshot and tracks selected server', async () => {
    let state!: ReturnType<typeof useMcpConfigManagement>
    const Harness = defineComponent({
      setup() {
        state = useMcpConfigManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.snapshot.value.configPath).toBe('mcp/mcp.json')
    expect(state.servers.value).toHaveLength(1)
    expect(state.selectedServer.value?.name).toBe('weather-server')

    state.selectServer('missing-server')
    await flushPromises()

    expect(state.selectedServer.value).toBeNull()
  })

  it('creates, updates, and deletes MCP servers through the API layer', async () => {
    let state!: ReturnType<typeof useMcpConfigManagement>
    const Harness = defineComponent({
      setup() {
        state = useMcpConfigManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    await state.createServer({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    })
    await state.updateServer('weather-server', {
      name: 'weather-server',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        WEATHER_TOKEN: '${WEATHER_TOKEN}',
      },
    })
    await state.deleteServer('weather-server')

    expect(mcpData.createMcpServerConfig).toHaveBeenCalledWith({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    })
    expect(mcpData.updateMcpServerConfig).toHaveBeenCalledWith('weather-server', {
      name: 'weather-server',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        WEATHER_TOKEN: '${WEATHER_TOKEN}',
      },
    })
    expect(mcpData.deleteMcpServerConfig).toHaveBeenCalledWith('weather-server')
  })
})
