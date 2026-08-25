import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SavedDocumentsController } from './saved-documents.controller';
import { SavedDocumentsService } from './saved-documents.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SavedDocumentsController],
  providers: [SavedDocumentsService],
})
export class SavedDocumentsModule {}
