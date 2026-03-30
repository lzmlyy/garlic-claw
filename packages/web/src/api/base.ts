const BASE = '/api'

/**
 * 统一 API 错误类型。
 */
export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API Error ${status}: ${body}`)
  }
}

/**
 * 获取当前 API 基础路径。
 * @returns API 根路径
 */
export function getApiBase(): string {
  return BASE
}

/**
 * 统一请求封装。
 * @param url API 路径
 * @param options fetch 选项
 * @returns 解析后的响应数据
 */
export async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const resolved = await sendRequest(url, options)
  return parseResponse<T>(resolved)
}

/**
 * 统一请求封装，并保留响应状态码与响应头。
 * @param url API 路径
 * @param options fetch 选项
 * @returns 解析后的响应体与元数据
 */
export async function requestWithMetadata<T>(
  url: string,
  options: RequestInit = {},
): Promise<{
  status: number
  headers: Record<string, string>
  body: T
}> {
  const resolved = await sendRequest(url, options)

  return {
    status: resolved.status,
    headers: collectHeaders(resolved.headers),
    body: await parseResponse<T>(resolved),
  }
}

/**
 * 构建带认证信息的请求头。
 * @param options fetch 选项
 * @returns 标准化请求头
 */
function buildHeaders(options: RequestInit): Record<string, string> {
  const token = localStorage.getItem('accessToken')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

/**
 * 发起请求并处理 401 刷新逻辑。
 * @param url 请求路径
 * @param options 请求参数
 * @returns 可继续解析的最终响应
 */
async function sendRequest(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const headers = buildHeaders(options)
  const response = await fetch(`${BASE}${url}`, { ...options, headers })
  return resolveUnauthorized(url, options, response, headers)
}

/**
 * 处理 401 刷新逻辑。
 * @param url 请求路径
 * @param options 请求参数
 * @param response 原始响应
 * @param headers 已构建请求头
 * @returns 可继续解析的最终响应
 */
async function resolveUnauthorized(
  url: string,
  options: RequestInit,
  response: Response,
  headers: Record<string, string>,
): Promise<Response> {
  if (response.status !== 401) {
    return response
  }

  const refreshed = await tryRefresh()
  if (!refreshed) {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    window.location.href = '/login'
    throw new ApiError(401, '未授权')
  }

  headers.Authorization = `Bearer ${localStorage.getItem('accessToken')}`
  return fetch(`${BASE}${url}`, { ...options, headers })
}

/**
 * 解析响应体。
 * @param response fetch 响应
 * @returns JSON 或文本结果
 */
async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError(response.status, await response.text())
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>
  }

  return (await response.text()) as T
}

/**
 * 把响应头序列化为普通对象，便于 UI 展示。
 * @param headers fetch 响应头
 * @returns 键值化响应头
 */
function collectHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries())
}

/**
 * 尝试刷新令牌。
 * @returns 是否刷新成功
 */
async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) {
    return false
  }

  try {
    const response = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!response.ok) {
      return false
    }

    const data = await response.json() as {
      accessToken: string
      refreshToken: string
    }
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    return true
  } catch {
    return false
  }
}
