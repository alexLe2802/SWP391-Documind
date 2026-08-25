import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

interface RequestWithId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  // Thực hiện chức năng intercept.
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, response, startedAt),
        error: (error: unknown) =>
          this.log(request, response, startedAt, error),
      }),
    );
  }

  // Thực hiện chức năng log.
  private log(
    request: RequestWithId,
    response: Response,
    startedAt: number,
    error?: unknown,
  ): void {
    const statusCode =
      error && typeof error === 'object' && 'status' in error
        ? Number(error.status)
        : response.statusCode;
    const entry = JSON.stringify({
      event: 'http.request_completed',
      severity: statusCode >= 500 ? 'error' : 'info',
      requestId: request.requestId ?? 'unknown',
      method: request.method,
      path: request.originalUrl,
      statusCode,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
    if (statusCode >= 500) this.logger.error(entry);
    else this.logger.log(entry);
  }
}
