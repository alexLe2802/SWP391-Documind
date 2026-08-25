import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DocumentContentModule } from '../document-content/document-content.module';
import { HealthService } from './health.service';

@Module({
  imports: [DocumentContentModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
