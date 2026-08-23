import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminDocumentsController } from './admin-documents.controller';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    StorageModule,
    NotificationsModule,
    DocumentsModule,
  ],
  controllers: [AdminUsersController, AdminDocumentsController],
  providers: [AdminUsersService],
})
export class AdminModule {}
