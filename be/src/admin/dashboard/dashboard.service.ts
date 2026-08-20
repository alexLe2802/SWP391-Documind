import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DocumentStatus,
  DocumentVisibility,
  RoleName,
  UserStatus,
  Prisma,
} from '../../generated/prisma/client';
import { DocumentsBySubjectQueryDto } from './dto/documents-by-subject-query.dto';
import { DocumentsByCategoryQueryDto } from './dto/documents-by-category-query.dto';
import { UploadStatisticsQueryDto } from './dto/upload-statistics-query.dto';
import { ChatbotStatsResponseDto } from './dto/chatbot-stats-response.dto';

export interface DashboardSummaryResponse {
  totalUsers: number;
  totalDocuments: number;
  totalPublicDocuments: number;
  totalPrivateDocuments: number;
  totalChats: number;
  totalDownloads: number;
  message: string;
}

export interface UserStatsResponse {
  byRole: { role: RoleName; count: number }[];
  byStatus: { status: UserStatus; count: number }[];
  message: string;
}

export interface DocumentStatsResponse {
  byStatus: { status: DocumentStatus; count: number }[];
  byVisibility: { visibility: DocumentVisibility; count: number }[];
  message: string;
}

export interface DashboardStatisticsResponse {
  users: {
    byRole: UserStatsResponse['byRole'];
    byStatus: UserStatsResponse['byStatus'];
  };
  documents: {
    byStatus: DocumentStatsResponse['byStatus'];
    byVisibility: DocumentStatsResponse['byVisibility'];
    bySubject: DocumentsBySubjectResponse['data'];
    byCategory: DocumentsByCategoryResponse['data'];
  };
  message: string;
}

export interface DocumentsBySubjectResponse {
  filters: DocumentsBySubjectQueryDto;
  data: { id: string; code: string; name: string; count: number }[];
  message: string;
}

export interface DocumentsByCategoryResponse {
  filters: DocumentsByCategoryQueryDto;
  data: { id: string; name: string; count: number }[];
  message: string;
}

export interface UploadStatisticsResponse {
  filters: UploadStatisticsQueryDto;
  data: { date: string; count: number }[];
  message: string;
}

const CHATBOT_QUERY_ACTION = 'CHATBOT_QUERY';

type RoleCountRow = { name: RoleName; _count: { users: number } };
type UserStatusCountRow = { status: UserStatus; _count: { _all: number } };
type DocumentStatusCountRow = { status: DocumentStatus; _count: { _all: number } };
type DocumentVisibilityCountRow = { visibility: DocumentVisibility; _count: { _all: number } };
type SubjectCountRow = { id: string; code: string; name: string; _count: { documents: number } };
type CategoryCountRow = { id: string; name: string; _count: { documents: number } };
type UploadStatisticsRow = { date: string; count: bigint | number | string };
type DateRangeQuery = { from?: string; to?: string };

interface ChatbotLogMetadata {
  noSource?: boolean;
  fallbackKeyword?: boolean;
  timings?: {
    embeddingMs?: number;
    searchMs?: number;
    geminiMs?: number;
    saveDbMs?: number;
    totalMs?: number;
  };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummaryResponse> {
    const [
      totalUsers,
      totalDocuments,
      totalPublicDocuments,
      totalPrivateDocuments,
      totalChats,
      totalDownloads,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.document.count({ where: { status: DocumentStatus.ACTIVE } }),
      this.prisma.document.count({
        where: { status: DocumentStatus.ACTIVE, visibility: DocumentVisibility.PUBLIC },
      }),
      this.prisma.document.count({
        where: { status: DocumentStatus.ACTIVE, visibility: DocumentVisibility.PRIVATE },
      }),
      this.prisma.chatSession.count(),
      this.prisma.downloadLog.count(),
    ]);

