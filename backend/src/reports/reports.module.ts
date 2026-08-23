import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DownloadLogModule } from '../download-log/download-log.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, DashboardModule, DownloadLogModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
