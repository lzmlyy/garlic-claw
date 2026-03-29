import type {
  AiProviderConnectionTestResult,
  AiModelConfig,
  AiProviderConfig,
  AiProviderSummary,
  DiscoveredAiModel,
  OfficialProviderCatalogItem,
  VisionFallbackConfig,
} from '@garlic-claw/shared'
import * as api from '../api'

/**
 * Vision Fallback 可选模型项。
 */
export interface VisionModelOption {
  providerId: string
  providerName: string
  modelId: string
  label: string
}

/**
 * provider 测试连接结果。
 */
export interface ProviderConnectionResult {
  kind: 'success' | 'error'
  text: string
}

/**
 * 设置页初始化所需的数据快照。
 */
export interface ProviderSettingsBaseData {
  catalog: OfficialProviderCatalogItem[]
  providers: AiProviderSummary[]
  visionConfig: VisionFallbackConfig
}

/**
 * 选中 provider 后右侧详情所需的数据快照。
 */
export interface ProviderSettingsSelectionData {
  provider: AiProviderConfig
  models: AiModelConfig[]
}

/**
 * 并发加载设置页基础数据。
 * @returns 官方目录、provider 列表和视觉配置
 */
export async function loadProviderSettingsBaseData(): Promise<ProviderSettingsBaseData> {
  const [catalog, providers, visionConfig] = await Promise.all([
    api.listOfficialProviderCatalog(),
    api.listAiProviders(),
    api.getVisionFallbackConfig(),
  ])

  return {
    catalog,
    providers,
    visionConfig,
  }
}

/**
 * 加载单个 provider 的详情与模型列表。
 * @param providerId provider ID
 * @returns provider 详情和模型列表
 */
export async function loadProviderSelectionData(
  providerId: string,
): Promise<ProviderSettingsSelectionData> {
  const [provider, models] = await Promise.all([
    api.getAiProvider(providerId),
    api.listAiModels(providerId),
  ])

  return {
    provider,
    models,
  }
}

/**
 * 按页面表单结果保存 provider 配置。
 * @param provider 页面表单输出
 */
export async function saveProviderConfig(provider: AiProviderConfig): Promise<void> {
  await api.upsertAiProvider(provider.id, {
    name: provider.name,
    mode: provider.mode,
    driver: provider.driver,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    models: provider.models,
  })
}

/**
 * 把用户勾选的远程模型导入到当前 provider。
 * @param providerId provider ID
 * @param discoveredModels 已拉取的模型列表
 * @param modelIds 用户勾选的模型 ID
 */
export async function importDiscoveredProviderModels(
  providerId: string,
  discoveredModels: DiscoveredAiModel[],
  modelIds: string[],
): Promise<void> {
  const modelNameMap = new Map(
    discoveredModels.map((model) => [model.id, model.name]),
  )

  for (const modelId of modelIds) {
    const modelName = modelNameMap.get(modelId)
    await api.upsertAiModel(providerId, modelId, {
      name: modelName && modelName !== modelId ? modelName : undefined,
    })
  }
}

/**
 * 重新构建 Vision Fallback 的模型候选列表。
 * @param providers 当前 provider 摘要列表
 * @returns 可直接绑定到下拉框的候选项
 */
export async function loadVisionModelOptions(
  providers: AiProviderSummary[],
): Promise<VisionModelOption[]> {
  const availableProviders = providers.filter((item) => item.available)
  const modelGroups = await Promise.all(
    availableProviders.map(async (provider) => ({
      provider,
      models: await listProviderModelsSafely(provider.id),
    })),
  )

  return modelGroups.flatMap(({ provider, models }) =>
    models
      .filter((model) => model.capabilities.input.image)
      .map((model) => ({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        label: `${provider.name} / ${model.name}`,
      })),
  )
}

async function listProviderModelsSafely(providerId: string): Promise<AiModelConfig[]> {
  try {
    return await api.listAiModels(providerId)
  } catch {
    return []
  }
}

/**
 * 把接口错误统一转成可显示文本。
 * @param error 任意异常
 * @param fallback 兜底提示
 * @returns 面向界面的错误文本
 */
export function toErrorMessage(
  error: Error | string | null | undefined,
  fallback: string,
): string {
  if (error instanceof Error) {
    return error.message
  }

  return typeof error === 'string' && error ? error : fallback
}

/**
 * 格式化 provider 测试连接成功文案。
 * @param result 测试连接结果
 * @returns 给用户显示的成功提示
 */
export function formatConnectionSuccess(
  result: AiProviderConnectionTestResult,
): string {
  const text = result.text.trim()
  return text
    ? `连接成功，模型 ${result.modelId} 返回：${text}`
    : `连接成功，模型 ${result.modelId} 已正常响应。`
}
