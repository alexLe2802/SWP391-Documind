import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ExtractionStatus,
  RoleName,
  SourceType,
} from '../generated/prisma/client';
import { DocumentContentService } from './document-content.service';

interface MockDocumentContent {
  jobId: string;
  extractionStatus: ExtractionStatus;
  extractedText?: string | null;
  contentSummary?: string | null;
  extractedAt?: Date | null;
  progress?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  updatedAt?: Date;
}

interface MockDocument {
  id: string;
  ownerId: string;
  fileType: string;
  content: MockDocumentContent | null;
}

interface DocumentContentUpsertArgs {
  create: {
    sourceType: SourceType;
  };
}

describe('DocumentContentService', () => {
  const fileTypeSourceCases: ReadonlyArray<readonly [string, SourceType]> = [
    ['application/pdf', SourceType.PDF],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      SourceType.DOCX,
    ],
    [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      SourceType.PPTX,
    ],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      SourceType.EXCEL,
    ],
    ['application/msword', SourceType.DOC],
    ['application/vnd.ms-excel', SourceType.EXCEL],
  ];

  const prisma = {
    document: {
      findUnique: jest.fn<Promise<MockDocument | null>, [unknown]>(),
      update: jest.fn<Promise<Record<string, never>>, [unknown]>(),
    },
    documentContent: {
      upsert: jest.fn<
        Promise<MockDocumentContent>,
        [DocumentContentUpsertArgs]
      >(),
    },
    documentChunk: {
      deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
    },
  };
  const queue = {
    enqueue: jest.fn<void, [{ jobId: string; documentId: string }]>(),
  };
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    role: { name: RoleName.USER },
  };

  let service: DocumentContentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DocumentContentService(prisma as never, queue as never);
  });

  it('returns the active job without enqueueing a duplicate extraction', async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      ownerId: user.id,
      fileType: 'pdf',
      content: {
        jobId: '33333333-3333-4333-8333-333333333333',
        extractionStatus: ExtractionStatus.PROCESSING,
      },
    });

    await expect(
      service.requestExtraction(
        '22222222-2222-4222-8222-222222222222',
        user as never,
      ),
    ).resolves.toEqual({
      jobId: '33333333-3333-4333-8333-333333333333',
      documentId: '22222222-2222-4222-8222-222222222222',
      extractionStatus: ExtractionStatus.PROCESSING,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it.each(fileTypeSourceCases)(
    'stores %s documents with %s source type',
    async (fileType: string, sourceType: SourceType) => {
      prisma.document.findUnique.mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        ownerId: user.id,
        fileType,
        content: null,
      });
      prisma.documentContent.upsert.mockResolvedValue({
        jobId: '33333333-3333-4333-8333-333333333333',
        extractionStatus: ExtractionStatus.PENDING,
      });
      prisma.document.update.mockResolvedValue({});

      await service.requestExtraction(
        '22222222-2222-4222-8222-222222222222',
        user as never,
      );

      const upsertArgs = prisma.documentContent.upsert.mock.calls[0]?.[0];

      expect(upsertArgs?.create.sourceType).toBe(sourceType);
    },
  );

  it('clears existing vector chunks when re-queueing extraction', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      ownerId: user.id,
      fileType: 'pdf',
      content: {
        jobId: 'old-job',
        extractionStatus: ExtractionStatus.COMPLETED,
      },
    });
    prisma.documentContent.upsert.mockResolvedValue({
      jobId: '33333333-3333-4333-8333-333333333333',
      extractionStatus: ExtractionStatus.PENDING,
    });
    prisma.document.update.mockResolvedValue({});
    prisma.documentChunk.deleteMany.mockResolvedValue({ count: 3 });

    await service.requestExtraction(documentId, user as never);

    expect(prisma.documentChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId },
    });
    const queuedJob = queue.enqueue.mock.calls[0]?.[0];
    expect(queuedJob).toBeDefined();
    expect(typeof queuedJob.jobId).toBe('string');
    expect(queuedJob.documentId).toBe(documentId);
  });

  it('rejects access by a non-owner', async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      ownerId: '44444444-4444-4444-8444-444444444444',
      fileType: 'pdf',
      content: null,
    });

    await expect(
      service.getContent('22222222-2222-4222-8222-222222222222', user as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects extraction retry/start for a non-owner without creating a job', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      ownerId: '44444444-4444-4444-8444-444444444444',
      fileType: 'pdf',
      content: {
        jobId: '33333333-3333-4333-8333-333333333333',
        extractionStatus: ExtractionStatus.FAILED,
      },
    });

    await expect(
      service.requestExtraction(documentId, user as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.documentContent.upsert).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.documentChunk.deleteMany).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('rejects extraction status reads for a non-owner without leaking job details', async () => {
    const documentId = '22222222-2222-4222-8222-222222222222';
    prisma.document.findUnique.mockResolvedValue({
      id: documentId,
      ownerId: '44444444-4444-4444-8444-444444444444',
      fileType: 'pdf',
      content: {
        jobId: 'private-job-id',
        extractionStatus: ExtractionStatus.FAILED,
        progress: 100,
        errorCode: 'EXTRACTION_FAILED',
        errorMessage: 'Private extraction failure detail',
      },
    });

    await expect(
      service.getExtractionStatus(documentId, user as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.documentContent.upsert).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.documentChunk.deleteMany).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    [-25, 0],
    [50, 50],
    [125, 100],
  ])(
    'returns bounded extraction progress %s as %s without creating a new job',
    async (storedProgress, returnedProgress) => {
      const documentId = '22222222-2222-4222-8222-222222222222';
      const updatedAt = new Date('2026-07-21T00:00:00.000Z');
      prisma.document.findUnique.mockResolvedValue({
        id: documentId,
        ownerId: user.id,
        fileType: 'pdf',
        content: {
          jobId: '33333333-3333-4333-8333-333333333333',
          extractionStatus: ExtractionStatus.PROCESSING,
          progress: storedProgress,
          errorCode: null,
          errorMessage: null,
          updatedAt,
        },
      });

      await expect(
        service.getExtractionStatus(documentId, user as never),
      ).resolves.toMatchObject({
        documentId,
        jobId: '33333333-3333-4333-8333-333333333333',
        extractionStatus: ExtractionStatus.PROCESSING,
        progress: returnedProgress,
        updatedAt,
      });

      expect(prisma.documentContent.upsert).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
      expect(prisma.documentChunk.deleteMany).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    },
  );

  it('returns 404 for an unknown document', async () => {
    prisma.document.findUnique.mockResolvedValue(null);

    await expect(
      service.getExtractionStatus(
        '22222222-2222-4222-8222-222222222222',
        user as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
