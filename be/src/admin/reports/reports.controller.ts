import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { RoleName } from '../../generated/prisma/client';
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
  constructor(private readonly reportsService: ReportsService) {}

  @Get('most-downloaded')
  @ApiOperation({ summary: 'Get most downloaded documents report' })
  getMostDownloaded(
    @Query() query: PopularDocumentsQueryDto,
  ): Promise<MostDownloadedReportResponse> {
    return this.reportsService.getMostDownloaded(query);
  }

  @Get('most-saved')
  @ApiOperation({ summary: 'Get most saved documents report' })
  getMostSaved(
    @Query() query: PopularDocumentsQueryDto,
  ): Promise<MostSavedReportResponse> {
    return this.reportsService.getMostSaved(query);
  }
}
