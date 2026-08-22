import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  DocumentVisibility,
  ModerationFlag,
  ModerationStatus,
  Prisma,
  RoleName,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminDocumentsQueryDto } from './dto/admin-documents-query.dto';

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

    // Only public documents are subject to moderation review.
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
}
