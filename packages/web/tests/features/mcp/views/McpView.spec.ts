import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import McpView from '@/features/mcp/views/McpView.vue'

describe('McpView', () => {
  it('renders mcp workspace with governance and config sections', () => {
    const wrapper = mount(McpView, {
      global: {
        stubs: {
          ToolGovernancePanel: { template: '<div>mcp-governance</div>' },
          McpConfigPanel: { template: '<div>mcp-config</div>' },
        },
      },
    })

    expect(wrapper.text()).toContain('MCP 管理')
    expect(wrapper.text()).toContain('mcp-governance')
    expect(wrapper.text()).toContain('mcp-config')
  })
})
