import { INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';
import { ApiResponseInterceptor } from './api-response.interceptor';
import { requestIdMiddleware } from './request-id.middleware';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

// Thực hiện chức năng configure api contract.
export function configureApiContract(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.useGlobalInterceptors(
    new RequestLoggingInterceptor(),
    new ApiResponseInterceptor(),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
