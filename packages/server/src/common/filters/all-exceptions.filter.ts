import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  createErrorResponse,
  isStandardResponse,
  resolveDefaultErrorMessage,
  toMessageString,
} from '../http/api-response';

/**
 * 判断异常响应体是否携带 message 字段。
 * @param value 异常响应对象
 * @returns 是否包含 message 字段
 */
function hasExceptionMessage(
  value: object,
): value is { message?: unknown } {
  return 'message' in value;
}

/**
 * 从异常响应对象中提取 message。
 * @param value 异常响应对象
 * @returns 可返回给客户端的 message
 */
function readExceptionMessage(value: object): unknown {
  if (!hasExceptionMessage(value) || value.message === undefined) {
    return value;
  }

  return value.message;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (isStandardResponse(res)) {
        message = res.message;
      } else if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        message = readExceptionMessage(res);
      } else {
        message = res;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = exception.message;
    } else {
      this.logger.error('Unknown exception', String(exception));
      message = String(exception);
    }

    response.status(status).json(
      createErrorResponse(
        status,
        toMessageString(message, resolveDefaultErrorMessage(status)),
      ),
    );
  }
}
