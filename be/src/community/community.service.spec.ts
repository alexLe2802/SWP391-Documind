import {
  DocumentStatus,
  DocumentVisibility,
  ModerationStatus,
  Prisma,
} from '../generated/prisma/client';
import { CommunityService } from './community.service';
import {
  CommunityDocumentQueryDto,
  CommunityDocumentFileType,
  CommunityDocumentSortBy,
  SortOrder,
} from './dto/community-document-query.dto';

describe('CommunityService', () => {
  const prisma = {
    document: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    savedDocument: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const auditLogService = {
    logSavePublicDocument: jest.fn(),
  };
  const storage = {
    createObjectPreviewUrl: jest.fn(),
  };
  const service = new CommunityService(
    prisma as never,
    auditLogService as never,
    storage as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => callback(prisma),
    );
  });

  describe('findOneDocument', () => {
    it('returns a public active document detail without auth', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-id',
        ownerId: 'owner-id',
        fileSize: BigInt(1024),
        extractionStatus: 'COMPLETED',
        content: { contentSummary: 'A summary' },
        savedBy: [],
      });

      const result = await service.findOneDocument('doc-id');

      const [[findFirstArgs]] = prisma.document.findFirst.mock.calls as Array<
        [
          {
            where: { id: string; visibility: string; status: string };
            include: {
              content: { select: { contentSummary: boolean } };
              savedBy: {
                where: { userId: string };
                select: { userId: boolean };
              };
            };
          },
        ]
      >;

      expect(findFirstArgs.where).toEqual({
        id: 'doc-id',
        visibility: DocumentVisibility.PUBLIC,
        moderationStatus: ModerationStatus.APPROVED,
        status: DocumentStatus.ACTIVE,
      });
      expect(findFirstArgs.include.content).toEqual({
        select: { contentSummary: true },
      });
      expect(findFirstArgs.include.savedBy).toEqual({
        where: { userId: '00000000-0000-0000-0000-000000000000' },
        select: { userId: true },
      });
      expect(result).toMatchObject({
        id: 'doc-id',
        fileSize: '1024',
        summary: 'A summary',
        saved: false,
        owned: false,
      });
      expect(result).not.toHaveProperty('content');
      expect(result).not.toHaveProperty('savedBy');
    });

    it('computes saved and owned for authenticated user', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-id',
        ownerId: 'user-id',
        fileSize: BigInt(512),
        extractionStatus: 'COMPLETED',
        content: { contentSummary: null },
        savedBy: [{ userId: 'user-id' }],
      });

      const result = await service.findOneDocument('doc-id', 'user-id');

      expect(result).toMatchObject({
        saved: true,
        owned: true,
      });
    });

    it('throws NotFoundException for missing or private documents', async () => {
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(service.findOneDocument('missing-id')).rejects.toThrow(
        'Community document not found',
      );
    });
  });

  describe('createPreviewUrl', () => {
    it('creates an inline preview URL for a public active community document', async () => {
      prisma.document.findFirst.mockResolvedValue({
        id: 'doc-id',
        storagePath: 'users/owner-id/lecture.pdf',
        fileType: 'application/pdf',
        fileName: 'lecture.pdf',
      });
      storage.createObjectPreviewUrl.mockResolvedValue({
        url: 'https://signed.example/preview',
        strategy: 'presigned',
        expiresAt: '2026-06-24T10:00:00.000Z',
      });
      prisma.document.update.mockResolvedValue({ id: 'doc-id' });

      await expect(service.createPreviewUrl('doc-id')).resolves.toEqual({
        url: 'https://signed.example/preview',
        strategy: 'presigned',
        expiresAt: '2026-06-24T10:00:00.000Z',
        contentType: 'application/pdf',
        fallbackToOfficeViewer: false,
      });

      expect(prisma.document.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'doc-id',
          visibility: DocumentVisibility.PUBLIC,
          moderationStatus: ModerationStatus.APPROVED,
          status: DocumentStatus.ACTIVE,
        },
        select: {
          id: true,
          storagePath: true,
          fileType: true,
          fileName: true,
        },
      });
      expect(storage.createObjectPreviewUrl).toHaveBeenCalledWith(
        'users/owner-id/lecture.pdf',
        'application/pdf',
      );
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-id' },
        data: { viewCount: { increment: 1 } },
      });
    });

    it('does not preview private or missing community documents', async () => {
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(service.createPreviewUrl('doc-id')).rejects.toThrow(
        'Community document not found',
      );
      expect(storage.createObjectPreviewUrl).not.toHaveBeenCalled();
      expect(prisma.document.update).not.toHaveBeenCalled();
    });
  });

  it('lists active public documents only', async () => {
    prisma.document.count.mockResolvedValue(1);
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-id',
        ownerId: 'owner-id',
        fileSize: BigInt(42),
        content: {
          contentSummary: 'Short public summary',
          extractedText: 'This should not be returned',
        },
        savedBy: [],
      },
    ]);

    const result = await service.findDocuments(new CommunityDocumentQueryDto());

    expect(prisma.document.count).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            visibility: DocumentVisibility.PUBLIC,
            moderationStatus: ModerationStatus.APPROVED,
            status: DocumentStatus.ACTIVE,
          },
        ],
      },
    });
    const [[findManyArgs]] = prisma.document.findMany.mock.calls as Array<
      [
        {
          include: {
            content: { select: { contentSummary: boolean } };
            savedBy: {
              where: { userId: string };
              select: { userId: boolean };
            };
          };
          take: number;
        },
      ]
    >;

    expect(findManyArgs.include.content).toEqual({
      select: { contentSummary: true },
    });
    expect(findManyArgs.include.savedBy).toEqual({
      where: { userId: '00000000-0000-0000-0000-000000000000' },
      select: { userId: true },
    });
    expect(findManyArgs.take).toBe(20);
    expect(result.items[0]).not.toHaveProperty('content');
    expect(result.items[0]).not.toHaveProperty('savedBy');
    expect(result.items[0]).toMatchObject({
      id: 'doc-id',
      fileSize: '42',
      summary: 'Short public summary',
      saved: false,
      owned: false,
    });
    expect(result.meta).toMatchObject({
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('runs count and list queries sequentially to avoid exhausting the database pool', async () => {
    let resolveCount!: (value: number) => void;
    prisma.document.count.mockReturnValue(
      new Promise<number>((resolve) => {
        resolveCount = resolve;
      }),
    );
    prisma.document.findMany.mockResolvedValue([]);

    const resultPromise = service.findDocuments(
      new CommunityDocumentQueryDto(),
    );

    await Promise.resolve();
    expect(prisma.document.findMany).not.toHaveBeenCalled();

    resolveCount(0);
    await resultPromise;

    expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
  });

  it('applies search, filters, sort, and pagination', async () => {
    prisma.document.count.mockResolvedValue(0);
    prisma.document.findMany.mockResolvedValue([]);

    await service.findDocuments(
      Object.assign(new CommunityDocumentQueryDto(), {
        q: 'calculus',
        fileType: CommunityDocumentFileType.PDF,
        subjectId: '11111111-1111-1111-1111-111111111111',
        categoryId: '22222222-2222-2222-2222-222222222222',
        tagIds: ['33333333-3333-3333-3333-333333333333'],
        sortBy: CommunityDocumentSortBy.DOWNLOAD_COUNT,
        sortOrder: SortOrder.ASC,
        page: 3,
        limit: 20,
      }),
    );

    const [[findManyArgs]] = prisma.document.findMany.mock.calls as Array<
      [
        {
          where: Prisma.DocumentWhereInput;
          orderBy: Prisma.DocumentOrderByWithRelationInput[];
          skip: number;
          take: number;
        },
      ]
    >;

    const andFilters = findManyArgs.where.AND as Prisma.DocumentWhereInput[];

    expect(andFilters).toEqual(
      expect.arrayContaining([
        {
          visibility: DocumentVisibility.PUBLIC,
          moderationStatus: ModerationStatus.APPROVED,
          status: DocumentStatus.ACTIVE,
        },
        { subjectId: '11111111-1111-1111-1111-111111111111' },
        { categoryId: '22222222-2222-2222-2222-222222222222' },
        {
          fileType: {
            contains: 'pdf',
            mode: 'insensitive',
          },
        },
        {
          tags: {
            some: {
              tagId: { in: ['33333333-3333-3333-3333-333333333333'] },
            },
          },
        },
      ]),
    );
    expect(andFilters.some((filter) => Array.isArray(filter.OR))).toBe(true);
    expect(findManyArgs).toMatchObject({
      orderBy: [{ downloadCount: 'asc' }, { id: 'desc' }],
      skip: 40,
      take: 20,
    });
  });

  it('computes saved and owned for authenticated community listings', async () => {
    prisma.document.count.mockResolvedValue(1);
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-id',
        ownerId: 'user-id',
        fileSize: BigInt(42),
        content: { contentSummary: null },
        savedBy: [{ userId: 'user-id' }],
      },
    ]);

    const result = await service.findDocuments(
      new CommunityDocumentQueryDto(),
      'user-id',
    );

    const [[findManyArgs]] = prisma.document.findMany.mock.calls as Array<
      [
        {
          include: {
            savedBy: {
              where: { userId: string };
              select: { userId: boolean };
            };
          };
        },
      ]
    >;

    expect(findManyArgs.include.savedBy).toEqual({
      where: { userId: 'user-id' },
      select: { userId: true },
    });
    expect(result.items[0]).toMatchObject({
      saved: true,
      owned: true,
    });
  });

  it('saves a public active document to my library without copying the file', async () => {
    const savedAt = new Date('2026-06-18T12:00:00.000Z');
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      ownerId: 'owner-id',
    });
    prisma.savedDocument.findUnique.mockResolvedValue(null);
    prisma.savedDocument.create.mockResolvedValue({
      id: 'saved-id',
      userId: 'user-id',
      documentId: 'doc-id',
      savedAt,
    });
    prisma.document.update.mockResolvedValue({ id: 'doc-id' });

    await expect(service.saveDocument('doc-id', 'user-id')).resolves.toEqual({
      documentId: 'doc-id',
      saved: true,
      savedAt,
    });
    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'doc-id',
        visibility: DocumentVisibility.PUBLIC,
        moderationStatus: ModerationStatus.APPROVED,
        status: DocumentStatus.ACTIVE,
      },
      select: { id: true, ownerId: true },
    });
    expect(prisma.savedDocument.create).toHaveBeenCalledWith({
      data: { userId: 'user-id', documentId: 'doc-id' },
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-id' },
      data: { saveCount: { increment: 1 } },
    });
    expect(auditLogService.logSavePublicDocument).toHaveBeenCalledWith(
      'user-id',
      'doc-id',
    );
  });

  it('returns the existing saved document without incrementing save count', async () => {
    const savedAt = new Date('2026-06-18T12:00:00.000Z');
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      ownerId: 'owner-id',
    });
    prisma.savedDocument.findUnique.mockResolvedValue({
      id: 'saved-id',
      userId: 'user-id',
      documentId: 'doc-id',
      savedAt,
    });

    await expect(service.saveDocument('doc-id', 'user-id')).resolves.toEqual({
      documentId: 'doc-id',
      saved: true,
      savedAt,
    });
    expect(prisma.savedDocument.create).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(auditLogService.logSavePublicDocument).not.toHaveBeenCalled();
  });

  it('does not save private or missing community documents', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(service.saveDocument('doc-id', 'user-id')).rejects.toThrow(
      'Community document not found',
    );
    expect(prisma.savedDocument.create).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(auditLogService.logSavePublicDocument).not.toHaveBeenCalled();
  });

  it('does not save a public document owned by the current user', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      ownerId: 'user-id',
    });

    await expect(service.saveDocument('doc-id', 'user-id')).rejects.toThrow(
      'Cannot save your own community document',
    );
    expect(prisma.savedDocument.create).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(auditLogService.logSavePublicDocument).not.toHaveBeenCalled();
  });
});
