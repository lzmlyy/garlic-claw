import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AiProviderEditorDialog from './AiProviderEditorDialog.vue'

describe('AiProviderEditorDialog', () => {
  it('does not close when clicking the overlay', async () => {
    const wrapper = mount(AiProviderEditorDialog, {
      props: {
        visible: true,
        title: '新增 provider',
        catalog: [],
        initialConfig: null,
      },
    })

    await wrapper.get('[data-test="provider-dialog-overlay"]').trigger('click')

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('still closes when clicking the explicit close actions', async () => {
    const wrapper = mount(AiProviderEditorDialog, {
      props: {
        visible: true,
        title: '新增 provider',
        catalog: [],
        initialConfig: null,
      },
    })

    await wrapper.get('[data-test="provider-dialog-close"]').trigger('click')
    await wrapper.get('[data-test="provider-dialog-cancel"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})
