import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentStatus,
  DocumentVisibility,
  RoleName,
  UserStatus,
  Prisma,
} from '../generated/prisma/client';
import { DocumentsBySubjectQueryDto } from './dto/documents-by-subject-query.dto';
import { DocumentsByCategoryQueryDto } from './dto/documents-by-category-query.dto';
import { UploadStatisticsQueryDto } from './dto/upload-statistics-query.dto';
import { AuditLogAction } from '../audit-log/audit-log.service';
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

type RoleCountRow = { name: RoleName; _count: { users: number } };
type UserStatusCountRow = {
  status: UserStatus;
  _count: { _all: number };
};
type DocumentStatusCountRow = {
  status: DocumentStatus;
  _count: { _all: number };
};
type DocumentVisibilityCountRow = {
  visibility: DocumentVisibility;
  _count: { _all: number };
};
type SubjectCountRow = {
  id: string;
  code: string;
  name: string;
  _count: { documents: number };
};
type CategoryCountRow = {
  id: string;
  name: string;
  subject?: { id: string; name: string } | null;
  _count: { documents: number };
};
type UploadStatisticsRow = {
  date: string;
  count: bigint | number | string;
};

type DateRangeQuery = {
  from?: string;
  to?: string;
};

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
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly prisma: PrismaService) {}

  // Lấy dữ liệu summary.
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
      this.prisma.document.count({
        where: { status: DocumentStatus.ACTIVE },
      }),
      this.prisma.document.count({
        where: {
          status: DocumentStatus.ACTIVE,
          visibility: DocumentVisibility.PUBLIC,
        },
      }),
      this.prisma.document.count({
        where: {
          status: DocumentStatus.ACTIVE,
          visibility: DocumentVisibility.PRIVATE,
        },
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

  // Lấy dữ liệu người dùng stats.
  async getUserStats(): Promise<UserStatsResponse> {
    const [roles, statuses] = (await Promise.all([
      this.prisma.role.findMany({
        select: {
          name: true,
          _count: {
            select: { users: true },
          },
        },
      }),
      this.prisma.user.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ])) as [RoleCountRow[], UserStatusCountRow[]];

    const byRole = roles.map((r) => ({
      role: r.name,
      count: r._count.users,
    }));

    const byStatus = statuses.map((s) => ({
      status: s.status,
      count: s._count._all,
    }));

    return {
      byRole,
      byStatus,
      message: 'User statistics retrieved successfully',
    };
  }

  // Lấy dữ liệu tài liệu stats.
  async getDocumentStats(): Promise<DocumentStatsResponse> {
    const [statuses, visibilities] = (await Promise.all([
      this.prisma.document.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.document.groupBy({
        by: ['visibility'],
        _count: { _all: true },
      }),
    ])) as [DocumentStatusCountRow[], DocumentVisibilityCountRow[]];

    const byStatus = statuses.map((s) => ({
      status: s.status,
      count: s._count._all,
    }));

    const byVisibility = visibilities.map((v) => ({
      visibility: v.visibility,
      count: v._count._all,
    }));

    return {
      byStatus,
      byVisibility,
      message: 'Document statistics retrieved successfully',
    };
  }

  // Lấy dữ liệu statistics.
  async getStatistics(): Promise<DashboardStatisticsResponse> {
    const [userStats, documentStats, subjectStats, categoryStats] =
      await Promise.all([
        this.getUserStats(),
        this.getDocumentStats(),
        this.getDocumentsBySubject({}),
        this.getDocumentsByCategory({}),
      ]);

    return {
      users: {
        byRole: userStats.byRole,
        byStatus: userStats.byStatus,
      },
      documents: {
        byStatus: documentStats.byStatus,
        byVisibility: documentStats.byVisibility,
        bySubject: subjectStats.data,
        byCategory: categoryStats.data,
      },
      message: 'Dashboard statistics retrieved successfully',
    };
  }

  // Lấy dữ liệu tài liệu by môn học.
  async getDocumentsBySubject(
    query: DocumentsBySubjectQueryDto,
  ): Promise<DocumentsBySubjectResponse> {
    const documentWhere = this.buildActiveDocumentWhere(query);

    const subjects = (await this.prisma.subject.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        _count: {
          select: {
            documents: {
              where: documentWhere,
            },
          },
        },
      },
    })) as SubjectCountRow[];

    const data = subjects.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      count: s._count.documents,
    }));

    return {
      filters: query,
      data,
      message: 'Documents by subject retrieved successfully',
    };
  }

  // Lấy dữ liệu tài liệu by danh mục.
  async getDocumentsByCategory(
    query: DocumentsByCategoryQueryDto,
  ): Promise<DocumentsByCategoryResponse> {
    const documentWhere = this.buildActiveDocumentWhere(query);

    const categories = (await this.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        subject: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            documents: {
              where: documentWhere,
            },
          },
        },
      },
    })) as CategoryCountRow[];

    const groupedCategories = new Map<
      string,
      { id: string; name: string; count: number }
    >();

    categories.forEach((category) => {
      const normalizedName = category.name.trim().toLowerCase();
      const existing = groupedCategories.get(normalizedName);

      if (existing) {
        existing.count += category._count.documents;
        return;
      }

      groupedCategories.set(normalizedName, {
        id: category.id,
        name: category.name,
        count: category._count.documents,
      });
    });

    const data = Array.from(groupedCategories.values());

    return {
      filters: query,
      data,
      message: 'Documents by category retrieved successfully',
    };
  }

  // Lấy dữ liệu chatbot stats.
  async getChatbotStats(): Promise<ChatbotStatsResponseDto> {
    const logs = await this.prisma.auditLog.findMany({
      where: { action: AuditLogAction.CHATBOT_QUERY },
      select: { metadata: true },
    });

    const totalQuestions = logs.length;
    let noSourceCount = 0;
    let fallbackKeywordCount = 0;

    let sumEmbedding = 0;
    let sumSearch = 0;
    let sumGemini = 0;
    let sumSaveDb = 0;
    let sumTotal = 0;

    for (const log of logs) {
      const meta = log.metadata as unknown as ChatbotLogMetadata | null;
      if (!meta) continue;

      if (meta.noSource) {
        noSourceCount++;
      }
      if (meta.fallbackKeyword) {
        fallbackKeywordCount++;
      }

      if (meta.timings) {
        sumEmbedding += Number(meta.timings.embeddingMs ?? 0);
        sumSearch += Number(meta.timings.searchMs ?? 0);
        sumGemini += Number(meta.timings.geminiMs ?? 0);
        sumSaveDb += Number(meta.timings.saveDbMs ?? 0);
        sumTotal += Number(meta.timings.totalMs ?? 0);
      }
    }

    const divisor = totalQuestions > 0 ? totalQuestions : 1;

    const topSources = await this.prisma.chatSource.groupBy({
      by: ['documentId'],
      _count: { documentId: true },
      orderBy: {
        _count: { documentId: 'desc' },
      },
      take: 5,
    });

    const topDocumentIds = topSources.map((s) => s.documentId);
    const documents = await this.prisma.document.findMany({
      where: { id: { in: topDocumentIds } },
      select: { id: true, title: true },
    });
    const docMap = new Map(documents.map((d) => [d.id, d.title]));

    const topCitedDocuments = topSources.map((s) => ({
      documentId: s.documentId,
      title: docMap.get(s.documentId) ?? 'Untitled Document',
      citeCount: s._count.documentId,
    }));

    return {
      totalQuestions,
      avgResponseTime: {
        avgEmbeddingMs: Math.round(sumEmbedding / divisor),
        avgSearchMs: Math.round(sumSearch / divisor),
        avgGeminiMs: Math.round(sumGemini / divisor),
        avgSaveDbMs: Math.round(sumSaveDb / divisor),
        avgTotalMs: Math.round(sumTotal / divisor),
      },
      noSourceCount,
      fallbackKeywordCount,
      topCitedDocuments,
      message: 'Chatbot statistics retrieved successfully',
    };
  }

  // Lấy dữ liệu tải lên statistics.
  async getUploadStatistics(
    query: UploadStatisticsQueryDto,
  ): Promise<UploadStatisticsResponse> {
    const rows = await this.prisma.$queryRaw<UploadStatisticsRow[]>(
      this.buildUploadStatisticsQuery(query),
    );

    const data = rows.map((row) => ({
      date: row.date,
      count: Number(row.count),
    }));

    return {
      filters: query,
      data,
      message: 'Upload statistics retrieved successfully',
    };
  }

  // Chuyển đổi hoặc chuẩn hóa active tài liệu where.
  private buildActiveDocumentWhere(
    query: DateRangeQuery,
  ): Prisma.DocumentWhereInput {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'from date cannot be after to date',
      });
    }

    const where: Prisma.DocumentWhereInput = {
      status: DocumentStatus.ACTIVE,
    };

    if (!query.from && !query.to) {
      return where;
    }

    where.createdAt = {};

    if (query.from) {
      where.createdAt.gte = new Date(query.from);
    }

    if (query.to) {
      where.createdAt.lte = new Date(query.to);
    }

    return where;
  }

  // Chuyển đổi hoặc chuẩn hóa tải lên statistics query.
  private buildUploadStatisticsQuery(
    query: UploadStatisticsQueryDto,
  ): Prisma.Sql {
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: 'from date cannot be after to date',
      });
    }

    const groupBy = query.groupBy ?? 'day';
    const conditions = [Prisma.sql`status = ${DocumentStatus.ACTIVE}`];

    if (query.from) {
      conditions.push(Prisma.sql`created_at >= ${new Date(query.from)}`);
    }

    if (query.to) {
      conditions.push(Prisma.sql`created_at <= ${new Date(query.to)}`);
    }

    return Prisma.sql`
      SELECT ${this.getUploadDateBucket(groupBy)} AS date, COUNT(*)::bigint AS count
      FROM documents
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  // Lấy dữ liệu tải lên date bucket.
  private getUploadDateBucket(
    groupBy: NonNullable<UploadStatisticsQueryDto['groupBy']>,
  ): Prisma.Sql {
    if (groupBy === 'week') {
      return Prisma.sql`to_char((date_trunc('week', created_at + interval '1 day') - interval '1 day')::date, 'YYYY-MM-DD')`;
    }

    if (groupBy === 'month') {
      return Prisma.sql`to_char(date_trunc('month', created_at)::date, 'YYYY-MM')`;
    }

    return Prisma.sql`to_char(created_at::date, 'YYYY-MM-DD')`;
  }
}
