import { HttpStatus } from '@nestjs/common';

const STANDARD_API_RESPONSE = Symbol('STANDARD_API_RESPONSE');

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  readonly [STANDARD_API_RESPONSE]?: true;
}

/**
 * 构建统一响应结构。
 * @param code 业务错误码（成功固定 0）
 * @param message 文本消息
 * @param data 响应数据
 * @returns 标准响应对象
 */
export function createApiResponse<T>(
  code: number,
  message: string,
  data: T,
): ApiResponse<T> {
  return markStandardResponse({
    code,
    message,
    data,
  });
}

/**
 * 构建成功响应结构。
 * @param data 响应数据
 * @param message 文本消息（默认空字符串）
 * @returns 标准成功响应
 */
export function createSuccessResponse<T>(
  data: T,
  message = '',
): ApiResponse<T> {
  return createApiResponse(0, message, data);
}

/**
 * 构建错误响应结构。
 * @param code 业务错误码（通常与 HTTP 状态码一致）
 * @param message 文本消息
 * @returns 标准错误响应
 */
export function createErrorResponse(
  code: number,
  message: string,
): ApiResponse<null> {
  return createApiResponse(code, message, null);
}

/**
 * 判断对象是否已被统一响应系统标记。
 * 这里不再只依赖对象字段形状，避免误判普通业务对象。
 * @param value 任意响应值
 * @returns 是否为标准响应
 */
export function isStandardResponse(value: unknown): value is ApiResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[STANDARD_API_RESPONSE] === true
  );
}

/**
 * @deprecated 请改用 isStandardResponse。
 */
export const isApiResponse = isStandardResponse;

/**
 * 将异常 message 统一收敛为字符串。
 * @param value 任意 message
 * @param fallback 兜底文案
 * @returns 可序列化字符串
 */
export function toMessageString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);

    if (normalized.length > 0) {
      return normalized.join('; ');
    }
  }

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

/**
 * 成功响应统一使用空 message，避免接口语义漂移。
 */
export function resolveSuccessMessage(): string {
  return '';
}

/**
 * 按 HTTP 状态码推断默认错误消息。
 */
export function resolveDefaultErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return 'Bad Request';
    case HttpStatus.UNAUTHORIZED:
      return 'Unauthorized';
    case HttpStatus.FORBIDDEN:
      return 'Forbidden';
    case HttpStatus.NOT_FOUND:
      return 'Not Found';
    case HttpStatus.CONFLICT:
      return 'Conflict';
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'Unprocessable Entity';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'Too Many Requests';
    case HttpStatus.INTERNAL_SERVER_ERROR:
      return 'Internal server error';
    default:
      if (statusCode >= 500) {
        return 'Internal server error';
      }
      return 'Request failed';
  }
}

function markStandardResponse<T>(response: ApiResponse<T>): ApiResponse<T> {
  Object.defineProperty(response, STANDARD_API_RESPONSE, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return response;
}
