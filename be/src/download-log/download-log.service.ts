import { BadRequestException, Injectable } from '@nestjs/common';
import { DownloadLog, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DownloadLogQueryDto } from './dto/download-log-query.dto';

export interface CreateDownloadLogInput {
  userId: string;
  documentId: string;
}

export interface MostDownloadedQuery {
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export interface MostDownloadedDocument {
  documentId: string;
  title: string;
  fileName: string;
  fileType: string;
  downloadCount: number;
}

export type DownloadLogListItem = DownloadLog & {
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  document: {
    id: string;
    title: string;
    fileName: string;
    fileType: string;
  };
};

export interface DownloadLogResponse {
  items: DownloadLogListItem[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

@Injectable()
export class DownloadLogService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly prisma: PrismaService) {}

  // Tạo hoặc lưu create.
  create(data: CreateDownloadLogInput): Promise<DownloadLog> {
    // Tạo lịch sử tải xuống trong database.
    return this.prisma.downloadLog.create({ data });
  }

  // Lấy danh sách dữ liệu phù hợp.
  async findAll(query: DownloadLogQueryDto): Promise<DownloadLogResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.downloadLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { downloadedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          document: {
            select: {
              id: true,
              title: true,
              fileName: true,
              fileType: true,
            },
          },
        },
      }),
      this.prisma.downloadLog.count({ where }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / Math.max(limit, 1));

    return {
      items: data,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1 && totalPages > 0,
      },
    };
  }

  // Lấy dữ liệu most downloaded.
  async getMostDownloaded(
    query: MostDownloadedQuery = {},
  ): Promise<MostDownloadedDocument[]> {
    const limit = query.limit ?? 10;
    const where = this.buildDateWhere(query);
    const grouped = await this.prisma.downloadLog.groupBy({
      by: ['documentId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { documentId: 'desc' } },
      take: limit,
    });
    const documentIds = grouped.map((item) => item.documentId);

    if (!documentIds.length) {
      return [];
    }

    const documents = await this.prisma.document.findMany({
      where: { id: { in: documentIds } },
      select: {
        id: true,
        title: true,
        fileName: true,
        fileType: true,
      },
    });
    const documentsById = new Map(
      documents.map((document) => [document.id, document]),
    );

    return grouped
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
          downloadCount: item._count._all,
        };
      })
      .filter((item): item is MostDownloadedDocument => item !== undefined);
  }

  // Chuyển đổi hoặc chuẩn hóa where.
  private buildWhere(query: DownloadLogQueryDto): Prisma.DownloadLogWhereInput {
    const where: Prisma.DownloadLogWhereInput = {};

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.documentId) {
      where.documentId = query.documentId;
    }

    return where;
  }

  // Chuyển đổi hoặc chuẩn hóa date where.
  private buildDateWhere(
    query: MostDownloadedQuery,
  ): Prisma.DownloadLogWhereInput {
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

    const where: Prisma.DownloadLogWhereInput = {};

    if (!query.fromDate && !query.toDate) {
      return where;
    }

    where.downloadedAt = {};

    if (query.fromDate) {
      where.downloadedAt.gte = new Date(query.fromDate);
    }

    if (query.toDate) {
      where.downloadedAt.lte = new Date(query.toDate);
    }

    return where;
  }
}
