import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module';
import { AiChatbotModule } from './ai-chatbot/ai-chatbot.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { CommunityModule } from './community/community.module';
import { validateEnvironment } from './config/env.validation';
import { ContentExtractionModule } from './content-extraction/content-extraction.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DocumentContentModule } from './document-content/document-content.module';
import { DocumentsModule } from './documents/documents.module';
import { DownloadLogModule } from './download-log/download-log.module';
import { FirebaseModule } from './firebase/firebase.module';
import { HealthModule } from './health/health.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { SavedDocumentsModule } from './saved-documents/saved-documents.module';
import { SearchModule } from './search/search.module';
import { StorageModule } from './storage/storage.module';
import { SubjectsModule } from './subjects/subjects.module';
import { TagsModule } from './tags/tags.module';
import { UsersModule } from './users/users.module';

const scheduleModuleFactory = ScheduleModule as unknown as {
  forRoot(): DynamicModule;
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env'
          : ['.env', '.env.example'],
      validate: validateEnvironment,
    }),
    scheduleModuleFactory.forRoot(),
    PrismaModule,
    FirebaseModule,
    AuthModule,
    HealthModule,
    UsersModule,
    RolesModule,
    SubjectsModule,
    CategoriesModule,
    TagsModule,
    DocumentsModule,
    ContentExtractionModule,
    DocumentContentModule,
    SearchModule,
    ChatbotModule,
    AiChatbotModule,
    CommunityModule,
    SavedDocumentsModule,
    AdminModule,
    DashboardModule,
    AuditLogModule,
    DownloadLogModule,
    ReportsModule,
    PaymentsModule,
    StorageModule,
  ],
})
export class AppModule {}
