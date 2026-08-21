import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';

@Module({
  imports: [AuditLogModule, AuthModule, PrismaModule, StorageModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
