import { Module } from '@nestjs/common';
import { AuditLogModule } from './audit-log/audit-log.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminDocumentsModule } from './documents/admin-documents.module';
import { AdminUsersModule } from './users/admin-users.module';

@Module({
  imports: [DashboardModule, AdminUsersModule, AdminDocumentsModule, AuditLogModule],
})
export class AdminModule {}
