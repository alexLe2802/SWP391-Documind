import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorEnvelope } from './api-contract.types';

interface ErrorPayload {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

interface RequestWithId extends Request {
  requestId?: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  // Thực hiện chức năng catch.
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = this.getPayload(exception);
    const requestId = request.requestId ?? 'unknown';

    if (status >= 500) {
      const message =
        exception instanceof Error ? exception.message : String(exception);
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        JSON.stringify({
          event: 'http.unhandled_error',
          severity: 'error',
          requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: status,
          message,
          timestamp: new Date().toISOString(),
        }),
        stack,
      );
    }

    const body: ApiErrorEnvelope = {
      success: false,
      error: {
        code: payload.code ?? this.defaultCode(status),
        message: this.message(payload.message, status),
        ...(payload.details !== undefined
          ? { details: payload.details }
          : this.validationDetails(payload.message)),
      },
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
      requestId,
    };

    response.setHeader('x-request-id', requestId);
    response.status(status).json(body);
  }

  // Lấy dữ liệu payload.
  private getPayload(exception: unknown): ErrorPayload {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    return typeof response === 'string' ? { message: response } : response;
  }

  // Thực hiện chức năng tin nhắn.
  private message(
    message: string | string[] | undefined,
    status: number,
  ): string {
    if (Array.isArray(message)) {
      return 'Validation failed';
    }
    if (message) {
      return message;
    }
    return status === 500
      ? 'Internal server error'
      : HttpStatus[status].replaceAll('_', ' ').toLowerCase();
  }

  // Thực hiện chức năng validation details.
  private validationDetails(message: string | string[] | undefined): {
    details?: { message: string }[];
  } {
    return Array.isArray(message)
      ? { details: message.map((item) => ({ message: item })) }
      : {};
  }

  // Thực hiện chức năng default code.
  private defaultCode(status: number): string {
    return HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR';
  }
}
