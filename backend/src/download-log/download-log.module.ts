import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DownloadLogController } from './download-log.controller';
import { DownloadLogService } from './download-log.service';

@Module({
  imports: [AuthModule],
  controllers: [DownloadLogController],
  providers: [DownloadLogService],
  exports: [DownloadLogService],
})
export class DownloadLogModule {}
