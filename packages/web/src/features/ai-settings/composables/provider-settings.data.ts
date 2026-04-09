import type {
  AiHostModelRoutingConfig,
  AiProviderConnectionTestResult,
  AiModelConfig,
  AiModelRouteTarget,
  AiProviderCatalogItem,
  AiProviderConfig,
  AiProviderSummary,
  DiscoveredAiModel,
  VisionFallbackConfig,
} from '@garlic-claw/shared'
import {
  deleteAiModel,
  deleteAiProvider,
  discoverAiProviderModels,
  getAiProvider,
  getHostModelRoutingConfig,
  getVisionFallbackConfig,
  listAiModels,
  listAiProviderCatalog,
  listAiProviders,
  setAiProviderDefaultModel,
  testAiProviderConnection,
  updateAiModelCapabilities,
  updateHostModelRoutingConfig,
  updateVisionFallbackConfig,
  upsertAiModel,
  upsertAiProvider,
} from '@/features/ai-settings/api/ai'
import { getErrorMessage } from '@/utils/error'

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
 * 宿主模型路由可选模型项。
 */
export interface HostModelRoutingOption extends AiModelRouteTarget {
  label: string
}

interface ProviderModelGroup {
  provider: AiProviderSummary
  models: AiModelConfig[]
}

export interface ProviderModelOptionsInput {
  providers: AiProviderSummary[]
  preloadedModelsByProviderId?: Partial<Record<string, AiModelConfig[]>>
}

export interface ProviderModelOptionsResult {
  visionOptions: VisionModelOption[]
  hostModelRoutingOptions: HostModelRoutingOption[]
  modelsByProviderId: Record<string, AiModelConfig[]>
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
  catalog: AiProviderCatalogItem[]
  providers: AiProviderSummary[]
  visionConfig: VisionFallbackConfig
  hostModelRoutingConfig: AiHostModelRoutingConfig
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
  const [catalog, providers, visionConfig, hostModelRoutingConfig] = await Promise.all([
    listAiProviderCatalog(),
    listAiProviders(),
    getVisionFallbackConfig(),
    getHostModelRoutingConfig(),
  ])

  return {
    catalog,
    providers,
    visionConfig,
    hostModelRoutingConfig,
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
    getAiProvider(providerId),
    listAiModels(providerId),
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
  await upsertAiProvider(provider.id, {
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
    await upsertAiModel(providerId, modelId, {
      name: modelName && modelName !== modelId ? modelName : undefined,
    })
  }
}

/**
 * 删除一个 provider。
 * @param providerId provider ID
 */
export function deleteProviderConfig(providerId: string) {
  return deleteAiProvider(providerId)
}

/**
 * 手动新增一个 provider 模型。
 * @param providerId provider ID
 * @param modelId 模型 ID
 * @param name 可选模型名
 */
export function addProviderModel(
  providerId: string,
  modelId: string,
  name?: string,
) {
  return upsertAiModel(providerId, modelId, { name })
}

/**
 * 删除一个 provider 模型。
 * @param providerId provider ID
 * @param modelId 模型 ID
 */
export function deleteProviderModel(providerId: string, modelId: string) {
  return deleteAiModel(providerId, modelId)
}

/**
 * 保存默认模型。
 * @param providerId provider ID
 * @param modelId 默认模型 ID
 * @returns 更新后的 provider 配置
 */
export function saveProviderDefaultModel(providerId: string, modelId: string) {
  return setAiProviderDefaultModel(providerId, modelId)
}

/**
 * 保存模型能力开关。
 * @param providerId provider ID
 * @param modelId 模型 ID
 * @param capabilities 能力配置
 */
export function saveProviderModelCapabilities(
  providerId: string,
  modelId: string,
  capabilities: Partial<AiModelConfig['capabilities']>,
) {
  return updateAiModelCapabilities(providerId, modelId, capabilities)
}

/**
 * 拉取远程 provider 可发现模型。
 * @param providerId provider ID
 * @returns 发现到的模型列表
 */
export function discoverProviderModels(providerId: string) {
  return discoverAiProviderModels(providerId)
}

/**
 * 测试 provider 连通性。
 * @param providerId provider ID
 * @param modelId 可选模型 ID
 * @returns 测试结果
 */
export function testProviderConnection(
  providerId: string,
  modelId?: string,
) {
  return testAiProviderConnection(providerId, { modelId })
}

/**
 * 保存 Vision Fallback 配置。
 * @param config Vision Fallback 配置
 * @returns 更新后的配置
 */
export function saveVisionFallbackConfig(config: VisionFallbackConfig) {
  return updateVisionFallbackConfig(config)
}

/**
 * 保存宿主模型路由配置。
 * @param config 宿主模型路由配置
 * @returns 更新后的配置
 */
export function saveHostModelRouting(
  config: AiHostModelRoutingConfig,
) {
  return updateHostModelRoutingConfig(config)
}

/**
 * 一次性加载 provider 相关的视觉与宿主路由候选项。
 * @param providers 当前 provider 摘要列表
 * @returns 视觉与宿主路由候选项
 */
export async function loadProviderModelOptions(
  input: ProviderModelOptionsInput | AiProviderSummary[],
): Promise<ProviderModelOptionsResult> {
  const providers = Array.isArray(input) ? input : input.providers
  const preloadedModelsByProviderId = Array.isArray(input)
    ? undefined
    : input.preloadedModelsByProviderId
  const modelGroups = await loadProviderModelGroups(providers, preloadedModelsByProviderId)

  return {
    visionOptions: modelGroups.flatMap(({ provider, models }) =>
      models
        .filter((model) => model.capabilities.input.image)
        .map((model) => ({
          providerId: provider.id,
          providerName: provider.name,
          modelId: model.id,
          label: `${provider.name} / ${model.name}`,
        })),
    ),
    hostModelRoutingOptions: modelGroups.flatMap(({ provider, models }) =>
      models.map((model) => ({
        providerId: provider.id,
        modelId: model.id,
        label: `${provider.name} / ${model.name}`,
        })),
    ),
    modelsByProviderId: Object.fromEntries(
      modelGroups.map(({ provider, models }) => [provider.id, models]),
    ),
  }
}

async function loadProviderModelGroups(
  providers: AiProviderSummary[],
  preloadedModelsByProviderId?: Partial<Record<string, AiModelConfig[]>>,
): Promise<ProviderModelGroup[]> {
  const availableProviders = providers.filter((item) => item.available)
  return Promise.all(
    availableProviders.map(async (provider) => ({
      provider,
      models: preloadedModelsByProviderId?.[provider.id]
        ?? await listProviderModelsSafely(provider.id),
    })),
  )
}

async function listProviderModelsSafely(providerId: string): Promise<AiModelConfig[]> {
  try {
    return await listAiModels(providerId)
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
  error: unknown,
  fallback: string,
): string {
  return getErrorMessage(error, fallback)
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
