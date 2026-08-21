import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
  ModerationStatus,
  Prisma,
} from '../generated/prisma/client';
import type { SavedDocument } from '../generated/prisma/client';
import { DocumentGetPayload } from '../generated/prisma/models/Document';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ObjectUrlResponse } from '../storage/storage.types';
import {
  CommunityDocumentQueryDto,
  CommunityDocumentFileType,
  CommunityDocumentSortBy,
} from './dto/community-document-query.dto';

const ANONYMOUS_USER_ID_FILTER = '00000000-0000-0000-0000-000000000000';

// Chuyển đổi hoặc chuẩn hóa cộng đồng tài liệu include.
const buildCommunityDocumentInclude = (currentUserId?: string) =>
  ({
    owner: {
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
      },
    },
    subject: true,
    category: true,
    tags: { include: { tag: true } },
    content: { select: { contentSummary: true } },
    savedBy: {
      where: { userId: currentUserId ?? ANONYMOUS_USER_ID_FILTER },
      select: { userId: true },
    },
  }) as const;

const communityFileTypeMimePatterns: Record<CommunityDocumentFileType, string> =
  {
    [CommunityDocumentFileType.PDF]: 'pdf',
    [CommunityDocumentFileType.DOC]: 'msword',
    [CommunityDocumentFileType.DOCX]: 'wordprocessingml',
    [CommunityDocumentFileType.XLS]: 'ms-excel',
    [CommunityDocumentFileType.XLSX]: 'spreadsheetml',
    [CommunityDocumentFileType.PPT]: 'ms-powerpoint',
    [CommunityDocumentFileType.PPTX]: 'presentationml',
  };

type CommunityDocumentPayload = DocumentGetPayload<{
  include: ReturnType<typeof buildCommunityDocumentInclude>;
}>;

export type CommunityDocument = Omit<
  CommunityDocumentPayload,
  'fileSize' | 'content' | 'savedBy'
> & {
  fileSize: string;
  aiStatus: ExtractionStatus;
  summary: string | null;
  saved: boolean;
  owned: boolean;
};

export interface CommunityDocumentListResponse {
  items: CommunityDocument[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface SavedCommunityDocumentResponse {
  documentId: string;
  saved: true;
  savedAt: Date;
}

@Injectable()
export class CommunityService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly storage: StorageService,
  ) {}