    return {
      totalUsers,
      totalDocuments,
      totalPublicDocuments,
      totalPrivateDocuments,
      totalChats,
      totalDownloads,
      message: 'Dashboard summary retrieved successfully',
    };
  }

  async getUserStats(): Promise<UserStatsResponse> {
    const [roles, statuses] = (await Promise.all([
      this.prisma.role.findMany({
        select: { name: true, _count: { select: { users: true } } },
      }),
      this.prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
    ])) as [RoleCountRow[], UserStatusCountRow[]];

    return {
      byRole: roles.map((r) => ({ role: r.name, count: r._count.users })),
      byStatus: statuses.map((s) => ({ status: s.status, count: s._count._all })),
      message: 'User statistics retrieved successfully',
    };
  }

  async getDocumentStats(): Promise<DocumentStatsResponse> {
    const [statuses, visibilities] = (await Promise.all([
      this.prisma.document.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.document.groupBy({ by: ['visibility'], _count: { _all: true } }),
    ])) as [DocumentStatusCountRow[], DocumentVisibilityCountRow[]];

    return {
      byStatus: statuses.map((s) => ({ status: s.status, count: s._count._all })),
      byVisibility: visibilities.map((v) => ({ visibility: v.visibility, count: v._count._all })),
      message: 'Document statistics retrieved successfully',
    };
  }

  async getStatistics(): Promise<DashboardStatisticsResponse> {
    const [userStats, documentStats, subjectStats, categoryStats] = await Promise.all([
      this.getUserStats(),
      this.getDocumentStats(),
      this.getDocumentsBySubject({}),
      this.getDocumentsByCategory({}),
    ]);

    return {
      users: { byRole: userStats.byRole, byStatus: userStats.byStatus },
      documents: {
        byStatus: documentStats.byStatus,
        byVisibility: documentStats.byVisibility,
        bySubject: subjectStats.data,
        byCategory: categoryStats.data,
      },
      message: 'Dashboard statistics retrieved successfully',
    };
  }

  async getDocumentsBySubject(query: DocumentsBySubjectQueryDto): Promise<DocumentsBySubjectResponse> {
    const documentWhere = this.buildActiveDocumentWhere(query);
    const subjects = (await this.prisma.subject.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        _count: { select: { documents: { where: documentWhere } } },
      },
    })) as SubjectCountRow[];

    return {
      filters: query,
      data: subjects.map((s) => ({ id: s.id, code: s.code, name: s.name, count: s._count.documents })),
      message: 'Documents by subject retrieved successfully',
    };
  }

  async getDocumentsByCategory(query: DocumentsByCategoryQueryDto): Promise<DocumentsByCategoryResponse> {
    const documentWhere = this.buildActiveDocumentWhere(query);
    const categories = (await this.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { documents: { where: documentWhere } } },
      },
    })) as CategoryCountRow[];

    const grouped = new Map<string, { id: string; name: string; count: number }>();
    categories.forEach((c) => {
      const key = c.name.trim().toLowerCase();
      const existing = grouped.get(key);
      if (existing) { existing.count += c._count.documents; return; }
      grouped.set(key, { id: c.id, name: c.name, count: c._count.documents });
    });

    return {
      filters: query,
      data: Array.from(grouped.values()),
      message: 'Documents by category retrieved successfully',
    };
  }

  async getChatbotStats(): Promise<ChatbotStatsResponseDto> {
    const logs = await this.prisma.auditLog.findMany({
      where: { action: CHATBOT_QUERY_ACTION },
      select: { metadata: true },
    });

    let noSourceCount = 0;
    let fallbackKeywordCount = 0;
    let sumEmbedding = 0, sumSearch = 0, sumGemini = 0, sumSaveDb = 0, sumTotal = 0;

    for (const log of logs) {
      const meta = log.metadata as unknown as ChatbotLogMetadata | null;
      if (!meta) continue;
      if (meta.noSource) noSourceCount++;
      if (meta.fallbackKeyword) fallbackKeywordCount++;
      if (meta.timings) {
        sumEmbedding += Number(meta.timings.embeddingMs ?? 0);
        sumSearch += Number(meta.timings.searchMs ?? 0);
        sumGemini += Number(meta.timings.geminiMs ?? 0);
        sumSaveDb += Number(meta.timings.saveDbMs ?? 0);
        sumTotal += Number(meta.timings.totalMs ?? 0);
      }
    }

    const totalQuestions = logs.length;
    const d = totalQuestions > 0 ? totalQuestions : 1;

    const topSources = await this.prisma.chatSource.groupBy({
      by: ['documentId'],
      _count: { documentId: true },
      orderBy: { _count: { documentId: 'desc' } },
      take: 5,
    });
    const docIds = topSources.map((s) => s.documentId);
    const documents = await this.prisma.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true, title: true },
    });
    const docMap = new Map(documents.map((d) => [d.id, d.title]));

    return {
      totalQuestions,
      avgResponseTime: {
        avgEmbeddingMs: Math.round(sumEmbedding / d),
        avgSearchMs: Math.round(sumSearch / d),
        avgGeminiMs: Math.round(sumGemini / d),
        avgSaveDbMs: Math.round(sumSaveDb / d),
        avgTotalMs: Math.round(sumTotal / d),
      },
      noSourceCount,
      fallbackKeywordCount,
      topCitedDocuments: topSources.map((s) => ({
        documentId: s.documentId,
        title: docMap.get(s.documentId) ?? 'Untitled Document',
        citeCount: s._count.documentId,
      })),
      message: 'Chatbot statistics retrieved successfully',
    };
  }

  async getUploadStatistics(query: UploadStatisticsQueryDto): Promise<UploadStatisticsResponse> {
    const rows = await this.prisma.$queryRaw<UploadStatisticsRow[]>(
      this.buildUploadStatisticsQuery(query),
    );
    return {
      filters: query,
      data: rows.map((row) => ({ date: row.date, count: Number(row.count) })),
      message: 'Upload statistics retrieved successfully',
    };
  }

  private buildActiveDocumentWhere(query: DateRangeQuery): Prisma.DocumentWhereInput {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException({ code: 'INVALID_DATE_RANGE', message: 'from date cannot be after to date' });
    }
    const where: Prisma.DocumentWhereInput = { status: DocumentStatus.ACTIVE };
    if (!query.from && !query.to) return where;
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
    return where;
  }

  private buildUploadStatisticsQuery(query: UploadStatisticsQueryDto): Prisma.Sql {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException({ code: 'INVALID_DATE_RANGE', message: 'from date cannot be after to date' });
    }
    const groupBy = query.groupBy ?? 'day';
    const conditions = [Prisma.sql`status = ${DocumentStatus.ACTIVE}`];
    if (query.from) conditions.push(Prisma.sql`created_at >= ${new Date(query.from)}`);
    if (query.to) conditions.push(Prisma.sql`created_at <= ${new Date(query.to)}`);
    return Prisma.sql`
      SELECT ${this.getUploadDateBucket(groupBy)} AS date, COUNT(*)::bigint AS count
      FROM documents
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  private getUploadDateBucket(groupBy: NonNullable<UploadStatisticsQueryDto['groupBy']>): Prisma.Sql {
    if (groupBy === 'week') {
      return Prisma.sql`to_char((date_trunc('week', created_at + interval '1 day') - interval '1 day')::date, 'YYYY-MM-DD')`;
    }
    if (groupBy === 'month') {
      return Prisma.sql`to_char(date_trunc('month', created_at)::date, 'YYYY-MM')`;
    }
    return Prisma.sql`to_char(created_at::date, 'YYYY-MM-DD')`;
  }
}
