import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ExtractionQueueService } from '../document-content/extraction-queue.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly extractionQueue: ExtractionQueueService,
  ) {}

  // Thực hiện chức năng liveness.
  liveness(): { status: 'ok'; timestamp: string; uptimeSeconds: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  // Lấy dữ liệu readiness.
  async readiness(): Promise<{
    status: 'ok';
    timestamp: string;
    checks: {
      database: 'up';
      extractionQueue: ReturnType<ExtractionQueueService['getSnapshot']>;
    };
  }> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'up',
          extractionQueue: this.extractionQueue.getSnapshot(),
        },
      };
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'health.readiness_failed',
          severity: 'critical',
          database: 'down',
          timestamp: new Date().toISOString(),
        }),
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: 'down' },
      });
    }
  }
}
