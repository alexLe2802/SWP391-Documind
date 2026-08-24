import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { GeminiService } from '../ai-chatbot/services/gemini.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { DocumentContentService } from '../document-content/document-content.service';
import { ExtractionQueueService } from '../document-content/extraction-queue.service';
import { DocumentContentResponseDto } from '../document-content/dto/document-content-response.dto';
import { ExtractionJobResponseDto } from '../document-content/dto/extraction-job-response.dto';
import { ExtractionStatusResponseDto } from '../document-content/dto/extraction-status-response.dto';
import {
  DocumentVisibility,
  ExtractionQuality,
  ExtractionStatus,
  ModerationStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ExtractionResult } from './interfaces/extraction-result.interface';
import { UploadedContentFile } from './interfaces/uploaded-file.interface';
import { DocxExtractorService } from './services/docx-extractor.service';
import { PdfExtractorService } from './services/pdf-extractor.service';
import { LegacyOfficeExtractorService } from './services/legacy-office-extractor.service';
import { PptxExtractorService } from './services/pptx-extractor.service';
import { XlsxExtractorService } from './services/xlsx-extractor.service';
import { ModerationScannerService } from './moderation-scanner.service';
import { NotificationsService } from '../notifications/notifications.service';

type DetectedFileType =
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'ppt'
  | 'pptx'
  | 'xls'
  | 'xlsx'
  | 'unknown';

class ExtractionTimeoutError extends Error {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor() {
    super('Document extraction timed out');
    this.name = 'ExtractionTimeoutError';
  }
}

