import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminDocumentsController } from './admin-documents.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AdminDocumentsController],
})
export class AdminDocumentsModule {}
