import { Injectable } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
  ModerationStatus,
  Prisma,
} from '../generated/prisma/client';
import { SavedDocumentGetPayload } from '../generated/prisma/models/SavedDocument';
import { PrismaService } from '../prisma/prisma.service';
import { SavedDocumentQueryDto } from './dto/saved-document-query.dto';

const savedDocumentInclude = {
  document: {
    include: {
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
    },
  },
} as const;

type SavedDocumentPayload = SavedDocumentGetPayload<{
  include: typeof savedDocumentInclude;
}>;

type SavedDocumentItemPayload = SavedDocumentPayload['document'];

export type SavedDocumentItem = Omit<
  SavedDocumentItemPayload,
  'fileSize' | 'content' | 'savedBy'
> & {
  fileSize: string;
  aiStatus: ExtractionStatus;
  summary: string | null;
  saved: true;
  owned: boolean;
  savedAt: Date;
};

export interface SavedDocumentListResponse {
  items: SavedDocumentItem[];
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
export class SavedDocumentsService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly prisma: PrismaService) {}

  // Lấy danh sách dữ liệu phù hợp.
  async findAll(
    userId: string,
    query: SavedDocumentQueryDto,
  ): Promise<SavedDocumentListResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(userId, query);
    const orderBy = this.buildOrderBy(query);

    const [totalItems, savedDocuments] = await Promise.all([
      this.prisma.savedDocument.count({ where }),
      this.prisma.savedDocument.findMany({
        where,
        include: savedDocumentInclude,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / Math.max(limit, 1));

    return {
      items: savedDocuments.map((savedDocument) =>
        this.serialize(savedDocument, userId),
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

  // Chuyển đổi hoặc chuẩn hóa where.
  private buildWhere(
    userId: string,
    query: SavedDocumentQueryDto,
  ): Prisma.SavedDocumentWhereInput {
    const documentFilters: Prisma.DocumentWhereInput[] = [
      {
        status: DocumentStatus.ACTIVE,
        OR: [
          {
            visibility: DocumentVisibility.PUBLIC,
            moderationStatus: ModerationStatus.APPROVED,
          },
          { ownerId: userId },
        ],
      },
    ];

    if (query.subjectId) documentFilters.push({ subjectId: query.subjectId });
    if (query.categoryId) {
      documentFilters.push({ categoryId: query.categoryId });
    }
    if (query.fileType) {
      documentFilters.push({ fileType: this.toMimeType(query.fileType) });
    }
    if (query.aiStatus) {
      documentFilters.push({ extractionStatus: query.aiStatus });
    }
    if (query.tagIds?.length) {
      documentFilters.push({
        tags: { some: { tagId: { in: query.tagIds } } },
      });
    }
    if (query.search) {
      documentFilters.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { fileName: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    return {
      userId,
      document: {
        AND: documentFilters,
      },
    };
  }

  // Chuyển đổi hoặc chuẩn hóa order by.
  private buildOrderBy(
    query: SavedDocumentQueryDto,
  ): Prisma.SavedDocumentOrderByWithRelationInput[] {
    const sortBy = query.sortBy ?? 'savedAt';
    const sortOrder = query.sortOrder ?? 'desc';

    if (sortBy === 'savedAt') {
      return [{ savedAt: sortOrder }, { id: 'desc' }];
    }

    return [{ document: { [sortBy]: sortOrder } }, { id: 'desc' }];
  }

  // Chuyển đổi hoặc chuẩn hóa serialize.
  private serialize(
    savedDocument: SavedDocumentPayload,
    currentUserId: string,
  ): SavedDocumentItem {
    const { content, ...document } = savedDocument.document;

    return {
      ...document,
      fileSize: savedDocument.document.fileSize.toString(),
      aiStatus: savedDocument.document.extractionStatus,
      summary: content?.contentSummary ?? null,
      saved: true,
      owned: savedDocument.document.ownerId === currentUserId,
      savedAt: savedDocument.savedAt,
    };
  }

  // Chuyển đổi hoặc chuẩn hóa mime type.
  private toMimeType(
    fileType: NonNullable<SavedDocumentQueryDto['fileType']>,
  ): string {
    const mimeTypes = {
      PDF: 'application/pdf',
      DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    } as const;

    return mimeTypes[fileType];
  }
}
