import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DashboardService,
  UploadStatisticsResponse,
} from '../dashboard/dashboard.service';
import { UploadStatisticsQueryDto } from '../dashboard/dto/upload-statistics-query.dto';
import {
  DownloadLogService,
  MostDownloadedDocument,
} from '../download-log/download-log.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PopularDocumentsQueryDto } from './dto/popular-documents-query.dto';

export interface MostDownloadedReportResponse {
  filters: PopularDocumentsQueryDto;
  data: MostDownloadedDocument[];
  message: string;
}

export interface MostSavedDocument {
  documentId: string;
  title: string;
  fileName: string;
  fileType: string;
  saveCount: number;
}

export interface MostSavedReportResponse {
  filters: PopularDocumentsQueryDto;
  data: MostSavedDocument[];
  message: string;
}

type PopularDocumentRow = {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
};

@Injectable()
export class ReportsService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly downloadLogService: DownloadLogService,
    private readonly prisma: PrismaService,
  ) {}

  // Lấy dữ liệu tải lên statistics.
  getUploadStatistics(
    query: UploadStatisticsQueryDto,
  ): Promise<UploadStatisticsResponse> {
    return this.dashboardService.getUploadStatistics(query);
  }

  // Lấy dữ liệu most downloaded.
  async getMostDownloaded(
    query: PopularDocumentsQueryDto,
  ): Promise<MostDownloadedReportResponse> {
    const data = await this.downloadLogService.getMostDownloaded(query);

    return {
      filters: query,
      data,
      message: 'Most downloaded documents retrieved successfully',
    };
  }

  // Lấy dữ liệu most đã lưu.
  async getMostSaved(
    query: PopularDocumentsQueryDto,
  ): Promise<MostSavedReportResponse> {
    const limit = query.limit ?? 10;
    const where = this.buildSavedDateWhere(query);
    const grouped = await this.prisma.savedDocument.groupBy({
      by: ['documentId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { documentId: 'desc' } },
      take: limit,
    });
    const documentIds = grouped.map((item) => item.documentId);

    if (!documentIds.length) {
      return {
        filters: query,
        data: [],
        message: 'Most saved documents retrieved successfully',
      };
    }

    const documents = (await this.prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: {
        id: true,
        title: true,
        fileName: true,
        fileType: true,
      },
    })) as PopularDocumentRow[];
    const documentsById = new Map(
      documents.map((document) => [document.id, document]),
    );

    return {
      filters: query,
      data: grouped
        .map((item) => {
          const document = documentsById.get(item.documentId);

          if (!document) {
            return undefined;
          }

          return {
            documentId: item.documentId,
            title: document.title,
            fileName: document.fileName,
            fileType: document.fileType,
            saveCount: item._count._all,
          };
        })
        .filter((item): item is MostSavedDocument => item !== undefined),
      message: 'Most saved documents retrieved successfully',
    };
  }

  // Chuyển đổi hoặc chuẩn hóa đã lưu date where.
  private buildSavedDateWhere(
    query: PopularDocumentsQueryDto,
  ): Prisma.SavedDocumentWhereInput {
    if (
      query.fromDate &&
      query.toDate &&
      new Date(query.fromDate) > new Date(query.toDate)
    ) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'fromDate cannot be after toDate',
      });
    }

    const where: Prisma.SavedDocumentWhereInput = {};

    if (!query.fromDate && !query.toDate) {
      return where;
    }

    where.savedAt = {};

    if (query.fromDate) {
      where.savedAt.gte = new Date(query.fromDate);
    }

    if (query.toDate) {
      where.savedAt.lte = new Date(query.toDate);
    }

    return where;
  }
}
