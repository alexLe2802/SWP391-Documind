import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiChatbotModule } from '../ai-chatbot/ai-chatbot.module';
import { DocumentContentController } from '../document-content/document-content.controller';
import { DocumentContentModule } from '../document-content/document-content.module';
import { StorageModule } from '../storage/storage.module';
import { ContentExtractionController } from './content-extraction.controller';
import { ContentExtractionService } from './content-extraction.service';
import { ExtractionFileValidationPipe } from './extraction-file-validation.pipe';
import { DocxExtractorService } from './services/docx-extractor.service';
import { PdfExtractorService } from './services/pdf-extractor.service';
import { LegacyOfficeExtractorService } from './services/legacy-office-extractor.service';
import { PptxExtractorService } from './services/pptx-extractor.service';
import { XlsxExtractorService } from './services/xlsx-extractor.service';
import { ModerationScannerService } from './moderation-scanner.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    DocumentContentModule,
    StorageModule,
    AiChatbotModule,
    NotificationsModule,
  ],
  controllers: [ContentExtractionController, DocumentContentController],
  providers: [
    ContentExtractionService,
    ExtractionFileValidationPipe,
    PdfExtractorService,
    LegacyOfficeExtractorService,
    DocxExtractorService,
    PptxExtractorService,
    XlsxExtractorService,
    ModerationScannerService,
  ],
  exports: [ContentExtractionService, ModerationScannerService],
})
export class ContentExtractionModule {}
