import {
  type AiProviderCatalogItem,
  type AiProviderConfig,
  type AiProviderMode,
  type AiProviderSummary,
  type ProviderProtocolDriver,
} from '@garlic-claw/shared'

type ProviderLike =
  | Pick<AiProviderConfig, 'mode' | 'driver'>
  | Pick<AiProviderSummary, 'mode' | 'driver'>

export const AI_PROVIDER_MODES: AiProviderMode[] = ['catalog', 'protocol']

export const PROVIDER_PROTOCOL_DRIVERS: ProviderProtocolDriver[] = [
  'openai',
  'anthropic',
  'gemini',
]

export interface ProviderDriverOption {
  id: string
  name: string
  label: string
}

export interface ProviderModeOption {
  value: AiProviderMode
  label: string
}

export function isCatalogProviderMode(mode: AiProviderMode): boolean {
  return mode === 'catalog'
}

export function isProtocolProviderMode(mode: AiProviderMode): boolean {
  return mode === 'protocol'
}

export function findAiProviderCatalogItem(
  catalog: AiProviderCatalogItem[],
  driver: string,
): AiProviderCatalogItem | null {
  return catalog.find((item) => item.id === driver) ?? null
}

export const protocolLabels: Record<AiProviderCatalogItem['protocol'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
}

export const providerModeLabels: Record<AiProviderMode, string> = {
  catalog: '目录模板',
  protocol: '协议接入',
}

export const providerModeOptions: ProviderModeOption[] = AI_PROVIDER_MODES.map((value) => ({
  value,
  label: providerModeLabels[value],
}))

const protocolDriverNames: Record<ProviderProtocolDriver, string> = {
  openai: 'OpenAI 协议接入',
  anthropic: 'Anthropic 协议接入',
  gemini: 'Gemini 协议接入',
}

export const protocolDriverOptions: ProviderDriverOption[] =
  PROVIDER_PROTOCOL_DRIVERS.map((id) => ({
    id,
    name: protocolDriverNames[id],
    label: protocolDriverNames[id],
  }))

export function getProtocolLabel(
  protocol: string,
  fallback = protocol,
): string {
  return protocolLabels[protocol as keyof typeof protocolLabels] ?? fallback
}

export function getCatalogDriverOptionLabel(item: AiProviderCatalogItem): string {
  return `${item.name} · 核心协议族`
}

export function getCatalogDriverOptions(
  catalog: AiProviderCatalogItem[],
): ProviderDriverOption[] {
  return catalog.map((item) => ({
    id: item.id,
    name: item.name,
    label: getCatalogDriverOptionLabel(item),
  }))
}

export function getProviderModeLabel(
  provider: ProviderLike,
  catalog: AiProviderCatalogItem[],
): string {
  if (isProtocolProviderMode(provider.mode)) {
    return providerModeLabels.protocol
  }

  const catalogProvider = findAiProviderCatalogItem(catalog, provider.driver)
  if (!catalogProvider) {
    return providerModeLabels.catalog
  }

  return '核心协议族'
}

export function getProviderDriverLabel(
  provider: ProviderLike,
  catalog: AiProviderCatalogItem[],
): string {
  if (isProtocolProviderMode(provider.mode)) {
    const protocol = getProtocolLabel(provider.driver, provider.driver)
    return `${protocol} 协议接入`
  }

  const catalogProvider = findAiProviderCatalogItem(catalog, provider.driver)
  if (!catalogProvider) {
    return provider.driver
  }

  return `${catalogProvider.name} · ${getProtocolLabel(catalogProvider.protocol)} 协议`
}

export function getProviderDriverHint(
  mode: AiProviderMode,
  driver: string,
  catalog: AiProviderCatalogItem[],
): string {
  if (isProtocolProviderMode(mode)) {
    const protocolLabel = getProtocolLabel(driver, 'OpenAI')
    return `协议接入模式只保留协议族。当前将按 ${protocolLabel} 协议族连接自定义供应商。`
  }

  const catalogProvider = findAiProviderCatalogItem(catalog, driver)
  if (!catalogProvider) {
    return '目录模板模式会使用内置 catalog 的默认地址和默认模型。'
  }

  return `这是内建的 ${getProtocolLabel(catalogProvider.protocol)} 核心协议族。`
}
