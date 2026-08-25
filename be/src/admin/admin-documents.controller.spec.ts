import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
  ModerationFlag,
  ModerationStatus,
} from '../generated/prisma/client';
import { AdminDocumentsController } from './admin-documents.controller';

describe('AdminDocumentsController', () => {
  const prisma = {
    document: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const auditLogService = {
    logDocumentHide: jest.fn(),
    logDocumentDelete: jest.fn(),
  };
  const notifications = { create: jest.fn() };
  const documentsService = { createPreviewUrl: jest.fn() };

  const controller = new AdminDocumentsController(
    prisma as never,
    auditLogService as never,
    notifications as never,
    documentsService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the same PDF conversion pipeline for admin previews', async () => {
    prisma.document.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
    documentsService.createPreviewUrl.mockResolvedValue({
      url: 'https://cdn.example/preview.pdf',
      contentType: 'application/pdf',
    });

    await expect(controller.preview('doc-1')).resolves.toEqual({
      url: 'https://cdn.example/preview.pdf',
      contentType: 'application/pdf',
    });
    expect(documentsService.createPreviewUrl).toHaveBeenCalledWith(
      'doc-1',
      'owner-1',
    );
  });

  it('lists documents with a minimal select payload', async () => {
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Lecture Notes',
        description: 'Chapter 1',
        fileName: 'lecture-1.pdf',
        fileType: 'application/pdf',
        fileSize: BigInt(4096),
        extractionStatus: 'COMPLETED',
        visibility: DocumentVisibility.PUBLIC,
        status: DocumentStatus.ACTIVE,
        moderationStatus: ModerationStatus.PENDING,
        moderationFlag: ModerationFlag.FLAGGED,
        rejectionReason: null,
        matchedKeywords: ['crack'],
        matchedContexts: [{ keyword: 'crack', excerpt: 'context' }],
        submittedAt: new Date('2026-06-20T00:00:00.000Z'),
        reviewedAt: null,
        reviewedBy: null,
        version: 1,
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
        updatedAt: new Date('2026-06-20T00:00:00.000Z'),
        owner: {
          id: 'user-1',
          fullName: 'Example User',
          email: 'user@example.com',
        },
        subject: {
          id: 'subject-1',
          code: 'MATH101',
          name: 'Mathematics',
        },
        category: {
          id: 'category-1',
          name: 'Lecture Notes',
        },
        tags: [{ tag: { id: 'tag-1', name: 'algebra' } }],
      },
    ]);
    prisma.document.count.mockResolvedValue(1);

    const result = await controller.findAll({
      page: 1,
      limit: 20,
    });

    expect(result.data).toEqual([
      {
        id: 'doc-1',
        title: 'Lecture Notes',
        description: 'Chapter 1',
        fileName: 'lecture-1.pdf',
        fileType: 'application/pdf',
        fileSize: '4096',
        subject: {
          id: 'subject-1',
          code: 'MATH101',
          name: 'Mathematics',
        },
        category: {
          id: 'category-1',
          name: 'Lecture Notes',
        },
        tags: [{ id: 'tag-1', name: 'algebra' }],
        aiStatus: 'COMPLETED',
        visibility: DocumentVisibility.PUBLIC,
        status: DocumentStatus.ACTIVE,
        moderationStatus: ModerationStatus.PENDING,
        moderationFlag: ModerationFlag.FLAGGED,
        rejectionReason: null,
        matchedKeywords: ['crack'],
        matchedContexts: [{ keyword: 'crack', excerpt: 'context' }],
        submittedAt: new Date('2026-06-20T00:00:00.000Z'),
        reviewedAt: null,
        reviewedBy: null,
        version: 1,
        moderationReason: null,
        owner: {
          id: 'user-1',
          fullName: 'Example User',
          email: 'user@example.com',
        },
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
        updatedAt: new Date('2026-06-20T00:00:00.000Z'),
      },
    ]);
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: { visibility: DocumentVisibility.PUBLIC },
      skip: 0,
      take: 20,
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
    });
  });

  it('filters public documents by AI status and searchable metadata', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.count.mockResolvedValue(0);

    await controller.findAll({
      page: 1,
      limit: 20,
      visibility: DocumentVisibility.PUBLIC,
      aiStatus: ExtractionStatus.COMPLETED,
      keyword: 'student@example.com',
    });

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          visibility: DocumentVisibility.PUBLIC,
          extractionStatus: ExtractionStatus.COMPLETED,
          OR: [
            {
              title: {
                contains: 'student@example.com',
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: 'student@example.com',
                mode: 'insensitive',
              },
            },
            {
              fileName: {
                contains: 'student@example.com',
                mode: 'insensitive',
              },
            },
            {
              owner: {
                fullName: {
                  contains: 'student@example.com',
                  mode: 'insensitive',
                },
              },
            },
            {
              owner: {
                email: {
                  contains: 'student@example.com',
                  mode: 'insensitive',
                },
              },
            },
            {
              subject: {
                name: {
                  contains: 'student@example.com',
                  mode: 'insensitive',
                },
              },
            },
            {
              category: {
                name: {
                  contains: 'student@example.com',
                  mode: 'insensitive',
                },
              },
            },
          ],
        },
      }),
    );
  });

  it('returns a JSON-safe payload when approving a document', async () => {
    const reviewedAt = new Date('2026-07-15T12:00:00.000Z');
    prisma.document.findUnique.mockResolvedValue({ id: 'doc-1' });
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      moderationStatus: ModerationStatus.APPROVED,
      moderationFlag: ModerationFlag.FLAGGED,
      rejectionReason: null,
      reviewedAt,
      reviewedBy: 'admin-1',
      updatedAt: reviewedAt,
    });

    const result = await controller.approve('doc-1', {
      id: 'admin-1',
    } as never);

    expect(() => JSON.stringify(result)).not.toThrow();
    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        select: {
          id: true,
          moderationStatus: true,
          moderationFlag: true,
          rejectionReason: true,
          reviewedAt: true,
          reviewedBy: true,
          updatedAt: true,
        },
      }),
    );
  });

  it('returns a JSON-safe payload when rejecting a document', async () => {
    const reviewedAt = new Date('2026-07-15T12:00:00.000Z');
    prisma.document.findUnique.mockResolvedValue({ id: 'doc-1' });
    prisma.document.update.mockResolvedValue({
      id: 'doc-1',
      moderationStatus: ModerationStatus.REJECTED,
      moderationFlag: ModerationFlag.NORMAL,
      rejectionReason: 'Duplicate content',
      reviewedAt,
      reviewedBy: 'admin-1',
      updatedAt: reviewedAt,
    });

    const result = await controller.reject(
      'doc-1',
      { reason: 'Duplicate content' },
      { id: 'admin-1' } as never,
    );

    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result.rejectionReason).toBe('Duplicate content');
  });

  it('does not reveal private documents through the approve endpoint', async () => {
    prisma.document.findUnique.mockResolvedValue(null);

    await expect(
      controller.approve('doc-1', { id: 'admin-1' } as never),
    ).rejects.toThrow('Document not found');
    expect(prisma.document.findUnique).toHaveBeenCalledWith({
      where: { id: 'doc-1', visibility: DocumentVisibility.PUBLIC },
      select: { id: true, ownerId: true, title: true },
    });
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it('does not reveal private documents through the reject endpoint', async () => {
    prisma.document.findUnique.mockResolvedValue(null);

    await expect(
      controller.reject(
        'doc-1',
        { reason: 'Not applicable' },
        { id: 'admin-1' } as never,
      ),
    ).rejects.toThrow('Document not found');
    expect(prisma.document.update).not.toHaveBeenCalled();
  });
});
