import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PluginConfigForm from '@/features/plugins/components/PluginConfigForm.vue'

vi.mock('@/features/ai-settings/api/ai', () => ({
  listAiProviders: vi.fn().mockResolvedValue([
    {
      id: 'openai',
      name: 'OpenAI',
    },
  ]),
}))

vi.mock('@/features/personas/api/personas', () => ({
  listPersonas: vi.fn().mockResolvedValue([
    {
      id: 'builtin.default-assistant',
      name: '默认助手',
      avatar: null,
      isDefault: true,
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    },
  ]),
}))

describe('PluginConfigForm', () => {
  it('emits nested config values from object-tree schema', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              apiKey: {
                type: 'string',
              },
              advanced: {
                type: 'object',
                items: {
                  maxRetries: {
                    type: 'int',
                  },
                },
              },
            },
          },
          values: {
            apiKey: 'demo-key',
            advanced: {
              maxRetries: 3,
            },
          },
        },
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          apiKey: 'demo-key',
          advanced: {
            maxRetries: 3,
          },
        },
      ],
    ])
  })

  it('drops undeclared legacy keys before saving config', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              apiKey: {
                type: 'string',
              },
              advanced: {
                type: 'object',
                items: {
                  maxRetries: {
                    type: 'int',
                  },
                },
              },
            },
          },
          values: {
            apiKey: 'demo-key',
            legacyRoot: 'hidden',
            advanced: {
              maxRetries: 3,
              legacyNested: 'hidden',
            },
          },
        },
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          apiKey: 'demo-key',
          advanced: {
            maxRetries: 3,
          },
        },
      ],
    ])
  })

  it('renders AstrBot-style special selector options through host data sources', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              targetProviderId: {
                type: 'string',
                specialType: 'selectProvider',
              },
            },
          },
          values: {
            targetProviderId: 'openai',
          },
        },
      },
    })

    await flushPromises()

    const options = wrapper.findAll('option').map((node) => node.text())
    expect(options).toContain('OpenAI')
    expect(options).toContain('继承主模型（默认）')
  })

  it('renders typed option labels for single-select fields', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              locale: {
                type: 'string',
                options: [
                  {
                    value: 'zh-CN',
                    label: '简体中文',
                  },
                  {
                    value: 'en-US',
                    label: 'English',
                  },
                ],
              },
            },
          },
          values: {
            locale: 'zh-CN',
          },
        },
      },
    })

    const options = wrapper.findAll('option').map((node) => node.text())
    expect(options).toContain('简体中文')
    expect(options).toContain('English')
  })

  it('renders list options as multi-select when render type is select', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              tags: {
                type: 'list',
                renderType: 'select',
                options: [
                  {
                    value: 'safe',
                    label: '安全',
                  },
                  {
                    value: 'fast',
                    label: '快速',
                  },
                ],
              },
            },
          },
          values: {
            tags: ['safe'],
          },
        },
      },
    })

    const select = wrapper.get('select[multiple]')
    const optionTexts = select.findAll('option').map((node) => node.text())
    expect(optionTexts).toContain('安全')
    expect(optionTexts).toContain('快速')
  })

  it('renders condition, collapsed sections, obvious hints and editor actions from schema', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              mode: {
                type: 'string',
                options: [
                  {
                    value: 'basic',
                    label: '基础',
                  },
                  {
                    value: 'advanced',
                    label: '高级',
                  },
                ],
              },
              hiddenField: {
                type: 'string',
                description: '隐藏字段',
                invisible: true,
              },
              advanced: {
                type: 'object',
                description: '高级设置',
                hint: '谨慎修改',
                obviousHint: true,
                collapsed: true,
                condition: {
                  mode: 'advanced',
                },
                items: {
                  prompt: {
                    type: 'text',
                    description: '提示词模板',
                    editorMode: true,
                  },
                },
              },
            },
          },
          values: {
            mode: 'basic',
            hiddenField: 'hidden',
            advanced: {
              prompt: 'hello',
            },
          },
        },
      },
    })

    expect(wrapper.text()).not.toContain('高级设置')
    expect(wrapper.text()).not.toContain('隐藏字段')

    await wrapper.get('select').setValue('advanced')

    expect(wrapper.text()).toContain('展开高级配置')

    await wrapper.get('button.collapsed-toggle').trigger('click')

    expect(wrapper.text()).toContain('高级设置')
    expect(wrapper.text()).toContain('注意：')
    expect(wrapper.text()).toContain('谨慎修改')
    expect(wrapper.text()).toContain('全屏编辑')
    expect(wrapper.text()).not.toContain('隐藏字段')
  })

  it('shows a clear error when list fields contain invalid JSON', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              names: {
                type: 'list',
              },
            },
          },
          values: {
            names: ['alpha'],
          },
        },
      },
    })

    await wrapper.get('textarea').setValue('{invalid json}')

    expect(wrapper.text()).toContain('JSON 数组格式无效')
  })
})
