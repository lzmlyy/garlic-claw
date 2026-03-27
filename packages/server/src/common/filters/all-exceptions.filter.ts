import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * 判断异常响应体是否携带 message 字段。
 * @param value 异常响应对象
 * @returns 是否包含 message 字段
 */
function hasExceptionMessage(
  value: object,
): value is { message?: string | object } {
  return 'message' in value;
}

/**
 * 从异常响应对象中提取 message。
 * @param value 异常响应对象
 * @returns 可返回给客户端的 message
 */
function readExceptionMessage(value: object): string | object {
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
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : readExceptionMessage(res);
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error('Unknown exception', String(exception));
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
