import type {
  ApiKeySummary,
  CreateApiKeyResponse,
} from '@garlic-claw/shared'
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '@/features/api-keys/api/api-keys'
import { getErrorMessage } from '@/utils/error'

export type CreateApiKeyInput = Parameters<typeof createApiKey>[0]

/**
 * 读取当前 API key 列表。
 * @returns API key 列表
 */
export function loadApiKeys(): Promise<ApiKeySummary[]> {
  return listApiKeys()
}

/**
 * 创建新的 API key。
 * @param payload 创建请求
 * @returns 新建结果，包含一次性 token
 */
export function createApiKeyRecord(
  payload: CreateApiKeyInput,
): Promise<CreateApiKeyResponse> {
  return createApiKey(payload)
}

/**
 * 撤销现有 API key。
 * @param id key ID
 * @returns 撤销后的 key 摘要
 */
export function revokeApiKeyRecord(id: string): Promise<ApiKeySummary> {
  return revokeApiKey(id)
}

/**
 * 统一转换 API key 管理页错误文案。
 * @param error 捕获到的异常
 * @param fallback 兜底文案
 * @returns 可展示错误文本
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return getErrorMessage(error, fallback)
}