@Injectable()
export class ContentExtractionService implements OnApplicationBootstrap {
  private static readonly MAX_RETRIES = 3;
  private readonly logger = new Logger(ContentExtractionService.name);

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly pdfExtractor: PdfExtractorService,
    private readonly docxExtractor: DocxExtractorService,
    private readonly pptxExtractor: PptxExtractorService,
    private readonly xlsxExtractor: XlsxExtractorService,
    private readonly prisma: PrismaService,
    private readonly documentContentService: DocumentContentService,
    private readonly extractionQueue: ExtractionQueueService,
    private readonly storage: StorageService,
    private readonly geminiService: GeminiService,
    private readonly moderationScanner: ModerationScannerService,
    private readonly configService: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly legacyOfficeExtractor?: LegacyOfficeExtractorService,
  ) {
    this.extractionQueue.registerProcessor((item) =>
      this.processExtraction(item.documentId, item.jobId),
    );
  }

  // Xử lý sự kiện application bootstrap.
  async onApplicationBootstrap(): Promise<void> {
    await this.recoverQueuedExtractions();
  }

  // Thực hiện chức năng recover queued extractions.
  async recoverQueuedExtractions(): Promise<void> {
    const staleBefore = new Date(
      Date.now() - this.getExtractionLeaseTimeoutMs(),
    );
    const jobs = await this.prisma.documentContent.findMany({
      where: {
        OR: [
          { extractionStatus: ExtractionStatus.PENDING },
          {
            extractionStatus: ExtractionStatus.PROCESSING,
            updatedAt: { lte: staleBefore },
          },
          {
            extractionStatus: ExtractionStatus.FAILED,
            retryCount: { lt: ContentExtractionService.MAX_RETRIES },
          },
        ],
      },
      select: {
        documentId: true,
        jobId: true,
        extractionStatus: true,
      },
      orderBy: { updatedAt: 'asc' },
    });

    for (const job of jobs) {
      if (job.extractionStatus === ExtractionStatus.FAILED) {
        const retryJobId = randomUUID();
        // Cập nhật các nội dung trích xuất trong database.
        const claimed = await this.prisma.documentContent.updateMany({
          where: {
            documentId: job.documentId,
            jobId: job.jobId,
            extractionStatus: ExtractionStatus.FAILED,
            retryCount: { lt: ContentExtractionService.MAX_RETRIES },
          },
          data: {
            jobId: retryJobId,
            extractionStatus: ExtractionStatus.PENDING,
            progress: 0,
            errorCode: null,
            errorMessage: null,
          },
        });
        if (claimed.count > 0) {
          this.extractionQueue.enqueue({
            documentId: job.documentId,
            jobId: retryJobId,
          });
        }
        continue;
      }

      if (job.extractionStatus === ExtractionStatus.PROCESSING) {
        const retryJobId = randomUUID();
        // Cập nhật các nội dung trích xuất trong database.
        const reclaimed = await this.prisma.documentContent.updateMany({
          where: {
            documentId: job.documentId,
            jobId: job.jobId,
            extractionStatus: ExtractionStatus.PROCESSING,
            updatedAt: { lte: staleBefore },
          },
          data: {
            jobId: retryJobId,
            extractionStatus: ExtractionStatus.PENDING,
            progress: 0,
            errorCode: null,
            errorMessage: null,
          },
        });
        if (reclaimed.count > 0) {
          this.extractionQueue.enqueue({
            documentId: job.documentId,
            jobId: retryJobId,
          });
        }
        continue;
      }

      this.extractionQueue.enqueue(job);
    }
  }

  // Thực hiện chức năng start extraction.
  async startExtraction(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<ExtractionJobResponseDto> {
    const job = await this.documentContentService.requestExtraction(
      documentId,
      user,
    );

    if (job.extractionStatus === ExtractionStatus.PENDING) {
      this.extractionQueue.enqueue({ jobId: job.jobId, documentId });
    }

    return job;
  }

  // Lấy dữ liệu tài liệu nội dung.
  getDocumentContent(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<DocumentContentResponseDto> {
    return this.documentContentService.getContent(documentId, user);
  }

  // Lấy dữ liệu extraction trạng thái.
  getExtractionStatus(
    documentId: string,
    user: AuthenticatedUser,
  ): Promise<ExtractionStatusResponseDto> {
    return this.documentContentService.getExtractionStatus(documentId, user);
  }

  // Xử lý extraction.
  async processExtraction(
    documentId: string,
    jobId: string,
    file?: UploadedContentFile,
  ): Promise<void> {
    try {
      // Cập nhật các nội dung trích xuất trong database.
      const processing = await this.prisma.documentContent.updateMany({
        where: {
          documentId,
          jobId,
          extractionStatus: ExtractionStatus.PENDING,
        },
        data: {
          extractionStatus: ExtractionStatus.PROCESSING,
          progress: 10,
          errorCode: null,
          errorMessage: null,
        },
      });

      if (processing.count === 0) {
        return;
      }

      const existingContent = await this.prisma.documentContent.findUnique({
        where: { documentId },
        select: {
          extractedText: true,
          contentSummary: true,
          extractedAt: true,
        },
      });
      if (existingContent?.extractedText) {
        await this.completeExistingExtraction(documentId, jobId, {
          extractedText: existingContent.extractedText,
          contentSummary: existingContent.contentSummary,
          extractedAt: existingContent.extractedAt,
        });
        return;
      }

      // Cập nhật tài liệu trong database.
      await this.prisma.document.update({
        where: { id: documentId },
        data: { extractionStatus: ExtractionStatus.PROCESSING },
      });

      const document = await this.prisma.document.findUnique({
        where: { id: documentId },
        select: {
          ownerId: true,
          title: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          storagePath: true,
          description: true,
          visibility: true,
        },
      });

      if (!document) {
        throw new Error('Document not found');
      }

      const extraction = file
        ? this.extractFromFile(file)
        : this.loadStoredDocumentFile(document).then((storedFile) =>
            this.extractFromFile(storedFile),
          );
      const result = await this.withExtractionTimeout(extraction);

      if (result.extractionStatus === ExtractionStatus.FAILED) {
        await this.persistFailure(
          documentId,
          jobId,
          'EXTRACTION_FAILED',
          result.errorMessage ?? 'Extraction failed',
        );
        return;
      }

      const completedAt = new Date(result.extractedAt);
      // Cập nhật các nội dung trích xuất trong database.
      const completed = await this.prisma.documentContent.updateMany({
        where: { documentId, jobId },
        data: {
          extractedText: result.extractedText,
          contentSummary: result.contentSummary,
          extractionStatus: result.extractionStatus,
          progress: 100,
          errorCode: null,
          errorMessage: null,
          extractedAt: completedAt,
          qualityStatus: result.qualityStatus,
          qualityDetails: result.qualityDetails,
        },
      });
      if (completed.count === 0) {
        return;
      }

      if (
        result.extractedText &&
        result.qualityStatus !== ExtractionQuality.UNREADABLE
      ) {
        try {
          await this.replaceVectorChunks(documentId, result.extractedText);
        } catch (error) {
          this.logger.warn(
            `Vector indexing skipped for document ${documentId}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }

      // The scanner only supplies risk metadata for the admin queue. It must
      // never approve a public document; approval is an explicit admin action.
      const moderationResult = this.moderationScanner.scan(
        [
          document.title,
          document.fileName,
          document.description,
          result.extractedText,
        ]
          .filter(Boolean)
          .join('\n'),
      );
      // Cập nhật tài liệu trong database.
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          extractionStatus: result.extractionStatus,
          ...(document.visibility === DocumentVisibility.PUBLIC
            ? {
                moderationStatus: ModerationStatus.PENDING,
              }
            : {}),
          ...this.toModerationData(moderationResult),
        },
      });
      if (
        document.visibility === DocumentVisibility.PUBLIC &&
        moderationResult.flag === 'FLAGGED'
      ) {
        await this.notifications.create({
          userId: document.ownerId,
          type: 'DOCUMENT_PENDING_REVIEW',
          title: 'Chờ câu trả lời của admin',
          message: `Tài liệu “${document.title}” đã bị cắm cờ và được gửi cho admin kiểm duyệt. Vui lòng chờ câu trả lời của admin.`,
          documentId,
        });
      }
    } catch (error) {
      await this.persistFailure(
        documentId,
        jobId,
        error instanceof ExtractionTimeoutError
          ? 'EXTRACTION_TIMEOUT'
          : 'EXTRACTION_FAILED',
        error instanceof Error ? error.message : 'Extraction failed',
      );
    }
  }

  // Xử lý from tệp.
  async extractFromFile(file: UploadedContentFile): Promise<ExtractionResult> {
    const fileType = this.detectFileType(file.originalname, file.mimetype);

    try {
      switch (fileType) {
        case 'pdf':
          return this.buildCompletedResult(
            file,
            fileType,
            await this.pdfExtractor.extract(file.buffer, file.originalname),
          );
        case 'docx':
          return this.buildCompletedResult(
            file,
            fileType,
            await this.docxExtractor.extract(file.buffer),
          );
        case 'pptx':
          return this.buildCompletedResult(
            file,
            fileType,
            await this.pptxExtractor.extract(file.buffer),
          );
        case 'xlsx':
          return this.buildCompletedResult(
            file,
            fileType,
            await this.xlsxExtractor.extract(file.buffer),
          );
        case 'doc':
        case 'ppt':
        case 'xls':
          return this.buildCompletedResult(
            file,
            fileType,
            await this.getLegacyOfficeExtractor().extract(
              file.buffer,
              file.originalname,
            ),
          );
        default:
          return this.buildFailedResult(
            file,
            fileType,
            'Unsupported file type',
          );
      }
    } catch (error) {
      return this.buildFailedResult(
        file,
        fileType,
        error instanceof Error ? error.message : 'Extraction failed',
      );
    }
  }

  // Lấy dữ liệu extraction lease timeout ms.
  private getExtractionLeaseTimeoutMs(): number {
    return (
      this.configService.get<number>('EXTRACTION_LEASE_TIMEOUT_MS') ?? 600_000
    );
  }

  // Kiểm tra điều kiện tải lên.
  async validateUpload(file: UploadedContentFile): Promise<void> {
    if (this.detectFileType(file.originalname, file.mimetype) === 'pdf') {
      await this.pdfExtractor.validateOcrPageLimit(file.buffer);
    }
  }

  // Thực hiện chức năng detect tệp type.
  private detectFileType(fileName: string, mimetype: string): DetectedFileType {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const normalizedMime = mimetype.toLowerCase();

    if (normalizedMime === 'application/pdf' || ext === 'pdf') {
      return 'pdf';
    }
    if (
      normalizedMime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      return 'docx';
    }
    if (normalizedMime === 'application/msword' || ext === 'doc') {
      return 'doc';
    }
    if (
      normalizedMime ===
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      ext === 'pptx'
    ) {
      return 'pptx';
    }
    if (normalizedMime === 'application/vnd.ms-powerpoint' || ext === 'ppt') {
      return 'ppt';
    }
    if (
      normalizedMime ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      ext === 'xlsx'
    ) {
      return 'xlsx';
    }
    if (normalizedMime === 'application/vnd.ms-excel' || ext === 'xls') {
      return 'xls';
    }
    return 'unknown';
  }

  // Chuyển đổi hoặc chuẩn hóa completed result.
  private buildCompletedResult(
    file: UploadedContentFile,
    fileType: string,
    extractedText: string,
  ): ExtractionResult {
    const result = this.buildResult(file, fileType, 'COMPLETED', extractedText);
    if (result.qualityStatus === ExtractionQuality.UNREADABLE) {
      return {
        ...result,
        extractionStatus: ExtractionStatus.FAILED,
        errorMessage:
          result.qualityDetails[0] ?? 'No readable text was extracted',
      };
    }

    return result;
  }

  // Chuyển đổi hoặc chuẩn hóa failed result.
  private buildFailedResult(
    file: UploadedContentFile,
    fileType: string,
    errorMessage: string,
  ): ExtractionResult {
    return {
      ...this.buildResult(file, fileType, 'FAILED', ''),
      errorMessage,
      qualityStatus: 'UNREADABLE',
      qualityDetails: [errorMessage],
    };
  }

  // Chuyển đổi hoặc chuẩn hóa result.
  private buildResult(
    file: UploadedContentFile,
    fileType: string,
    extractionStatus: ExtractionResult['extractionStatus'],
    extractedText: string,
  ): ExtractionResult {
    const normalizedText = this.normalizeText(extractedText ?? '');
    const quality = this.assessQuality(normalizedText);
    return {
      fileName: file.originalname,
      fileType,
      extractionStatus,
      extractedText: normalizedText,
      contentSummary: this.summarize(normalizedText),
      extractedAt: new Date().toISOString(),
      ...quality,
    };
  }

  // Lấy dữ liệu stored tài liệu tệp.
  private async loadStoredDocumentFile(document: {
    fileName: string;
    fileType: string;
    fileSize: bigint;
    storagePath: string;
  }): Promise<UploadedContentFile> {
    return {
      originalname: document.fileName,
      mimetype: document.fileType,
      size: Number(document.fileSize),
      buffer: await this.storage.getObjectBuffer(document.storagePath),
    };
  }

  // Thực hiện chức năng persist failure.
  private async persistFailure(
    documentId: string,
    jobId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const safeErrorMessage = this.sanitizeErrorMessage(errorMessage);
    // Cập nhật các nội dung trích xuất trong database.
    const failed = await this.prisma.documentContent.updateMany({
      where: { documentId, jobId },
      data: {
        extractionStatus: ExtractionStatus.FAILED,
        progress: 100,
        retryCount: { increment: 1 },
        errorCode,
        errorMessage: safeErrorMessage,
        qualityStatus: ExtractionQuality.UNREADABLE,
        qualityDetails: [safeErrorMessage],
        extractedAt: new Date(),
      },
    });
    if (failed.count === 0) {
      return;
    }

    // Cập nhật tài liệu trong database.
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        extractionStatus: ExtractionStatus.FAILED,
        moderationFlag: 'SCAN_FAILED',
        moderationPriority: 1,
        matchedKeywords: [],
        matchedContexts: [],
      },
    });
  }

  // Thực hiện chức năng sanitize lỗi tin nhắn.
  private sanitizeErrorMessage(errorMessage: string): string {
    const firstLine = errorMessage.split(/\r?\n/, 1)[0]?.trim();
    if (!firstLine) {
      return 'Extraction failed';
    }

    return firstLine
      .replace(/https?:\/\/\S+/gi, '[REDACTED_URL]')
      .replace(
        /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi,
        '[REDACTED]',
      )
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, '[REDACTED]')
      .replace(
        /\b[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*[=:]\s*\S+/g,
        '[REDACTED]',
      )
      .slice(0, 500);
  }

  // Thực hiện chức năng with extraction timeout.
  private async withExtractionTimeout<T>(promise: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new ExtractionTimeoutError()),
            this.getExtractionTimeoutMs(),
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // Lấy dữ liệu extraction timeout ms.
  private getExtractionTimeoutMs(): number {
    const configured = this.configService.get<number>('EXTRACTION_TIMEOUT_MS');
    return typeof configured === 'number' &&
      Number.isInteger(configured) &&
      configured > 0
      ? configured
      : 240_000;
  }

  // Chuyển đổi hoặc chuẩn hóa moderation dữ liệu.
  private toModerationData(
    result: ReturnType<ModerationScannerService['scan']>,
  ): {
    moderationFlag: 'NORMAL' | 'FLAGGED' | 'SCAN_FAILED';
    moderationPriority: number;
    matchedKeywords: string[];
    matchedContexts: Array<{ keyword: string; excerpt: string }>;
  } {
    return {
      moderationFlag: result.flag,
      moderationPriority: result.priority,
      matchedKeywords: result.matchedKeywords,
      matchedContexts: result.matchedContexts,
    };
  }

  // Chuyển đổi hoặc chuẩn hóa text.
  private normalizeText(text: string): string {
    return text
      .split(String.fromCharCode(0))
      .join('')
      .replace(/[ \t]+/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Thực hiện chức năng summarize.
  private summarize(text: string): string {
    if (!text) {
      return '';
    }
    return text.slice(0, 500);
  }

  // Thực hiện chức năng complete existing extraction.
  private async completeExistingExtraction(
    documentId: string,
    jobId: string,
    content: {
      extractedText: string;
      contentSummary: string | null;
      extractedAt: Date | null;
    },
  ): Promise<void> {
    try {
      await this.replaceVectorChunks(documentId, content.extractedText);
    } catch (error) {
      this.logger.warn(
        `Vector indexing skipped for document ${documentId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }

    // Cập nhật các nội dung trích xuất trong database.
    const completed = await this.prisma.documentContent.updateMany({
      where: { documentId, jobId },
      data: {
        contentSummary:
          content.contentSummary ?? this.summarize(content.extractedText),
        extractionStatus: ExtractionStatus.COMPLETED,
        progress: 100,
        errorCode: null,
        errorMessage: null,
        extractedAt: content.extractedAt ?? new Date(),
      },
    });
    if (completed.count === 0) {
      return;
    }

    // Cập nhật tài liệu trong database.
    await this.prisma.document.update({
      where: { id: documentId },
      data: { extractionStatus: ExtractionStatus.COMPLETED },
    });
  }

  // Thực hiện chức năng replace vector chunks.
  private async replaceVectorChunks(
    documentId: string,
    text: string,
  ): Promise<void> {
    const chunks = this.splitIntoSemanticChunks(text, 1000, 200).map(
      (content) => ({
        content,
        sourceLocator: this.extractSourceLocator(content),
      }),
    );
    const vectorizedChunks: Array<{
      content: string;
      vector: string;
      sourceLocator: string[];
    }> = [];

    const concurrency = 4;
    for (let start = 0; start < chunks.length; start += concurrency) {
      const batch = chunks.slice(start, start + concurrency);
      const results = await Promise.all(
        batch.map(async (chunk) => ({
          content: chunk.content,
          vector: JSON.stringify(
            await this.generateEmbeddingWithRetry(chunk.content),
          ),
          sourceLocator: chunk.sourceLocator,
        })),
      );
      vectorizedChunks.push(...results);
    }

    await this.prisma
      .$executeRaw`DELETE FROM document_chunks WHERE document_id = ${documentId}::uuid`;

    for (let i = 0; i < vectorizedChunks.length; i++) {
      const { content, vector, sourceLocator } = vectorizedChunks[i];

      await this.prisma.$executeRaw`
        INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding, source_locator)
        VALUES (
          gen_random_uuid(),
          ${documentId}::uuid,
          ${i},
          ${content},
          ${vector}::vector,
          ${JSON.stringify(sourceLocator)}::jsonb
        )
      `;
    }
  }

  // Thực hiện chức năng split into semantic chunks.
  private splitIntoSemanticChunks(
    text: string,
    chunkSize = 1000,
    chunkOverlap = 200,
  ): string[] {
    const lineChunks = this.splitIntoLineAwareChunks(text, chunkSize);
    if (lineChunks.length > 0) {
      return lineChunks;
    }

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start) {
          end = lastSpace;
        }
      }

      chunks.push(text.slice(start, end).trim());
      start = end - chunkOverlap;
      if (start < 0 || end >= text.length) {
        break;
      }
    }

    return chunks.filter((chunk) => chunk.length > 0);
  }

  // Thực hiện chức năng split into line aware chunks.
  private splitIntoLineAwareChunks(text: string, chunkSize: number): string[] {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length <= 1) {
      return [];
    }

    const chunks: string[] = [];
    let currentLines: string[] = [];
    let currentHeading = '';
    let currentTableHeader = '';
    let currentColumnHeader = '';

    for (const line of lines) {
      if (this.isChunkHeading(line)) {
        currentHeading = line;
        currentTableHeader = '';
        currentColumnHeader = '';
      }
      if (line.startsWith('[TABLE:')) {
        currentTableHeader = line;
        currentColumnHeader = '';
      } else if (
        currentTableHeader &&
        this.isTableRow(line) &&
        !currentColumnHeader
      ) {
        currentColumnHeader = line;
      }

      const nextLines = [...currentLines, line];
      const nextChunk = nextLines.join('\n');

      if (
        currentLines.length > 0 &&
        nextChunk.length > chunkSize &&
        !this.shouldKeepLineWithCurrentChunk(line, currentLines)
      ) {
        chunks.push(currentLines.join('\n').trim());
        currentLines = this.seedChunkWithContext(
          line,
          currentHeading,
          currentTableHeader,
          currentColumnHeader,
        );
      } else if (
        currentLines.length > 0 &&
        nextChunk.length > chunkSize &&
        this.shouldKeepLineWithCurrentChunk(line, currentLines)
      ) {
        currentLines.push(line);
        chunks.push(currentLines.join('\n').trim());
        currentLines = this.seedChunkWithContext(
          '',
          currentHeading,
          currentTableHeader,
          currentColumnHeader,
        );
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      chunks.push(currentLines.join('\n').trim());
    }

    return chunks.filter((chunk) => chunk.length > 0);
  }

  // Kiểm tra điều kiện keep line with hiện tại chunk.
  private shouldKeepLineWithCurrentChunk(
    line: string,
    currentLines: string[],
  ): boolean {
    return (
      this.isTableRow(line) &&
      (currentLines.some((currentLine) => currentLine.startsWith('[TABLE:')) ||
        currentLines.some((currentLine) => this.isChunkHeading(currentLine)))
    );
  }

  // Thực hiện chức năng seed chunk with context.
  private seedChunkWithContext(
    line: string,
    currentHeading: string,
    currentTableHeader: string,
    currentColumnHeader: string,
  ): string[] {
    const seed = [
      currentHeading,
      currentTableHeader,
      currentColumnHeader,
    ].filter(
      (contextLine, index, allLines) =>
        contextLine && allLines.indexOf(contextLine) === index,
    );

    if (line && !seed.includes(line)) {
      seed.push(line);
    }

    return seed;
  }

  // Kiểm tra điều kiện chunk heading.
  private isChunkHeading(line: string): boolean {
    return (
      /^\d+(?:\.\d+)*\.?\s+\S/.test(line) ||
      /^#{1,6}\s+\S/.test(line) ||
      /^\[(?:SECTION|PAGE|SLIDE|SHEET):/.test(line)
    );
  }

  // Kiểm tra điều kiện table row.
  private isTableRow(line: string): boolean {
    return (
      line.includes(' | ') ||
      line.startsWith('[TABLE:') ||
      line.startsWith('[ROW:')
    );
  }

  // Xử lý embedding with retry.
  private async generateEmbeddingWithRetry(text: string): Promise<number[]> {
    try {
      return await this.geminiService.generateEmbedding(text);
    } catch {
      return this.geminiService.generateEmbedding(text);
    }
  }

  // Thực hiện chức năng assess quality.
  private assessQuality(text: string): {
    qualityStatus: ExtractionResult['qualityStatus'];
    qualityDetails: string[];
  } {
    const withoutMarkers = text
      .replace(/\[(?:PAGE|SLIDE|SHEET|TABLE|ROW|SECTION|TITLE):[^\]]*\]/g, '')
      .replace(/\[NOTE: No selectable[^\]]*\]/g, '')
      .trim();
    const hasMeaningfulText = /[\p{L}\p{N}]/u.test(withoutMarkers);

    if (!hasMeaningfulText) {
      return {
        qualityStatus: 'UNREADABLE',
        qualityDetails: ['No readable text was extracted; OCR is required.'],
      };
    }

    if (/\[NOTE: No selectable[^\]]*\]/.test(text)) {
      return {
        qualityStatus: 'PARTIAL',
        qualityDetails: ['One or more pages contain no readable text.'],
      };
    }

    return { qualityStatus: 'READY', qualityDetails: [] };
  }

  // Xử lý nguồn locator.
  private extractSourceLocator(chunk: string): string[] {
    return [
      ...new Set(
        [
          ...chunk.matchAll(
            /\[(?:PAGE|SLIDE|SHEET|ROW|SECTION):\s*([^\]]+)\]/g,
          ),
        ].map((match) => match[0].slice(1, -1)),
      ),
    ];
  }

  // Lấy dữ liệu legacy office extractor.
  private getLegacyOfficeExtractor(): LegacyOfficeExtractorService {
    if (!this.legacyOfficeExtractor) {
      throw new Error('Legacy Office extractor is unavailable');
    }
    return this.legacyOfficeExtractor;
  }
}
