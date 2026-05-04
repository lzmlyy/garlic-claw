import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SchemaConfigForm from '@/modules/config/components/SchemaConfigForm.vue'
import { INTERNAL_CONFIG_CHANGED_EVENT } from '@/modules/ai-settings/internal-config-change'
import * as aiApi from '@/modules/ai-settings/api/ai'
vi.mock('@/modules/ai-settings/api/ai', () => ({
  listAiProviders: vi.fn().mockResolvedValue([
    {
      id: 'openai',
      name: 'OpenAI',
    },
  ]),
}))

vi.mock('@/modules/personas/api/personas', () => ({
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

vi.mock('@/modules/plugins/api/plugins', () => ({
  listSubagentTypes: vi.fn().mockResolvedValue([
    {
      id: 'general',
      name: '通用',
      description: '默认子代理',
    },
    {
      id: 'explore',
      name: '探索',
    },
    {
      id: 'review',
      name: '审阅',
      description: '优先找风险与缺口',
    },
    {
      id: 'writer',
      name: '写作',
      description: '优先产出可复用文本',
    },
  ]),
}))

enableAutoUnmount(afterEach)

const ElOptionStub = defineComponent({
  name: 'ElOption',
  props: {
    label: {
      type: String,
      default: '',
    },
    value: {
      type: [String, Number, Boolean],
      required: false,
      default: '',
    },
  },
  template: '<option :value="value"><slot>{{ label }}</slot></option>',
})
const ElSelectStub = defineComponent({
  name: 'ElSelect',
  props: {
    modelValue: {
      type: [String, Number, Array, Boolean, Object],
      required: false,
      default: '',
    },
    multiple: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['change', 'update:modelValue'],
  setup(props, { emit }) {
    function handleChange(event: Event) {
      const target = event.target as HTMLSelectElement
      const value = props.multiple
        ? [...target.selectedOptions].map((option) => option.value)
        : target.value
      emit('update:modelValue', value)
      emit('change', value)
    }

    return {
      handleChange,
    }
  },
  template: '<select :multiple="multiple" :value="multiple ? null : modelValue ?? \'\'" @change="handleChange"><slot /></select>',
})

function mountSchemaConfigForm(options: Parameters<typeof mount<typeof SchemaConfigForm>>[1]) {
  return mount(SchemaConfigForm, {
    ...options,
    global: {
      ...options?.global,
      stubs: {
        ElOption: ElOptionStub,
        ElSelect: ElSelectStub,
        ...options?.global?.stubs,
      },
    },
  })
}

describe('SchemaConfigForm', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits nested config values from object-tree schema', async () => {
    const wrapper = mountSchemaConfigForm({
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
    const wrapper = mountSchemaConfigForm({
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
    const wrapper = mountSchemaConfigForm({
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

  it('renders subagent type selector options through host data sources', async () => {
    const wrapper = mountSchemaConfigForm({
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              targetSubagentType: {
                type: 'string',
                specialType: 'selectSubagentType',
              },
            },
          },
          values: {
            targetSubagentType: 'general',
          },
        },
      },
    })

    await flushPromises()

    const options = wrapper.findAll('option').map((node) => node.text())
    expect(options).toContain('通用')
    expect(options).toContain('探索')
    expect(options).toContain('审阅')
    expect(options).toContain('写作')
    expect(options).toContain('使用默认子代理类型')
  })

  it('renders typed option labels for single-select fields', async () => {
    const wrapper = mountSchemaConfigForm({
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
    const wrapper = mountSchemaConfigForm({
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
    const wrapper = mountSchemaConfigForm({
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

    expect(wrapper.text()).toContain('高级设置')
    expect(wrapper.text()).toContain('注意：')
    expect(wrapper.text()).toContain('谨慎修改')
    expect(wrapper.text()).toContain('全屏编辑')
    expect(wrapper.text()).not.toContain('隐藏字段')
  })

  it('resolves nested field conditions against the current object scope', async () => {
    const wrapper = mountSchemaConfigForm({
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              contextCompaction: {
                type: 'object',
                description: '上下文压缩',
                items: {
                  strategy: {
                    type: 'string',
                    description: '策略',
                    options: [
                      {
                        value: 'summary',
                        label: '摘要压缩',
                      },
                      {
                        value: 'sliding',
                        label: '滑动窗口',
                      },
                    ],
                  },
                  compressionThreshold: {
                    type: 'int',
                    description: '自动触发阈值',
                    condition: {
                      strategy: 'summary',
                    },
                  },
                },
              },
            },
          },
          values: {
            contextCompaction: {
              strategy: 'summary',
              compressionThreshold: 80,
            },
          },
        },
      },
    })

    expect(wrapper.text()).toContain('自动触发阈值')

    await wrapper.findAll('select')[0].setValue('sliding')

    expect(wrapper.text()).not.toContain('自动触发阈值')
  })

  it('shows a clear error when list fields contain invalid JSON', async () => {
    const wrapper = mountSchemaConfigForm({
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

  it('renders builtin runtime-tools config schema as platform-scoped backend options', async () => {
    const wrapper = mountSchemaConfigForm({
      props: {
        saving: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              approvalMode: {
                type: 'string',
                options: [
                  {
                    value: 'review',
                    label: '审批确认',
                  },
                  {
                    value: 'yolo',
                    label: 'YOLO 直通',
                  },
                ],
              },
              shellBackend: {
                type: 'string',
                options: process.platform === 'win32'
                  ? [
                    {
                      value: 'native-shell',
                      label: 'PowerShell',
                    },
                    {
                      value: 'wsl-shell',
                      label: 'WSL',
                    },
                    {
                      value: 'just-bash',
                      label: 'just-bash',
                    },
                  ]
                  : [
                    {
                      value: 'native-shell',
                      label: 'bash',
                    },
                  ],
                hint: process.platform === 'win32'
                  ? 'Windows 下提供 PowerShell / WSL / just-bash'
                  : 'Linux 下只提供 bash',
              },
              bashOutput: {
                type: 'object',
                description: 'bash 输出治理',
                collapsed: true,
                items: {
                  maxLines: {
                    type: 'int',
                    defaultValue: 200,
                  },
                  maxBytes: {
                    type: 'int',
                    defaultValue: 16384,
                  },
                  showTruncationDetails: {
                    type: 'bool',
                    defaultValue: true,
                  },
                },
              },
            },
          },
          values: {
            approvalMode: 'review',
            shellBackend: 'native-shell',
            bashOutput: {
              maxLines: 80,
              maxBytes: 8192,
              showTruncationDetails: false,
            },
          },
        },
      },
    })

    const selects = wrapper.findAll('select.config-input')
    const approvalModeInput = selects[0]
    const backendInput = selects[1]
    expect((approvalModeInput.element as HTMLSelectElement).value).toBe('review')
    await approvalModeInput.setValue('yolo')
    expect((backendInput.element as HTMLSelectElement).value).toBe('native-shell')
    await backendInput.setValue(process.platform === 'win32' ? 'just-bash' : 'native-shell')

    expect(wrapper.text()).toContain('bash 输出治理')
    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          approvalMode: 'yolo',
          shellBackend: process.platform === 'win32' ? 'just-bash' : 'native-shell',
          bashOutput: {
            maxLines: 80,
            maxBytes: 8192,
            showTruncationDetails: false,
          },
        },
      ],
    ])
  })

  it('refreshes provider selector options after provider-model config changes', async () => {
    vi.mocked(aiApi.listAiProviders)
      .mockResolvedValueOnce([
        {
          id: 'openai',
          name: 'OpenAI',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'openai',
          name: 'OpenAI',
        },
        {
          id: 'deepseek',
          name: 'DeepSeek',
        },
      ])

    const wrapper = mountSchemaConfigForm({
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
    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'provider-models',
      },
    }))
    await vi.advanceTimersByTimeAsync(0)
    await flushPromises()

    const options = wrapper.findAll('option').map((node) => node.text())
    expect(options).toContain('OpenAI')
    expect(options).toContain('DeepSeek')
  })

  it('retries auto-save after a failed save when the snapshot has not caught up', async () => {
    const wrapper = mountSchemaConfigForm({
      props: {
        autoSave: true,
        saving: false,
        showSaveButton: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              prompt: {
                type: 'string',
              },
            },
          },
          values: {
            prompt: 'alpha',
          },
        },
      },
    })

    await wrapper.get('.config-input input').setValue('beta')
    await vi.advanceTimersByTimeAsync(500)

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          prompt: 'beta',
        },
      ],
    ])

    await wrapper.setProps({ saving: true })
    await wrapper.setProps({ saving: false })
    await vi.advanceTimersByTimeAsync(0)

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          prompt: 'beta',
        },
      ],
      [
        {
          prompt: 'beta',
        },
      ],
    ])
  })

  it('does not retry auto-save after the snapshot catches up to the pending draft', async () => {
    const wrapper = mountSchemaConfigForm({
      props: {
        autoSave: true,
        saving: false,
        showSaveButton: false,
        snapshot: {
          schema: {
            type: 'object',
            items: {
              prompt: {
                type: 'string',
              },
            },
          },
          values: {
            prompt: 'alpha',
          },
        },
      },
    })

    await wrapper.get('.config-input input').setValue('beta')
    await vi.advanceTimersByTimeAsync(500)

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          prompt: 'beta',
        },
      ],
    ])

    await wrapper.setProps({ saving: true })
    await wrapper.setProps({
      snapshot: {
        schema: {
          type: 'object',
          items: {
            prompt: {
              type: 'string',
            },
          },
        },
        values: {
          prompt: 'beta',
        },
      },
    })
    await wrapper.setProps({ saving: false })
    await vi.advanceTimersByTimeAsync(0)

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          prompt: 'beta',
        },
      ],
    ])
  })
})
