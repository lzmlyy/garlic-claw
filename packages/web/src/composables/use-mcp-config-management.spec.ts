import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMcpConfigManagement } from './use-mcp-config-management'
import * as api from '../api'

vi.mock('../api', () => ({
  listMcpServers: vi.fn(),
  createMcpServer: vi.fn(),
  updateMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
}))

describe('useMcpConfigManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listMcpServers).mockResolvedValue({
      configPath: 'D:/repo/.mcp/mcp.json',
      servers: [
        {
          name: 'weather-server',
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
          env: {},
        },
      ],
    })
    vi.mocked(api.createMcpServer).mockResolvedValue({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    })
    vi.mocked(api.updateMcpServer).mockResolvedValue({
      name: 'weather-server',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        WEATHER_TOKEN: '${WEATHER_TOKEN}',
      },
    })
    vi.mocked(api.deleteMcpServer).mockResolvedValue({
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

    expect(state.snapshot.value.configPath).toBe('D:/repo/.mcp/mcp.json')
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

    expect(api.createMcpServer).toHaveBeenCalledWith({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    })
    expect(api.updateMcpServer).toHaveBeenCalledWith('weather-server', {
      name: 'weather-server',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        WEATHER_TOKEN: '${WEATHER_TOKEN}',
      },
    })
    expect(api.deleteMcpServer).toHaveBeenCalledWith('weather-server')
  })
})
