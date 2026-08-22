import {
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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  DocumentStatus,
  DocumentVisibility,
  ModerationStatus,
  Prisma,
  RoleName,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDocumentsQueryDto } from './dto/admin-documents-query.dto';
import { HideDocumentDto, RejectDocumentDto } from './dto/moderation-action.dto';

type AuthenticatedAdmin = { id: string };

type ModerationActionResponse = {
  id: string;
  moderationStatus: ModerationStatus;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  updatedAt: Date;
};

@ApiTags('admin-documents')
@ApiBearerAuth()
@Controller('admin/documents')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class AdminDocumentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all public documents for administrative moderation' })
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
        { owner: { fullName: { contains: query.keyword, mode: 'insensitive' } } },
        { owner: { email: { contains: query.keyword, mode: 'insensitive' } } },
        { subject: { name: { contains: query.keyword, mode: 'insensitive' } } },
        { category: { name: { contains: query.keyword, mode: 'insensitive' } } },
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
          owner: { select: { id: true, fullName: true, email: true } },
          subject: { select: { id: true, code: true, name: true } },
          category: { select: { id: true, name: true } },
          tags: { select: { tag: { select: { id: true, name: true } } } },
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
        tags: doc.tags.map((e) => ({ id: e.tag.id, name: e.tag.name })),
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

  @Get(':id')
  @ApiOperation({ summary: 'Get a single public document for moderation review' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    const doc = await this.prisma.document.findUnique({
      where: { id, visibility: DocumentVisibility.PUBLIC },
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
        submittedAt: true,
        reviewedAt: true,
        reviewedBy: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, fullName: true, email: true } },
        subject: { select: { id: true, code: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return { ...doc, fileSize: doc.fileSize.toString() };
  }

  @Put(':id/approve')
  @ApiOperation({ summary: 'Approve a pending document for publication' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<ModerationActionResponse> {
    const existing = await this.prisma.document.findUnique({
      where: { id, visibility: DocumentVisibility.PUBLIC },
      select: { id: true, ownerId: true, title: true },
    });
    if (!existing) throw new NotFoundException('Document not found');

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

    return updated;
  }

  @Put(':id/reject')
  @ApiOperation({ summary: 'Reject a document — reason is required and stored for the owner' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectDocumentDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<ModerationActionResponse> {
    const existing = await this.prisma.document.findUnique({
      where: { id, visibility: DocumentVisibility.PUBLIC },
      select: { id: true, ownerId: true, title: true },
    });
    if (!existing) throw new NotFoundException('Document not found');

    // Rejection reason is persisted so the owner can understand why the
    // document was removed from the community library.
    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        moderationStatus: ModerationStatus.REJECTED,
        status: DocumentStatus.REJECTED,
        rejectionReason: body.reason,
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

    void this.prisma.auditLog
      .create({
        data: {
          userId: admin.id,
          action: 'admin.document_rejected',
          targetType: 'Document',
          targetId: id,
          metadata: { reason: body.reason },
        },
      })
      .catch(() => {});

    return updated;
  }

  @Put(':id/hide')
  @ApiOperation({ summary: 'Hide or unhide a public document' })
  async hide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: HideDocumentDto,
    @CurrentUser() admin: AuthenticatedAdmin,
  ): Promise<{ id: string; status: DocumentStatus; moderationReason: string | null; updatedAt: Date }> {
    const existing = await this.prisma.document.findUnique({
      where: { id, visibility: DocumentVisibility.PUBLIC },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Document not found');

    const status = body.hidden ? DocumentStatus.HIDDEN : DocumentStatus.ACTIVE;
    const updated = await this.prisma.document.update({
      where: { id },
      data: { status },
    });

    void this.prisma.auditLog
      .create({
        data: {
          userId: admin.id,
          action: body.hidden ? 'admin.document_hidden' : 'admin.document_unhidden',
          targetType: 'Document',
          targetId: id,
          metadata: { status, reason: body.reason ?? null },
        },
      })
      .catch(() => {});

    return {
      id: updated.id,
      status: updated.status,
      moderationReason: body.reason ?? null,
      updatedAt: updated.updatedAt,
    };
  }
}
