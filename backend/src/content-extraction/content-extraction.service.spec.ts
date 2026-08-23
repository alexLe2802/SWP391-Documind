import { ContentExtractionService } from './content-extraction.service';
import {
  DocumentVisibility,
  ExtractionStatus,
  ModerationStatus,
  RoleName,
} from '../generated/prisma/client';
import { UploadedContentFile } from './interfaces/uploaded-file.interface';

interface UpdateManyArgs {
  where: {
    documentId: string;
    jobId: string;
    OR?: unknown[];
    extractionStatus?: ExtractionStatus;
    retryCount?: { lt: number };
    updatedAt?: { lte: Date };
  };
  data: Record<string, unknown>;
}

interface FindManyArgs {
  where?: {
    OR?: Array<{
      extractionStatus?: ExtractionStatus;
      retryCount?: { lt: number };
      updatedAt?: { lte: Date };
    }>;
  };
}

describe('ContentExtractionService', () => {
  const pdfExtractor = {
    extract: jest.fn<Promise<string>, [Buffer]>(),
  };
  const docxExtractor = {
    extract: jest.fn<Promise<string>, [Buffer]>(),
  };
  const pptxExtractor = {
    extract: jest.fn<Promise<string>, [Buffer]>(),
  };
  const xlsxExtractor = {
    extract: jest.fn<Promise<string>, [Buffer]>(),
  };
  const prisma = {
    document: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    documentContent: {
      findMany: jest.fn<Promise<unknown[]>, [FindManyArgs?]>(),
      findUnique: jest.fn(),
      updateMany: jest.fn<Promise<{ count: number }>, [UpdateManyArgs]>(),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  let queueProcessor:
    | ((item: { jobId: string; documentId: string }) => Promise<void>)
    | undefined;
  const extractionQueue = {
    registerProcessor: jest.fn(
      (
        processor: (item: {
          jobId: string;
          documentId: string;
        }) => Promise<void>,
      ) => {
        queueProcessor = processor;
      },
    ),
    enqueue: jest.fn<void, [{ jobId: string; documentId: string }]>((item) => {
      void queueProcessor?.(item);
    }),
  };
  const documentContentService = {
    requestExtraction: jest.fn(),
    getContent: jest.fn(),
    getExtractionStatus: jest.fn(),
  };
  const storage = {
    getObjectBuffer: jest.fn<Promise<Buffer>, [string]>(),
  };
  const geminiService = {
    generateEmbedding: jest
      .fn<Promise<number[]>, [string]>()
      .mockResolvedValue(new Array(768).fill(0)),
  };
  const moderationScanner = {
    scan: jest.fn().mockReturnValue({
      flag: 'NORMAL',
      priority: 2,
      matchedKeywords: [],
      matchedContexts: [],
    }),
  };
  const configService = {
    get: jest.fn<number | undefined, [string]>((key: string) =>
      key === 'EXTRACTION_TIMEOUT_MS'
        ? 120_000
        : key === 'EXTRACTION_LEASE_TIMEOUT_MS'
          ? 600_000
          : undefined,
    ),
  };
  const notifications = { create: jest.fn() };
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    role: { name: RoleName.USER },
  };

  let service: ContentExtractionService;

  beforeEach(() => {
    jest.clearAllMocks();
    queueProcessor = undefined;
    prisma.documentContent.findMany.mockResolvedValue([]);
    prisma.documentContent.findUnique.mockResolvedValue(null);
    service = new ContentExtractionService(
      pdfExtractor as never,
      docxExtractor as never,
      pptxExtractor as never,
      xlsxExtractor as never,
      prisma as never,
      documentContentService as never,
      extractionQueue as never,
      storage as never,
      geminiService as never,
      moderationScanner as never,
      configService as never,
      notifications as never,
    );
  });

  it('does not enqueue an already-processing job from an API request', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    documentContentService.requestExtraction.mockResolvedValue({
      jobId,
      documentId,
      extractionStatus: ExtractionStatus.PROCESSING,
    });
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      title: 'Recovered document',
      fileName: 'recovered.pdf',
      fileType: 'pdf',
    });
    pdfExtractor.extract.mockResolvedValue('Recovered text');
    const processSpy = jest
      .spyOn(service, 'processExtraction')
      .mockResolvedValue(undefined);

    await service.startExtraction(documentId, user as never);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(extractionQueue.enqueue).not.toHaveBeenCalled();
    expect(processSpy).not.toHaveBeenCalled();
  });

  it('recovers pending jobs but leaves a fresh processing lease alone', async () => {
    prisma.documentContent.findMany.mockResolvedValue([
      {
        documentId: '22222222-2222-4222-8222-222222222222',
        jobId: '33333333-3333-4333-8333-333333333333',
        extractionStatus: ExtractionStatus.PENDING,
      },
    ]);

    await service.recoverQueuedExtractions();

    const [findManyArgs] = prisma.documentContent.findMany.mock.calls[0];
    const recoveryClauses = findManyArgs?.where?.OR ?? [];
    expect(recoveryClauses[0]).toEqual({
      extractionStatus: ExtractionStatus.PENDING,
    });
    expect(recoveryClauses[1]?.extractionStatus).toBe(
      ExtractionStatus.PROCESSING,
    );
    expect(recoveryClauses[1]?.updatedAt?.lte).toBeInstanceOf(Date);
    expect(extractionQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(extractionQueue.enqueue).toHaveBeenCalledWith({
      documentId: '22222222-2222-4222-8222-222222222222',
      jobId: '33333333-3333-4333-8333-333333333333',
      extractionStatus: ExtractionStatus.PENDING,
    });
  });

  it('reclaims a stale processing lease with a new job identity', async () => {
    const documentId = '44444444-4444-4444-8444-444444444444';
    const staleJobId = '55555555-5555-4555-8555-555555555555';
    prisma.documentContent.findMany.mockResolvedValue([
      {
        documentId,
        jobId: staleJobId,
        extractionStatus: ExtractionStatus.PROCESSING,
      },
    ]);
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });

    await service.recoverQueuedExtractions();

    const reclaim = prisma.documentContent.updateMany.mock.calls[0]?.[0];
    expect(reclaim.where).toMatchObject({
      documentId,
      jobId: staleJobId,
      extractionStatus: ExtractionStatus.PROCESSING,
    });
    expect(reclaim.where.updatedAt?.lte).toBeInstanceOf(Date);
    expect(reclaim.data).toMatchObject({
      extractionStatus: ExtractionStatus.PENDING,
      progress: 0,
    });
    expect(reclaim.data.jobId).not.toBe(staleJobId);
    expect(extractionQueue.enqueue).toHaveBeenCalledWith({
      documentId,
      jobId: reclaim.data.jobId,
    });
  });

  it('creates a new job identity before retrying a failed extraction', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const failedJobId = '33333333-3333-4333-8333-333333333333';
    prisma.documentContent.findMany.mockResolvedValue([
      {
        documentId,
        jobId: failedJobId,
        extractionStatus: ExtractionStatus.FAILED,
      },
    ]);
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });

    await service.recoverQueuedExtractions();

    const retryUpdate = prisma.documentContent.updateMany.mock.calls[0]?.[0];
    expect(retryUpdate.where).toEqual({
      documentId,
      jobId: failedJobId,
      extractionStatus: ExtractionStatus.FAILED,
      retryCount: { lt: 3 },
    });
    expect(retryUpdate.data).toMatchObject({
      extractionStatus: ExtractionStatus.PENDING,
      progress: 0,
      errorCode: null,
      errorMessage: null,
    });
    expect(retryUpdate.data.jobId).not.toBe(failedJobId);
    expect(extractionQueue.enqueue).toHaveBeenCalledWith({
      documentId,
      jobId: retryUpdate.data.jobId,
    });
  });

  it('does not recover failed jobs that already reached the retry limit', async () => {
    prisma.documentContent.findMany.mockResolvedValue([]);

    await service.recoverQueuedExtractions();

    const [findManyArgs] = prisma.documentContent.findMany.mock.calls[0];
    expect(findManyArgs?.where?.OR).toEqual(
      expect.arrayContaining([
        {
          extractionStatus: ExtractionStatus.FAILED,
          retryCount: { lt: 3 },
        },
      ]),
    );
    expect(prisma.documentContent.updateMany).not.toHaveBeenCalled();
    expect(extractionQueue.enqueue).not.toHaveBeenCalled();
  });

  it('returns PENDING and extracts uploaded object bytes from R2', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    documentContentService.requestExtraction.mockResolvedValue({
      jobId,
      documentId,
      extractionStatus: ExtractionStatus.PENDING,
    });
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      title: 'Uploaded document',
      fileName: 'notes.pdf',
      fileType: 'application/pdf',
      fileSize: BigInt(42),
      storagePath: 'users/owner-id/notes.pdf',
    });
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    storage.getObjectBuffer.mockResolvedValue(Buffer.from('pdf'));
    pdfExtractor.extract.mockResolvedValue('Extracted text from R2');

    await expect(
      service.startExtraction(documentId, user as never),
    ).resolves.toEqual({
      jobId,
      documentId,
      extractionStatus: ExtractionStatus.PENDING,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const processingUpdate = prisma.documentContent.updateMany.mock.calls[0][0];
    expect(processingUpdate.where).toEqual(
      expect.objectContaining({ documentId, jobId }),
    );
    expect(processingUpdate.data).toEqual({
      extractionStatus: ExtractionStatus.PROCESSING,
      progress: 10,
      errorCode: null,
      errorMessage: null,
    });
    const completedUpdate = prisma.documentContent.updateMany.mock.calls[1][0];
    expect(completedUpdate.where).toEqual({ documentId, jobId });
    expect(completedUpdate.data).toMatchObject({
      extractionStatus: ExtractionStatus.COMPLETED,
      progress: 100,
      extractedText: 'Extracted text from R2',
    });
    expect(storage.getObjectBuffer).toHaveBeenCalledWith(
      'users/owner-id/notes.pdf',
    );
    expect(pdfExtractor.extract).toHaveBeenCalledWith(
      Buffer.from('pdf'),
      'notes.pdf',
    );
    expect(typeof completedUpdate.data.contentSummary).toBe('string');
    expect(completedUpdate.data.extractedAt).toBeInstanceOf(Date);
  });

  it('persists FAILED when background extraction throws', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    prisma.documentContent.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findUnique.mockRejectedValue(new Error('Storage failed'));

    await service.processExtraction(documentId, jobId);

    const failedUpdate =
      prisma.documentContent.updateMany.mock.calls.at(-1)?.[0];
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.where).toEqual({ documentId, jobId });
    expect(failedUpdate?.data).toMatchObject({
      extractionStatus: ExtractionStatus.FAILED,
      progress: 100,
      retryCount: { increment: 1 },
      errorCode: 'EXTRACTION_FAILED',
      errorMessage: 'Storage failed',
    });
    expect(failedUpdate?.data.extractedAt).toBeInstanceOf(Date);
    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: documentId },
      data: {
        extractionStatus: ExtractionStatus.FAILED,
        moderationFlag: 'SCAN_FAILED',
        moderationPriority: 1,
        matchedKeywords: [],
        matchedContexts: [],
      },
    });
  });

  it('redacts credentials and stack details from persisted extraction errors', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    prisma.documentContent.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findUnique.mockRejectedValue(
      new Error(
        'Storage request failed: https://r2.example/file?X-Amz-Credential=SECRET_VALUE\n    at StorageClient.getObject (storage.ts:42:1)',
      ),
    );

    await service.processExtraction(documentId, jobId);

    const failedUpdate =
      prisma.documentContent.updateMany.mock.calls.at(-1)?.[0];
    expect(failedUpdate?.data.errorMessage).toBe(
      'Storage request failed: [REDACTED_URL]',
    );
    expect(failedUpdate?.data.qualityDetails).toEqual([
      'Storage request failed: [REDACTED_URL]',
    ]);
    expect(JSON.stringify(failedUpdate?.data)).not.toContain('SECRET_VALUE');
    expect(JSON.stringify(failedUpdate?.data)).not.toContain('storage.ts');
  });

  it('stops cleanly when the document is deleted during extraction', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    prisma.documentContent.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.document.update.mockRejectedValueOnce(
      Object.assign(new Error('Record to update not found'), { code: 'P2025' }),
    );

    await expect(
      service.processExtraction(documentId, jobId),
    ).resolves.toBeUndefined();

    expect(prisma.documentContent.updateMany).toHaveBeenCalledTimes(2);
    expect(storage.getObjectBuffer).not.toHaveBeenCalled();
    expect(pdfExtractor.extract).not.toHaveBeenCalled();
    expect(prisma.document.update).toHaveBeenCalledTimes(1);
  });

  it('fails a stalled storage read with a stable extraction timeout', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    configService.get.mockReturnValueOnce(1);
    prisma.documentContent.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      title: 'Large document',
      fileName: 'large.pdf',
      fileType: 'application/pdf',
      fileSize: BigInt(10_000_000),
      storagePath: 'users/owner/large.pdf',
    });
    storage.getObjectBuffer.mockImplementation(
      () => new Promise<Buffer>(() => undefined),
    );

    const outcome = await Promise.race([
      service.processExtraction(documentId, jobId).then(() => 'finished'),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve('still-processing'), 50),
      ),
    ]);

    expect(outcome).toBe('finished');
    const failedUpdate =
      prisma.documentContent.updateMany.mock.calls.at(-1)?.[0];
    expect(failedUpdate?.data).toMatchObject({
      extractionStatus: ExtractionStatus.FAILED,
      progress: 100,
      errorCode: 'EXTRACTION_TIMEOUT',
      errorMessage: 'Document extraction timed out',
    });
  });

  it('persists COMPLETED content when file bytes are available', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    const file: UploadedContentFile = {
      originalname: 'notes.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
    };
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      title: 'Notes',
      fileName: file.originalname,
      fileType: 'pdf',
    });
    pdfExtractor.extract.mockResolvedValue('Extracted PDF text');

    await service.processExtraction(documentId, jobId, file);

    const completedUpdate =
      prisma.documentContent.updateMany.mock.calls.at(-1)?.[0];
    expect(completedUpdate).toBeDefined();
    expect(completedUpdate?.where).toEqual({ documentId, jobId });
    expect(completedUpdate?.data).toMatchObject({
      extractedText: 'Extracted PDF text',
      contentSummary: 'Extracted PDF text',
      extractionStatus: ExtractionStatus.COMPLETED,
      progress: 100,
      errorCode: null,
      errorMessage: null,
    });
    expect(completedUpdate?.data.extractedAt).toBeInstanceOf(Date);
    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: documentId },
      data: {
        extractionStatus: ExtractionStatus.COMPLETED,
        moderationFlag: 'NORMAL',
        moderationPriority: 2,
        matchedKeywords: [],
        matchedContexts: [],
      },
    });
  });

  it('persists moderation flags from extracted text without failing extraction', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    moderationScanner.scan.mockReturnValueOnce({
      flag: 'FLAGGED',
      priority: 0,
      matchedKeywords: ['malware'],
      matchedContexts: [
        {
          keyword: 'malware',
          excerpt: 'Academic discussion mentioning malware in context.',
        },
      ],
    });
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      ownerId: user.id,
      title: 'Security Notes',
      fileName: 'security.pdf',
      fileType: 'pdf',
      visibility: DocumentVisibility.PUBLIC,
    });
    pdfExtractor.extract.mockResolvedValue(
      'Academic discussion mentioning malware in context.',
    );

    await service.processExtraction(documentId, jobId, {
      originalname: 'security.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
    });

    const updateManyCalls = prisma.documentContent.updateMany.mock.calls;
    const completedUpdate = updateManyCalls.at(-1)?.[0];
    expect(completedUpdate?.where).toEqual({ documentId, jobId });
    expect(completedUpdate?.data).toMatchObject({
      extractionStatus: ExtractionStatus.COMPLETED,
      extractedText: 'Academic discussion mentioning malware in context.',
    });
    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: documentId },
      data: {
        extractionStatus: ExtractionStatus.COMPLETED,
        moderationStatus: ModerationStatus.PENDING,
        moderationFlag: 'FLAGGED',
        moderationPriority: 0,
        matchedKeywords: ['malware'],
        matchedContexts: [
          {
            keyword: 'malware',
            excerpt: 'Academic discussion mentioning malware in context.',
          },
        ],
      },
    });
    expect(notifications.create).toHaveBeenCalledWith({
      userId: user.id,
      type: 'DOCUMENT_PENDING_REVIEW',
      title: 'Chờ câu trả lời của admin',
      message:
        'Tài liệu “Security Notes” đã bị cắm cờ và được gửi cho admin kiểm duyệt. Vui lòng chờ câu trả lời của admin.',
      documentId,
    });
  });

  it('keeps a clean public document pending after extraction', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      title: 'Ordinary lecture notes',
      fileName: 'lecture.pdf',
      fileType: 'pdf',
      visibility: DocumentVisibility.PUBLIC,
    });
    pdfExtractor.extract.mockResolvedValue('Ordinary academic content');

    await service.processExtraction(documentId, jobId, {
      originalname: 'lecture.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
    });

    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: documentId },
      data: {
        extractionStatus: ExtractionStatus.COMPLETED,
        moderationStatus: ModerationStatus.PENDING,
        moderationFlag: 'NORMAL',
        moderationPriority: 2,
        matchedKeywords: [],
        matchedContexts: [],
      },
    });
  });

  it('serializes generated embeddings as pgvector input', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    const embedding = new Array(768).fill(0.25);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      title: 'Vector Notes',
      fileName: 'vector.pdf',
      fileType: 'pdf',
    });
    pdfExtractor.extract.mockResolvedValue('A short vectorized document');

    await service.processExtraction(documentId, jobId, {
      originalname: 'vector.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
    });

    const executeRawCalls = prisma.$executeRaw.mock.calls as unknown[][];
    const insertCall = executeRawCalls[1];
    expect(insertCall).toBeDefined();
    expect(insertCall).toContain(JSON.stringify(embedding));
  });

  it('chunks long tables without splitting rows and repeats table context', () => {
    const text = [
      '[SECTION: Project Work Plan]',
      '[TABLE: Table 1]',
      'Task | Owner | Due date | Status',
      'Collect requirements | An | 2026-07-01 | Done',
      'Build prototype | Binh | 2026-07-15 | In progress',
      'Review release | Chi | 2026-07-30 | Pending',
      'Prepare training | Dung | 2026-08-05 | Not started',
      'Publish report | Ha | 2026-08-12 | Blocked',
    ].join('\n');

    const chunks = (
      service as unknown as {
        splitIntoSemanticChunks(
          text: string,
          chunkSize: number,
          chunkOverlap: number,
        ): string[];
      }
    ).splitIntoSemanticChunks(text, 190, 50);

    const prototypeChunk = chunks.find((chunk) =>
      chunk.includes('Build prototype | Binh | 2026-07-15 | In progress'),
    );
    expect(prototypeChunk).toBeDefined();
    expect(prototypeChunk).toContain('[SECTION: Project Work Plan]');
    expect(prototypeChunk).toContain('[TABLE: Table 1]');
    expect(prototypeChunk).toContain('Task | Owner | Due date | Status');
    expect(prototypeChunk).not.toMatch(/Build prototype \| Binh$/);

    const reportChunk = chunks.find((chunk) =>
      chunk.includes('Publish report | Ha | 2026-08-12 | Blocked'),
    );
    expect(reportChunk).toContain('[SECTION: Project Work Plan]');
    expect(reportChunk).toContain('[TABLE: Table 1]');
    expect(reportChunk).toContain('Task | Owner | Due date | Status');
  });

  it('keeps page, slide, and sheet markers with their related chunks', () => {
    const text = [
      '[PAGE: 2]',
      'Enable TCP/IP and set port 1433.',
      '[SLIDE: 4]',
      '[TITLE: Deployment Checklist]',
      'Restart SQL Server service.',
      '[SHEET: Ports]',
      '[ROW: 1] Name | Port',
      '[ROW: 2] SQL Server | 1433',
    ].join('\n');

    const chunks = (
      service as unknown as {
        splitIntoSemanticChunks(
          text: string,
          chunkSize: number,
          chunkOverlap: number,
        ): string[];
      }
    ).splitIntoSemanticChunks(text, 80, 20);

    expect(chunks.some((chunk) => chunk.includes('[PAGE: 2]'))).toBe(true);
    expect(
      chunks.some(
        (chunk) =>
          chunk.includes('[SLIDE: 4]') &&
          chunk.includes('Restart SQL Server service.'),
      ),
    ).toBe(true);
    expect(
      chunks.some(
        (chunk) =>
          chunk.includes('[SHEET: Ports]') &&
          chunk.includes('[ROW: 2] SQL Server | 1433'),
      ),
    ).toBe(true);
  });

  it('retries transient embedding failures and keeps extracted content completed', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    geminiService.generateEmbedding.mockRejectedValueOnce(
      new Error('Embedding quota exceeded'),
    );
    prisma.documentContent.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.update.mockResolvedValue({});
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      title: 'Fallback Notes',
      fileName: 'fallback.pdf',
      fileType: 'pdf',
    });
    pdfExtractor.extract.mockResolvedValue(
      'Text remains searchable by keyword',
    );

    await service.processExtraction(documentId, jobId, {
      originalname: 'fallback.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
    });

    const extractionStatuses = prisma.documentContent.updateMany.mock.calls.map(
      ([args]) => args.data.extractionStatus,
    );
    expect(extractionStatuses).not.toContain(ExtractionStatus.FAILED);
    expect(prisma.document.update).toHaveBeenLastCalledWith({
      where: { id: documentId },
      data: {
        extractionStatus: ExtractionStatus.COMPLETED,
        moderationFlag: 'NORMAL',
        moderationPriority: 2,
        matchedKeywords: [],
        matchedContexts: [],
      },
    });
    expect(geminiService.generateEmbedding).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('delegates document content and status reads', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    documentContentService.getContent.mockResolvedValue({ documentId });
    documentContentService.getExtractionStatus.mockResolvedValue({
      documentId,
    });

    await service.getDocumentContent(documentId, user as never);
    await service.getExtractionStatus(documentId, user as never);

    expect(documentContentService.getContent).toHaveBeenCalledWith(
      documentId,
      user,
    );
    expect(documentContentService.getExtractionStatus).toHaveBeenCalledWith(
      documentId,
      user,
    );
  });

  it('extracts PDF text through the PDF extractor', async () => {
    pdfExtractor.extract.mockResolvedValue('PDF body text');

    const file: UploadedContentFile = {
      originalname: 'sample.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
    };
    const result = await service.extractFromFile(file);

    expect(pdfExtractor.extract).toHaveBeenCalled();
    expect(result.extractionStatus).toBe('COMPLETED');
    expect(result.extractedText).toBe('PDF body text');
    expect(result.contentSummary).toContain('PDF body text');
  });

  it('removes NUL bytes from extracted text before PostgreSQL persistence', async () => {
    pdfExtractor.extract.mockResolvedValue('Valid\u0000 PDF\u0000 body');

    const result = await service.extractFromFile({
      originalname: 'nul-bytes.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf'),
    });

    expect(result.extractionStatus).toBe('COMPLETED');
    expect(result.extractedText).toBe('Valid PDF body');
    expect(result.contentSummary).toBe('Valid PDF body');
    expect(result.extractedText).not.toContain('\u0000');
  });

  it('extracts DOCX text through the DOCX extractor', async () => {
    docxExtractor.extract.mockResolvedValue('DOCX body text');

    const file: UploadedContentFile = {
      originalname: 'sample.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx'),
    };
    const result = await service.extractFromFile(file);

    expect(docxExtractor.extract).toHaveBeenCalled();
    expect(result.extractionStatus).toBe('COMPLETED');
  });

  it('extracts PPTX and XLSX text from file bytes', async () => {
    pptxExtractor.extract.mockResolvedValue('Extracted PPTX text');
    xlsxExtractor.extract.mockResolvedValue('Extracted XLSX text');

    const pptxFile: UploadedContentFile = {
      originalname: 'slides.pptx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: Buffer.from('pptx'),
    };

    const xlsxFile: UploadedContentFile = {
      originalname: 'sheet.xlsx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('xlsx'),
    };

    const pptxResult = await service.extractFromFile(pptxFile);
    const xlsxResult = await service.extractFromFile(xlsxFile);

    expect(pptxExtractor.extract).toHaveBeenCalledWith(Buffer.from('pptx'));
    expect(xlsxExtractor.extract).toHaveBeenCalledWith(Buffer.from('xlsx'));
    expect(pptxResult.extractionStatus).toBe('COMPLETED');
    expect(xlsxResult.extractionStatus).toBe('COMPLETED');
  });

  it('returns FAILED when an extractor throws', async () => {
    pdfExtractor.extract.mockRejectedValue(new Error('Invalid PDF'));

    const result = await service.extractFromFile({
      originalname: 'broken.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('invalid'),
    });

    expect(result.extractionStatus).toBe('FAILED');
    expect(result.extractedText).toBe('');
    expect(result.errorMessage).toBe('Invalid PDF');
  });

  it.each([
    ['legacy.doc', 'application/msword'],
    ['legacy.ppt', 'application/vnd.ms-powerpoint'],
    ['legacy.xls', 'application/vnd.ms-excel'],
  ])(
    'returns FAILED instead of completed mock content when legacy extractor is unavailable for %s',
    async (originalname, mimetype) => {
      const result = await service.extractFromFile({
        originalname,
        mimetype,
        buffer: Buffer.from('legacy office bytes'),
      });

      expect(result.extractionStatus).toBe(ExtractionStatus.FAILED);
      expect(result.extractedText).toBe('');
      expect(result.errorMessage).toBe(
        'Legacy Office extractor is unavailable',
      );
    },
  );

  it('returns FAILED for unsupported file types', async () => {
    const result = await service.extractFromFile({
      originalname: 'notes.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('notes'),
    });

    expect(result.extractionStatus).toBe('FAILED');
    expect(result.fileType).toBe('unknown');
    expect(result.errorMessage).toBe('Unsupported file type');
    expect(pdfExtractor.extract).not.toHaveBeenCalled();
    expect(docxExtractor.extract).not.toHaveBeenCalled();
  });
});
