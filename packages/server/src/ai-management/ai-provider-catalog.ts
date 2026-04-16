import type { AiProviderCatalogItem } from '@garlic-claw/shared';

export const PROVIDER_CATALOG: AiProviderCatalogItem[] = [
  { id: 'openai', kind: 'core', protocol: 'openai', name: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  { id: 'anthropic', kind: 'core', protocol: 'anthropic', name: 'Anthropic', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-sonnet-20241022' },
  { id: 'gemini', kind: 'core', protocol: 'gemini', name: 'Google Gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-1.5-pro' },
  { id: 'groq', kind: 'preset', protocol: 'openai', name: 'Groq', defaultBaseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile' },
  { id: 'openrouter', kind: 'preset', protocol: 'openai', name: 'OpenRouter', defaultBaseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o' },
];
