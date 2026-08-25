import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
  ModerationStatus,
  Prisma,
} from '../generated/prisma/client';
import { DocumentListQueryDto } from './dto/document-list-query.dto';
import { DocumentsService } from './documents.service';

describe('DocumentsService', () => {
  const prisma = {
    subject: { findFirst: jest.fn(), findUnique: jest.fn() },
    category: { findFirst: jest.fn(), findUnique: jest.fn() },
    tag: { count: jest.fn(), upsert: jest.fn() },
    document: {
      create: jest.fn<Promise<unknown>, [Prisma.DocumentCreateArgs]>(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn<Promise<unknown>, [Prisma.DocumentUpdateArgs]>(),
      delete: jest.fn(),
    },
  };
  const storage = {
    uploadObject: jest.fn(),
    deleteObject: jest.fn(),
    getObjectBuffer: jest.fn(),
    objectExists: jest.fn(),
    createObjectPreviewUrl: jest.fn(),
    createObjectDownloadUrl: jest.fn(),
  };
  const downloadLogService = {
    create: jest.fn(),
  };
  const auditLogService = {
    logDocumentUpload: jest.fn(),
    logDocumentDelete: jest.fn(),
    logDocumentHide: jest.fn(),
  };
  const notifications = { create: jest.fn() };
  const moderationScanner = {
    scan: jest.fn().mockReturnValue({
      flag: 'NORMAL',
      priority: 2,
      matchedKeywords: [],
      matchedContexts: [],
    }),
  };
  const service = new DocumentsService(
    prisma as never,
    storage as never,
    downloadLogService as never,
    auditLogService as never,
    notifications as never,
    moderationScanner as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    [DocumentVisibility.PRIVATE, ModerationStatus.APPROVED],
    [DocumentVisibility.PUBLIC, ModerationStatus.PENDING],
  ])(
    'sets %s uploads to moderation status %s',
    async (visibility, moderationStatus) => {
      prisma.subject.findFirst.mockResolvedValue({ id: 'subject-id' });
      prisma.category.findFirst.mockResolvedValue({ id: 'category-id' });
      prisma.tag.count.mockResolvedValue(0);
      storage.uploadObject.mockResolvedValue({
        key: 'users/owner-id/file.pdf',
      });
      prisma.document.create.mockResolvedValue({
        id: 'doc-id',
        fileSize: BigInt(42),
      });

      await service.upload(
        'owner-id',
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Document',
          visibility,
        },
        {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 42,
          buffer: Buffer.from('pdf'),
        },
      );

      expect(prisma.document.create.mock.calls[0]?.[0]).toMatchObject({
        data: { visibility, moderationStatus },
      });
    },
  );

  it.each([
    ['application/pdf', 'file.pdf'],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'file.docx',
    ],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'file.xlsx',
    ],
    [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'file.pptx',
    ],
  ])('accepts %s uploads', async (mimetype, originalname) => {
    prisma.subject.findFirst.mockResolvedValue({ id: 'subject-id' });
    prisma.category.findFirst.mockResolvedValue({ id: 'category-id' });
    prisma.tag.count.mockResolvedValue(0);
    storage.uploadObject.mockResolvedValue({
      key: 'users/owner-id/file',
    });
    prisma.document.create.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
    });

    await service.upload(
      'owner-id',
      {
        subjectId: 'subject-id',
        categoryId: 'category-id',
        title: 'Document',
      },
      {
        originalname,
        mimetype,
        size: 42,
        buffer: Buffer.from('pdf'),
      },
    );

    expect(storage.uploadObject).toHaveBeenCalled();
  });

  it.each([
    ['application/msword', 'file.doc'],
    ['application/vnd.ms-excel', 'file.xls'],
    ['application/vnd.ms-powerpoint', 'file.ppt'],
  ])('accepts supported legacy %s uploads', async (mimetype, originalname) => {
    await expect(
      service.upload(
        'owner-id',
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Document',
        },
        { originalname, mimetype, size: 42, buffer: Buffer.from('legacy') },
      ),
    ).resolves.toMatchObject({ id: 'doc-id' });
    expect(storage.uploadObject).toHaveBeenCalledWith(
      'owner-id',
      expect.objectContaining({ mimetype, originalname }),
    );
  });

  it('normalizes, deduplicates, and connects free-form tags', async () => {
    prisma.subject.findFirst.mockResolvedValue({ id: 'subject-id' });
    prisma.category.findFirst.mockResolvedValue({ id: 'category-id' });
    prisma.tag.count.mockResolvedValue(0);
    prisma.tag.upsert
      .mockResolvedValueOnce({ id: 'tag-ai', name: 'ai' })
      .mockResolvedValueOnce({ id: 'tag-notes', name: 'notes' });
    storage.uploadObject.mockResolvedValue({ key: 'users/owner-id/file.pdf' });
    prisma.document.create.mockResolvedValue({
      id: 'doc-id',
      title: 'Document',
      fileName: 'file.pdf',
      fileSize: BigInt(42),
    });

    await service.upload(
      'owner-id',
      {
        subjectId: 'subject-id',
        categoryId: 'category-id',
        title: 'Document',
        tags: [' AI ', 'ai', 'Notes'],
      },
      {
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        size: 42,
        buffer: Buffer.from('pdf'),
      },
    );

    expect(prisma.tag.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.tag.upsert).toHaveBeenNthCalledWith(1, {
      where: { name: 'ai' },
      create: { name: 'ai' },
      update: {},
    });
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tags: {
            create: [{ tagId: 'tag-ai' }, { tagId: 'tag-notes' }],
          },
        }) as unknown,
      }),
    );
  });

  it('uploads the file then saves document metadata', async () => {
    prisma.subject.findFirst.mockResolvedValue({ id: 'subject-id' });
    prisma.category.findFirst.mockResolvedValue({ id: 'category-id' });
    prisma.tag.count.mockResolvedValue(2);
    storage.uploadObject.mockResolvedValue({
      key: 'users/owner-id/file.pdf',
      fileUrl: 'https://cdn.example/users/owner-id/file.pdf',
    });
    prisma.document.create.mockResolvedValue({
      id: 'doc-id',
      title: 'Document',
      fileName: 'file.pdf',
      fileSize: BigInt(42),
      visibility: DocumentVisibility.PUBLIC,
      fileUrl: 'https://cdn.example/users/owner-id/file.pdf',
    });

    const result = await service.upload(
      'owner-id',
      {
        subjectId: 'subject-id',
        categoryId: 'category-id',
        title: 'Document',
        description: 'desc',
        visibility: DocumentVisibility.PUBLIC,
        tagIds: ['tag-1', 'tag-2'],
      },
      {
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        size: 42,
        buffer: Buffer.from('pdf'),
      },
    );

    expect(storage.uploadObject).toHaveBeenCalledWith(
      'owner-id',
      expect.objectContaining({ originalname: 'file.pdf' }),
    );
    expect(prisma.document.create).toHaveBeenCalled();
    expect(auditLogService.logDocumentUpload).toHaveBeenCalledWith(
      'owner-id',
      'doc-id',
      {
        title: 'Document',
        fileName: 'file.pdf',
        visibility: DocumentVisibility.PUBLIC,
      },
    );
    const createCalls: unknown = prisma.document.create.mock.calls;
    expect(createCalls).toMatchObject([
      [
        {
          data: {
            ownerId: 'owner-id',
            storagePath: 'users/owner-id/file.pdf',
            fileName: 'file.pdf',
            fileType: 'application/pdf',
            fileSize: BigInt(42),
            fileUrl: 'https://cdn.example/users/owner-id/file.pdf',
          },
        },
      ],
    ]);
    expect(result.id).toBe('doc-id');
  });

  it('lists documents visible to the user by default', async () => {
    prisma.document.count.mockResolvedValue(1);
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-id',
        fileSize: BigInt(42),
      },
    ]);

    const result = await service.findAll(
      'owner-id',
      new DocumentListQueryDto(),
    );

    const findManyCalls = prisma.document.findMany.mock
      .calls as unknown as Array<
      [{ where: { status: { not: DocumentStatus } } }]
    >;
    expect(findManyCalls[0][0].where.status.not).toBe(DocumentStatus.DELETED);
    expect(result.pagination.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('lists hidden documents for the owner only', async () => {
    prisma.document.count.mockResolvedValue(1);
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-id',
        fileSize: BigInt(42),
      },
    ]);

    await service.findAll(
      'owner-id',
      Object.assign(new DocumentListQueryDto(), { ownerOnly: true }),
    );

    const findManyCalls = prisma.document.findMany.mock
      .calls as unknown as Array<
      [
        {
          where: {
            AND: Array<{ ownerId: string; status: { not: DocumentStatus } }>;
          };
        },
      ]
    >;
    expect(findManyCalls[0][0].where.AND[0]).toEqual({
      ownerId: 'owner-id',
      status: { not: DocumentStatus.DELETED },
    });
  });

  it('applies library file type, AI status, and sort filters', async () => {
    prisma.document.count.mockResolvedValue(0);
    prisma.document.findMany.mockResolvedValue([]);

    await service.findAll(
      'owner-id',
      Object.assign(new DocumentListQueryDto(), {
        ownerOnly: true,
        fileType: 'PDF',
        aiStatus: ExtractionStatus.COMPLETED,
        sortBy: 'title',
        sortOrder: 'asc',
      }),
    );

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { fileType: 'application/pdf' },
            { extractionStatus: ExtractionStatus.COMPLETED },
          ]) as unknown,
        }) as unknown,
        orderBy: [{ title: 'asc' }, { id: 'desc' }],
      }),
    );
  });

  it('cleans up uploaded file when saving metadata fails', async () => {
    prisma.subject.findFirst.mockResolvedValue({ id: 'subject-id' });
    prisma.category.findFirst.mockResolvedValue({ id: 'category-id' });
    prisma.tag.count.mockResolvedValue(0);
    storage.uploadObject.mockResolvedValue({
      key: 'users/owner-id/file.pdf',
    });
    prisma.document.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.upload(
        'owner-id',
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Document',
        },
        {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 42,
          buffer: Buffer.from('pdf'),
        },
      ),
    ).rejects.toThrow('db down');
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'owner-id',
      'users/owner-id/file.pdf',
    );
    expect(auditLogService.logDocumentUpload).not.toHaveBeenCalled();
  });

  it('rejects a missing subject before uploading', async () => {
    prisma.subject.findFirst.mockResolvedValue(null);
    prisma.category.findFirst.mockResolvedValue({ id: 'category-id' });
    prisma.tag.count.mockResolvedValue(0);

    await expect(
      service.upload(
        'owner-id',
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Document',
        },
        {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 42,
          buffer: Buffer.from('pdf'),
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('rejects unsupported files before querying relations or uploading', async () => {
    await expect(
      service.upload(
        'owner-id',
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Document',
        },
        {
          originalname: 'malware.exe',
          mimetype: 'application/octet-stream',
          size: 42,
          buffer: Buffer.from('binary'),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subject.findFirst).not.toHaveBeenCalled();
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('rejects files with a supported MIME type but unsupported extension', async () => {
    await expect(
      service.upload(
        'owner-id',
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Document',
        },
        {
          originalname: 'file.txt',
          mimetype: 'application/pdf',
          size: 42,
          buffer: Buffer.from('pdf'),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subject.findUnique).not.toHaveBeenCalled();
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('rejects files larger than the configured limit before uploading', async () => {
    await expect(
      service.upload(
        'owner-id',
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Document',
        },
        {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 80 * 1024 * 1024 + 1,
          buffer: Buffer.alloc(1),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('rejects empty files before uploading', async () => {
    await expect(
      service.upload(
        'owner-id',
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Document',
        },
        {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 0,
          buffer: Buffer.alloc(0),
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadObject).not.toHaveBeenCalled();
  });

  it('allows a non-owner to read an active public document', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      ownerId: 'owner-id',
      visibility: DocumentVisibility.PUBLIC,
      status: DocumentStatus.ACTIVE,
      fileSize: BigInt(42),
      extractionStatus: ExtractionStatus.COMPLETED,
      content: null,
      savedBy: [],
    });

    const result = await service.findOne('doc-id', 'viewer-id');

    const [[findFirstArgs]] = prisma.document.findFirst.mock.calls as Array<
      [
        {
          where: {
            status: { not: DocumentStatus };
            AND: Array<{
              OR?: Array<{
                visibility?: DocumentVisibility;
                status?: DocumentStatus;
              }>;
            }>;
          };
        },
      ]
    >;
    expect(findFirstArgs.where.status.not).toBe(DocumentStatus.DELETED);
    expect(findFirstArgs.where.AND[0].OR).toEqual(
      expect.arrayContaining([
        {
          visibility: DocumentVisibility.PUBLIC,
          status: DocumentStatus.ACTIVE,
          moderationStatus: 'APPROVED',
        },
      ]),
    );
    expect(result).toMatchObject({
      id: 'doc-id',
      owned: false,
      saved: false,
    });
  });

  it('only lists saved documents that remain public, approved, and active', async () => {
    prisma.document.count.mockResolvedValue(0);
    prisma.document.findMany.mockResolvedValue([]);

    await service.findAll('viewer-id', { savedOnly: true });

    const [[findManyArgs]] = prisma.document.findMany.mock.calls as Array<
      [{ where: { AND: Prisma.DocumentWhereInput[] } }]
    >;
    expect(findManyArgs.where.AND[0]).toEqual({
      savedBy: { some: { userId: 'viewer-id' } },
      visibility: DocumentVisibility.PUBLIC,
      moderationStatus: ModerationStatus.APPROVED,
      status: DocumentStatus.ACTIVE,
    });
  });

  it('does not grant direct access through a stale save alone', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('document-id', 'viewer-id'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const [[findFirstArgs]] = prisma.document.findFirst.mock.calls as Array<
      [{ where: { AND: Array<{ OR?: unknown[] }> } }]
    >;
    expect(findFirstArgs.where.AND[0].OR).not.toEqual(
      expect.arrayContaining([
        {
          savedBy: { some: { userId: 'viewer-id' } },
          status: DocumentStatus.ACTIVE,
        },
      ]),
    );
  });

  it('does not expose another user document', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('document-id', 'other-owner'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns not found when the document is missing', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('missing-id', 'other-owner'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates document status to hidden', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
      status: DocumentStatus.HIDDEN,
    });

    await service.update('doc-id', 'owner-id', {
      status: DocumentStatus.HIDDEN,
    });

    const [updateArgs] = prisma.document.update.mock.calls as Array<
      [
        {
          where: { id: string };
          data: { status?: DocumentStatus };
        },
      ]
    >;
    expect(updateArgs).toBeDefined();
    expect(updateArgs[0].where).toEqual({ id: 'doc-id' });
    expect(updateArgs[0].data.status).toBe(DocumentStatus.HIDDEN);
    expect(auditLogService.logDocumentHide).toHaveBeenCalledWith(
      'owner-id',
      'doc-id',
      { status: DocumentStatus.HIDDEN },
    );
  });

  it('sends a clean completed private document to admin review when published', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
      visibility: DocumentVisibility.PRIVATE,
      extractionStatus: ExtractionStatus.COMPLETED,
      title: 'Clean notes',
      fileName: 'notes.pdf',
      description: null,
      content: { extractedText: 'Ordinary academic content' },
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
      visibility: DocumentVisibility.PUBLIC,
    });

    await service.updateVisibility(
      'doc-id',
      'owner-id',
      DocumentVisibility.PUBLIC,
    );

    const [updateArgs] = prisma.document.update.mock.calls as Array<
      [
        {
          where: { id: string };
          data: { visibility?: DocumentVisibility };
        },
      ]
    >;
    expect(updateArgs).toBeDefined();
    expect(updateArgs[0].where).toEqual({ id: 'doc-id' });
    expect(updateArgs[0].data.visibility).toBe(DocumentVisibility.PUBLIC);
    expect(updateArgs[0].data).toMatchObject({
      moderationStatus: ModerationStatus.PENDING,
      moderationFlag: 'NORMAL',
      moderationPriority: 2,
      matchedKeywords: [],
      matchedContexts: [],
    });
    expect(notifications.create).toHaveBeenCalledWith({
      userId: 'owner-id',
      type: 'DOCUMENT_PENDING_REVIEW',
      title: 'Tài liệu đang chờ kiểm duyệt',
      message:
        'Tài liệu “Clean notes” đã được gửi đến quản trị viên và chỉ xuất hiện trên cộng đồng sau khi được duyệt.',
      documentId: 'doc-id',
    });
  });

  it('sends a flagged completed private document to admin review when published', async () => {
    moderationScanner.scan.mockReturnValueOnce({
      flag: 'FLAGGED',
      priority: 0,
      matchedKeywords: ['malware'],
      matchedContexts: [{ keyword: 'malware', excerpt: 'malware example' }],
    });
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
      visibility: DocumentVisibility.PRIVATE,
      extractionStatus: ExtractionStatus.COMPLETED,
      title: 'Security notes',
      fileName: 'security.pdf',
      description: null,
      content: { extractedText: 'Academic malware example' },
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
      visibility: DocumentVisibility.PUBLIC,
    });

    await service.updateVisibility(
      'doc-id',
      'owner-id',
      DocumentVisibility.PUBLIC,
    );

    const updateCalls = prisma.document.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    const updateArgs = updateCalls.at(-1)?.[0];
    expect(updateArgs).toBeDefined();
    if (!updateArgs) throw new Error('Expected a document update');
    expect(updateArgs.data).toMatchObject({
      visibility: DocumentVisibility.PUBLIC,
      moderationStatus: ModerationStatus.PENDING,
      moderationFlag: 'FLAGGED',
      moderationPriority: 0,
      matchedKeywords: ['malware'],
    });
  });

  it('removes every saved copy when an owner makes a public document private', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      ownerId: 'owner-id',
      fileSize: BigInt(42),
      visibility: DocumentVisibility.PUBLIC,
      extractionStatus: ExtractionStatus.COMPLETED,
      moderationStatus: ModerationStatus.APPROVED,
      title: 'Public notes',
      fileName: 'notes.pdf',
      description: null,
      content: { extractedText: 'Academic content' },
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-id',
      ownerId: 'owner-id',
      fileSize: BigInt(42),
      visibility: DocumentVisibility.PRIVATE,
      savedBy: [],
    });

    await service.updateVisibility(
      'doc-id',
      'owner-id',
      DocumentVisibility.PRIVATE,
    );

    const updateArgs = prisma.document.update.mock.calls[0]?.[0] as
      | Prisma.DocumentUpdateArgs
      | undefined;
    expect(updateArgs?.where).toEqual({ id: 'doc-id' });
    expect(updateArgs?.data).toMatchObject({
      visibility: DocumentVisibility.PRIVATE,
      savedBy: { deleteMany: {} },
      saveCount: 0,
    });
  });

  it('creates a download URL using the original file name', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      fileName: 'Lecture Notes.pdf',
      fileType: 'application/pdf',
      storagePath: 'users/owner-id/random-lecture-notes.pdf',
      fileSize: BigInt(42),
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
    });
    downloadLogService.create.mockResolvedValue({ id: 'log-id' });
    storage.createObjectDownloadUrl.mockResolvedValue({
      url: 'https://signed.example/download',
      strategy: 'presigned',
      expiresAt: '2026-06-16T13:00:00.000Z',
    });

    await expect(
      service.createDownloadUrl('doc-id', 'owner-id'),
    ).resolves.toEqual({
      url: 'https://signed.example/download',
      strategy: 'presigned',
      expiresAt: '2026-06-16T13:00:00.000Z',
    });
    expect(storage.createObjectDownloadUrl).toHaveBeenCalledWith(
      'users/owner-id/random-lecture-notes.pdf',
      'Lecture Notes.pdf',
      'application/pdf',
    );
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-id' },
      data: { downloadCount: { increment: 1 } },
    });
    expect(downloadLogService.create).toHaveBeenCalledWith({
      userId: 'owner-id',
      documentId: 'doc-id',
    });
  });

  it('does not create a download URL or log when document access is denied', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      service.createDownloadUrl('doc-id', 'other-user-id'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storage.createObjectDownloadUrl).not.toHaveBeenCalled();
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(downloadLogService.create).not.toHaveBeenCalled();
  });

  it('creates a preview URL after checking document access', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      ownerId: 'owner-id',
      fileName: 'Lecture Notes.pdf',
      fileType: 'application/pdf',
      storagePath: 'users/owner-id/random-lecture-notes.pdf',
      fileSize: BigInt(42),
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
    });
    storage.createObjectPreviewUrl.mockResolvedValue({
      url: 'https://cdn.example/users/owner-id/random-lecture-notes.pdf',
      strategy: 'public',
    });

    await expect(
      service.createPreviewUrl('doc-id', 'owner-id'),
    ).resolves.toEqual({
      url: 'https://cdn.example/users/owner-id/random-lecture-notes.pdf',
      strategy: 'public',
      contentType: 'application/pdf',
      fallbackToOfficeViewer: undefined,
    });
    expect(storage.createObjectPreviewUrl).toHaveBeenCalledWith(
      'users/owner-id/random-lecture-notes.pdf',
      'application/pdf',
    );
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-id' },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('always sends modern Office documents directly to Microsoft Viewer', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      ownerId: 'owner-id',
      fileName: 'Slides.pptx',
      fileType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      storagePath: 'users/owner-id/random-slides.pptx',
      fileSize: BigInt(42),
    });
    prisma.document.update.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
    });
    storage.createObjectPreviewUrl.mockResolvedValue({
      url: 'https://signed.example/random-slides.pptx',
      strategy: 'presigned',
    });

    await expect(
      service.createPreviewUrl('doc-id', 'owner-id'),
    ).resolves.toEqual({
      url: 'https://signed.example/random-slides.pptx',
      strategy: 'presigned',
      contentType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fallbackToOfficeViewer: true,
    });
    expect(storage.getObjectBuffer).not.toHaveBeenCalled();
    expect(storage.uploadObject).not.toHaveBeenCalled();
    expect(storage.createObjectPreviewUrl).toHaveBeenCalledWith(
      'users/owner-id/random-slides.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
  });

  it('permanently deletes owned documents from the database and storage', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-id',
      fileSize: BigInt(42),
      storagePath: 'users/owner-id/file.pdf',
    });
    prisma.document.delete.mockResolvedValue({ id: 'doc-id' });
    storage.deleteObject.mockResolvedValue(undefined);

    await service.remove('doc-id', 'owner-id');

    expect(prisma.document.delete).toHaveBeenCalledWith({
      where: { id: 'doc-id' },
    });
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'owner-id',
      'users/owner-id/file.pdf',
    );
    expect(auditLogService.logDocumentDelete).toHaveBeenCalledWith(
      'owner-id',
      'doc-id',
    );
  });
});
