import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PopularDocumentsQueryDto } from './dto/popular-documents-query.dto';

export interface MostDownloadedDocument {
  documentId: string;
  title: string;
  fileName: string;
  fileType: string;
  downloadCount: number;
}

export interface MostSavedDocument {
  documentId: string;
  title: string;
  fileName: string;
  fileType: string;
  saveCount: number;
}

export interface MostDownloadedReportResponse {
  filters: PopularDocumentsQueryDto;
  data: MostDownloadedDocument[];
  message: string;
}

export interface MostSavedReportResponse {
  filters: PopularDocumentsQueryDto;
  data: MostSavedDocument[];
  message: string;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMostDownloaded(
    query: PopularDocumentsQueryDto,
  ): Promise<MostDownloadedReportResponse> {
    const limit = query.limit ?? 10;
    const where = this.buildDateWhere('downloadedAt', query);

    const grouped = await this.prisma.downloadLog.groupBy({
      by: ['documentId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { documentId: 'desc' } },
      take: limit,
    });

    const documentIds = grouped.map((item) => item.documentId);
    if (!documentIds.length) {
      return { filters: query, data: [], message: 'Most downloaded documents retrieved successfully' };
    }

    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, title: true, fileName: true, fileType: true },
    });
    const byId = new Map(documents.map((d) => [d.id, d]));

    return {
      filters: query,
      data: grouped
        .map((item) => {
          const doc = byId.get(item.documentId);
          if (!doc) return undefined;
          return {
            documentId: item.documentId,
            title: doc.title,
            fileName: doc.fileName,
            fileType: doc.fileType,
            downloadCount: item._count._all,
          };
        })
        .filter((item): item is MostDownloadedDocument => item !== undefined),
      message: 'Most downloaded documents retrieved successfully',
    };
  }

  async getMostSaved(
    query: PopularDocumentsQueryDto,
  ): Promise<MostSavedReportResponse> {
    const limit = query.limit ?? 10;
    const where = this.buildDateWhere('savedAt', query);

    const grouped = await this.prisma.savedDocument.groupBy({
      by: ['documentId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { documentId: 'desc' } },
      take: limit,
    });

    const documentIds = grouped.map((item) => item.documentId);
    if (!documentIds.length) {
      return { filters: query, data: [], message: 'Most saved documents retrieved successfully' };
    }

    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, title: true, fileName: true, fileType: true },
    });
    const byId = new Map(documents.map((d) => [d.id, d]));

    return {
      filters: query,
      data: grouped
        .map((item) => {
          const doc = byId.get(item.documentId);
          if (!doc) return undefined;
          return {
            documentId: item.documentId,
            title: doc.title,
            fileName: doc.fileName,
            fileType: doc.fileType,
            saveCount: item._count._all,
          };
        })
        .filter((item): item is MostSavedDocument => item !== undefined),
      message: 'Most saved documents retrieved successfully',
    };
  }

  private buildDateWhere(
    field: string,
    query: PopularDocumentsQueryDto,
  ): Record<string, unknown> {
    if (
      query.fromDate &&
      query.toDate &&
      new Date(query.fromDate) > new Date(query.toDate)
    ) {
      throw new BadRequestException('fromDate cannot be after toDate');
    }

    const where: Record<string, unknown> = {};
    if (query.fromDate || query.toDate) {
      const dateFilter: Record<string, Date> = {};
      if (query.fromDate) dateFilter['gte'] = new Date(query.fromDate);
      if (query.toDate) dateFilter['lte'] = new Date(query.toDate);
      where[field] = dateFilter;
    }
    return where;
  }
}
