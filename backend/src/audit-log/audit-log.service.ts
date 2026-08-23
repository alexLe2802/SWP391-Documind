import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLog, Prisma } from '../generated/prisma/client';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

export const AuditLogAction = {
  USER_LOGIN: 'USER_LOGIN',
  DOCUMENT_UPLOAD: 'DOCUMENT_UPLOAD',
  DOCUMENT_DELETE: 'DOCUMENT_DELETE',
  DOCUMENT_HIDE: 'DOCUMENT_HIDE',
  PUBLIC_DOCUMENT_SAVE: 'PUBLIC_DOCUMENT_SAVE',
  CHATBOT_QUERY: 'CHATBOT_QUERY',
} as const;

export const AuditLogTargetType = {
  USER: 'USER',
  DOCUMENT: 'DOCUMENT',
  CHATBOT: 'CHATBOT',
} as const;

export interface ChatbotStepTimings {
  embeddingMs: number;
  searchMs: number;
  geminiMs: number;
  saveDbMs: number;
  totalMs: number;
}

export interface ChatbotQueryLogMetadata {
  sessionId: string;
  mode: string;
  question: string;
  noSource: boolean;
  fallbackKeyword: boolean;
  sourcesCount: number;
  citedDocumentIds: string[];
  timings: ChatbotStepTimings;
}

export interface CreateAuditLogInput {
  userId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditLogResponse {
  items: AuditLog[];
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
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly prisma: PrismaService) {}

  // Tạo hoặc lưu create.
  async create(data: CreateAuditLogInput): Promise<AuditLog> {
    // Tạo nhật ký kiểm toán trong database.
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        targetType: data.targetType,
        userId: data.userId,
        targetId: data.targetId,
        metadata: data.metadata,
      },
    });
  }

  // Thực hiện chức năng log đăng nhập.
  logLogin(
    userId: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<AuditLog> {
    return this.create({
      userId,
      action: AuditLogAction.USER_LOGIN,
      targetType: AuditLogTargetType.USER,
      targetId: userId,
      metadata,
    });
  }

  // Thực hiện chức năng log tài liệu tải lên.
  logDocumentUpload(
    userId: string,
    documentId: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<AuditLog> {
    return this.create({
      userId,
      action: AuditLogAction.DOCUMENT_UPLOAD,
      targetType: AuditLogTargetType.DOCUMENT,
      targetId: documentId,
      metadata,
    });
  }

  // Thực hiện chức năng log tài liệu delete.
  logDocumentDelete(
    userId: string,
    documentId: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<AuditLog> {
    return this.create({
      userId,
      action: AuditLogAction.DOCUMENT_DELETE,
      targetType: AuditLogTargetType.DOCUMENT,
      targetId: documentId,
      metadata,
    });
  }

  // Thực hiện chức năng log tài liệu hide.
  logDocumentHide(
    userId: string,
    documentId: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<AuditLog> {
    return this.create({
      userId,
      action: AuditLogAction.DOCUMENT_HIDE,
      targetType: AuditLogTargetType.DOCUMENT,
      targetId: documentId,
      metadata,
    });
  }

  // Thực hiện chức năng log save public tài liệu.
  logSavePublicDocument(
    userId: string,
    documentId: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<AuditLog> {
    return this.create({
      userId,
      action: AuditLogAction.PUBLIC_DOCUMENT_SAVE,
      targetType: AuditLogTargetType.DOCUMENT,
      targetId: documentId,
      metadata,
    });
  }

  // Thực hiện chức năng log chatbot query.
  logChatbotQuery(
    userId: string | null,
    metadata: ChatbotQueryLogMetadata,
  ): Promise<AuditLog> {
    return this.create({
      userId: userId ?? undefined,
      action: AuditLogAction.CHATBOT_QUERY,
      targetType: AuditLogTargetType.CHATBOT,
      targetId: metadata.sessionId,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    });
  }

  // Lấy danh sách dữ liệu phù hợp.
  async findAll(query: AuditLogQueryDto): Promise<AuditLogResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.action) {
      where.action = query.action;
    }

    if (query.keyword) {
      where.OR = [
        { action: { contains: query.keyword, mode: 'insensitive' } },
        { targetType: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
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
}
