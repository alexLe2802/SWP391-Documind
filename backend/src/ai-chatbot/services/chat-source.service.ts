import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import {
  DocumentStatus,
  ExtractionQuality,
  ExtractionStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LibraryFiltersDto } from '../dto/ask-library.dto';
import { CitationDto } from '../dto/citation.dto';
import { GeminiService } from './gemini.service';

type FileTypeFilter = string | { in: string[] };

const CITATION_SNIPPET_LIMIT = 280;
const MIN_RELEVANCE_SCORE = 5;
const MIN_SEMANTIC_SCORE = 0.35;
const MIN_METADATA_RELEVANCE_SCORE = 0.62;
const MAX_CHUNKS_PER_DOCUMENT = 2;
const PROMPT_CONTEXT_LIMIT = 3000;
const WHOLE_DOCUMENT_CONTEXT_LIMIT = 16_000;
const WHOLE_DOCUMENT_MAX_BLOCKS = 24;

const SEARCHABLE_EXTRACTION_STATUSES = [
  ExtractionStatus.COMPLETED,
  ExtractionStatus.MOCKED,
];
const SEARCHABLE_EXTRACTION_QUALITIES = [
  ExtractionQuality.READY,
  ExtractionQuality.PARTIAL,
];

const FILE_TYPE_ALIASES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['application/vnd.ms-powerpoint'],
  pptx: [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/mp4'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
};

// Generic tokens that carry no domain signal and should not influence scoring.
// Includes common Vietnamese function words (normalized, diacritics removed)
// and English stop words.
const STOPWORDS = new Set([
  // Vietnamese generic (normalized: lowercase, NFD stripped)
  'huong',
  'dan',
  'chi',
  'tiet',
  'noi',
  'dung',
  'cach',
  'nao',
  'gi',
  'la',
  'va',
  'co',
  'de',
  'cho',
  'voi',
  'trong',
  'cua',
  'mot',
  'duoc',
  'toi',
  'ban',
  'hay',
  'khi',
  'sau',
  'truoc',
  'them',
  'cac',
  'nhung',
  'ma',
  'neu',
  'thi',
  'se',
  'da',
  'dang',
  'vay',
  'nhu',
  've',
  'ket',
  'lien',
  'quan',
  'den',
  'nay',
  'do',
  // English generic
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'be',
  'to',
  'of',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'as',
  'do',
  'does',
  'did',
  'how',
  'what',
  'why',
  'when',
  'where',
  'which',
  'who',
  'guide',
  'tutorial',
  'example',
  'detail',
  'details',
  'introduction',
  'overview',
  'basic',
  'basics',
  'document',
  'documents',
  'file',
  'files',
  'search',
  'show',
  'find',
  'help',
  'information',
  'about',
  'explain',
  'tell',
  'give',
  'tai',
  'lieu',
  'tim',
  'thong',
  'tin',
  'giai',
  'thich',
  'tom',
  'tat',
]);

const SEARCH_INTENT_WORDS = new Set([
  'tim',
  'search',
  'show',
  'find',
  'list',
  'liet',
  'ke',
  'danh',
  'sach',
  'tai',
  'lieu',
  'tailieu',
  'document',
  'documents',
  'file',
  'files',
]);

const TABLE_STRUCTURE_QUERY_TERMS = new Set([
  'relationship',
  'relationships',
  'relation',
  'cardinality',
  'entity',
  'bang',
  'table',
  'row',
  'rows',
  'dong',
  'column',
  'columns',
  'cot',
  'cell',
  'cells',
  'o',
]);

const TABLE_STRUCTURE_QUERY_PHRASES = [
  'quan he',
  'moi quan he',
  'thuc the',
  'bang trung gian',
];

const TOPIC_FILTER_EXCLUDED_TERMS = new Set([
  ...TABLE_STRUCTURE_QUERY_TERMS,
  'quan',
  'he',
  'moi',
  'thuc',
  'the',
  'trung',
  'gian',
]);

const DETAILED_QUERY_TERMS = new Set([
  'full',
  'complete',
  'detailed',
  'detail',
  'details',
  'all',
  'steps',
  'step',
  'procedure',
  'process',
  'checklist',
  'summary',
  'summarize',
  'day',
  'du',
  'toan',
  'bo',
  'tat',
  'ca',
  'chi',
  'tiet',
  'hon',
  'nua',
  'them',
  'ro',
  'buoc',
  'quy',
  'trinh',
  'tom',
  'tat',
]);

const DETAILED_QUERY_PHRASES = [
  'giai thich chi tiet',
  'chi tiet hon',
  'ro hon',
  'them nua',
  'hon nua',
  'huong dan day du',
  'tom tat day du',
  'toan bo',
  'tat ca cac buoc',
  'file nay noi gi',
  'noi dung cua file nay',
  'noi dung cua tai lieu nay',
  'cac buoc',
];

export interface ChatSourceResult extends CitationDto {
  promptContext?: string;
  usedFallbackKeyword?: boolean;
}

interface RawChunk {
  chunkId?: string;
  chunkIndex?: number;
  content: string;
  documentId: string;
  title: string;
  distance: number;
  sourceLocator?: string[] | null;
}

interface GroupedDocument {
  chunkId?: string;
  chunkIndex?: number;
  documentId: string;
  title: string;
  relevanceScore: number;
  snippet: string;
  promptContext: string;
  sourceLocator: string[];
}

interface DocumentDiscoveryRow {
  title: string;
  description: string | null;
  subject?: { name: string } | null;
  category?: { name: string } | null;
  tags?: Array<{
    tag: { name: string } | null;
  }> | null;
  content?: {
    extractedText?: string | null;
    contentSummary?: string | null;
  } | null;
}

interface QueryAnalysis {
  normalized: string;
  coreTerms: string[];
  corePhrases: string[];
  explicitSearchIntent: boolean;
  documentSearchIntent: boolean;
  conciseTopicQuery: boolean;
}

interface MetadataScore {
  rawScore: number;
  relevanceScore: number;
  metadataOverlap: number;
  titlePhraseMatch: boolean;
  strongTitleTokenOverlap: boolean;
  taxonomyMatch: boolean;
  strongDescriptionMatch: boolean;
  passesTopicGate: boolean;
}

