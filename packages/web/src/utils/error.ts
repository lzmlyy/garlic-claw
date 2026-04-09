export type AppErrorType = 'network' | 'validation' | 'auth' | 'business'

export interface AppErrorOptions {
  status?: number
  code?: string
  details?: unknown
  originalError?: unknown
  retryable?: boolean
}

/**
 * 应用统一错误基类。
 */
export class AppError extends Error {
  readonly type: AppErrorType
  readonly status?: number
  readonly code?: string
  readonly details?: unknown
  readonly originalError?: unknown
  readonly retryable: boolean

  constructor(
    type: AppErrorType,
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.status = options.status
    this.code = options.code
    this.details = options.details
    this.originalError = options.originalError
    this.retryable = options.retryable ?? false
  }
}

/**
 * 网络错误。
 */
export class NetworkError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('network', message, {
      ...options,
      retryable: options.retryable ?? true,
    })
    this.name = 'NetworkError'
  }
}

/**
 * 参数校验错误。
 */
export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('validation', message, {
      ...options,
      retryable: options.retryable ?? false,
    })
    this.name = 'ValidationError'
  }
}

/**
 * 鉴权错误。
 */
export class AuthError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('auth', message, {
      ...options,
      retryable: options.retryable ?? false,
    })
    this.name = 'AuthError'
  }
}

/**
 * 业务错误。
 */
export class BusinessError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super('business', message, {
      ...options,
      retryable: options.retryable ?? false,
    })
    this.name = 'BusinessError'
  }
}

/**
 * 将任意异常统一转换为 AppError。
 * @param error 原始异常
 * @param fallback 默认文案
 * @returns 统一错误对象
 */
export function toAppError(
  error: unknown,
  fallback = '请求失败，请稍后重试',
): AppError {
  if (error instanceof AppError) {
    return error
  }

  const httpLike = toHttpLikeError(error)
  if (httpLike) {
    return fromHttpLikeError(httpLike, fallback)
  }

  if (isAbortError(error)) {
    return new BusinessError('请求已取消', {
      code: 'ABORTED',
      originalError: error,
      retryable: false,
    })
  }

  if (error instanceof TypeError) {
    return new NetworkError(nonEmpty(error.message) ?? '网络请求失败，请检查连接', {
      originalError: error,
    })
  }

  if (error instanceof Error) {
    return new BusinessError(nonEmpty(error.message) ?? fallback, {
      originalError: error,
    })
  }

  if (typeof error === 'string' && nonEmpty(error)) {
    return new BusinessError(error)
  }

  return new BusinessError(fallback, {
    originalError: error,
  })
}

/**
 * 获取可展示给用户的错误文案。
 * @param error 任意异常
 * @param fallback 默认文案
 * @returns 可读文案
 */
export function getErrorMessage(
  error: unknown,
  fallback = '请求失败，请稍后重试',
): string {
  return toAppError(error, fallback).message
}

/**
 * 判断错误是否建议重试。
 * @param error 任意异常
 * @returns 是否可重试
 */
export function isRetryableError(error: unknown): boolean {
  const appError = toAppError(error)
  if (appError.retryable) {
    return true
  }

  return isRetryableStatus(appError.status)
}

interface HttpLikeError {
  status: number
  body?: string
  message?: string
  code?: string
  details?: unknown
  originalError?: unknown
}

function toHttpLikeError(error: unknown): HttpLikeError | null {
  if (!isRecord(error)) {
    return null
  }

  const status = error.status
  if (typeof status !== 'number' || !Number.isFinite(status)) {
    return null
  }

  const body = typeof error.body === 'string' ? error.body : undefined
  const message = typeof error.message === 'string' ? error.message : undefined
  const code = typeof error.code === 'string' ? error.code : undefined
  return {
    status,
    body,
    message,
    code,
    details: error.details,
    originalError: error,
  }
}

function fromHttpLikeError(error: HttpLikeError, fallback: string): AppError {
  const message = resolveHttpMessage(error, fallback)
  const commonOptions: AppErrorOptions = {
    status: error.status,
    code: error.code,
    details: error.details ?? error.body,
    originalError: error.originalError,
    retryable: isRetryableStatus(error.status),
  }

  if (error.status === 401 || error.status === 403) {
    return new AuthError(message, commonOptions)
  }

  if (error.status === 400 || error.status === 422) {
    return new ValidationError(message, commonOptions)
  }

  if (error.status === 408 || error.status === 429 || error.status >= 500) {
    return new NetworkError(message, commonOptions)
  }

  return new BusinessError(message, commonOptions)
}

function resolveHttpMessage(error: HttpLikeError, fallback: string): string {
  const bodyMessage = extractMessageFromBody(error.body)
  const message = nonEmpty(bodyMessage) ?? nonEmpty(error.message)
  if (message) {
    return message
  }

  if (error.status === 401 || error.status === 403) {
    return '登录状态失效，请重新登录'
  }

  if (error.status === 400 || error.status === 422) {
    return '请求参数有误'
  }

  if (error.status === 404) {
    return '请求资源不存在'
  }

  if (error.status === 408 || error.status === 429 || error.status >= 500) {
    return '服务暂时不可用，请稍后重试'
  }

  return fallback
}

function extractMessageFromBody(body?: string): string | null {
  const trimmed = nonEmpty(body)
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!isRecord(parsed)) {
      return trimmed
    }

    const candidate = parsed.message
    if (typeof candidate === 'string' && nonEmpty(candidate)) {
      return candidate
    }

    return trimmed
  } catch {
    return trimmed
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function nonEmpty(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isRetryableStatus(status?: number): boolean {
  if (typeof status !== 'number') {
    return false
  }

  return status === 408 || status === 425 || status === 429 || status >= 500
}
