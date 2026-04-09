import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import {
  createErrorResponse,
  createSuccessResponse,
  isStandardResponse,
  resolveDefaultErrorMessage,
  resolveSuccessMessage,
  toMessageString,
  type ApiResponse,
} from '../http/api-response';

/**
 * 全局响应包装拦截器。
 * 将 HTTP controller 返回值统一包裹为 { code, message, data }。
 */
@Injectable()
export class GlobalResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<unknown> | T> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<unknown> | T> {
    if (context.getType<'http' | 'rpc' | 'ws'>() !== 'http') {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((payload) => {
        if (
          isRawHttpPayload(payload) ||
          isSseResponse(response) ||
          isStandardResponse(payload)
        ) {
          return payload;
        }

        const statusCode = response.statusCode;

        if (statusCode >= HttpStatus.BAD_REQUEST) {
          return createErrorResponse(
            statusCode,
            resolveErrorMessage(payload, statusCode),
          );
        }

        return createSuccessResponse(payload ?? null, resolveSuccessMessage());
      }),
    );
  }
}

function isRawHttpPayload(payload: unknown): boolean {
  return payload instanceof StreamableFile || Buffer.isBuffer(payload);
}

function isSseResponse(response: Response): boolean {
  const contentType = response.getHeader('Content-Type');
  if (typeof contentType === 'string') {
    return contentType.includes('text/event-stream');
  }

  if (Array.isArray(contentType)) {
    return contentType.some((value) => value.includes('text/event-stream'));
  }

  return false;
}

function resolveErrorMessage(payload: unknown, statusCode: number): string {
  const fallback = resolveDefaultErrorMessage(statusCode);
  if (typeof payload === 'string') {
    return toMessageString(payload, fallback);
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload
  ) {
    return toMessageString((payload as { message?: unknown }).message, fallback);
  }

  return fallback;
}
