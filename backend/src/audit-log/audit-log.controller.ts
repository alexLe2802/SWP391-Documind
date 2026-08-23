import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLogService, AuditLogResponse } from './audit-log.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '../generated/prisma/client';

@ApiTags('admin-audit-logs')
@ApiBearerAuth()
@Controller('admin/logs/audit')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class AuditLogController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly auditLogService: AuditLogService) {}

  // Lấy danh sách dữ liệu phù hợp.
  @Get()
  @ApiOperation({ summary: 'List admin audit logs' })
  async findAll(@Query() query: AuditLogQueryDto): Promise<AuditLogResponse> {
    return this.auditLogService.findAll(query);
  }
}
