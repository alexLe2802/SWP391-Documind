import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RoleName } from '../../generated/prisma/client';
import {
  DashboardService,
  DashboardSummaryResponse,
  DocumentsBySubjectResponse,
  UploadStatisticsResponse,
  UserStatsResponse,
  DocumentStatsResponse,
  DocumentsByCategoryResponse,
  DashboardStatisticsResponse,
} from './dashboard.service';
import { DocumentsBySubjectQueryDto } from './dto/documents-by-subject-query.dto';
import { DocumentsByCategoryQueryDto } from './dto/documents-by-category-query.dto';
import { UploadStatisticsQueryDto } from './dto/upload-statistics-query.dto';
import { ChatbotStatsResponseDto } from './dto/chatbot-stats-response.dto';

@ApiTags('admin-dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get admin dashboard summary totals' })
  async getSummary(): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary();
  }

  @Get('user-stats')
  @ApiOperation({ summary: 'Get admin user statistics by role and status' })
  async getUserStats(): Promise<UserStatsResponse> {
    return this.dashboardService.getUserStats();
  }

  @Get('document-stats')
  @ApiOperation({
    summary: 'Get admin document statistics by status and visibility',
  })
  async getDocumentStats(): Promise<DocumentStatsResponse> {
    return this.dashboardService.getDocumentStats();
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get combined admin dashboard statistics' })
  async getStatistics(): Promise<DashboardStatisticsResponse> {
    return this.dashboardService.getStatistics();
  }

  @Get('documents-by-subject')
  @ApiOperation({ summary: 'Get active document counts by subject' })
  async getDocumentsBySubject(
    @Query() query: DocumentsBySubjectQueryDto,
  ): Promise<DocumentsBySubjectResponse> {
    return this.dashboardService.getDocumentsBySubject(query);
  }

  @Get('documents-by-category')
  @ApiOperation({ summary: 'Get active document counts by category' })
  async getDocumentsByCategory(
    @Query() query: DocumentsByCategoryQueryDto,
  ): Promise<DocumentsByCategoryResponse> {
    return this.dashboardService.getDocumentsByCategory(query);
  }

  @Get('upload-statistics')
  @ApiOperation({ summary: 'Get active document upload statistics' })
  async getUploadStatistics(
    @Query() query: UploadStatisticsQueryDto,
  ): Promise<UploadStatisticsResponse> {
    return await this.dashboardService.getUploadStatistics(query);
  }

  @Get('chatbot-stats')
  @ApiOperation({
    summary: 'Get chatbot analytics and performance statistics',
  })
  async getChatbotStats(): Promise<ChatbotStatsResponseDto> {
    return await this.dashboardService.getChatbotStats();
  }
}