  // Lấy dữ liệu chi tiết tài liệu.
  async findOneDocument(
    id: string,
    currentUserId?: string,
  ): Promise<CommunityDocument> {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        visibility: DocumentVisibility.PUBLIC,
        moderationStatus: ModerationStatus.APPROVED,
        status: DocumentStatus.ACTIVE,
      },
      include: buildCommunityDocumentInclude(currentUserId),
    });

    if (!document) {
      throw new NotFoundException('Community document not found');
    }

    return this.serialize(document, currentUserId);
  }

  // Tạo hoặc lưu xem trước url.
  async createPreviewUrl(id: string): Promise<ObjectUrlResponse> {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        visibility: DocumentVisibility.PUBLIC,
        moderationStatus: ModerationStatus.APPROVED,
        status: DocumentStatus.ACTIVE,
      },
      select: {
        id: true,
        storagePath: true,
        fileType: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Community document not found');
    }

    // Tạo URL tạm thời để truy cập object an toàn từ Cloudflare R2.
    const previewUrl = await this.storage.createObjectPreviewUrl(
      document.storagePath,
      document.fileType,
    );

    // Cập nhật tài liệu trong database.
    await this.prisma.document.update({
      where: { id: document.id },
      data: { viewCount: { increment: 1 } },
    });

    return previewUrl;
  }

  // Lấy dữ liệu tài liệu.
  async findDocuments(
    query: CommunityDocumentQueryDto,
    currentUserId?: string,
  ): Promise<CommunityDocumentListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);

    // Keep these queries sequential. With Supabase's session-mode pool, running
    // them concurrently can require a second connection and fail with
    // EMAXCONNSESSION when the pool is near its limit.
    const totalItems = await this.prisma.document.count({ where });
    const documents = await this.prisma.document.findMany({
      where,
      include: buildCommunityDocumentInclude(currentUserId),
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    });
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / Math.max(limit, 1));

    return {
      items: documents.map((document) =>
        this.serialize(document, currentUserId),
      ),
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1 && totalPages > 0,
      },
    };
  }
  // Tạo hoặc lưu tài liệu.
  async saveDocument(
    documentId: string,
    userId: string,
  ): Promise<SavedCommunityDocumentResponse> {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        visibility: DocumentVisibility.PUBLIC,
        moderationStatus: ModerationStatus.APPROVED,
        status: DocumentStatus.ACTIVE,
      },
      select: { id: true, ownerId: true },
    });

    if (!document) {
      throw new NotFoundException('Community document not found');
    }

    if (document.ownerId === userId) {
      throw new BadRequestException('Cannot save your own community document');
    }

    const existingSavedDocument = await this.findSavedDocument(
      userId,
      documentId,
    );
    if (existingSavedDocument) {
      return this.serializeSavedDocument(existingSavedDocument);
    }

    try {
      // Thực hiện các thay đổi liên quan trong cùng một database transaction.
      const savedDocument = await this.prisma.$transaction(async (tx) => {
        const created = await tx.savedDocument.create({
          data: { userId, documentId },
        });
        await tx.document.update({
          where: { id: documentId },
          data: { saveCount: { increment: 1 } },
        });

        return created;
      });
      await this.auditLogService.logSavePublicDocument(userId, documentId);

      return this.serializeSavedDocument(savedDocument);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const savedDocument = await this.findSavedDocument(userId, documentId);
        if (savedDocument) {
          return this.serializeSavedDocument(savedDocument);
        }
      }

      throw error;
    }
  }

  // Thực hiện chức năng unsave tài liệu.
  async unsaveDocument(documentId: string, userId: string): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        visibility: DocumentVisibility.PUBLIC,
        moderationStatus: ModerationStatus.APPROVED,
        status: DocumentStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!document) {
      throw new NotFoundException('Community document not found');
    }

    const savedDocument = await this.findSavedDocument(userId, documentId);
    if (!savedDocument) {
      return;
    }

    // Thực hiện các thay đổi liên quan trong cùng một database transaction.
    await this.prisma.$transaction(async (tx) => {
      await tx.savedDocument.delete({
        where: { id: savedDocument.id },
      });
      await tx.document.update({
        where: { id: documentId },
        data: { saveCount: { decrement: 1 } },
      });
    });

    await this.auditLogService.create({
      userId,
      action: 'PUBLIC_DOCUMENT_UNSAVE',
      targetType: 'DOCUMENT',
      targetId: documentId,
    });
  }

  // Chuyển đổi hoặc chuẩn hóa where.
  private buildWhere(
    query: CommunityDocumentQueryDto,
  ): Prisma.DocumentWhereInput {
    const filters: Prisma.DocumentWhereInput[] = [
      {
        visibility: DocumentVisibility.PUBLIC,
        moderationStatus: ModerationStatus.APPROVED,
        status: DocumentStatus.ACTIVE,
      },
    ];

    if (query.subjectId) filters.push({ subjectId: query.subjectId });
    if (query.categoryId) filters.push({ categoryId: query.categoryId });
    if (query.fileType) {
      filters.push({
        fileType: {
          contains: communityFileTypeMimePatterns[query.fileType],
          mode: 'insensitive',
        },
      });
    }
    if (query.tagIds?.length) {
      filters.push({ tags: { some: { tagId: { in: query.tagIds } } } });
    }
    if (query.q) {
      filters.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
          { fileName: { contains: query.q, mode: 'insensitive' } },
          {
            subject: {
              name: { contains: query.q, mode: 'insensitive' },
            },
          },
          {
            category: {
              name: { contains: query.q, mode: 'insensitive' },
            },
          },
          {
            tags: {
              some: {
                tag: {
                  name: { contains: query.q, mode: 'insensitive' },
                },
              },
            },
          },
        ],
      });
    }

    return { AND: filters };
  }

  // Chuyển đổi hoặc chuẩn hóa order by.
  private buildOrderBy(
    query: CommunityDocumentQueryDto,
  ): Prisma.DocumentOrderByWithRelationInput[] {
    const sortBy = query.sortBy ?? CommunityDocumentSortBy.CREATED_AT;
    const sortOrder = query.sortOrder ?? 'desc';
    const primarySort = {
      [sortBy]: sortOrder,
    } as Prisma.DocumentOrderByWithRelationInput;

    return [primarySort, { id: 'desc' }];
  }

  // Chuyển đổi hoặc chuẩn hóa serialize.
  private serialize(
    document: CommunityDocumentPayload,
    currentUserId?: string,
  ): CommunityDocument {
    const { content, savedBy, ...safeDocument } = document;

    return {
      ...safeDocument,
      fileSize: document.fileSize.toString(),
      aiStatus: document.extractionStatus,
      summary: content?.contentSummary ?? null,
      saved: savedBy.length > 0,
      owned: document.ownerId === currentUserId,
    };
  }

  // Lấy dữ liệu đã lưu tài liệu.
  private findSavedDocument(
    userId: string,
    documentId: string,
  ): Promise<SavedDocument | null> {
    return this.prisma.savedDocument.findUnique({
      where: {
        userId_documentId: {
          userId,
          documentId,
        },
      },
    });
  }

  // Chuyển đổi hoặc chuẩn hóa đã lưu tài liệu.
  private serializeSavedDocument(
    savedDocument: SavedDocument,
  ): SavedCommunityDocumentResponse {
    return {
      documentId: savedDocument.documentId,
      saved: true,
      savedAt: savedDocument.savedAt,
    };
  }

  // Kiểm tra điều kiện unique constraint lỗi.
  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
