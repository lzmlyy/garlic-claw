import { describe, expect, it } from 'vitest'
import { shouldDeleteBrowserSmokeProvider } from './browser-smoke-provider-cleanup.mjs'

describe('shouldDeleteBrowserSmokeProvider', () => {
  it('deletes the configured smoke provider id', () => {
    expect(shouldDeleteBrowserSmokeProvider({
      configuredProviderId: 'smoke-ui-123-openai',
      initialProviderIds: new Set(['ds2api']),
      providerApiKey: 'smoke-openai-key',
      providerId: 'smoke-ui-123-openai',
      smokePrefixRoot: 'smoke-ui-',
    })).toBe(true)
  })

  it('deletes prefixed smoke providers even when ids differ', () => {
    expect(shouldDeleteBrowserSmokeProvider({
      configuredProviderId: 'smoke-ui-123-openai',
      initialProviderIds: new Set(['ds2api']),
      providerApiKey: 'smoke-openai-key',
      providerId: 'smoke-ui-old-openai',
      smokePrefixRoot: 'smoke-ui-',
    })).toBe(true)
  })

  it('deletes historical fixed openai test providers that were not present before smoke', () => {
    expect(shouldDeleteBrowserSmokeProvider({
      configuredProviderId: 'smoke-ui-123-openai',
      initialProviderIds: new Set(['ds2api']),
      providerApiKey: 'test-openai-key',
      providerId: 'openai',
      smokePrefixRoot: 'smoke-ui-',
    })).toBe(true)
  })

  it('keeps pre-existing providers even if they look like test data', () => {
    expect(shouldDeleteBrowserSmokeProvider({
      configuredProviderId: 'smoke-ui-123-openai',
      initialProviderIds: new Set(['ds2api', 'openai']),
      providerApiKey: 'test-openai-key',
      providerId: 'openai',
      smokePrefixRoot: 'smoke-ui-',
    })).toBe(false)
  })
})
