import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { extname } from 'node:path';
import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
  ModerationStatus,
  Prisma,
  SourceType,
} from '../generated/prisma/client';
import { DocumentGetPayload } from '../generated/prisma/models/Document';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DownloadLogService } from '../download-log/download-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ObjectUrlResponse, UploadedFile } from '../storage/storage.types';
import {
  DOCUMENT_FILE_EXTENSIONS,
  DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE,
} from './documents.constants';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentListQueryDto } from './dto/document-list-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationScannerService } from '../content-extraction/moderation-scanner.service';

const documentInclude = {
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
  content: true,
  savedBy: true,
} as const;

type DocumentPayload = DocumentGetPayload<{
  include: typeof documentInclude;
}>;

export type UiReadyDocument = Omit<DocumentPayload, 'fileSize'> & {
  fileSize: string;
  aiStatus: ExtractionStatus;
  summary: string | null;
  saved: boolean;
  owned: boolean;
};

export interface DocumentListResponse {
  filters: DocumentListQueryDto;
  data: UiReadyDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly downloadLogService: DownloadLogService,
    private readonly auditLogService: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly moderationScanner: ModerationScannerService,
  ) {}

  // Lưu tệp và tạo bản ghi tài liệu; tài liệu công khai luôn chờ admin duyệt.
  async upload(
    ownerId: string,
    dto: CreateDocumentDto,
    file: UploadedFile,
  ): Promise<UiReadyDocument> {
    this.validateFile(file);
    await this.validateRelations(
      ownerId,
      dto.subjectId,
      dto.categoryId,
      dto.tagIds,
    );
    // Tải tệp lên kho lưu trữ Cloudflare R2.
    const uploadedObject = await this.storage.uploadObject(ownerId, file);
    const tagIds = await this.resolveTagIds(dto.tagIds ?? [], dto.tags ?? []);
    const visibility = dto.visibility ?? DocumentVisibility.PRIVATE;

    let document: DocumentPayload;
    try {
      // Tạo tài liệu trong database.
      document = await this.prisma.document.create({
        data: {
          ownerId,
          subjectId: dto.subjectId,
          categoryId: dto.categoryId,
          title: dto.title.trim(),
          description: dto.description?.trim(),
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: BigInt(file.size),
          storagePath: uploadedObject.key,
          fileUrl: uploadedObject.fileUrl,
          visibility,
          moderationStatus:
            visibility === DocumentVisibility.PRIVATE
              ? ModerationStatus.APPROVED
              : ModerationStatus.PENDING,
          extractionStatus: ExtractionStatus.PENDING,
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
          content: {
            create: {
              sourceType: this.toSourceType(file.mimetype, file.originalname),
              extractionStatus: ExtractionStatus.PENDING,
              progress: 0,
            },
          },
        },
        include: documentInclude,
      });
    } catch (error) {
      await Promise.resolve(
        // Xóa object tương ứng khỏi kho lưu trữ Cloudflare R2.
        this.storage.deleteObject(ownerId, uploadedObject.key),
      ).catch(() => undefined);
      throw error;
    }

    await this.auditLogService.logDocumentUpload(ownerId, document.id, {
      title: document.title,
      fileName: document.fileName,
      visibility: document.visibility,
    });
    await this.notifications.create({
      userId: ownerId,
      type: 'DOCUMENT_UPLOADED',
      title: 'Tải tài liệu thành công',
      message: `Tài liệu “${document.title}” đã được tải lên thành công.`,
      documentId: document.id,
    });

    return this.serialize(document, ownerId);
  }

  // Lấy danh sách dữ liệu phù hợp.
  async findAll(
    ownerId: string,
    query: DocumentListQueryDto,
  ): Promise<DocumentListResponse> {
    const where = this.buildVisibleWhere(ownerId, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const [total, documents] = await Promise.all([
      this.prisma.document.count({ where }),
      this.prisma.document.findMany({
        where,
        include: documentInclude,
        orderBy: [
          { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
          { id: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      filters: query,
      data: documents.map((document) => this.serialize(document, ownerId)),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  // Lấy một bản ghi dữ liệu phù hợp.
  async findOne(id: string, ownerId: string): Promise<UiReadyDocument> {
    const document = await this.prisma.document.findFirst({
      where: this.buildVisibleWhere(ownerId, { id }),
      include: documentInclude,
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return this.serialize(document, ownerId);
  }

  // Tạo hoặc lưu tải xuống url.
  async createDownloadUrl(
    id: string,
    ownerId: string,
  ): Promise<ObjectUrlResponse> {
    const document = await this.findOne(id, ownerId);
    // Tạo URL tạm thời để truy cập object an toàn từ Cloudflare R2.
    const downloadUrl = await this.storage.createObjectDownloadUrl(
      document.storagePath,
      document.fileName,
      document.fileType,
    );

    await Promise.all([
      // Cập nhật tài liệu trong database.
      this.prisma.document.update({
        where: { id },
        data: { downloadCount: { increment: 1 } },
      }),
      this.downloadLogService.create({
        userId: ownerId,
        documentId: id,
      }),
    ]);

    return downloadUrl;
  }

  // Tạo hoặc lưu xem trước url.
  async createPreviewUrl(
    id: string,
    ownerId: string,
  ): Promise<ObjectUrlResponse> {
    const document = await this.findOne(id, ownerId);
    const previewObject = this.getPreviewObject(document);
    // Tạo URL tạm thời để truy cập object an toàn từ Cloudflare R2.
    const previewUrl = await this.storage.createObjectPreviewUrl(
      previewObject.storagePath,
      previewObject.fileType,
    );

    // Cập nhật tài liệu trong database.
    await this.prisma.document.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return {
      ...previewUrl,
      contentType: previewObject.fileType,
      fallbackToOfficeViewer: previewObject.fallbackToOfficeViewer,
    };
  }

  // Lấy dữ liệu xem trước object.
  private getPreviewObject(document: UiReadyDocument): {
    storagePath: string;
    fileType: string;
    fallbackToOfficeViewer?: boolean;
  } {
    if (this.isPdf(document.fileType, document.fileName)) {
      return {
        storagePath: document.storagePath,
        fileType: document.fileType,
      };
    }

    if (!this.isOfficeDocument(document.fileType, document.fileName)) {
      return {
        storagePath: document.storagePath,
        fileType: document.fileType,
      };
    }

    this.logger.log(`Using Microsoft Office viewer for ${document.id}`);
    return {
      storagePath: document.storagePath,
      fileType: document.fileType,
      fallbackToOfficeViewer: true,
    };
  }

  // Kiểm tra điều kiện pdf.
  private isPdf(mimeType: string, fileName: string): boolean {
    return (
      mimeType === 'application/pdf' ||
      extname(fileName).toLowerCase() === '.pdf'
    );
  }

  // Kiểm tra điều kiện office tài liệu.
  private isOfficeDocument(mimeType: string, fileName: string): boolean {
    const extension = extname(fileName).toLowerCase();
    return (
      [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ].includes(mimeType) || ['.docx', '.pptx', '.xlsx'].includes(extension)
    );
  }

  // Cập nhật metadata; tài liệu công khai bị sửa sẽ quay lại trạng thái chờ duyệt.
  async update(
    id: string,
    ownerId: string,
    dto: UpdateDocumentDto,
  ): Promise<UiReadyDocument> {
    const existingDocument = await this.findOne(id, ownerId);
    if (dto.subjectId || dto.categoryId || dto.tagIds) {
      await this.validateRelations(
        ownerId,
        dto.subjectId ?? existingDocument.subjectId,
        dto.categoryId ?? existingDocument.categoryId,
        dto.tagIds,
      );
    }
    const { tagIds, status, ...data } = dto;
    const targetVisibility = dto.visibility ?? existingDocument.visibility;
    const becomesPublicFromPrivate =
      targetVisibility === DocumentVisibility.PUBLIC &&
      existingDocument.visibility === DocumentVisibility.PRIVATE;
    const becomesPrivateFromPublic =
      targetVisibility === DocumentVisibility.PRIVATE &&
      existingDocument.visibility === DocumentVisibility.PUBLIC;
    const shouldModeratePublicDocument =
      targetVisibility === DocumentVisibility.PUBLIC &&
      (becomesPublicFromPrivate ||
        existingDocument.moderationStatus !== ModerationStatus.APPROVED ||
        dto.title !== undefined ||
        dto.description !== undefined);
    const moderationResult = shouldModeratePublicDocument
      ? this.moderationScanner.scan(
          [
            dto.title ?? existingDocument.title,
            existingDocument.fileName,
            dto.description ?? existingDocument.description,
            existingDocument.content?.extractedText,
          ]
            .filter(Boolean)
            .join('\n'),
        )
      : undefined;
    // Cập nhật tài liệu trong database.
    const document = await this.prisma.document.update({
      where: { id },
      data: {
        ...data,
        status,
        ...(targetVisibility === DocumentVisibility.PRIVATE
          ? {
              moderationStatus: ModerationStatus.APPROVED,
              rejectionReason: null,
              reviewedAt: null,
              reviewedBy: null,
              ...(becomesPrivateFromPublic
                ? {
                    savedBy: { deleteMany: {} },
                    saveCount: 0,
                  }
                : {}),
            }
          : moderationResult
            ? {
                moderationStatus: ModerationStatus.PENDING,
                moderationFlag: moderationResult.flag,
                moderationPriority: moderationResult.priority,
                matchedKeywords: moderationResult.matchedKeywords,
                matchedContexts: moderationResult.matchedContexts,
                rejectionReason: null,
                reviewedAt: null,
                reviewedBy: null,
                submittedAt: new Date(),
                version: { increment: 1 },
              }
            : {}),
        tags:
          tagIds === undefined
            ? undefined
            : {
                deleteMany: {},
                create: tagIds.map((tagId) => ({ tagId })),
              },
      },
      include: documentInclude,
    });
    if (status === DocumentStatus.HIDDEN) {
      await this.auditLogService.logDocumentHide(ownerId, id, { status });
    }
    if (becomesPublicFromPrivate) {
      await this.notifications.create({
        userId: ownerId,
        type: 'DOCUMENT_PENDING_REVIEW',
        title: 'Tài liệu đang chờ kiểm duyệt',
        message: `Tài liệu “${existingDocument.title}” đã được gửi đến quản trị viên và chỉ xuất hiện trên cộng đồng sau khi được duyệt.`,
        documentId: id,
      });
    }
    return this.serialize(document, ownerId);
  }

  // Cập nhật quyền hiển thị.
  updateVisibility(
    id: string,
    ownerId: string,
    visibility: DocumentVisibility,
  ): Promise<UiReadyDocument> {
    return this.update(id, ownerId, { visibility });
  }

  // Xóa hoặc giải phóng remove.
  async remove(id: string, ownerId: string): Promise<void> {
    const document = await this.findOne(id, ownerId);
    // Xóa tài liệu trong database.
    await this.prisma.document.delete({
      where: { id },
    });
    await this.auditLogService.logDocumentDelete(ownerId, id);
    await Promise.resolve(
      // Xóa object tương ứng khỏi kho lưu trữ Cloudflare R2.
      this.storage.deleteObject(ownerId, document.storagePath),
    ).catch((error: unknown) => {
      this.logger.warn(
        `Document ${id} was deleted from the database, but its storage object could not be removed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  // Kiểm tra điều kiện relations.
  private async validateRelations(
    ownerId: string,
    subjectId?: string,
    categoryId?: string,
    tagIds: string[] = [],
  ): Promise<void> {
    const [subject, category, tagCount] = await Promise.all([
      subjectId
        ? this.prisma.subject.findFirst({
            where: {
              id: subjectId,
              deletedAt: null,
              OR: [
                { ownerId },
                {
                  ownerId: null,
                  documents: {
                    some: {
                      ownerId,
                      status: { not: DocumentStatus.DELETED },
                    },
                  },
                },
              ],
            },
          })
        : Promise.resolve(true),
      categoryId
        ? this.prisma.category.findFirst({
            where: {
              id: categoryId,
              deletedAt: null,
              ...(subjectId ? { subjectId } : {}),
              OR: [
                { ownerId },
                {
                  ownerId: null,
                  documents: {
                    some: {
                      ownerId,
                      status: { not: DocumentStatus.DELETED },
                      ...(subjectId ? { subjectId } : {}),
                    },
                  },
                },
              ],
            },
          })
        : Promise.resolve(true),
      tagIds.length
        ? this.prisma.tag.count({ where: { id: { in: tagIds } } })
        : Promise.resolve(0),
    ]);
    if (!subject) throw new NotFoundException('Subject not found');
    if (!category) throw new NotFoundException('Category not found');
    if (tagCount !== tagIds.length) {
      throw new NotFoundException('One or more tags were not found');
    }
  }

  // Chuyển đổi hoặc chuẩn hóa thẻ ids.
  private async resolveTagIds(
    existingIds: string[],
    names: string[],
  ): Promise<string[]> {
    const normalizedNames = [
      ...new Set(
        names.map((name) => name.trim().toLowerCase()).filter(Boolean),
      ),
    ];
    const resolved = await Promise.all(
      normalizedNames.map((name) =>
        // Tạo mới hoặc cập nhật thẻ trong database.
        this.prisma.tag.upsert({
          where: { name },
          create: { name },
          update: {},
        }),
      ),
    );
    return [...new Set([...existingIds, ...resolved.map((tag) => tag.id)])];
  }

  // Kiểm tra điều kiện tệp.
  private validateFile(file: UploadedFile): void {
    if (!file.buffer.length || file.size <= 0) {
      throw new BadRequestException('Document file is empty');
    }
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      throw new BadRequestException('Document file exceeds 80 MB');
    }
    if (
      !DOCUMENT_MIME_TYPES.includes(
        file.mimetype as (typeof DOCUMENT_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException('Unsupported document MIME type');
    }
    if (
      !DOCUMENT_FILE_EXTENSIONS.has(extname(file.originalname).toLowerCase())
    ) {
      throw new BadRequestException('Unsupported document file extension');
    }
  }

  // Chuyển đổi hoặc chuẩn hóa visible where.
  private buildVisibleWhere(
    ownerId: string,
    query: Partial<DocumentListQueryDto> & { id?: string } = {},
  ): Prisma.DocumentWhereInput {
    const accessFilter: Prisma.DocumentWhereInput = query.ownerOnly
      ? { ownerId, status: { not: DocumentStatus.DELETED } }
      : query.savedOnly
        ? {
            savedBy: { some: { userId: ownerId } },
            visibility: DocumentVisibility.PUBLIC,
            moderationStatus: ModerationStatus.APPROVED,
            status: DocumentStatus.ACTIVE,
          }
        : {
            OR: [
              { ownerId, status: { not: DocumentStatus.DELETED } },
              {
                visibility: DocumentVisibility.PUBLIC,
                status: DocumentStatus.ACTIVE,
                moderationStatus: 'APPROVED',
              },
              {
                savedBy: { some: { userId: ownerId } },
                visibility: DocumentVisibility.PUBLIC,
                moderationStatus: ModerationStatus.APPROVED,
                status: DocumentStatus.ACTIVE,
              },
            ],
          };

    const filters: Prisma.DocumentWhereInput[] = [];
    if (query.id) filters.push({ id: query.id });
    if (query.subjectId) filters.push({ subjectId: query.subjectId });
    if (query.categoryId) filters.push({ categoryId: query.categoryId });
    if (query.visibility) filters.push({ visibility: query.visibility });
    if (query.fileType) {
      const mimeTypes: Record<string, string> = {
        PDF: 'application/pdf',
        DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      filters.push({ fileType: mimeTypes[query.fileType] });
    }
    if (query.aiStatus) {
      filters.push({ extractionStatus: query.aiStatus });
    }
    if (query.tagIds?.length) {
      filters.push({
        tags: {
          some: { tagId: { in: query.tagIds } },
        },
      });
    }
    if (query.search) {
      filters.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { fileName: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    return {
      status: { not: DocumentStatus.DELETED },
      AND: [accessFilter, ...filters],
    };
  }

  // Chuyển đổi hoặc chuẩn hóa serialize.
  private serialize(
    document: DocumentPayload,
    currentUserId: string,
  ): UiReadyDocument {
    return {
      ...document,
      fileSize: document.fileSize.toString(),
      aiStatus: document.extractionStatus,
      summary: document.content?.contentSummary ?? null,
      saved:
        document.savedBy?.some((saved) => saved.userId === currentUserId) ??
        false,
      owned: document.ownerId === currentUserId,
    };
  }

  // Chuyển đổi hoặc chuẩn hóa nguồn type.
  private toSourceType(mimeType: string, fileName: string): SourceType {
    const extension = extname(fileName).replace('.', '').toUpperCase();
    const mapped =
      extension === 'XLSX' || extension === 'XLS' ? 'EXCEL' : extension;

    if (
      mapped === SourceType.PDF ||
      mapped === SourceType.DOC ||
      mapped === SourceType.DOCX ||
      mapped === SourceType.PPTX ||
      mapped === SourceType.EXCEL
    ) {
      return mapped;
    }

    if (mimeType.includes('pdf')) return SourceType.PDF;
    if (mimeType.includes('word')) return SourceType.DOCX;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return SourceType.EXCEL;
    }
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
      return SourceType.PPTX;
    }

    return SourceType.MOCK;
  }
}
