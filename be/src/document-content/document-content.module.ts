import { Module } from '@nestjs/common';
import { DocumentContentService } from './document-content.service';
import { ExtractionQueueService } from './extraction-queue.service';

@Module({
  providers: [DocumentContentService, ExtractionQueueService],
  exports: [DocumentContentService, ExtractionQueueService],
})
export class DocumentContentModule {}