@Injectable()
export class ChatSourceService {
  private readonly logger = new Logger(ChatSourceService.name);

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  // Lấy dữ liệu nguồn for tài liệu.
  async getSourcesForDocument(
    documentId: string,
    question?: string,
    limit = 5,
  ): Promise<ChatSourceResult[]> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, title: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!question || this.isContinuationQuery(question)) {
      const content = await this.prisma.documentContent.findUnique({
        where: { documentId },
        select: { extractedText: true },
      });
      const fullText = question
        ? this.buildWholeDocumentContext(content?.extractedText ?? '')
        : this.extractFullText(content ?? null, question);
      const contextLimit = question
        ? WHOLE_DOCUMENT_CONTEXT_LIMIT
        : PROMPT_CONTEXT_LIMIT;
      return [
        {
          sourceNumber: 1,
          documentId: document.id,
          title: document.title,
          chunkId: null,
          chunkIndex: null,
          snippet: this.toSourceSnippet(fullText, question),
          promptContext: fullText.slice(0, contextLimit),
          passage: fullText.slice(0, contextLimit),
          relevanceScore: 0.9,
        },
      ];
    }

    try {
      const queryEmbedding =
        await this.geminiService.generateEmbedding(question);
      const queryVector = JSON.stringify(queryEmbedding);

      const detailedAnswer = this.isDetailedAnswerQuery(question);
      const chunkLimit = detailedAnswer ? Math.max(limit * 4, 12) : limit;
      const chunks = await this.prisma.$queryRaw<
        Array<{
          chunkId: string;
          chunkIndex: number;
          content: string;
          distance: number;
          sourceLocator?: string[] | null;
        }>
      >`
        SELECT
          id as "chunkId",
          chunk_index as "chunkIndex",
          content,
          source_locator as "sourceLocator",
          (embedding <=> ${queryVector}::vector) as distance
        FROM document_chunks
        WHERE document_id = ${documentId}::uuid
        ORDER BY distance ASC
        LIMIT ${chunkLimit}
      `;

      if (chunks.length === 0) {
        throw new Error('No chunks found in database');
      }

      const selectedChunks = this.selectChunksForPrompt(
        this.reRankChunks(chunks, question),
        question,
        limit,
      );

      return selectedChunks.map((chunk, index) => ({
        citationId: chunk.chunkId,
        chunkId: chunk.chunkId,
        sourceNumber: index + 1,
        documentId: document.id,
        title: document.title,
        chunkIndex: chunk.chunkIndex,
        snippet: this.toSourceSnippet(chunk.content, question),
        quote: this.toSourceSnippet(chunk.content, question),
        promptContext: chunk.content.slice(0, PROMPT_CONTEXT_LIMIT),
        passage: chunk.content.slice(0, PROMPT_CONTEXT_LIMIT),
        relevanceScore: this.chunkRelevanceScore(chunk, question),
        sourceLocator: chunk.sourceLocator ?? [],
      }));
    } catch {
      const content = await this.prisma.documentContent.findUnique({
        where: { documentId },
        select: { extractedText: true },
      });
      const fullText = this.extractFullText(content ?? null, question);
      return [
        {
          sourceNumber: 1,
          documentId: document.id,
          title: document.title,
          chunkId: null,
          chunkIndex: null,
          snippet: this.toSourceSnippet(fullText, question),
          promptContext: fullText.slice(0, PROMPT_CONTEXT_LIMIT),
          passage: fullText.slice(0, PROMPT_CONTEXT_LIMIT),
          relevanceScore: 0.9,
        },
      ];
    }
  }

  // Lấy dữ liệu nguồn for library.
  async getSourcesForLibrary(
    userId: string,
    question: string,
    limit = 5,
    filters?: LibraryFiltersDto,
  ): Promise<ChatSourceResult[]> {
    const queryAnalysis = this.analyzeQuery(question);
    if (
      this.hasSelectedDocumentFilter(filters) &&
      this.isWholeDocumentContextQuery(question)
    ) {
      return this.getSelectedDocumentSources(userId, filters, limit, question);
    }

    if (
      queryAnalysis.explicitSearchIntent &&
      queryAnalysis.coreTerms.length === 0
    ) {
      if (this.hasSelectedDocumentFilter(filters)) {
        return this.getSelectedDocumentSources(userId, filters, limit);
      }
      return [];
    }

    if (queryAnalysis.documentSearchIntent) {
      this.logger.log(`Document discovery intent detected: "${question}"`);
      const discoveredSources = await this.executeDocumentDiscovery(
        userId,
        question,
        limit,
        filters,
        queryAnalysis,
      );
      if (discoveredSources.length > 0) {
        return discoveredSources;
      }
      this.logger.log(
        `Document discovery found no metadata match; falling back to semantic search for "${question}"`,
      );
    }

    try {
      const queryEmbedding =
        await this.geminiService.generateEmbedding(question);

      const dbLimit = Math.max(limit * 4, 20);
      const queryParams: unknown[] = [
        JSON.stringify(queryEmbedding),
        userId,
        userId,
        dbLimit,
      ];
      let filterSql = '';

      if (filters?.subjectId) {
        queryParams.push(filters.subjectId);
        filterSql += ` AND d.subject_id = $${queryParams.length}::uuid`;
      }
      if (filters?.subjectIds && filters.subjectIds.length > 0) {
        queryParams.push(filters.subjectIds);
        filterSql += ` AND d.subject_id = ANY($${queryParams.length}::uuid[])`;
      }
      if (filters?.categoryId) {
        queryParams.push(filters.categoryId);
        filterSql += ` AND d.category_id = $${queryParams.length}::uuid`;
      }
      const fileTypeFilter = this.toFileTypeFilter(filters?.fileType);
      if (fileTypeFilter) {
        if (typeof fileTypeFilter === 'string') {
          queryParams.push(fileTypeFilter);
          filterSql += ` AND d.file_type = $${queryParams.length}`;
        } else {
          queryParams.push(fileTypeFilter.in);
          filterSql += ` AND d.file_type = ANY($${queryParams.length}::text[])`;
        }
      }
      if (filters?.documentIds && filters.documentIds.length > 0) {
        queryParams.push(filters.documentIds);
        filterSql += ` AND d.id = ANY($${queryParams.length}::uuid[])`;
      }

      const sqlQuery = `
        SELECT
          c.id as "chunkId",
          c.chunk_index as "chunkIndex",
          c.content,
          c.source_locator as "sourceLocator",
          c.document_id as "documentId",
          d.title,
          (c.embedding <=> $1::vector) as distance
        FROM document_chunks c
        JOIN documents d ON d.id = c.document_id
        JOIN document_contents dc ON dc.document_id = d.id
        LEFT JOIN saved_documents sd ON sd.document_id = d.id AND sd.user_id = $3::uuid
        WHERE (d.owner_id = $2::uuid OR sd.id IS NOT NULL)
          AND d.status = 'ACTIVE'
          AND d.extraction_status IN ('COMPLETED', 'MOCKED')
          AND dc.extraction_status IN ('COMPLETED', 'MOCKED')
          AND dc.quality_status IN ('READY', 'PARTIAL')
          ${filterSql}
        ORDER BY distance ASC
        LIMIT $4
      `;

      const chunks = await this.prisma.$queryRawUnsafe<RawChunk[]>(
        sqlQuery,
        ...queryParams,
      );
      const scopedChunks = this.hasSelectedDocumentFilter(filters)
        ? chunks.filter((chunk) =>
            filters.documentIds.includes(chunk.documentId),
          )
        : chunks;

      // Semantic search ran successfully — filter by threshold.
      // Return [] when no document meets the minimum similarity bar;
      // do NOT fall through to the keyword fallback in this case.
      const relevantChunks = this.reRankChunks(scopedChunks, question).filter(
        (c) => this.chunkRelevanceScore(c, question) >= MIN_SEMANTIC_SCORE,
      );

      if (relevantChunks.length === 0) {
        // The user explicitly scoped the chat to specific documents; never
        // answer "no sources" while those documents exist. Cross-lingual
        // questions (Vietnamese question over English content) routinely
        // score below the semantic threshold, so fall back to the selected
        // documents' text instead of dropping them.
        if (this.hasSelectedDocumentFilter(filters)) {
          return this.getSelectedDocumentSources(
            userId,
            filters,
            limit,
            question,
          );
        }
        return [];
      }

      const grouped = this.groupChunksByDocument(relevantChunks, question);
      const semanticSources: ChatSourceResult[] = grouped.map((doc, index) => ({
        citationId: doc.chunkId,
        chunkId: doc.chunkId,
        sourceNumber: index + 1,
        documentId: doc.documentId,
        title: doc.title,
        chunkIndex: doc.chunkIndex,
        snippet: doc.snippet,
        quote: doc.snippet,
        promptContext: doc.promptContext,
        passage: doc.promptContext,
        relevanceScore: doc.relevanceScore,
        sourceLocator: doc.sourceLocator,
      }));
      const sources = this.filterSemanticSourcesForTopic(
        semanticSources,
        queryAnalysis,
      );

      if (sources.length === 0 && this.hasSelectedDocumentFilter(filters)) {
        return this.getSelectedDocumentSources(
          userId,
          filters,
          limit,
          question,
        );
      }

      return this.reRankSources(sources, question, limit);
    } catch {
      // Only falls here on technical failures: embedding API error, DB exception, etc.
      if (this.hasSelectedDocumentFilter(filters)) {
        return this.getSelectedDocumentSources(
          userId,
          filters,
          limit,
          question,
        );
      }
      return this.fallbackKeywordSearch(userId, question, limit, filters);
    }
  }

  // Thực hiện chức năng fallback keyword search.
  async fallbackKeywordSearch(
    userId: string,
    question: string,
    limit = 5,
    filters?: LibraryFiltersDto,
  ): Promise<ChatSourceResult[]> {
    const documents = await this.prisma.document.findMany({
      where: {
        OR: [{ ownerId: userId }, { savedBy: { some: { userId } } }],
        status: DocumentStatus.ACTIVE,
        extractionStatus: { in: SEARCHABLE_EXTRACTION_STATUSES },
        content: {
          is: {
            extractionStatus: { in: SEARCHABLE_EXTRACTION_STATUSES },
            qualityStatus: { in: SEARCHABLE_EXTRACTION_QUALITIES },
            OR: [
              { extractedText: { not: null } },
              { contentSummary: { not: null } },
            ],
          },
        },
        id:
          filters?.documentIds && filters.documentIds.length > 0
            ? { in: filters.documentIds }
            : undefined,
        subjectId: filters?.subjectId,
        categoryId: filters?.categoryId,
        fileType: this.toFileTypeFilter(filters?.fileType),
      },
      select: {
        id: true,
        title: true,
        description: true,
        content: {
          select: {
            extractedText: true,
            contentSummary: true,
          },
        },
        tags: {
          select: {
            tag: { select: { name: true } },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    const rawSources = documents
      .map((document) => ({
        document,
        relevanceScore: this.scoreDocument(document, question),
      }))
      .filter(({ relevanceScore }) => relevanceScore >= MIN_RELEVANCE_SCORE)
      .sort((left, right) => {
        if (right.relevanceScore !== left.relevanceScore) {
          return right.relevanceScore - left.relevanceScore;
        }

        return left.document.title.localeCompare(right.document.title);
      })
      .slice(0, Math.max(20, limit * 3))
      .map(({ document, relevanceScore }, index) => {
        const normalizedScore = Math.min(
          0.99,
          0.1 + (relevanceScore / (relevanceScore + 20)) * 0.89,
        );
        return this.toCitation(document, index + 1, normalizedScore, question);
      });

    const results = this.reRankSources(rawSources, question, limit);
    return results.map((item) => ({ ...item, usedFallbackKeyword: true }));
  }

  // Kiểm tra điều kiện selected tài liệu filter.
  private hasSelectedDocumentFilter(
    filters?: LibraryFiltersDto,
  ): filters is LibraryFiltersDto & { documentIds: string[] } {
    return Boolean(filters?.documentIds && filters.documentIds.length > 0);
  }

  // Lấy dữ liệu selected tài liệu nguồn.
  private async getSelectedDocumentSources(
    userId: string,
    filters: LibraryFiltersDto & { documentIds: string[] },
    limit: number,
    question?: string,
  ): Promise<ChatSourceResult[]> {
    const documents = await this.prisma.document.findMany({
      where: {
        OR: [{ ownerId: userId }, { savedBy: { some: { userId } } }],
        status: DocumentStatus.ACTIVE,
        extractionStatus: { in: SEARCHABLE_EXTRACTION_STATUSES },
        content: {
          is: {
            extractionStatus: { in: SEARCHABLE_EXTRACTION_STATUSES },
            qualityStatus: { in: SEARCHABLE_EXTRACTION_QUALITIES },
            OR: [
              { extractedText: { not: null } },
              { contentSummary: { not: null } },
            ],
          },
        },
        id: { in: filters.documentIds },
        subjectId:
          filters.subjectIds && filters.subjectIds.length > 0
            ? { in: filters.subjectIds }
            : filters.subjectId,
        categoryId: filters.categoryId,
        fileType: this.toFileTypeFilter(filters.fileType),
      },
      select: {
        id: true,
        title: true,
        content: {
          select: {
            extractedText: true,
            contentSummary: true,
          },
        },
      },
    });

    const selectedOrder = new Map(
      filters.documentIds.map((documentId, index) => [documentId, index]),
    );

    return documents
      .filter((document) => selectedOrder.has(document.id))
      .sort(
        (left, right) =>
          (selectedOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (selectedOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(0, limit)
      .map((document, index) =>
        this.toCitation(document, index + 1, 0.9, question),
      );
  }

  // Thực hiện chức năng group chunks by tài liệu.
  private groupChunksByDocument(
    chunks: RawChunk[],
    question?: string,
  ): GroupedDocument[] {
    const maxChunksPerDocument =
      question && this.isDetailedAnswerQuery(question)
        ? Math.max(MAX_CHUNKS_PER_DOCUMENT, 5)
        : MAX_CHUNKS_PER_DOCUMENT;
    const promptContextLimit =
      question && this.isDetailedAnswerQuery(question)
        ? PROMPT_CONTEXT_LIMIT * 2
        : PROMPT_CONTEXT_LIMIT;
    const byDocument = new Map<string, RawChunk[]>();

    for (const chunk of chunks) {
      const existing = byDocument.get(chunk.documentId) ?? [];
      if (existing.length < maxChunksPerDocument) {
        existing.push(chunk);
        byDocument.set(chunk.documentId, existing);
      }
    }

    return Array.from(byDocument.values()).map((docChunks) => {
      const best = docChunks[0];
      const relevanceScore = this.chunkRelevanceScore(best, question);
      const combinedText = docChunks.map((c) => c.content).join('\n\n');

      return {
        chunkId: best.chunkId,
        chunkIndex: best.chunkIndex,
        documentId: best.documentId,
        title: best.title,
        relevanceScore,
        snippet: this.toSourceSnippet(best.content, question),
        promptContext: combinedText.slice(0, promptContextLimit),
        sourceLocator: [
          ...new Set(docChunks.flatMap((chunk) => chunk.sourceLocator ?? [])),
        ],
      };
    });
  }

  // Thực hiện chức năng select chunks for prompt.
  private selectChunksForPrompt<
    T extends { content: string; distance: number },
  >(chunks: T[], question: string, limit: number): T[] {
    if (!this.isDetailedAnswerQuery(question)) {
      return chunks.slice(0, limit);
    }

    const selected: T[] = [];
    const seenLocations = new Set<string>();

    for (const chunk of chunks) {
      const location = this.extractStructureLocation(chunk.content);
      if (location && seenLocations.has(location)) {
        continue;
      }
      selected.push(chunk);
      if (location) {
        seenLocations.add(location);
      }
      if (selected.length >= limit) {
        break;
      }
    }

    if (selected.length < limit) {
      for (const chunk of chunks) {
        if (!selected.includes(chunk)) {
          selected.push(chunk);
        }
        if (selected.length >= limit) {
          break;
        }
      }
    }

    return selected;
  }

  // Xử lý structure location.
  private extractStructureLocation(content: string): string {
    return /\[(?:SECTION|PAGE|SLIDE|SHEET):[^\]]+\]/.exec(content)?.[0] ?? '';
  }

  // Chuyển đổi hoặc chuẩn hóa citation.
  private toCitation(
    document: {
      id: string;
      title: string;
      content: {
        extractedText?: string | null;
        contentSummary?: string | null;
      } | null;
    },
    sourceNumber: number,
    relevanceScore: number | null = null,
    question?: string,
  ): ChatSourceResult {
    const wholeDocumentQuestion = Boolean(
      question && this.isWholeDocumentContextQuery(question),
    );
    const explicitSectionQuestion = Boolean(
      question && this.hasExplicitNumberedSectionReference(question),
    );
    const fullText = wholeDocumentQuestion
      ? this.buildWholeDocumentContext(
          document.content?.extractedText ??
            document.content?.contentSummary ??
            '',
        )
      : this.extractFullText(document.content, question);
    const snippetText = this.extractSnippetText(document.content, question);
    const promptContextLimit = wholeDocumentQuestion
      ? WHOLE_DOCUMENT_CONTEXT_LIMIT
      : explicitSectionQuestion
        ? WHOLE_DOCUMENT_CONTEXT_LIMIT
        : question && this.isDetailedAnswerQuery(question)
          ? PROMPT_CONTEXT_LIMIT * 2
          : PROMPT_CONTEXT_LIMIT;
    return {
      sourceNumber,
      documentId: document.id,
      title: document.title,
      chunkId: null,
      chunkIndex: null,
      snippet: this.toSourceSnippet(snippetText, question),
      promptContext: fullText.slice(0, promptContextLimit),
      passage: fullText.slice(0, promptContextLimit),
      relevanceScore,
    };
  }

  // Xử lý snippet text.
  private extractSnippetText(
    content: {
      extractedText?: string | null;
    } | null,
    question?: string,
  ): string {
    const extractedText = content?.extractedText?.trim() || '';

    if (question) {
      const explicitSectionText = this.extractExplicitSectionPassage(
        extractedText,
        question,
      );
      if (explicitSectionText) {
        return explicitSectionText;
      }

      const relevantText = this.extractRelevantPassage(extractedText, question);
      if (relevantText) {
        return relevantText;
      }
    }

    return extractedText;
  }

  // Xử lý full text.
  private extractFullText(
    content: {
      extractedText?: string | null;
      contentSummary?: string | null;
    } | null,
    question?: string,
  ): string {
    const extractedText = content?.extractedText?.trim() || '';
    const contentSummary = content?.contentSummary?.trim() || '';

    if (question) {
      const explicitSectionText = this.extractExplicitSectionPassage(
        extractedText,
        question,
      );
      if (explicitSectionText) {
        return explicitSectionText;
      }
    }

    if (question && this.isDetailedAnswerQuery(question) && extractedText) {
      return extractedText;
    }

    if (question) {
      const relevantText = this.extractRelevantPassage(extractedText, question);
      if (relevantText) {
        return relevantText;
      }
    }

    return contentSummary || extractedText;
  }

  // Thực hiện chức năng score tài liệu.
  private scoreDocument(
    document: {
      title: string;
      description: string | null;
      content: {
        extractedText: string | null;
        contentSummary: string | null;
      } | null;
      tags: Array<{ tag: { name: string } }>;
    },
    query: string | QueryAnalysis,
  ): number {
    const terms =
      typeof query === 'string' ? this.tokenize(query) : query.coreTerms;
    if (terms.length === 0) {
      return 0;
    }

    return (
      this.scoreText(document.title, terms, 10) +
      this.scoreText(document.description, terms, 5) +
      this.scoreText(document.content?.contentSummary, terms, 5) +
      this.scoreText(
        document.tags.map(({ tag }) => tag.name).join(' '),
        terms,
        4,
      ) +
      this.scoreText(document.content?.extractedText, terms, 1)
    );
  }

  // Thực hiện chức năng score text.
  private scoreText(
    value: string | null | undefined,
    terms: string[],
    weight: number,
  ): number {
    if (!value) {
      return 0;
    }

    const normalized = this.normalize(value);
    return terms.reduce((score, term) => {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedTerm}\\b`, 'gi');
      const matches = normalized.match(regex)?.length || 0;
      return score + matches * weight;
    }, 0);
  }

  // Chuyển đổi hoặc chuẩn hóa tokenize.
  private tokenize(value: string): string[] {
    const tokens = this.normalize(value)
      .split(' ')
      .filter((token) => this.isSearchToken(token));

    return [...new Set(tokens)];
  }

  // Kiểm tra điều kiện search token.
  private isSearchToken(token: string): boolean {
    return (
      !STOPWORDS.has(token) && (token.length >= 2 || /^[0-9]+$/.test(token))
    );
  }

  // Chuyển đổi hoặc chuẩn hóa normalize.
  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/\u0111/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Chuyển đổi hoặc chuẩn hóa tệp type filter.
  private toFileTypeFilter(
    fileType: string | undefined,
  ): FileTypeFilter | undefined {
    if (!fileType) {
      return undefined;
    }

    const normalized = fileType.trim().toLowerCase();
    const mimeTypes = FILE_TYPE_ALIASES[normalized];

    return mimeTypes ? { in: mimeTypes } : normalized;
  }

  // Thực hiện chức năng re rank nguồn.
  private reRankSources(
    sources: ChatSourceResult[],
    question: string,
    limit: number,
  ): ChatSourceResult[] {
    const terms = this.tokenize(question);

    return sources
      .map((source) => {
        let bonus = 0;
        const titleLower = this.normalize(source.title);

        for (const term of terms) {
          const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`\\b${escapedTerm}\\b`, 'i').test(titleLower)) {
            bonus += 0.05;
            if (bonus >= 0.1) break; // Total title bonus capped at +0.10
          }
        }

        const rawScore = source.relevanceScore ?? 0.5;
        const boostedScore = Math.min(0.99, rawScore + bonus);

        return {
          ...source,
          relevanceScore: boostedScore,
        };
      })
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, limit)
      .map((source, index) => ({
        ...source,
        sourceNumber: index + 1,
      }));
  }

  // Thực hiện chức năng filter semantic nguồn for topic.
  private filterSemanticSourcesForTopic(
    sources: ChatSourceResult[],
    queryAnalysis: QueryAnalysis,
  ): ChatSourceResult[] {
    const topicTerms = this.extractTopicFilterTerms(queryAnalysis);
    if (
      topicTerms.length === 0 ||
      (!queryAnalysis.documentSearchIntent &&
        !this.hasStrongTopicSignal(topicTerms))
    ) {
      return sources;
    }

    const hasIdentifierTerms = topicTerms.some((term) => term.includes('_'));
    const minMatches = hasIdentifierTerms
      ? topicTerms.length
      : topicTerms.length <= 2
        ? 1
        : 2;
    return sources.filter(
      (source) => this.countTopicMatches(source, topicTerms) >= minMatches,
    );
  }

  // Xử lý topic filter terms.
  private extractTopicFilterTerms(queryAnalysis: QueryAnalysis): string[] {
    return queryAnalysis.coreTerms.filter(
      (term) => !TOPIC_FILTER_EXCLUDED_TERMS.has(term),
    );
  }

  // Kiểm tra điều kiện strong topic signal.
  private hasStrongTopicSignal(topicTerms: string[]): boolean {
    return (
      topicTerms.length >= 2 || topicTerms.some((term) => term.length >= 3)
    );
  }

  // Thực hiện chức năng count topic matches.
  private countTopicMatches(
    source: Pick<ChatSourceResult, 'title' | 'snippet' | 'promptContext'>,
    coreTerms: string[],
  ): number {
    const sourceText = [
      source.title,
      source.snippet,
      source.promptContext,
    ].join(' ');
    const haystack = this.normalize(sourceText);
    const haystackWithUnderscores = this.normalizeWithUnderscores(sourceText);

    return coreTerms.reduce((count, term) => {
      const variants = this.getTermVariants(term);
      const matched = variants.some((variant) =>
        this.matchesNormalizedTerm(haystack, haystackWithUnderscores, variant),
      );
      return matched ? count + 1 : count;
    }, 0);
  }

  // Lấy dữ liệu term variants.
  private getTermVariants(term: string): string[] {
    const variants = new Set([term]);
    if (term.endsWith('js') && term.length > 2) {
      variants.add(`${term.slice(0, -2)} js`);
    }
    if (term === 'api') {
      variants.add('apis');
    }
    if (term.includes('_')) {
      variants.add(term.replace(/_/g, ' '));
    }
    return [...variants];
  }

  // Kiểm tra điều kiện normalized term.
  private matchesNormalizedTerm(
    normalizedValue: string,
    normalizedValueWithUnderscores: string,
    term: string,
  ): boolean {
    return term.includes('_')
      ? this.containsTerm(normalizedValueWithUnderscores, term)
      : this.containsTerm(normalizedValue, term);
  }

  // Thực hiện chức năng contains term.
  private containsTerm(value: string, term: string): boolean {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escapedTerm}\\b`, 'i').test(value);
  }

  // Kiểm tra điều kiện tài liệu discovery intent.
  private isDocumentDiscoveryIntent(question: string): boolean {
    return this.analyzeQuery(question).documentSearchIntent;
  }

  // Xử lý core terms.
  private extractCoreTerms(question: string): string[] {
    return this.analyzeQuery(question).coreTerms;
  }

  // Thực hiện chức năng score tài liệu metadata.
  private scoreDocumentMetadata(
    doc: DocumentDiscoveryRow,
    query: QueryAnalysis | string[],
  ): MetadataScore {
    const analysis = Array.isArray(query)
      ? {
          normalized: '',
          coreTerms: query,
          corePhrases: this.extractCorePhrases(query),
          explicitSearchIntent: false,
          documentSearchIntent: query.length > 0,
          conciseTopicQuery: false,
        }
      : query;
    const coreTerms = analysis.coreTerms;
    const title = doc.title ? this.normalize(doc.title) : '';
    const titleWithUnderscores = doc.title
      ? this.normalizeWithUnderscores(doc.title)
      : '';
    const subjectName = doc.subject?.name
      ? this.normalize(doc.subject.name)
      : '';
    const subjectNameWithUnderscores = doc.subject?.name
      ? this.normalizeWithUnderscores(doc.subject.name)
      : '';
    const categoryName = doc.category?.name
      ? this.normalize(doc.category.name)
      : '';
    const categoryNameWithUnderscores = doc.category?.name
      ? this.normalizeWithUnderscores(doc.category.name)
      : '';
    const description = doc.description ? this.normalize(doc.description) : '';
    const descriptionWithUnderscores = doc.description
      ? this.normalizeWithUnderscores(doc.description)
      : '';
    const tags =
      doc.tags?.map((t) => this.normalize(t.tag?.name || '')).join(' ') || '';
    const tagsWithUnderscores =
      doc.tags
        ?.map((t) => this.normalizeWithUnderscores(t.tag?.name || ''))
        .join(' ') || '';
    const content = this.normalize(this.extractFullText(doc.content ?? null));
    const contentWithUnderscores = this.normalizeWithUnderscores(
      this.extractFullText(doc.content ?? null),
    );

    let metadataOverlap = 0;
    let rawScore = 0;
    let titleTokenMatches = 0;
    let descriptionTokenMatches = 0;
    let titlePhraseMatch = false;
    let taxonomyMatch = false;
    let strongDescriptionMatch = false;

    for (const phrase of analysis.corePhrases) {
      const matchesTitlePhrase = this.containsPhrase(title, phrase);
      const matchesSubjectPhrase = this.containsPhrase(subjectName, phrase);
      const matchesCategoryPhrase = this.containsPhrase(categoryName, phrase);
      const matchesTagsPhrase = this.containsPhrase(tags, phrase);
      const matchesDescriptionPhrase = this.containsPhrase(description, phrase);
      const matchesContentPhrase = this.containsPhrase(content, phrase);

      if (
        matchesTitlePhrase ||
        matchesSubjectPhrase ||
        matchesCategoryPhrase ||
        matchesTagsPhrase ||
        matchesDescriptionPhrase
      ) {
        metadataOverlap += phrase.split(' ').length;
      }

      if (matchesTitlePhrase) {
        titlePhraseMatch = true;
        rawScore += 50;
      }
      if (matchesSubjectPhrase) {
        taxonomyMatch = true;
        rawScore += 35;
      }
      if (matchesCategoryPhrase) {
        taxonomyMatch = true;
        rawScore += 28;
      }
      if (matchesTagsPhrase) {
        taxonomyMatch = true;
        rawScore += 26;
      }
      if (matchesDescriptionPhrase) {
        strongDescriptionMatch = true;
        rawScore += 18;
      }
      if (matchesContentPhrase) {
        rawScore += 4;
      }
    }

    for (const term of coreTerms) {
      const matchesTitle = this.matchesNormalizedTerm(
        title,
        titleWithUnderscores,
        term,
      );
      const matchesSubject = this.matchesNormalizedTerm(
        subjectName,
        subjectNameWithUnderscores,
        term,
      );
      const matchesCategory = this.matchesNormalizedTerm(
        categoryName,
        categoryNameWithUnderscores,
        term,
      );
      const matchesDescription = this.matchesNormalizedTerm(
        description,
        descriptionWithUnderscores,
        term,
      );
      const matchesTags = this.matchesNormalizedTerm(
        tags,
        tagsWithUnderscores,
        term,
      );
      const matchesContent = this.matchesNormalizedTerm(
        content,
        contentWithUnderscores,
        term,
      );

      if (
        matchesTitle ||
        matchesSubject ||
        matchesCategory ||
        matchesDescription ||
        matchesTags
      ) {
        metadataOverlap += 1;
      }

      if (matchesTitle) {
        titleTokenMatches += 1;
        rawScore += 10;
      }
      if (matchesSubject) {
        taxonomyMatch = true;
        rawScore += 8;
      }
      if (matchesCategory) {
        taxonomyMatch = true;
        rawScore += 6;
      }
      if (matchesTags) {
        taxonomyMatch = true;
        rawScore += 5;
      }
      if (matchesDescription) {
        descriptionTokenMatches += 1;
        rawScore += 4;
      }
      if (matchesContent) {
        rawScore += 1;
      }
    }

    const strongTitleTokenOverlap =
      titleTokenMatches > 0 &&
      (coreTerms.length === 1 || titleTokenMatches / coreTerms.length >= 0.67);
    strongDescriptionMatch =
      strongDescriptionMatch ||
      (descriptionTokenMatches > 0 &&
        descriptionTokenMatches / coreTerms.length >= 0.67);
    const passesTopicGate =
      metadataOverlap > 0 &&
      (titlePhraseMatch ||
        strongTitleTokenOverlap ||
        taxonomyMatch ||
        strongDescriptionMatch);
    const relevanceScore =
      rawScore > 0
        ? Math.min(0.99, 0.55 + (rawScore / (rawScore + 25)) * 0.44)
        : 0;

    return {
      rawScore,
      relevanceScore,
      metadataOverlap,
      titlePhraseMatch,
      strongTitleTokenOverlap,
      taxonomyMatch,
      strongDescriptionMatch,
      passesTopicGate,
    };
  }

  // Thực hiện chức năng analyze query.
  private analyzeQuery(question: string): QueryAnalysis {
    const normalized = this.normalize(question);
    const allTokens = normalized.split(' ').filter(Boolean);
    const identifierTerms = this.extractIdentifierTerms(question);
    const identifierParts = new Set(
      identifierTerms.flatMap((term) => term.split('_')),
    );
    const coreTerms = [
      ...new Set([
        ...identifierTerms,
        ...allTokens.filter(
          (token) =>
            token.length >= 2 &&
            !STOPWORDS.has(token) &&
            !SEARCH_INTENT_WORDS.has(token) &&
            !identifierParts.has(token),
        ),
      ]),
    ];
    const corePhrases = this.extractCorePhrases(coreTerms);
    if (this.isTableStructureQuery(question)) {
      return {
        normalized,
        coreTerms,
        corePhrases,
        explicitSearchIntent: false,
        documentSearchIntent: false,
        conciseTopicQuery: false,
      };
    }

    const explicitSearchIntent = allTokens.some((token) =>
      SEARCH_INTENT_WORDS.has(token),
    );
    const conciseTopicQuery =
      !explicitSearchIntent &&
      identifierTerms.length === 0 &&
      this.isConciseTopicQuery(question, coreTerms);
    const documentSearchIntent =
      coreTerms.length > 0 && (explicitSearchIntent || conciseTopicQuery);

    return {
      normalized,
      coreTerms,
      corePhrases,
      explicitSearchIntent,
      documentSearchIntent,
      conciseTopicQuery,
    };
  }

  // Xử lý identifier terms.
  private extractIdentifierTerms(question: string): string[] {
    return [
      ...new Set(
        this.normalizeWithUnderscores(question)
          .split(' ')
          .filter(
            (token) =>
              token.includes('_') &&
              token
                .split('_')
                .every((part) => part.length >= 2 && !STOPWORDS.has(part)),
          ),
      ),
    ];
  }

  // Xử lý core phrases.
  private extractCorePhrases(coreTerms: string[]): string[] {
    const phrases: string[] = [];
    const maxPhraseLength = Math.min(4, coreTerms.length);

    for (let size = maxPhraseLength; size >= 2; size -= 1) {
      for (let index = 0; index <= coreTerms.length - size; index += 1) {
        phrases.push(coreTerms.slice(index, index + size).join(' '));
      }
    }

    return [...new Set(phrases)];
  }

  // Kiểm tra điều kiện concise topic query.
  private isConciseTopicQuery(
    originalQuestion: string,
    coreTerms: string[],
  ): boolean {
    if (coreTerms.length === 0 || coreTerms.length > 5) {
      return false;
    }

    const trimmed = originalQuestion.trim();
    const hasQuestionMark = trimmed.includes('?');
    const hasAcronym = /\b[A-Z0-9]{2,}\b/.test(trimmed);
    const hasTitleCaseTopic = /\b[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)+\b/.test(
      trimmed,
    );

    return !hasQuestionMark && (hasAcronym || hasTitleCaseTopic);
  }

  // Thực hiện chức năng contains phrase.
  private containsPhrase(value: string, phrase: string): boolean {
    if (!value || !phrase) {
      return false;
    }

    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escapedPhrase}\\b`, 'i').test(value);
  }

  // Thực hiện chức năng apply score gap filter.
  private applyScoreGapFilter<T extends { relevanceScore: number }>(
    items: T[],
    queryAnalysis: QueryAnalysis,
  ): T[] {
    if (!queryAnalysis.documentSearchIntent || items.length <= 1) {
      return items;
    }

    const topScore = items[0]?.relevanceScore ?? 0;
    if (topScore < 0.84) {
      return items;
    }

    const minAllowedScore = Math.max(
      MIN_METADATA_RELEVANCE_SCORE,
      topScore - 0.22,
    );
    return items.filter((item) => item.relevanceScore >= minAllowedScore);
  }

  // Xử lý tài liệu discovery.
  private async executeDocumentDiscovery(
    userId: string,
    question: string,
    limit = 5,
    filters?: LibraryFiltersDto,
    queryAnalysis = this.analyzeQuery(question),
  ): Promise<ChatSourceResult[]> {
    const coreTerms = queryAnalysis.coreTerms;
    this.logger.log(
      `Executing document discovery for user ${userId}. Question: "${question}". Core terms: ${JSON.stringify(coreTerms)}`,
    );

    if (coreTerms.length === 0) {
      return [];
    }

    const documents = await this.prisma.document.findMany({
      where: {
        OR: [{ ownerId: userId }, { savedBy: { some: { userId } } }],
        status: DocumentStatus.ACTIVE,
        id:
          filters?.documentIds && filters.documentIds.length > 0
            ? { in: filters.documentIds }
            : undefined,
        subjectId:
          filters?.subjectIds && filters.subjectIds.length > 0
            ? { in: filters.subjectIds }
            : filters?.subjectId || undefined,
        categoryId: filters?.categoryId,
        fileType: this.toFileTypeFilter(filters?.fileType),
      },
      include: {
        subject: true,
        category: true,
        tags: {
          include: {
            tag: true,
          },
        },
        content: {
          select: {
            extractedText: true,
            contentSummary: true,
            extractionStatus: true,
          },
        },
      },
    });

    const scopedDocuments = this.hasSelectedDocumentFilter(filters)
      ? documents.filter((document) =>
          filters.documentIds.includes(document.id),
        )
      : documents;

    const scoredDocs = scopedDocuments
      .map((doc) => {
        const metadataScore = this.scoreDocumentMetadata(doc, queryAnalysis);
        return {
          doc,
          rawScore: metadataScore.rawScore,
          relevanceScore: metadataScore.relevanceScore,
          metadataScore,
        };
      })
      .filter(
        (item) =>
          item.metadataScore.passesTopicGate &&
          item.relevanceScore >= MIN_METADATA_RELEVANCE_SCORE,
      )
      .sort((a, b) => {
        if (b.rawScore !== a.rawScore) {
          return b.rawScore - a.rawScore;
        }

        return a.doc.title.localeCompare(b.doc.title);
      });

    const sources: ChatSourceResult[] = this.applyScoreGapFilter(
      scoredDocs,
      queryAnalysis,
    )
      .slice(0, limit)
      .map((item, index) => {
        const fullText = this.extractFullText(item.doc.content, question);
        const snippetText = this.extractSnippetText(item.doc.content, question);
        return {
          sourceNumber: index + 1,
          documentId: item.doc.id,
          title: item.doc.title,
          chunkId: null,
          chunkIndex: null,
          snippet: this.toSourceSnippet(snippetText, question),
          promptContext: fullText.slice(0, PROMPT_CONTEXT_LIMIT),
          passage: fullText.slice(0, PROMPT_CONTEXT_LIMIT),
          relevanceScore: item.relevanceScore,
        };
      });

    this.logger.log(
      `Document discovery found ${sources.length} matching documents`,
    );
    return sources;
  }

  // Thực hiện chức năng re rank chunks.
  private reRankChunks<T extends { content: string; distance: number }>(
    chunks: T[],
    question: string,
  ): T[] {
    return [...chunks].sort((left, right) => {
      return (
        this.chunkRelevanceScore(right, question) -
        this.chunkRelevanceScore(left, question)
      );
    });
  }

  // Thực hiện chức năng table chunk bonus.
  private tableChunkBonus(
    content: string,
    queryTerms: string[],
    includeTableStructureBonus: boolean,
  ): number {
    const normalized = this.normalizeWithUnderscores(content);
    const tokens = new Set(normalized.split(' ').filter(Boolean));
    let bonus = 0;

    if (
      includeTableStructureBonus &&
      (tokens.has('table') || tokens.has('section'))
    ) {
      bonus += 0.08;
    }
    for (const term of queryTerms) {
      if (tokens.has(term) || normalized.includes(term)) {
        bonus += 0.06;
      }
    }

    return Math.min(bonus, 0.3);
  }

  // Thực hiện chức năng chunk relevance score.
  private chunkRelevanceScore(
    chunk: { content: string; distance: number },
    question?: string,
  ): number {
    const baseScore = 1 - chunk.distance;
    if (!question) {
      return baseScore;
    }

    const isTableLikeChunk = this.isStructuredText(chunk.content);
    const isTableStructureQuery = this.isTableStructureQuery(question);
    if (!isTableLikeChunk && !isTableStructureQuery) {
      return baseScore;
    }

    return Math.min(
      0.99,
      baseScore +
        this.tableChunkBonus(
          chunk.content,
          this.tokenizeWithUnderscores(question),
          isTableStructureQuery,
        ),
    );
  }

  // Kiểm tra điều kiện table structure query.
  private isTableStructureQuery(question: string): boolean {
    const normalized = this.normalizeWithUnderscores(question);
    const tokens = normalized.split(' ').filter(Boolean);

    return (
      tokens.some((token) => TABLE_STRUCTURE_QUERY_TERMS.has(token)) ||
      TABLE_STRUCTURE_QUERY_PHRASES.some((phrase) =>
        this.containsPhrase(normalized, phrase),
      )
    );
  }

  // Kiểm tra điều kiện detailed answer query.
  private isDetailedAnswerQuery(question: string): boolean {
    const normalized = this.normalize(question);
    const tokens = normalized.split(' ').filter(Boolean);

    return (
      this.isContinuationQuery(question) ||
      tokens.some((token) => DETAILED_QUERY_TERMS.has(token)) ||
      DETAILED_QUERY_PHRASES.some((phrase) =>
        this.containsPhrase(normalized, phrase),
      )
    );
  }

  // Kiểm tra điều kiện whole tài liệu context query.
  private isWholeDocumentContextQuery(question: string): boolean {
    const normalized = this.normalize(question);
    return (
      this.isContinuationQuery(question) ||
      (this.isDetailedAnswerQuery(question) &&
        (this.containsPhrase(normalized, 'toan bo') ||
          this.containsPhrase(normalized, 'day du') ||
          this.containsPhrase(normalized, 'file nay noi gi') ||
          this.containsPhrase(normalized, 'tai lieu nay noi gi') ||
          /\b(file|document|documents|tai lieu)\b/.test(normalized)))
    );
  }

  // Kiểm tra điều kiện continuation query.
  private isContinuationQuery(question: string): boolean {
    const normalized = this.normalize(question);
    return (
      this.containsPhrase(normalized, 'tiep tuc') ||
      this.containsPhrase(normalized, 'phan tiep theo') ||
      this.containsPhrase(normalized, 'phan con lai') ||
      this.containsPhrase(normalized, 'continue') ||
      this.containsPhrase(normalized, 'next part')
    );
  }

  // Chuyển đổi hoặc chuẩn hóa whole tài liệu context.
  private buildWholeDocumentContext(text: string): string {
    const normalized = text.trim();
    if (normalized.length <= WHOLE_DOCUMENT_CONTEXT_LIMIT) {
      return normalized;
    }

    const blocks = normalized
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    const allCandidates =
      blocks.length > 1 ? blocks : this.splitIntoWindows(normalized);
    const candidates = this.selectEvenlyDistributedBlocks(allCandidates);
    const separator = '\n\n[... phần giữa đã được rút gọn ...]\n\n';
    const contentBudget = Math.max(
      1,
      WHOLE_DOCUMENT_CONTEXT_LIMIT - separator.length * (candidates.length - 1),
    );
    const blockBudget = Math.max(
      1,
      Math.floor(contentBudget / candidates.length),
    );

    return candidates
      .map((block) => block.slice(0, blockBudget))
      .join(separator)
      .slice(0, WHOLE_DOCUMENT_CONTEXT_LIMIT);
  }

  // Thực hiện chức năng split into windows.
  private splitIntoWindows(text: string): string[] {
    const windowSize = Math.floor(WHOLE_DOCUMENT_CONTEXT_LIMIT / 3);
    const middleStart = Math.max(0, Math.floor((text.length - windowSize) / 2));
    return [
      text.slice(0, windowSize),
      text.slice(middleStart, middleStart + windowSize),
      text.slice(-windowSize),
    ];
  }

  // Thực hiện chức năng select evenly distributed blocks.
  private selectEvenlyDistributedBlocks(blocks: string[]): string[] {
    if (blocks.length <= WHOLE_DOCUMENT_MAX_BLOCKS) {
      return blocks;
    }

    return Array.from({ length: WHOLE_DOCUMENT_MAX_BLOCKS }, (_, index) => {
      const sourceIndex = Math.round(
        (index * (blocks.length - 1)) / (WHOLE_DOCUMENT_MAX_BLOCKS - 1),
      );
      return blocks[sourceIndex];
    });
  }

  // Xử lý explicit section passage.
  private extractExplicitSectionPassage(
    text: string,
    question: string,
  ): string {
    if (!text) {
      return '';
    }

    const requestedNumbers = this.extractRequestedSectionNumbers(question);
    if (requestedNumbers.size === 0) {
      return '';
    }

    const blocks = text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    const selectedSections: string[] = [];
    const seenSections = new Set<string>();

    for (let index = 0; index < blocks.length; index += 1) {
      const sectionNumber = this.numberedSectionLead(blocks[index]);
      if (!sectionNumber || !requestedNumbers.has(sectionNumber)) {
        continue;
      }

      const sectionText = this.collectSectionBlocks(blocks, index);
      if (!sectionText || seenSections.has(sectionText)) {
        continue;
      }

      selectedSections.push(sectionText);
      seenSections.add(sectionText);
    }

    return selectedSections.join('\n\n').slice(0, WHOLE_DOCUMENT_CONTEXT_LIMIT);
  }

  // Xử lý requested section numbers.
  private extractRequestedSectionNumbers(question: string): Set<string> {
    const normalized = this.normalize(question);
    const requestedNumbers = new Set<string>();
    const sectionPattern =
      /\b(?:bai|lesson|section|muc|phan|chuong|chapter|unit|slide|page|trang)\s+((?:\d+\s*(?:,|va|and)?\s*)+)/g;

    for (const match of normalized.matchAll(sectionPattern)) {
      const numbers = match[1]?.match(/\d+/g) ?? [];
      for (const number of numbers) {
        requestedNumbers.add(number);
      }
    }

    return requestedNumbers;
  }

  // Kiểm tra điều kiện explicit numbered section reference.
  private hasExplicitNumberedSectionReference(question: string): boolean {
    return this.extractRequestedSectionNumbers(question).size > 0;
  }

  // Xử lý relevant passage.
  private extractRelevantPassage(text: string, question: string): string {
    if (!text) {
      return '';
    }

    const queryTerms = this.tokenizeWithUnderscores(question);
    const blocks = text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    const scoredBlocks = blocks
      .map((block, index) => ({
        block,
        index,
        score: this.passageScore(
          block,
          queryTerms,
          this.isTableStructureQuery(question),
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.index - right.index;
      });

    if (scoredBlocks.length === 0) {
      return '';
    }

    const best = scoredBlocks[0];
    if (this.isNumberedSectionLead(best.block)) {
      return this.collectSectionBlocks(blocks, best.index);
    }

    const previous = blocks[best.index - 1];
    const bestBlock = this.focusPassageWithinBlock(
      best.block,
      queryTerms,
      this.isTableStructureQuery(question),
    );
    const context = [previous, bestBlock].filter(Boolean).join('\n\n');

    // Keep the query hit even when a DOCX table, PDF page, PPTX slide, or
    // XLSX sheet is larger than the prompt budget. Slicing the whole block
    // from its beginning used to silently discard matching rows near the end.
    return context.length <= PROMPT_CONTEXT_LIMIT
      ? context
      : bestBlock.slice(0, PROMPT_CONTEXT_LIMIT);
  }

  // Thực hiện chức năng focus passage within block.
  private focusPassageWithinBlock(
    block: string,
    queryTerms: string[],
    includeTableStructureBonus: boolean,
  ): string {
    if (block.length <= PROMPT_CONTEXT_LIMIT) {
      return block;
    }

    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const ranked = lines
      .map((line, index) => ({
        index,
        score: this.passageScore(line, queryTerms, includeTableStructureBonus),
      }))
      .sort(
        (left, right) => right.score - left.score || left.index - right.index,
      );
    const bestLineIndex = ranked[0]?.index ?? 0;
    const selected: string[] = [];
    let start = bestLineIndex;
    let end = bestLineIndex;
    let length = 0;

    // Tạo hoặc lưu line.
    const addLine = (line: string, prepend = false): boolean => {
      const nextLength = length + line.length + (selected.length > 0 ? 1 : 0);
      if (nextLength > PROMPT_CONTEXT_LIMIT) return false;
      if (prepend) {
        selected.unshift(line);
      } else {
        selected.push(line);
      }
      length = nextLength;
      return true;
    };

    addLine(lines[bestLineIndex] ?? '');
    while (start > 0 || end < lines.length - 1) {
      let added = false;
      if (start > 0) {
        start -= 1;
        added = addLine(lines[start], true) || added;
      }
      if (end < lines.length - 1) {
        end += 1;
        added = addLine(lines[end]) || added;
      }
      if (!added) break;
    }

    return selected.join('\n');
  }

  // Kiểm tra điều kiện numbered section lead.
  private isNumberedSectionLead(block: string): boolean {
    return this.numberedSectionLead(block) !== null;
  }

  // Thực hiện chức năng numbered section lead.
  private numberedSectionLead(block: string): string | null {
    if (block.trim().startsWith('[')) {
      return null;
    }

    const normalized = this.normalize(block);
    return (
      /^(bai|lesson|section|muc|phan|chuong|chapter|unit|slide|page|trang|lan|cau|buoc|step|question|item|part)\s+(\d+)\b/.exec(
        normalized,
      )?.[2] ?? null
    );
  }

  // Thực hiện chức năng collect section blocks.
  private collectSectionBlocks(blocks: string[], startIndex: number): string {
    const selected: string[] = [];
    let totalLength = 0;

    for (let index = startIndex; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (index > startIndex && this.isNumberedSectionLead(block)) {
        break;
      }

      const nextLength = totalLength + block.length + 2;
      if (selected.length > 0 && nextLength > PROMPT_CONTEXT_LIMIT) {
        break;
      }

      selected.push(block);
      totalLength = nextLength;
    }

    return selected.join('\n\n');
  }

  // Chuyển đổi hoặc chuẩn hóa nguồn snippet.
  private toSourceSnippet(text: string, question?: string): string {
    const relevantSnippet = question
      ? this.extractRelevantSnippetText(text, question)
      : '';
    const snippetSource = relevantSnippet || text;

    return snippetSource.replace(/\s+/g, ' ').slice(0, CITATION_SNIPPET_LIMIT);
  }

  // Xử lý relevant snippet text.
  private extractRelevantSnippetText(text: string, question: string): string {
    const queryTerms = this.tokenizeWithUnderscores(question);
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return text;
    }

    const scored = lines
      .map((line, index) => ({
        index,
        score: this.passageScore(
          line,
          queryTerms,
          this.isTableStructureQuery(question),
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.index - right.index;
      });

    if (scored.length === 0) {
      return '';
    }

    const bestIndex = scored[0].index;
    const start = Math.max(0, bestIndex - 2);
    const end = Math.min(lines.length, bestIndex + 4);

    return lines.slice(start, end).join('\n');
  }

  // Thực hiện chức năng passage score.
  private passageScore(
    value: string,
    queryTerms: string[],
    includeTableStructureBonus: boolean,
  ): number {
    const normalized = this.normalizeWithUnderscores(value);
    const tokens = new Set(normalized.split(' ').filter(Boolean));
    let score = 0;

    if (
      includeTableStructureBonus &&
      (tokens.has('table') ||
        tokens.has('section') ||
        tokens.has('page') ||
        tokens.has('slide') ||
        tokens.has('sheet'))
    ) {
      score += 0.08;
    }

    for (const term of queryTerms) {
      const isNumericIdentifier = /^[0-9]+$/.test(term);
      if (
        tokens.has(term) ||
        (!isNumericIdentifier && normalized.includes(term))
      ) {
        score += 0.1;
      }
    }

    return score;
  }

  // Kiểm tra điều kiện structured text.
  private isStructuredText(value: string): boolean {
    return /\[(?:SECTION|TABLE|PAGE|SLIDE|SHEET|ROW):/.test(value);
  }

  // Chuyển đổi hoặc chuẩn hóa tokenize with underscores.
  private tokenizeWithUnderscores(value: string): string[] {
    return [
      ...new Set(
        this.normalizeWithUnderscores(value)
          .split(' ')
          .filter((token) => this.isSearchToken(token)),
      ),
    ];
  }

  // Chuyển đổi hoặc chuẩn hóa with underscores.
  private normalizeWithUnderscores(value: string): string {
    return value
      .toLowerCase()
      .replace(/\u0111/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
