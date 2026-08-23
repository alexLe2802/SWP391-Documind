import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
  ModerationFlag,
  ModerationStatus,
  RoleName,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ObjectUrlResponse } from '../storage/storage.types';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsService } from '../documents/documents.service';

type ModerationActionResponse = {
  id: string;
  moderationStatus: ModerationStatus;
  moderationFlag: ModerationFlag;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  updatedAt: Date;
};

class AdminDocumentsQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(DocumentVisibility)
  visibility?: DocumentVisibility;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsEnum(ExtractionStatus)
  aiStatus?: ExtractionStatus;

  @IsOptional()
  @IsEnum(ModerationStatus)
  moderationStatus?: ModerationStatus;

  @IsOptional()
  @IsEnum(ModerationFlag)
  moderationFlag?: ModerationFlag;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit: number = 20;
}

class HideDocumentDto {
  @IsBoolean()
  hidden!: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

class RejectDocumentDto {
  @IsString()
  reason!: string;
}

@ApiTags('admin-documents')
@ApiBearerAuth()
@Controller('admin/documents')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class AdminDocumentsController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly notifications: NotificationsService,
    private readonly documentsService: DocumentsService,
  ) {}

  // Lấy danh sách dữ liệu phù hợp.
  @Get()
  @ApiOperation({ summary: 'List all documents for administrative moderation' })
  async findAll(@Query() query: AdminDocumentsQueryDto): Promise<{
    data: unknown[];
    meta: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // The moderation console only knows about documents intentionally
    // submitted to the public library. Private documents stay owner-only.
    const where: Prisma.DocumentWhereInput = {
      visibility: DocumentVisibility.PUBLIC,
    };
    if (query.status) where.status = query.status;
    if (query.aiStatus) where.extractionStatus = query.aiStatus;
    if (query.moderationStatus) where.moderationStatus = query.moderationStatus;
    if (query.moderationFlag) where.moderationFlag = query.moderationFlag;
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword, mode: 'insensitive' } },
        { description: { contains: query.keyword, mode: 'insensitive' } },
        { fileName: { contains: query.keyword, mode: 'insensitive' } },
        {
          owner: { fullName: { contains: query.keyword, mode: 'insensitive' } },
        },
        {
          owner: { email: { contains: query.keyword, mode: 'insensitive' } },
        },
        {
          subject: { name: { contains: query.keyword, mode: 'insensitive' } },
        },
        {
          category: { name: { contains: query.keyword, mode: 'insensitive' } },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ moderationPriority: 'asc' }, { submittedAt: 'asc' }],
        select: {
          id: true,
          title: true,
          description: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          extractionStatus: true,
          visibility: true,
          status: true,
          moderationStatus: true,
          moderationFlag: true,
          rejectionReason: true,
          matchedKeywords: true,
          matchedContexts: true,
          submittedAt: true,
          reviewedAt: true,
          reviewedBy: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          owner: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          subject: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
            },
          },
          tags: {
            select: {
              tag: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((doc) => ({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize.toString(),
        subject: doc.subject,
        category: doc.category,
        tags: doc.tags.map((entry) => ({
          id: entry.tag.id,
          name: entry.tag.name,
        })),
        aiStatus: doc.extractionStatus,
        visibility: doc.visibility,
        status: doc.status,
        moderationStatus: doc.moderationStatus,
        moderationFlag: doc.moderationFlag,
        rejectionReason: doc.rejectionReason,
        matchedKeywords: doc.matchedKeywords,
        matchedContexts: doc.matchedContexts,
        submittedAt: doc.submittedAt,
        reviewedAt: doc.reviewedAt,
        reviewedBy: doc.reviewedBy,
        version: doc.version,
        moderationReason: doc.rejectionReason,
        owner: doc.owner,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      })),
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  // Thực hiện chức năng xem trước.
  @Get(':id/preview')
  @ApiOperation({ summary: 'Create an admin preview URL for a document' })
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ObjectUrlResponse> {
    const document = await this.prisma.document.findUnique({
      where: { id, visibility: DocumentVisibility.PUBLIC },
      select: { ownerId: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    return this.documentsService.createPreviewUrl(id, document.ownerId);
  }

  // Thực hiện nghiệp vụ approve.
  @Put(':id/approve')
  @ApiOperation({ summary: 'Approve a pending document for publication' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<ModerationActionResponse> {
    const existing = await this.prisma.document.findUnique({
      where: { id, visibility: DocumentVisibility.PUBLIC },
      select: { id: true, ownerId: true, title: true },
    });
    if (!existing) throw new NotFoundException('Document not found');
    // Cập nhật tài liệu trong database.
    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        moderationStatus: ModerationStatus.APPROVED,
        status: DocumentStatus.ACTIVE,
        rejectionReason: null,
        reviewedAt: new Date(),
        reviewedBy: admin.id,
      },
      select: {
        id: true,
        moderationStatus: true,
        moderationFlag: true,
        rejectionReason: true,
        reviewedAt: true,
        reviewedBy: true,
        updatedAt: true,
      },
    });
    await this.auditLogService.logDocumentHide(admin.id, id, {
      action: 'APPROVED',
      moderationFlag: updated.moderationFlag,
    });
    await this.notifications.create({
      userId: existing.ownerId,
      type: 'DOCUMENT_APPROVED',
      title: 'Tài liệu đã được duyệt',
      message: `Tài liệu tên “${existing.title}” đã được duyệt lên cộng đồng.`,
      documentId: id,
    });
    return updated;
  }

  // Thực hiện nghiệp vụ reject.
  @Put(':id/reject')
  @ApiOperation({ summary: 'Reject a document with a required reason' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectDocumentDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<ModerationActionResponse> {
    const reason = body.reason.trim();
    if (!reason) throw new BadRequestException('Rejection reason is required');
    const existing = await this.prisma.document.findUnique({
      where: { id, visibility: DocumentVisibility.PUBLIC },
      select: { id: true, ownerId: true, title: true },
    });
    if (!existing) throw new NotFoundException('Document not found');
    // Cập nhật tài liệu trong database.
    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        moderationStatus: ModerationStatus.REJECTED,
        status: DocumentStatus.HIDDEN,
        rejectionReason: reason,
        reviewedAt: new Date(),
        reviewedBy: admin.id,
      },
      select: {
        id: true,
        moderationStatus: true,
        moderationFlag: true,
        rejectionReason: true,
        reviewedAt: true,
        reviewedBy: true,
        updatedAt: true,
      },
    });
    await this.auditLogService.logDocumentHide(admin.id, id, {
      action: 'REJECTED',
      reason,
    });
    await this.notifications.create({
      userId: existing.ownerId,
      type: 'DOCUMENT_REJECTED',
      title: 'Tài liệu đã bị từ chối',
      message: `Tài liệu của bạn “${existing.title}” đã bị từ chối và ẩn khỏi cộng đồng. Lý do: ${reason}`,
      documentId: id,
    });
    return updated;
  }

  // Thực hiện chức năng hide.
  @Put(':id/hide')
  @ApiOperation({ summary: 'Moderates a document by hiding or unhiding it' })
  async hide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: HideDocumentDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<{
    id: string;
    status: DocumentStatus;
    moderationReason: string | null;
    updatedAt: Date;
  }> {
    const document = await this.prisma.document.findUnique({
      where: { id, visibility: DocumentVisibility.PUBLIC },
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const status = body.hidden ? DocumentStatus.HIDDEN : DocumentStatus.ACTIVE;
    // Cập nhật tài liệu trong database.
    const updated = await this.prisma.document.update({
      where: { id },
      data: { status },
    });

    await this.auditLogService.logDocumentHide(admin.id, id, {
      status,
      reason: body.reason,
    });

    return {
      id: updated.id,
      status: updated.status,
      moderationReason: body.reason ?? null,
      updatedAt: updated.updatedAt,
    };
  }
}
