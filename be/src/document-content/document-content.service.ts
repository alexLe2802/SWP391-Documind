import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  ExtractionStatus,
  Prisma,
  RoleName,
  SourceType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentContentResponseDto } from './dto/document-content-response.dto';
import { ExtractionJobResponseDto } from './dto/extraction-job-response.dto';
import { ExtractionStatusResponseDto } from './dto/extraction-status-response.dto';
import { ExtractionQueueService } from './extraction-queue.service';

const DOCUMENT_SOURCE_TYPE_BY_MIME_TYPE: Record<string, SourceType> = {
  'APPLICATION/PDF': SourceType.PDF,
  'APPLICATION/MSWORD': SourceType.DOC,
  'APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.WORDPROCESSINGML.DOCUMENT':
    SourceType.DOCX,
  'APPLICATION/VND.MS-EXCEL': SourceType.EXCEL,
  'APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.SPREADSHEETML.SHEET':
    SourceType.EXCEL,
  'APPLICATION/VND.OPENXMLFORMATS-OFFICEDOCUMENT.PRESENTATIONML.PRESENTATION':
    SourceType.PPTX,
};

@Injectable()
export class DocumentContentService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly extractionQueue: ExtractionQueueService,
  ) {}

  // Thực hiện chức năng yêu cầu extraction.
  async requestExtraction(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<ExtractionJobResponseDto> {
    const document = await this.getAuthorizedDocument(documentId, user);
    const current = document.content;

    if (
      current &&
      (current.extractionStatus === ExtractionStatus.PENDING ||
        current.extractionStatus === ExtractionStatus.PROCESSING)
    ) {
      return {
        jobId: current.jobId,
        documentId,
        extractionStatus: current.extractionStatus,
      };
    }

    const jobId = randomUUID();
    // Tạo mới hoặc cập nhật nội dung trích xuất trong database.
    const content = await this.prisma.documentContent.upsert({
      where: { documentId },
      create: {
        documentId,
        jobId,
        sourceType: this.toSourceType(document.fileType),
        extractionStatus: ExtractionStatus.PENDING,
      },
      update: {
        jobId,
        extractedText: null,
        contentSummary: null,
        extractionStatus: ExtractionStatus.PENDING,
        progress: 0,
        retryCount: 0,
        errorCode: null,
        errorMessage: null,
        extractedAt: null,
        qualityStatus: 'READY',
        qualityDetails: undefined,
      },
    });

    // Cập nhật tài liệu trong database.
    await this.prisma.document.update({
      where: { id: documentId },
      data: { extractionStatus: ExtractionStatus.PENDING },
    });
    // Xóa các đoạn nội dung tài liệu trong database.
    await this.prisma.documentChunk.deleteMany({
      where: { documentId },
    });
    this.extractionQueue.enqueue({ jobId, documentId });

    return {
      jobId: content.jobId,
      documentId,
      extractionStatus: content.extractionStatus,
    };
  }

  // Lấy dữ liệu nội dung.
  async getContent(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<DocumentContentResponseDto> {
    const document = await this.getAuthorizedDocument(documentId, user);
    const content = document.content;

    if (!content) {
      throw new NotFoundException('Document content not found');
    }

    return {
      documentId,
      extractedText: content.extractedText ?? undefined,
      contentSummary: content.contentSummary,
      extractionStatus: content.extractionStatus,
      extractedAt: content.extractedAt,
      qualityStatus: content.qualityStatus,
      qualityDetails: content.qualityDetails as string[] | null,
    };
  }

  // Lấy dữ liệu extraction trạng thái.
  async getExtractionStatus(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<ExtractionStatusResponseDto> {
    const document = await this.getAuthorizedDocument(documentId, user);
    const content = document.content;

    if (!content) {
      throw new NotFoundException('Extraction job not found');
    }

    return {
      documentId,
      jobId: content.jobId,
      extractionStatus: content.extractionStatus,
      progress: this.clampProgress(content.progress),
      errorCode: content.errorCode,
      errorMessage: content.errorMessage,
      updatedAt: content.updatedAt,
      qualityStatus: content.qualityStatus,
      qualityDetails: content.qualityDetails as string[] | null,
    };
  }

  // Lấy dữ liệu authorized tài liệu.
  private async getAuthorizedDocument(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<Prisma.DocumentGetPayload<{ include: { content: true } }>> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { content: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.ownerId !== user.id && user.role.name !== RoleName.ADMIN) {
      throw new ForbiddenException('Document access denied');
    }
    return document;
  }

  // Chuyển đổi hoặc chuẩn hóa nguồn type.
  private toSourceType(fileType: string): SourceType {
    const normalized = fileType.replace(/^\./, '').toUpperCase();
    const sourceType = DOCUMENT_SOURCE_TYPE_BY_MIME_TYPE[normalized];

    if (sourceType) {
      return sourceType;
    }

    return normalized in SourceType
      ? SourceType[normalized as keyof typeof SourceType]
      : SourceType.MOCK;
  }

  // Thực hiện chức năng clamp progress.
  private clampProgress(progress: number): number {
    if (progress < 0) {
      return 0;
    }

    if (progress > 100) {
      return 100;
    }

    return progress;
  }
}
