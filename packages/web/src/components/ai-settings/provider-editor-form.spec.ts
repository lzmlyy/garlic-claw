import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import type { OfficialProviderCatalogItem } from '@garlic-claw/shared'
import {
  applyProviderDriverDefaults,
  createProviderFormState,
  syncProviderFormState,
} from './provider-editor-form'

const catalog: OfficialProviderCatalogItem[] = [
  {
    id: 'openai',
    kind: 'core',
    name: 'OpenAI',
    npm: '@ai-sdk/openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'anthropic',
    kind: 'core',
    name: 'Anthropic',
    npm: '@ai-sdk/anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'gemini',
    kind: 'core',
    name: 'Google Gemini',
    npm: '@ai-sdk/google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-pro',
  },
]

describe('provider-editor-form', () => {
  it('refreshes official defaults when creating a provider with another official driver', () => {
    const form = reactive(createProviderFormState())

    syncProviderFormState(form, null, catalog)
    form.driver = 'anthropic'
    applyProviderDriverDefaults(form, catalog, null)

    expect(form.id).toBe('anthropic')
    expect(form.name).toBe('Anthropic')
    expect(form.baseUrl).toBe('https://api.anthropic.com/v1')
    expect(form.defaultModel).toBe('claude-3-5-sonnet-20241022')
    expect(form.modelsText).toBe('claude-3-5-sonnet-20241022')
  })

  it('clears stale official defaults when switching a new provider to compatible mode', () => {
    const form = reactive(createProviderFormState())

    syncProviderFormState(form, null, catalog)
    form.mode = 'compatible'
    form.driver = 'gemini'
    applyProviderDriverDefaults(form, catalog, null)

    expect(form.id).toBe('gemini')
    expect(form.name).toBe('Gemini 兼容')
    expect(form.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta')
    expect(form.defaultModel).toBe('')
    expect(form.modelsText).toBe('')
  })
})
