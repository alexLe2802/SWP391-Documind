import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
