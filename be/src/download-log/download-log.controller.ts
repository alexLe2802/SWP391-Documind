import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleName } from '../generated/prisma/client';
import {
  DownloadLogService,
  DownloadLogResponse,
} from './download-log.service';
import { DownloadLogQueryDto } from './dto/download-log-query.dto';

@ApiTags('admin-download-logs')
@ApiBearerAuth()
@Controller('admin/logs/downloads')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class DownloadLogController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly downloadLogService: DownloadLogService) {}

  // Lấy danh sách dữ liệu phù hợp.
  @Get()
  @ApiOperation({ summary: 'List admin download logs' })
  findAll(@Query() query: DownloadLogQueryDto): Promise<DownloadLogResponse> {
    return this.downloadLogService.findAll(query);
  }
}
