import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentContentModule } from '../document-content/document-content.module';
import { ContentExtractionModule } from '../content-extraction/content-extraction.module';
import { DownloadLogModule } from '../download-log/download-log.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    StorageModule,
    DocumentContentModule,
    ContentExtractionModule,
    DownloadLogModule,
    AuditLogModule,
    NotificationsModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
