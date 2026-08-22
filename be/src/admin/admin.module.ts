import { Module } from '@nestjs/common';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminDocumentsModule } from './documents/admin-documents.module';

@Module({
  imports: [DashboardModule, AdminUsersModule, AdminDocumentsModule],
})
export class AdminModule {}
