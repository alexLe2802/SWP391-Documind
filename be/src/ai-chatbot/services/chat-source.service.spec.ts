import {
  DocumentStatus,
  ExtractionQuality,
  ExtractionStatus,
} from '../../generated/prisma/client';
import { ChatSourceService } from './chat-source.service';

describe('ChatSourceService', () => {
  const prisma = {
    document: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    documentContent: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  };
  const geminiService = {
    generateEmbedding: jest
      .fn()
      .mockRejectedValue(new Error('Vector search fallback')),
  };
  const userId = '11111111-1111-4111-8111-111111111111';

  let service: ChatSourceService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.findUnique.mockResolvedValue(null);
    prisma.documentContent.findUnique.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    geminiService.generateEmbedding.mockRejectedValue(
      new Error('Vector search fallback'),
    );
    service = new ChatSourceService(prisma as never, geminiService as never);
  });

  // -------------------------------------------------------------------------
  // Existing: keyword fallback ownership / filter tests
  // -------------------------------------------------------------------------

  it('searches only documents owned by or saved by the current user', async () => {
    prisma.document.findMany.mockResolvedValue([]);

    await service.getSourcesForLibrary(userId, 'machine learning', 5);

    const findManyCalls = prisma.document.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(findManyCalls[0][0].where).toMatchObject({
      OR: [{ ownerId: userId }, { savedBy: { some: { userId } } }],
      status: DocumentStatus.ACTIVE,
    });
    expect(findManyCalls[0][0].where).not.toHaveProperty('visibility');
  });

  it('does not treat public documents as Ask My Library sources unless owned or saved', async () => {
    prisma.document.findMany.mockResolvedValue([]);

    await service.getSourcesForLibrary(userId, 'public research', 5);

    const findManyCalls = prisma.document.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(findManyCalls[0][0].where).toMatchObject({
      OR: [{ ownerId: userId }, { savedBy: { some: { userId } } }],
    });
    const orFilters = findManyCalls[0][0].where.OR as Array<
      Record<string, unknown>
    >;
    expect(orFilters).not.toEqual(
      expect.arrayContaining([{ visibility: 'PUBLIC' }]),
    );
  });

  it('filters out documents without searchable extracted content at query time', async () => {
    prisma.document.findMany.mockResolvedValue([]);

    await service.getSourcesForLibrary(userId, 'machine learning', 5);

    const findManyCalls = prisma.document.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(findManyCalls[0][0].where).toMatchObject({
      extractionStatus: {
        in: [ExtractionStatus.COMPLETED, ExtractionStatus.MOCKED],
      },
      content: {
        is: {
          extractionStatus: {
            in: [ExtractionStatus.COMPLETED, ExtractionStatus.MOCKED],
          },
          OR: [
            { extractedText: { not: null } },
            { contentSummary: { not: null } },
          ],
        },
      },
    });
  });

  it('maps shorthand fileType filters to stored MIME types', async () => {
    prisma.document.findMany.mockResolvedValue([]);

    await service.getSourcesForLibrary(userId, 'machine learning', 5, {
      fileType: 'pdf',
    });

    const findManyCalls = prisma.document.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(findManyCalls[0][0].where).toMatchObject({
      fileType: { in: ['application/pdf'] },
    });
  });

  it('keeps MIME fileType filters as exact stored values', async () => {
    prisma.document.findMany.mockResolvedValue([]);

    await service.getSourcesForLibrary(userId, 'machine learning', 5, {
      fileType: 'application/pdf',
    });

    const findManyCalls = prisma.document.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(findManyCalls[0][0].where).toMatchObject({
      fileType: 'application/pdf',
    });
  });

  it('includes saved documents returned by the library query', async () => {
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Saved Machine Learning Notes',
        ownerId: '99999999-9999-4999-8999-999999999999',
        extractedText: 'Machine learning saved notes machine learning',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'machine learning',
      5,
    );

    expect(result).toEqual([
      expect.objectContaining({
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Saved Machine Learning Notes',
      }),
    ]);
  });

  it('selects top relevant documents by weighted keyword score', async () => {
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'General Notes',
        extractedText: 'machine learning machine learning',
      }),
      documentFixture({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Machine Learning Exam',
        extractedText: 'overview',
      }),
      documentFixture({
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Cooking',
        extractedText: 'recipe',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'machine learning',
      1,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        documentId: '33333333-3333-4333-8333-333333333333',
        sourceNumber: 1,
      }),
    );
    expect(result[0].relevanceScore).toBeCloseTo(0.645, 3);
  });

  it('keeps broad library queries over 30+ documents bounded to the requested limit', async () => {
    const documents = Array.from({ length: 35 }, (_, index) =>
      documentFixture({
        id: `${String(index + 1).padStart(8, '0')}-2222-4222-8222-222222222222`,
        title: `Machine Learning Notes ${String(index + 1).padStart(2, '0')}`,
        extractedText:
          'machine learning supervised learning classification regression',
      }),
    );
    prisma.document.findMany.mockResolvedValue(documents);

    const result = await service.getSourcesForLibrary(
      userId,
      'machine learning overview',
      5,
    );

    expect(result).toHaveLength(5);
    expect(result.map((source) => source.sourceNumber)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns citation-ready sources with truncated extracted text snippets', async () => {
    const longExtractedText = 'extracted fallback '.repeat(40);
    const longSummary = 'summary snippet '.repeat(40);
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Machine Learning Summary',
        contentSummary: longSummary,
        extractedText: longExtractedText,
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'machine learning',
      5,
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        sourceNumber: 1,
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Machine Learning Summary',
      }),
    );
    expect(result[0].relevanceScore).toEqual(expect.any(Number));
    expect(result[0].snippet).toHaveLength(280);
    expect(result[0].snippet).toBe(longExtractedText.slice(0, 280));
  });

  it('uses extractedText for snippet and keeps summary prompt context bounded', async () => {
    const longExtractedText =
      'SHOULD_NOT_BE_SENT_FULL_TEXT '.repeat(300) + 'UNBOUNDED_TAIL';
    const summary = 'Machine learning summary '.repeat(200);
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Machine Learning Long Source',
        contentSummary: summary,
        extractedText: longExtractedText,
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'machine learning',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Machine Learning Long Source',
      }),
    );
    expect(result[0].snippet).toBe(longExtractedText.slice(0, 280));
    expect(result[0].promptContext).toBe(summary.slice(0, 3000));
    expect(result[0].promptContext).toHaveLength(3000);
    expect(result[0].promptContext).not.toContain('UNBOUNDED_TAIL');
    expect(result[0].promptContext).not.toContain(
      'SHOULD_NOT_BE_SENT_FULL_TEXT',
    );
  });

  it('returns no sources when no document matches the question keywords', async () => {
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Cooking',
        extractedText: 'recipe',
      }),
    ]);

    await expect(
      service.getSourcesForLibrary(userId, 'machine learning', 5),
    ).resolves.toEqual([]);
  });

  it('serializes a document query embedding as pgvector input', async () => {
    const embedding = new Array(768).fill(0.25);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.document.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Vector Notes',
    });
    prisma.$queryRaw.mockResolvedValue([
      { content: 'Relevant chunk', distance: 0.1 },
    ]);

    await service.getSourcesForDocument(
      '22222222-2222-4222-8222-222222222222',
      'What is retrieval?',
    );

    const queryCalls = prisma.$queryRaw.mock.calls as unknown[][];
    expect(queryCalls[0][1]).toBe(JSON.stringify(embedding));
  });

  it('returns the exact retrieved chunk trace for Ask This Document', async () => {
    const chunkId = '33333333-3333-4333-8333-333333333333';
    const passage =
      '[PAGE: 4]\nThe exact retrieved passage used to answer the question.';
    geminiService.generateEmbedding.mockResolvedValueOnce(
      new Array(768).fill(0.25),
    );
    prisma.document.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Traceable Notes',
    });
    prisma.$queryRaw.mockResolvedValue([
      { chunkId, chunkIndex: 7, content: passage, distance: 0.1 },
    ]);

    const [source] = await service.getSourcesForDocument(
      '22222222-2222-4222-8222-222222222222',
      'What exact passage was retrieved?',
    );

    expect(source).toEqual(
      expect.objectContaining({
        chunkId,
        chunkIndex: 7,
        promptContext: passage,
      }),
    );
    expect(source.snippet).toContain('exact retrieved passage');
  });

  it('prioritizes Ask This Document relationship table chunks for CHAT_MESSAGE citations', async () => {
    const embedding = new Array(768).fill(0.25);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.document.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'ERD Report',
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        content: 'General ERD introduction without relationship rows',
        distance: 0.1,
      },
      {
        content: [
          '3.2. Bảng Entity và Relationship trong Conceptual ERD',
          '[TABLE: 3.2. Bảng Entity và Relationship trong Conceptual ERD]',
          'Entity 1 | Relation | Entity 2 | Cardinality | Description',
          'CHAT_MESSAGE | cites | CHAT_SOURCE | 1-N | Source citations',
        ].join('\n'),
        distance: 0.2,
      },
    ]);

    const result = await service.getSourcesForDocument(
      '22222222-2222-4222-8222-222222222222',
      'Mối quan hệ giữa CHAT_MESSAGE và CHAT_SOURCE là gì?',
    );

    expect(result[0].snippet).toContain(
      'CHAT_MESSAGE | cites | CHAT_SOURCE | 1-N',
    );
    expect(result[0].promptContext).toContain(
      '3.2. Bảng Entity và Relationship trong Conceptual ERD',
    );
    expect(result[0].documentId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('uses table rows instead of opening paragraphs for generic entity relationship questions', async () => {
    const embedding = new Array(768).fill(0.25);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.document.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'ERD Report',
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        content:
          'Conceptual ERD introduction paragraph that does not describe relationship detail.',
        distance: 0.1,
      },
      {
        content: [
          '[SECTION: 3.2. Bảng Entity và Relationship trong Conceptual ERD]',
          '[TABLE: Entity Relationships]',
          'Entity 1 | Relation | Entity 2 | Cardinality | Description',
          'ROLE | assigns | USER | 1-N | Role assignment',
          'USER | uploads | DOCUMENT | 1-N | Upload ownership',
          'DOCUMENT | has | DOCUMENT_CONTENT | 1-0..1 | Extracted body',
        ].join('\n'),
        distance: 0.2,
      },
    ]);

    const result = await service.getSourcesForDocument(
      '22222222-2222-4222-8222-222222222222',
      'Mối quan hệ giữa các Entity với nhau',
    );

    expect(result[0].promptContext).toContain('[TABLE: Entity Relationships]');
    expect(result[0].snippet).toContain('ROLE | assigns | USER | 1-N');
    expect(result[0].snippet).not.toContain(
      'Conceptual ERD introduction paragraph',
    );
  });

  it('keeps diverse structured chunks for detailed Ask This Document questions', async () => {
    const embedding = new Array(768).fill(0.25);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.document.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'SQL Server Setup Guide',
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        content:
          '[PAGE: 1]\nOverview paragraph about setting up SQL Server access.',
        distance: 0.1,
      },
      {
        content:
          '[PAGE: 2]\nEnable the sa account and choose SQL Server and Windows Authentication mode.',
        distance: 0.2,
      },
      {
        content:
          '[PAGE: 3]\nEnable TCP/IP, set port 1433, and restart SQL Server service.',
        distance: 0.25,
      },
      {
        content:
          '[PAGE: 2]\nRepeated notes about SQL Server authentication mode.',
        distance: 0.26,
      },
    ]);

    const result = await service.getSourcesForDocument(
      '22222222-2222-4222-8222-222222222222',
      'huong dan day du tat ca cac buoc',
      3,
    );

    expect(result).toHaveLength(3);
    expect(result.map((source) => source.promptContext)).toEqual([
      expect.stringContaining('[PAGE: 1]'),
      expect.stringContaining('[PAGE: 2]'),
      expect.stringContaining('[PAGE: 3]'),
    ]);
    expect(result[2].promptContext).toContain('port 1433');
  });

  it('prioritizes generic table chunks and snippets for table row questions', async () => {
    const embedding = new Array(768).fill(0.25);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.document.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Project Plan',
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        content:
          'Opening paragraph describing the project plan at a high level.',
        distance: 0.1,
      },
      {
        content: [
          '[SECTION: Project Work Plan]',
          '[TABLE: Table 1]',
          'Task | Owner | Due date | Status',
          'Collect requirements | An | 2026-07-01 | Done',
          'Build prototype | Binh | 2026-07-15 | In progress',
          'Review release | Chi | 2026-07-30 | Pending',
        ].join('\n'),
        distance: 0.2,
      },
    ]);

    const result = await service.getSourcesForDocument(
      '22222222-2222-4222-8222-222222222222',
      'Build prototype status',
    );

    expect(result[0].promptContext).toContain('[TABLE: Table 1]');
    expect(result[0].snippet).toContain(
      'Build prototype | Binh | 2026-07-15 | In progress',
    );
    expect(result[0].snippet).not.toContain(
      'Opening paragraph describing the project plan',
    );
  });

  it('keeps vector-search parameters aligned when library filters are present', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: 'Filtered chunk',
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Filtered Notes',
        distance: 0.2,
      },
    ]);

    await service.getSourcesForLibrary(userId, 'retrieval', 3, {
      subjectId: '33333333-3333-4333-8333-333333333333',
      categoryId: '44444444-4444-4444-8444-444444444444',
      fileType: 'PDF',
    });

    const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
      string,
      ...unknown[],
    ];
    expect(sql).toContain('LIMIT $4');
    expect(sql).toContain('d.subject_id = $5::uuid');
    expect(sql).toContain('d.category_id = $6::uuid');
    expect(sql).toContain('d.file_type = ANY($7::text[])');
    expect(params).toEqual([
      JSON.stringify(embedding),
      userId,
      userId,
      // dbLimit is now Math.max(limit * 4, 20) → max(12, 20) = 20
      20,
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      ['application/pdf'],
    ]);
  });

  it('keeps semantic Ask My Library search scoped to the current user ownership and saves', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([]);

    await service.getSourcesForLibrary(userId, 'retrieval', 3);

    const [sql, ...params] = prisma.$queryRawUnsafe.mock.calls[0] as [
      string,
      ...unknown[],
    ];
    expect(sql).toContain(
      'LEFT JOIN saved_documents sd ON sd.document_id = d.id AND sd.user_id = $3::uuid',
    );
    expect(sql).toContain('WHERE (d.owner_id = $2::uuid OR sd.id IS NOT NULL)');
    expect(sql).toContain("AND d.status = 'ACTIVE'");
    expect(sql).toContain(
      "AND d.extraction_status IN ('COMPLETED', 'MOCKED')",
    );
    expect(sql).toContain(
      "AND dc.extraction_status IN ('COMPLETED', 'MOCKED')",
    );
    expect(sql).not.toContain("d.visibility = 'PUBLIC'");
    expect(params).toEqual([JSON.stringify(embedding), userId, userId, 20]);
  });

  // -------------------------------------------------------------------------
  // New: semantic threshold filtering
  // -------------------------------------------------------------------------

  it('returns [] when semantic search succeeds but all chunks are below the similarity threshold', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    // All chunks have distance > 0.65 → similarity < 0.35 → below MIN_SEMANTIC_SCORE
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: 'Digital marketing overview',
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Học Digital Marketing-7',
        distance: 0.72,
      },
      {
        content: 'Market research process',
        documentId: '33333333-3333-4333-8333-333333333333',
        title: 'Học Digital Marketing-6',
        distance: 0.68,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'hướng dẫn kết nối api nextjs',
      5,
    );

    // Must return empty without calling keyword fallback
    expect(result).toEqual([]);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  it('excludes chunks below MIN_SEMANTIC_SCORE even when mixed with relevant chunks', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: 'Next.js API routes connect frontend to backend',
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Hướng_dẫn_NextJS_gọi_API',
        distance: 0.25, // similarity = 0.75 ✅
      },
      {
        content: 'Digital marketing objectives',
        documentId: '33333333-3333-4333-8333-333333333333',
        title: 'Học Digital Marketing-7',
        distance: 0.72, // similarity = 0.28 ❌
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'hướng dẫn kết nối api nextjs',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Hướng_dẫn_NextJS_gọi_API');
    expect(result[0].relevanceScore).toBeCloseTo(0.85);
  });

  it('falls back to keyword search only on technical failures, not on empty threshold results', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    // DB throws a technical error
    prisma.$queryRawUnsafe.mockRejectedValueOnce(
      new Error('DB connection lost'),
    );
    prisma.document.findMany.mockResolvedValue([]);

    await service.getSourcesForLibrary(userId, 'api nextjs', 5);

    // Keyword fallback should be invoked on technical errors
    expect(prisma.document.findMany).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // New: group chunks by document
  // -------------------------------------------------------------------------

  it('groups multiple chunks from the same document and keeps top 2', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    const docId = '22222222-2222-4222-8222-222222222222';
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: 'Chunk A about Next.js API',
        documentId: docId,
        title: 'NextJS Guide',
        distance: 0.2,
      },
      {
        content: 'Chunk B about Next.js routing',
        documentId: docId,
        title: 'NextJS Guide',
        distance: 0.22,
      },
      {
        content: 'Chunk C about Next.js middleware',
        documentId: docId,
        title: 'NextJS Guide',
        distance: 0.24,
      },
    ]);

    const result = await service.getSourcesForLibrary(userId, 'nextjs api', 5);

    // Three chunks from same doc → 1 grouped source
    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe(docId);
    // relevanceScore = 1 - 0.20 = 0.80, plus +0.05 reRank bonus for 'nextjs' in title → 0.85
    expect(result[0].relevanceScore).toBeCloseTo(0.85);
  });

  it('merges top 2 chunk contents into promptContext, limited to 3000 chars', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    const docId = '22222222-2222-4222-8222-222222222222';
    const longChunkA = 'A'.repeat(1800);
    const longChunkB = 'B'.repeat(1800);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: longChunkA,
        documentId: docId,
        title: 'NextJS Guide',
        distance: 0.2,
      },
      {
        content: longChunkB,
        documentId: docId,
        title: 'NextJS Guide',
        distance: 0.22,
      },
    ]);

    const result = await service.getSourcesForLibrary(userId, 'nextjs api', 5);

    expect(result).toHaveLength(1);
    // promptContext = chunk A + '\n\n' + chunk B, sliced to 3000
    expect(result[0].promptContext).toHaveLength(3000);
    // snippet is still just the first chunk, sliced to 280
    expect(result[0].snippet).toHaveLength(280);
    expect(result[0].snippet).not.toBe(result[0].promptContext);
  });

  // -------------------------------------------------------------------------
  // New: keyword fallback stopwords
  // -------------------------------------------------------------------------

  it('excludes documents matching only Vietnamese/English stop words in keyword fallback', async () => {
    // geminiService throws → keyword fallback activates
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Học Digital Marketing',
        // Only stopwords appear in text; no domain-specific tokens
        extractedText: 'Hướng dẫn chi tiết cách thức nội dung',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Hướng dẫn chi tiết',
      5,
    );

    // After stopword removal: no meaningful tokens → score = 0 < MIN_RELEVANCE_SCORE
    expect(result).toEqual([]);
  });

  it('still scores documents with domain-specific tokens after stopword removal', async () => {
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Hướng dẫn NextJS API',
        extractedText: 'nextjs api backend frontend connect',
      }),
      documentFixture({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Digital Marketing Guide',
        extractedText: 'marketing strategy',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Hướng dẫn chi tiết về nextjs api',
      5,
    );

    // NextJS doc should score on 'nextjs', 'api' tokens; Marketing should not match
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].title).toBe('Hướng dẫn NextJS API');
  });

  // -------------------------------------------------------------------------
  // New: reRank bonus cap
  // -------------------------------------------------------------------------

  it('caps total reRank title bonus at +0.10 regardless of matching terms', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    // Base score = 1 - 0.40 = 0.60; title has many query tokens
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: 'Machine learning algorithms explained',
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Machine Learning Algorithm Neural Network Deep Learning',
        distance: 0.4,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'machine learning algorithm neural network deep learning',
      5,
    );

    expect(result).toHaveLength(1);
    // Max possible boosted score = 0.60 + 0.10 = 0.70, not 0.60 + (5 * 0.05) = 0.85
    expect(result[0].relevanceScore).toBeLessThanOrEqual(0.71);
    expect(result[0].relevanceScore).toBeGreaterThan(0.6);
  });

  it('prioritizes DOCUMENT_TAG chunks for Ask My Library DOCUMENT and TAG questions', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    const docId = '22222222-2222-4222-8222-222222222222';
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: 'Generic document metadata overview',
        documentId: docId,
        title: 'Logical ERD Report',
        distance: 0.1,
      },
      {
        content: [
          '4.4. Triển khai relationship trong Logical ERD',
          '[TABLE: 4.4. Triển khai relationship trong Logical ERD]',
          'DOCUMENT_TAG | links | DOCUMENT and TAG | N-N | Join table',
        ].join('\n'),
        documentId: docId,
        title: 'Logical ERD Report',
        distance: 0.2,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'DOCUMENT và TAG quan hệ thế nào?',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].promptContext).toContain(
      'DOCUMENT_TAG | links | DOCUMENT and TAG | N-N',
    );
    expect(result[0].snippet).toContain('DOCUMENT_TAG');
  });

  it('prioritizes USER_SUBSCRIPTION and PAYMENT relationship rows', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    const docId = '22222222-2222-4222-8222-222222222222';
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: 'General subscription overview',
        documentId: docId,
        title: 'Logical ERD Report',
        distance: 0.1,
      },
      {
        content: [
          '[SECTION: 4.4. Triển khai relationship trong Logical ERD]',
          '[TABLE: Entity Relationships]',
          'Entity 1 | Relation | Entity 2 | Cardinality | Description',
          'USER_SUBSCRIPTION | has | PAYMENT | 1-N | Payment history',
        ].join('\n'),
        documentId: docId,
        title: 'Logical ERD Report',
        distance: 0.2,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'USER_SUBSCRIPTION và PAYMENT có quan hệ gì?',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].promptContext).toContain(
      'USER_SUBSCRIPTION | has | PAYMENT | 1-N',
    );
    expect(result[0].snippet).toContain(
      'USER_SUBSCRIPTION | has | PAYMENT | 1-N',
    );
  });

  it('returns only AI Study Hub metadata matches for a concise topic query', async () => {
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'SRS_AI_Study_Hub_Outline_v0.1',
        description: 'Software requirements specification for AI Study Hub',
        extractedText: 'AI Study Hub requirements and scope',
      }),
      documentFixture({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Hoc Digital Marketing',
        extractedText: 'Digital marketing campaign and funnel notes',
      }),
      documentFixture({
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Huong_dan_NextJS_goi_API',
        extractedText: 'NextJS API route examples',
      }),
      documentFixture({
        id: '55555555-5555-4555-8555-555555555555',
        title: 'SITI WEBSITE',
        extractedText: 'Website introduction and sitemap',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'AI Study Hub',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('SRS_AI_Study_Hub_Outline_v0.1');
    expect(result.map((source) => source.title)).not.toEqual(
      expect.arrayContaining([
        'Hoc Digital Marketing',
        'Huong_dan_NextJS_goi_API',
        'SITI WEBSITE',
      ]),
    );
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
  });

  it('returns only Digital Marketing sources for a concise topic query', async () => {
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Hoc Digital Marketing',
        description: 'Digital Marketing strategy and channels',
        extractedText: 'SEO social ads email marketing',
      }),
      documentFixture({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'SRS_AI_Study_Hub_Outline_v0.1',
        extractedText: 'Software requirements specification',
      }),
      documentFixture({
        id: '44444444-4444-4444-8444-444444444444',
        title: 'UI UX Fundamentals',
        extractedText: 'Wireframes and interface design',
      }),
      documentFixture({
        id: '55555555-5555-4555-8555-555555555555',
        title: 'Huong_dan_NextJS_goi_API',
        extractedText: 'NextJS API routes',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Digital Marketing',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Hoc Digital Marketing');
    expect(result.map((source) => source.title)).not.toEqual(
      expect.arrayContaining([
        'SRS_AI_Study_Hub_Outline_v0.1',
        'UI UX Fundamentals',
        'Huong_dan_NextJS_goi_API',
      ]),
    );
  });

  it('returns SRS sources without unrelated Digital Marketing documents', async () => {
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'SRS_AI_Study_Hub_Outline_v0.1',
        description: 'Software Requirements Specification',
        extractedText: 'Functional and non-functional requirements',
      }),
      documentFixture({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Hoc Digital Marketing',
        extractedText: 'Digital marketing campaigns',
      }),
    ]);

    const result = await service.getSourcesForLibrary(userId, 'SRS', 5);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('SRS_AI_Study_Hub_Outline_v0.1');
    expect(result.map((source) => source.title)).not.toContain(
      'Hoc Digital Marketing',
    );
  });

  it('filters semantic-only content when metadata overlap is zero in strict mode', async () => {
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'General Notes',
        description: 'Miscellaneous class notes',
        extractedText: 'AI Study Hub appears once in a weak unrelated passage',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'AI Study Hub',
      5,
    );

    expect(result).toEqual([]);
  });

  it('does not fill top-N with low-confidence unrelated documents', async () => {
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Hoc Digital Marketing',
        description: 'Digital Marketing fundamentals',
        extractedText: 'Digital Marketing fundamentals',
      }),
      documentFixture({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'SRS_AI_Study_Hub_Outline_v0.1',
        extractedText: 'Software requirements specification',
      }),
      documentFixture({
        id: '44444444-4444-4444-8444-444444444444',
        title: 'UI UX Fundamentals',
        extractedText: 'Interface design',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Digital Marketing',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Hoc Digital Marketing');
  });

  it('returns no sources for generic document search words only', async () => {
    const result = await service.getSourcesForLibrary(
      userId,
      'tim tai lieu',
      5,
    );

    expect(result).toEqual([]);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
  });

  it('uses semantic fallback for concise topic queries without metadata matches', async () => {
    const embedding = new Array(768).fill(0.5);
    prisma.document.findMany.mockResolvedValue([]);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: 'AI Study Hub is a platform for organizing study documents.',
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'AI Study Hub Overview',
        distance: 0.2,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'AI Study Hub',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('AI Study Hub Overview');
    expect(geminiService.generateEmbedding).toHaveBeenCalledWith(
      'AI Study Hub',
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
  });

  it('falls through to semantic search when document discovery finds no metadata match', async () => {
    const embedding = new Array(768).fill(0.5);
    prisma.document.findMany.mockResolvedValue([]);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content:
          'Next.js calls backend APIs through route handlers and fetch requests.',
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Huong_dan_NextJS_goi_API_cho_nguoi_moi',
        distance: 0.2,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'tim cac file lien quan den cach NEXTJS giao tiep API',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Huong_dan_NextJS_goi_API_cho_nguoi_moi');
    expect(geminiService.generateEmbedding).toHaveBeenCalledWith(
      'tim cac file lien quan den cach NEXTJS giao tiep API',
    );
  });

  it('filters semantically high-scoring document-discovery sources that do not match the requested topic', async () => {
    const embedding = new Array(768).fill(0.5);
    prisma.document.findMany.mockResolvedValue([]);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content:
          'Next.js calls backend APIs through route handlers and fetch requests.',
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Huong_dan_NextJS_goi_API_cho_nguoi_moi',
        distance: 0.2,
      },
      {
        content:
          'Session 1 What is Marketing? Customer value and brand strategy.',
        documentId: '33333333-3333-4333-8333-333333333333',
        title: 'Invoice-NOVX6ROV-0003',
        distance: 0.19,
      },
      {
        content:
          'ScienceDirect Available online with unrelated education research.',
        documentId: '44444444-4444-4444-8444-444444444444',
        title: '1-s2.0-S1877050924016612-main',
        distance: 0.22,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'tim cac file lien quan den cach NEXTJS giao tiep API',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result.map((source) => source.title)).toEqual([
      'Huong_dan_NextJS_goi_API_cho_nguoi_moi',
    ]);
  });

  it('returns only the matching table source for specific Ask My Library entity questions', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: [
          '[SECTION: AI Study Hub Logical ERD]',
          '[TABLE: Entity Relationships]',
          'Entity 1 | Relation | Entity 2 | Cardinality | Description',
          'CHAT_MESSAGE | cites | CHAT_SOURCE | 1-N | Message citations',
        ].join('\n'),
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'AI Study Hub ERD',
        distance: 0.2,
      },
      {
        content:
          'A general academic article about learning platforms and student outcomes.',
        documentId: '33333333-3333-4333-8333-333333333333',
        title: 'Ojd anic research notes',
        distance: 0.19,
      },
      {
        content: 'API smoke test payloads and unrelated backend examples.',
        documentId: '44444444-4444-4444-8444-444444444444',
        title: 'Test API Quang',
        distance: 0.21,
      },
      {
        content:
          'ScienceDirect article metadata for unrelated education research.',
        documentId: '55555555-5555-4555-8555-555555555555',
        title: 'Garg_2024',
        distance: 0.18,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'CHAT_MESSAGE va CHAT_SOURCE trong AI Study Hub',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('AI Study Hub ERD');
    expect(result[0].snippet).toContain(
      'CHAT_MESSAGE | cites | CHAT_SOURCE | 1-N',
    );
  });

  it('requires all requested entity identifiers for relationship sources', async () => {
    const embedding = new Array(768).fill(0.5);
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content:
          'Chat citation source overview without the requested database entities.',
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Chat Source Notes',
        distance: 0.1,
      },
      {
        content: [
          '[TABLE: Entity Relationships]',
          'Entity 1 | Relation | Entity 2 | Cardinality | Description',
          'CHAT_MESSAGE | cites | CHAT_SOURCE | 1-N | Message citations',
        ].join('\n'),
        documentId: '33333333-3333-4333-8333-333333333333',
        title: 'AI Study Hub ERD',
        distance: 0.2,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'CHAT_MESSAGE va CHAT_SOURCE co quan he gi?',
      5,
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('AI Study Hub ERD');
    expect(result[0].snippet).toContain(
      'CHAT_MESSAGE | cites | CHAT_SOURCE | 1-N',
    );
  });

  it('uses selected documents as fallback context when semantic chunks miss the relevance threshold', async () => {
    const embedding = new Array(768).fill(0.5);
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        content: 'Only weakly related chunk',
        documentId: selectedDocumentId,
        title: 'Huong_dan_NextJS_goi_API_cho_nguoi_moi',
        distance: 0.9,
      },
    ]);
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Marketing Plan',
        extractedText: 'Digital marketing campaign and content plan.',
      }),
      documentFixture({
        id: selectedDocumentId,
        title: 'Huong_dan_NextJS_goi_API_cho_nguoi_moi',
        extractedText:
          'Tai lieu huong dan Next.js goi API tu backend va vi du code mau.',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'chi tiet ve noi dung nay',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      documentId: selectedDocumentId,
      title: 'Huong_dan_NextJS_goi_API_cho_nguoi_moi',
      relevanceScore: 0.9,
    });
    expect(result[0].promptContext).toContain('Next.js goi API');
  });

  it('returns no selected-document sources when the requested ids are outside the user scope', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    geminiService.generateEmbedding.mockRejectedValueOnce(
      new Error('Embedding unavailable'),
    );
    prisma.document.findMany.mockResolvedValue([]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Nội dung tài liệu này là gì?',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result).toEqual([]);
    const findManyCalls = prisma.document.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    const findManyArgs = findManyCalls[0][0];
    expect(findManyArgs.where).toMatchObject({
      OR: [{ ownerId: userId }, { savedBy: { some: { userId } } }],
      id: { in: [selectedDocumentId] },
      status: DocumentStatus.ACTIVE,
    });
  });

  it('does not include a selected marketing source for a technical API question', async () => {
    const embedding = new Array(768).fill(0.5);
    const apiDocumentId = '22222222-2222-4222-8222-222222222222';
    const marketingDocumentId = '33333333-3333-4333-8333-333333333333';
    geminiService.generateEmbedding.mockResolvedValueOnce(embedding);
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        content:
          'Next.js route handlers call a REST API with bearer authentication.',
        documentId: apiDocumentId,
        title: 'Next.js API Guide',
        distance: 0.2,
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        content:
          'Marketing campaign planning, brand awareness and social media reach.',
        documentId: marketingDocumentId,
        title: 'Marketing Plan',
        distance: 0.18,
      },
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Cách gọi REST API trong Next.js?',
      5,
      { documentIds: [apiDocumentId, marketingDocumentId] },
    );

    expect(result.map((source) => source.documentId)).toEqual([apiDocumentId]);
  });

  it('uses selected documents as fallback context when embedding search fails', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    geminiService.generateEmbedding.mockRejectedValueOnce(
      new Error('Embedding unavailable'),
    );
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Marketing Plan',
        extractedText: 'Digital marketing campaign and content plan.',
      }),
      documentFixture({
        id: selectedDocumentId,
        title: 'Huong_dan_NextJS_goi_API_cho_nguoi_moi',
        extractedText:
          'Tai lieu huong dan Next.js goi API tu backend va vi du code mau.',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'chi tiet ve noi dung nay',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe(selectedDocumentId);
    expect(result[0].promptContext).toContain('Next.js goi API');
  });

  it('keeps numeric query terms when selecting fallback passages from a selected document', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    geminiService.generateEmbedding.mockRejectedValueOnce(
      new Error('Embedding unavailable'),
    );
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: selectedDocumentId,
        title: 'ObservationLog01',
        extractedText: [
          'Observation log overview.',
          'Lần 1: Tôi hỏi AI về ISTQB definition.',
          'Ghi chú chuyển tiếp không liên quan.',
          'Lần 2: Tôi hỏi AI: "Testing can prove that software has no defects. True or false? Explain."',
          'ChatGPT: False. Testing shows the presence of defects, not their absence.',
          'Gemini: False. Exhaustive testing is impossible, so testing cannot prove no defects.',
          'Claude AI: False. It explains resource limits and software complexity.',
          'Lần 3: Tôi hỏi AI về regression testing.',
        ].join('\n\n'),
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Nội dung lần 2 hỏi về AI gồm những gì?',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe(selectedDocumentId);
    expect(result[0].promptContext).toContain('Lần 2');
    expect(result[0].promptContext).toContain('ChatGPT: False');
    expect(result[0].promptContext).toContain('Gemini: False');
    expect(result[0].promptContext).toContain('Claude AI: False');
    expect(result[0].promptContext).not.toContain('Lần 1');
    expect(result[0].promptContext).not.toContain('Lần 3');
    expect(result[0].snippet).toContain('Lần 2');
  });

  it('collects all explicitly requested lesson sections from a selected document', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    geminiService.generateEmbedding.mockRejectedValueOnce(
      new Error('Embedding unavailable'),
    );
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: selectedDocumentId,
        title: 'JPD326 Speaking',
        extractedText: [
          'Bai 6: Suc khoe',
          'Tinh huong 1: Khong co cam giac them an do thay doi mua.',
          'Vai A: Lang nghe va dua loi khuyen.',
          'Vai B: Mo ta tinh trang suc khoe.',
          'Bai 7: Moi tham gia hoat dong',
          'Tinh huong 3: Moi mot nguoi tham gia su kien.',
          'Vai A: Dua loi moi va giai thich thoi gian.',
          'Vai B: Tra loi loi moi.',
          'Bai 8: Xin nghi lam',
          'Tinh huong 5: Xin quan ly cho nghi mot tuan.',
          'Bai 10: Goi dien tim do that lac',
          'Tinh huong 6: Tim vi bi bo quen o quan ca phe.',
        ].join('\n\n'),
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Con bai 6 bai 7 dau',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result).toHaveLength(1);
    expect(result[0].promptContext).toContain('Bai 6: Suc khoe');
    expect(result[0].promptContext).toContain(
      'Tinh huong 1: Khong co cam giac them an',
    );
    expect(result[0].promptContext).toContain(
      'Bai 7: Moi tham gia hoat dong',
    );
    expect(result[0].promptContext).toContain(
      'Tinh huong 3: Moi mot nguoi tham gia su kien',
    );
    expect(result[0].promptContext).not.toContain('Bai 8: Xin nghi lam');
    expect(result[0].promptContext).not.toContain(
      'Bai 10: Goi dien tim do that lac',
    );
  });

  it('uses full extracted text for detailed selected-document questions in Vietnamese', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    geminiService.generateEmbedding.mockRejectedValueOnce(
      new Error('Embedding unavailable'),
    );
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: selectedDocumentId,
        title: 'ObservationLog01',
        contentSummary: 'Short summary should not replace the full file.',
        extractedText: [
          'Lần 1: Tôi hỏi AI về ISTQB definition.',
          'ChatGPT: Đúng nhưng thiếu chi tiết về quy trình kiểm thử.',
          'Gemini: Đúng và đầy đủ, bám sát theo ISTQB syllabus.',
          'Lần 2: Tôi hỏi AI: "Testing can prove that software has no defects. True or false? Explain."',
          'ChatGPT: False. Testing shows the presence of defects, not their absence.',
          'Gemini: False. Exhaustive testing is impossible.',
          'Claude AI: False. It explains resource limits and software complexity.',
        ].join('\n\n'),
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Nội dung đầy đủ chi tiết của file là gì',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe(selectedDocumentId);
    expect(result[0].promptContext).toContain('Lần 1');
    expect(result[0].promptContext).toContain('Lần 2');
    expect(result[0].promptContext).toContain('ChatGPT: False');
    expect(result[0].promptContext).toContain('Gemini: False');
    expect(result[0].promptContext).toContain('Claude AI: False');
    expect(result[0].promptContext).not.toBe(
      'Short summary should not replace the full file.',
    );
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
  });

  it('keeps the beginning, middle, and end of long selected documents for whole-file questions', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    const extractedText = [
      `Bài 1: Phần mở đầu ${'a'.repeat(6_000)}`,
      `Bài 7: Phần giữa ${'b'.repeat(6_000)}`,
      `Bài 10: Phần cuối ${'c'.repeat(6_000)}`,
    ].join('\n\n');
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: selectedDocumentId,
        title: 'JPD326 Speaking',
        extractedText,
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Nội dung đầy đủ của file này là gì',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result).toHaveLength(1);
    expect(result[0].promptContext).toContain('Bài 1: Phần mở đầu');
    expect(result[0].promptContext).toContain('Bài 7: Phần giữa');
    expect(result[0].promptContext).toContain('Bài 10: Phần cuối');
    expect(result[0].promptContext!.length).toBeLessThanOrEqual(16_000);
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
  });

  it('treats continue as a whole-document follow-up for selected files', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    const extractedText = `${'Phần trước '.repeat(800)}PHẦN CUỐI CỦA TÀI LIỆU`;
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: selectedDocumentId,
        title: 'JPD326 Speaking',
        extractedText,
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Tiếp tục phần còn lại',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result[0].promptContext).toContain('PHẦN CUỐI CỦA TÀI LIỆU');
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
  });

  it('keeps a matching row near the end of an oversized structured block', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    const unrelatedRows = Array.from(
      { length: 180 },
      (_, index) =>
        `SCRUM-${100 + index} | Unrelated backlog item ${'x'.repeat(24)}`,
    );
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: selectedDocumentId,
        title: 'Feedback',
        contentSummary: 'Short summary without the requested task.',
        extractedText: [
          '[SECTION: 7.2 Task chính của Week 3]',
          '[TABLE: Table 9]',
          'Jira Key | Task | Deadline | Giao cho',
          ...unrelatedRows,
          'SCRUM-44 | [ERD] Identify updated core and extension entities | 25/05 | Backend Lead',
        ].join('\n'),
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'SCRUM-44 có task gì?',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result).toHaveLength(1);
    expect(result[0].promptContext).toContain('SCRUM-44');
    expect(result[0].promptContext).toContain(
      'Identify updated core and extension entities',
    );
    expect(result[0].promptContext!.length).toBeLessThanOrEqual(3000);
  });

  it('uses selected documents for generic search-intent prompts without core terms', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: selectedDocumentId,
        title: 'Selected File',
        extractedText: 'Selected file content should still be available.',
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'tim tai lieu',
      5,
      { documentIds: [selectedDocumentId] },
    );

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe(selectedDocumentId);
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
  });

  it('uses selected XLSX documents with partial extraction quality as valid source context', async () => {
    const selectedDocumentId = '22222222-2222-4222-8222-222222222222';
    prisma.document.findMany.mockResolvedValue([
      documentFixture({
        id: selectedDocumentId,
        title: 'AI_Study_Hub_Project_Management_Template',
        extractedText: [
          '[SHEET: Sheet1]',
          'Task | Owner | Status | Due date',
          'Setup backend API | Quang | In progress | 2026-07-21',
          'Review citation behavior | Quang | Done | 2026-07-22',
        ].join('\n'),
      }),
    ]);

    const result = await service.getSourcesForLibrary(
      userId,
      'Tóm tắt các điểm chính và thông tin quan trọng nhất trong tài liệu này.',
      5,
      { documentIds: [selectedDocumentId], fileType: 'xlsx' },
    );

    expect(result).toHaveLength(1);
    expect(result[0].documentId).toBe(selectedDocumentId);
    expect(result[0].promptContext).toContain('Setup backend API');
    expect(result[0].promptContext).toContain('Review citation behavior');
    const [findManyArgs] = prisma.document.findMany.mock.calls[0] as [
      {
        where: {
          fileType?: { in: string[] };
          content?: {
            is?: {
              qualityStatus?: { in: ExtractionQuality[] };
            };
          };
        };
      },
    ];
    expect(findManyArgs.where.fileType).toEqual({
      in: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    });
    expect(findManyArgs.where.content?.is?.qualityStatus).toEqual({
      in: [ExtractionQuality.READY, ExtractionQuality.PARTIAL],
    });
    expect(geminiService.generateEmbedding).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function documentFixture(overrides: {
    id: string;
    title: string;
    ownerId?: string;
    description?: string | null;
    contentSummary?: string | null;
    extractedText: string;
    subject?: { name: string } | null;
    category?: { name: string } | null;
    tags?: Array<{ tag: { name: string } }>;
  }) {
    return {
      id: overrides.id,
      title: overrides.title,
      ownerId: overrides.ownerId ?? userId,
      description: overrides.description ?? null,
      subject: overrides.subject ?? null,
      category: overrides.category ?? null,
      content: {
        contentSummary: overrides.contentSummary ?? null,
        extractedText: overrides.extractedText,
      },
      tags: overrides.tags ?? [],
    };
  }
});
