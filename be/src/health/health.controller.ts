import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly healthService: HealthService) {}

  // Kiểm tra điều kiện check.
  @Get()
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  check(): ReturnType<HealthService['liveness']> {
    return this.healthService.liveness();
  }

  // Thực hiện chức năng liveness.
  @Get('live')
  liveness(): ReturnType<HealthService['liveness']> {
    return this.healthService.liveness();
  }

  // Lấy dữ liệu readiness.
  @Get('ready')
  readiness(): ReturnType<HealthService['readiness']> {
    return this.healthService.readiness();
  }
}
