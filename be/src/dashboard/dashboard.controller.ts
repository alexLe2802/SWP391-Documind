import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '../generated/prisma/client';
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
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly dashboardService: DashboardService) {}

  // Lấy dữ liệu summary.
  @Get('summary')
  @ApiOperation({ summary: 'Get admin dashboard summary totals' })
  async getSummary(): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary();
  }

  // Lấy dữ liệu người dùng stats.
  @Get('user-stats')
  @ApiOperation({ summary: 'Get admin user statistics by role and status' })
  async getUserStats(): Promise<UserStatsResponse> {
    return this.dashboardService.getUserStats();
  }

  // Lấy dữ liệu tài liệu stats.
  @Get('document-stats')
  @ApiOperation({
    summary: 'Get admin document statistics by status and visibility',
  })
  async getDocumentStats(): Promise<DocumentStatsResponse> {
    return this.dashboardService.getDocumentStats();
  }

  // Lấy dữ liệu statistics.
  @Get('statistics')
  @ApiOperation({ summary: 'Get combined admin dashboard statistics' })
  async getStatistics(): Promise<DashboardStatisticsResponse> {
    return this.dashboardService.getStatistics();
  }

  // Lấy dữ liệu tài liệu by môn học.
  @Get('documents-by-subject')
  @ApiOperation({ summary: 'Get active document counts by subject' })
  async getDocumentsBySubject(
    @Query() query: DocumentsBySubjectQueryDto,
  ): Promise<DocumentsBySubjectResponse> {
    return this.dashboardService.getDocumentsBySubject(query);
  }

  // Lấy dữ liệu tài liệu by danh mục.
  @Get('documents-by-category')
  @ApiOperation({ summary: 'Get active document counts by category' })
  async getDocumentsByCategory(
    @Query() query: DocumentsByCategoryQueryDto,
  ): Promise<DocumentsByCategoryResponse> {
    return this.dashboardService.getDocumentsByCategory(query);
  }

  // Lấy dữ liệu tải lên statistics.
  @Get('upload-statistics')
  @ApiOperation({ summary: 'Get active document upload statistics' })
  async getUploadStatistics(
    @Query() query: UploadStatisticsQueryDto,
  ): Promise<UploadStatisticsResponse> {
    return await this.dashboardService.getUploadStatistics(query);
  }

  // Lấy dữ liệu chatbot stats.
  @Get('chatbot-stats')
  @ApiOperation({
    summary: 'Get chatbot analytics and performance statistics',
  })
  async getChatbotStats(): Promise<ChatbotStatsResponseDto> {
    return await this.dashboardService.getChatbotStats();
  }
}
