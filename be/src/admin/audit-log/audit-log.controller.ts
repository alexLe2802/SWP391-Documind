import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { RoleName } from '../../generated/prisma/client';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogResponse, AuditLogService } from './audit-log.service';

@ApiTags('admin-audit-logs')
@ApiBearerAuth()
@Controller('admin/logs/audit')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'Query admin audit logs' })
  findAll(@Query() query: AuditLogQueryDto): Promise<AuditLogResponse> {
    return this.auditLogService.findAll(query);
  }
}
