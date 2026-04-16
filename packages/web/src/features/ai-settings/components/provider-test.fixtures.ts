import type { AiProviderCatalogItem } from '@garlic-claw/shared'

export const coreProviderCatalogFixture: AiProviderCatalogItem[] = [
  {
    id: 'openai',
    kind: 'core',
    protocol: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'anthropic',
    kind: 'core',
    protocol: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
  },
  {
    id: 'gemini',
    kind: 'core',
    protocol: 'gemini',
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-pro',
  },
]
