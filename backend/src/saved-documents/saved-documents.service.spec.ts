import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
  Prisma,
} from '../generated/prisma/client';
import { SavedDocumentsService } from './saved-documents.service';

describe('SavedDocumentsService', () => {
  const prisma = {
    savedDocument: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const service = new SavedDocumentsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists real saved documents for the current user', async () => {
    const savedAt = new Date('2026-06-18T12:00:00.000Z');
    prisma.savedDocument.count.mockResolvedValue(1);
    prisma.savedDocument.findMany.mockResolvedValue([
      {
        id: 'saved-id',
        savedAt,
        document: {
          id: 'doc-id',
          ownerId: 'owner-id',
          title: 'Calculus Notes',
          fileSize: BigInt(1024),
          extractionStatus: ExtractionStatus.COMPLETED,
          content: { contentSummary: 'Limits and derivatives' },
          savedBy: [{ userId: 'user-id' }],
        },
      },
    ]);

    const result = await service.findAll('user-id', {});

    expect(prisma.savedDocument.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        document: {
          AND: [
            {
              status: DocumentStatus.ACTIVE,
              OR: [
                {
                  visibility: DocumentVisibility.PUBLIC,
                  moderationStatus: 'APPROVED',
                },
                { ownerId: 'user-id' },
              ],
            },
          ],
        },
      },
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'doc-id',
        title: 'Calculus Notes',
        fileSize: '1024',
        aiStatus: ExtractionStatus.COMPLETED,
        summary: 'Limits and derivatives',
        saved: true,
        owned: false,
        savedAt,
      }),
    ]);
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it('returns an empty response when the user has no saved documents', async () => {
    prisma.savedDocument.count.mockResolvedValue(0);
    prisma.savedDocument.findMany.mockResolvedValue([]);

    await expect(service.findAll('user-id', {})).resolves.toEqual({
      items: [],
      meta: {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });

  it('applies filters, search, sort, and pagination', async () => {
    prisma.savedDocument.count.mockResolvedValue(0);
    prisma.savedDocument.findMany.mockResolvedValue([]);

    await service.findAll('user-id', {
      search: 'biology',
      subjectId: '11111111-1111-1111-1111-111111111111',
      categoryId: '22222222-2222-2222-2222-222222222222',
      fileType: 'PDF',
      aiStatus: ExtractionStatus.COMPLETED,
      sortBy: 'title',
      sortOrder: 'asc',
      page: 3,
      limit: 10,
    });

    const [[findManyArgs]] = prisma.savedDocument.findMany.mock.calls as Array<
      [
        {
          where: Prisma.SavedDocumentWhereInput;
          orderBy: Prisma.SavedDocumentOrderByWithRelationInput[];
          skip: number;
          take: number;
        },
      ]
    >;
    const documentFilters = findManyArgs.where.document
      ?.AND as Prisma.DocumentWhereInput[];

    expect(documentFilters).toEqual(
      expect.arrayContaining([
        { subjectId: '11111111-1111-1111-1111-111111111111' },
        { categoryId: '22222222-2222-2222-2222-222222222222' },
        { fileType: 'application/pdf' },
        { extractionStatus: ExtractionStatus.COMPLETED },
      ]),
    );
    expect(findManyArgs).toMatchObject({
      orderBy: [{ document: { title: 'asc' } }, { id: 'desc' }],
      skip: 20,
      take: 10,
    });
  });
});
