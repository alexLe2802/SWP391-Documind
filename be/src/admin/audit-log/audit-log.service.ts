import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

export interface AuditLogResponse {
  items: {
    id: string;
    userId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata: unknown;
    createdAt: Date;
  }[];
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
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AuditLogQueryDto): Promise<AuditLogResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;
    if (query.keyword) {
      where.OR = [
        { action: { contains: query.keyword, mode: 'insensitive' } },
        { targetType: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const [items, totalItems] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / limit);
    return {
      items,
      meta: { page, limit, totalItems, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
    };
  }
}
