import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PopularDocumentsQueryDto } from './dto/popular-documents-query.dto';

export interface MostDownloadedDoc { documentId: string; title: string; fileName: string; fileType: string; downloadCount: number; }
export interface MostSavedDoc { documentId: string; title: string; fileName: string; fileType: string; saveCount: number; }
export interface MostDownloadedReportResponse { filters: PopularDocumentsQueryDto; data: MostDownloadedDoc[]; message: string; }
export interface MostSavedReportResponse { filters: PopularDocumentsQueryDto; data: MostSavedDoc[]; message: string; }

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMostDownloaded(query: PopularDocumentsQueryDto): Promise<MostDownloadedReportResponse> {
    this.validateDateRange(query);
    const limit = query.limit ?? 10;
    const where = this.buildDateWhere('downloadedAt', query);
    const grouped = await this.prisma.downloadLog.groupBy({ by: ['documentId'], where, _count: { _all: true }, orderBy: { _count: { documentId: 'desc' } }, take: limit });
    if (!grouped.length) return { filters: query, data: [], message: 'Most downloaded documents retrieved successfully' };
    const docs = await this.prisma.document.findMany({ where: { id: { in: grouped.map(g => g.documentId) } }, select: { id: true, title: true, fileName: true, fileType: true } });
    const byId = new Map(docs.map(d => [d.id, d]));
    return { filters: query, data: grouped.map(g => { const d = byId.get(g.documentId); if (!d) return undefined; return { documentId: g.documentId, title: d.title, fileName: d.fileName, fileType: d.fileType, downloadCount: g._count._all }; }).filter((x): x is MostDownloadedDoc => x !== undefined), message: 'Most downloaded documents retrieved successfully' };
  }

  async getMostSaved(query: PopularDocumentsQueryDto): Promise<MostSavedReportResponse> {
    this.validateDateRange(query);
    const limit = query.limit ?? 10;
    const where = this.buildDateWhere('savedAt', query);
    const grouped = await this.prisma.savedDocument.groupBy({ by: ['documentId'], where, _count: { _all: true }, orderBy: { _count: { documentId: 'desc' } }, take: limit });
    if (!grouped.length) return { filters: query, data: [], message: 'Most saved documents retrieved successfully' };
    const docs = await this.prisma.document.findMany({ where: { id: { in: grouped.map(g => g.documentId) } }, select: { id: true, title: true, fileName: true, fileType: true } });
    const byId = new Map(docs.map(d => [d.id, d]));
    return { filters: query, data: grouped.map(g => { const d = byId.get(g.documentId); if (!d) return undefined; return { documentId: g.documentId, title: d.title, fileName: d.fileName, fileType: d.fileType, saveCount: g._count._all }; }).filter((x): x is MostSavedDoc => x !== undefined), message: 'Most saved documents retrieved successfully' };
  }

  private validateDateRange(query: PopularDocumentsQueryDto) {
    if (query.fromDate && query.toDate && new Date(query.fromDate) > new Date(query.toDate)) throw new BadRequestException('fromDate cannot be after toDate');
  }

  private buildDateWhere(field: string, query: PopularDocumentsQueryDto): Record<string, unknown> {
    if (!query.fromDate && !query.toDate) return {};
    const filter: Record<string, Date> = {};
    if (query.fromDate) filter['gte'] = new Date(query.fromDate);
    if (query.toDate) filter['lte'] = new Date(query.toDate);
    return { [field]: filter };
  }
}
