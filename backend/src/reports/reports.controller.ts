import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UploadStatisticsQueryDto } from '../dashboard/dto/upload-statistics-query.dto';
import { RoleName } from '../generated/prisma/client';
import { PopularDocumentsQueryDto } from './dto/popular-documents-query.dto';
import {
  MostDownloadedReportResponse,
  MostSavedReportResponse,
  ReportsService,
} from './reports.service';

@ApiTags('admin-reports')
@ApiBearerAuth()
@Controller('admin/reports')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class ReportsController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly reportsService: ReportsService) {}

  // Lấy dữ liệu tải lên statistics.
  @Get('upload-statistics')
  @ApiOperation({ summary: 'Get active document upload statistics report' })
  getUploadStatistics(
    @Query() query: UploadStatisticsQueryDto,
  ): ReturnType<ReportsService['getUploadStatistics']> {
    return this.reportsService.getUploadStatistics(query);
  }

  // Lấy dữ liệu most downloaded.
  @Get('most-downloaded')
  @ApiOperation({ summary: 'Get most downloaded documents report' })
  getMostDownloaded(
    @Query() query: PopularDocumentsQueryDto,
  ): Promise<MostDownloadedReportResponse> {
    return this.reportsService.getMostDownloaded(query);
  }

  // Lấy dữ liệu most đã lưu.
  @Get('most-saved')
  @ApiOperation({ summary: 'Get most saved documents report' })
  getMostSaved(
    @Query() query: PopularDocumentsQueryDto,
  ): Promise<MostSavedReportResponse> {
    return this.reportsService.getMostSaved(query);
  }
}
