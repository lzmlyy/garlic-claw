import type { Reactive } from 'vue'
import type { AiProviderConfig, OfficialProviderCatalogItem } from '@garlic-claw/shared'

/**
 * provider 编辑表单状态。
 */
export interface ProviderFormState {
  id: string
  name: string
  mode: 'official' | 'compatible'
  driver: string
  apiKey: string
  baseUrl: string
  defaultModel: string
  modelsText: string
}

/**
 * 兼容模式可选的驱动列表。
 */
export const compatibleDrivers = [
  { id: 'openai', name: 'OpenAI 兼容' },
  { id: 'anthropic', name: 'Anthropic 兼容' },
  { id: 'gemini', name: 'Gemini 兼容' },
] as const

/**
 * 创建 provider 编辑表单的默认状态。
 * @returns 可直接交给 `reactive()` 的初始对象
 */
export function createProviderFormState(): ProviderFormState {
  return {
    id: 'openai',
    name: 'OpenAI',
    mode: 'official',
    driver: 'openai',
    apiKey: '',
    baseUrl: '',
    defaultModel: '',
    modelsText: '',
  }
}

/**
 * 根据当前弹窗上下文重置表单内容。
 * @param form 表单状态
 * @param initialConfig 当前正在编辑的 provider；为空表示新建
 * @param catalog 官方 provider 目录
 */
export function syncProviderFormState(
  form: Reactive<ProviderFormState>,
  initialConfig: AiProviderConfig | null,
  catalog: OfficialProviderCatalogItem[],
): void {
  if (initialConfig) {
    form.id = initialConfig.id
    form.name = initialConfig.name
    form.mode = initialConfig.mode
    form.driver = initialConfig.driver
    form.apiKey = initialConfig.apiKey ?? ''
    form.baseUrl = initialConfig.baseUrl ?? ''
    form.defaultModel = initialConfig.defaultModel ?? ''
    form.modelsText = initialConfig.models.join('\n')
    return
  }

  const firstCatalogItem = catalog[0]
  form.id = firstCatalogItem?.id ?? 'openai'
  form.name = firstCatalogItem?.name ?? 'OpenAI'
  form.mode = 'official'
  form.driver = firstCatalogItem?.id ?? 'openai'
  form.apiKey = ''
  form.baseUrl = firstCatalogItem?.defaultBaseUrl ?? ''
  form.defaultModel = firstCatalogItem?.defaultModel ?? ''
  form.modelsText = firstCatalogItem?.defaultModel ?? ''
}

/**
 * 根据当前驱动和模式补齐默认值。
 * @param form 表单状态
 * @param catalog 官方 provider 目录
 * @param initialConfig 当前正在编辑的 provider
 */
export function applyProviderDriverDefaults(
  form: Reactive<ProviderFormState>,
  catalog: OfficialProviderCatalogItem[],
  initialConfig: AiProviderConfig | null,
): void {
  const official = catalog.find((item) => item.id === form.driver)
  if (form.mode === 'official' && official) {
    form.id = official.id
    if (!form.name || form.name === initialConfig?.name) {
      form.name = official.name
    }
    if (!form.baseUrl || form.baseUrl === initialConfig?.baseUrl) {
      form.baseUrl = official.defaultBaseUrl
    }
    if (!form.defaultModel || form.defaultModel === initialConfig?.defaultModel) {
      form.defaultModel = official.defaultModel
      form.modelsText = official.defaultModel
    }
    return
  }

  if (form.mode === 'compatible') {
    if (!initialConfig) {
      form.id = slugify(form.name || form.driver)
    }
    if (!form.baseUrl) {
      form.baseUrl = compatibleDrivers.find((item) => item.id === form.driver)?.id === 'anthropic'
        ? 'https://api.anthropic.com/v1'
        : form.driver === 'gemini'
          ? 'https://generativelanguage.googleapis.com/v1beta'
          : 'https://api.openai.com/v1'
    }
  }
}

/**
 * 把表单状态转换成后端接口所需的 provider 配置。
 * @param form 当前表单状态
 * @returns 已整理好的 provider 配置
 */
export function buildProviderConfigPayload(
  form: Reactive<ProviderFormState>,
): AiProviderConfig {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    mode: form.mode,
    driver: form.driver.trim(),
    apiKey: form.apiKey.trim() || undefined,
    baseUrl: form.baseUrl.trim() || undefined,
    defaultModel: form.defaultModel.trim() || undefined,
    models: form.modelsText
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  }
}

/**
 * 把任意名称收敛为稳定的 provider ID。
 * @param value 原始名称
 * @returns 适合放到配置里的 slug
 */
function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}
