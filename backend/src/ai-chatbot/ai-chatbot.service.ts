import {
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  ChatMode,
  DocumentStatus,
  DocumentVisibility,
  ModerationStatus,
  ExtractionStatus,
  MessageSender,
  Prisma,
  RoleName,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiAnswerStatus, AiChatResponseDto } from './dto/ai-chat-response.dto';
import { AskDocumentDto } from './dto/ask-document.dto';
import { AskLibraryDto } from './dto/ask-library.dto';
import { ChatMessagesQueryDto } from './dto/chat-messages-query.dto';
import {
  ChatMessageListResponseDto,
  ChatSessionDetailDto,
  ChatSessionListResponseDto,
} from './dto/chat-session-response.dto';
import { ChatSessionsQueryDto } from './dto/chat-sessions-query.dto';
import { CitationDto } from './dto/citation.dto';
import { PaginationMetaDto } from './dto/pagination-meta.dto';
import {
  GeminiErrorCode,
  GeminiReplyOptions,
  GeminiSafeResponse,
  GeminiService,
} from './services/gemini.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import {
  ChatSourceResult,
  ChatSourceService,
} from './services/chat-source.service';

type ChatSourceContext = ChatSourceResult;

export interface RetrievalTimingContext {
  userId: string;
  startTime: number;
  embeddingMs: number;
  searchMs: number;
}

type AnswerIntent =
  | 'FULL_DOCUMENT_CONTENT'
  | 'EXPLICIT_SECTION_DETAIL'
  | 'DETAILED_FOLLOW_UP'
  | 'SUMMARY'
  | 'DIRECT_QUESTION';

type HistoricalSourceDocument = {
  ownerId: string;
  visibility: DocumentVisibility;
  moderationStatus: ModerationStatus;
  status: DocumentStatus;
};

type HistoricalSource = {
  document: HistoricalSourceDocument;
};

@Injectable()
export class AiChatbotService {
  private readonly timeoutMs = 30_000;
  private readonly longAnswerTimeoutMs = 90_000;
  private readonly documentContextLimit = 12_000;
  private readonly citationSnippetLimit = 280;
  private readonly defaultPromptContextPerSource = 4_000;
  private readonly defaultLibraryLimit = 5;
  private readonly maxHistoryMessages = 4;
  private readonly maxPromptContextCharacters = 16_000;
  private readonly continuationPrompt = 'Tiếp tục phần còn lại';
  private readonly sensitiveRequestRefusal =
    'Tôi không thể cung cấp chỉ dẫn hệ thống, thông tin xác thực hoặc cấu hình bí mật. Tôi chỉ có thể trả lời dựa trên tài liệu mà bạn được phép truy cập.';
  private readonly noLibrarySourceAnswer =
    'Không tìm thấy tài liệu phù hợp trong thư viện của bạn.';
  private readonly noDocumentSourceAnswer =
    'Không tìm thấy đủ căn cứ trong tài liệu để trả lời chính xác câu hỏi này.';
  private readonly revokedSourceAnswer =
    'Nội dung này không còn khả dụng vì quyền truy cập tài liệu nguồn đã thay đổi.';
  private readonly suggestedPrompts = [
    'Tóm tắt tài liệu này',
    'Giải thích nội dung chính',
    'Tạo câu hỏi ôn tập',
  ];
  private readonly sessionTurnTails = new Map<string, Promise<void>>();
  private readonly logger = new Logger(AiChatbotService.name);

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly sourceService: ChatSourceService,
    private readonly auditLogService?: AuditLogService,
  ) {}

  // Thực hiện chức năng ask tài liệu.
  async askDocument(
    dto: AskDocumentDto,
    user: AuthenticatedUser,
  ): Promise<AiChatResponseDto> {
    const t0 = performance.now();
    const document = await this.prisma.document.findUnique({
      where: { id: dto.documentId },
      include: {
        content: {
          select: {
            extractedText: true,
            contentSummary: true,
            extractionStatus: true,
            qualityStatus: true,
          },
        },
      },
    });
    if (!document || document.status !== DocumentStatus.ACTIVE) {
      throw new NotFoundException('Document not found');
    }

    if (!this.canReadDocument(document, user)) {
      throw new ForbiddenException('Document access denied');
    }

    const content = document.content;
    if (
      !content?.extractedText ||
      content.extractionStatus !== ExtractionStatus.COMPLETED
    ) {
      throw new ConflictException('Document content is not ready');
    }
    if (content.qualityStatus === 'UNREADABLE') {
      throw new ConflictException(
        'Document extraction is incomplete and cannot be used by AI yet',
      );
    }

    const session = await this.resolveSession(
      user.id,
      ChatMode.ASK_THIS_DOCUMENT,
      dto.sessionId,
      dto.documentId,
    );
    const t1 = performance.now();
    const sources = await this.sourceService.getSourcesForDocument(
      dto.documentId,
      dto.question,
    );
    const t2 = performance.now();
    const timings: RetrievalTimingContext = {
      userId: user.id,
      startTime: t0,
      embeddingMs: Math.round(t1 - t0),
      searchMs: Math.round(t2 - t1),
    };
    return this.withSessionTurnLock(session.id, () =>
      sources.length === 0
        ? this.processNoSourceQuestion(
            dto.question,
            session,
            timings,
            this.noDocumentSourceAnswer,
          )
        : this.processQuestion(dto.question, session, sources, timings),
    );
  }

  // Thực hiện chức năng ask library.
  async askLibrary(
    dto: AskLibraryDto,
    user: AuthenticatedUser,
  ): Promise<AiChatResponseDto> {
    const t0 = performance.now();
    const session = await this.resolveSession(
      user.id,
      ChatMode.ASK_MY_LIBRARY,
      dto.sessionId,
    );
    const t1 = performance.now();
    const retrievalQuery = this.buildRetrievalQuery(
      dto.question,
      session.messages,
    );
    const promptQuestion = this.buildPromptQuestion(
      dto.question,
      session.messages,
    );
    const sources = await this.sourceService.getSourcesForLibrary(
      user.id,
      retrievalQuery,
      dto.limit ?? this.defaultLibraryLimit,
      dto.filters,
    );
    const t2 = performance.now();
    const timings: RetrievalTimingContext = {
      userId: user.id,
      startTime: t0,
      embeddingMs: Math.round(t1 - t0),
      searchMs: Math.round(t2 - t1),
    };
    return this.withSessionTurnLock(session.id, () =>
      sources.length === 0
        ? this.processNoSourceQuestion(dto.question, session, timings)
        : this.processQuestion(
            dto.question,
            session,
            sources,
            timings,
            promptQuestion,
          ),
    );
  }

  // Thực hiện chức năng with phiên turn lock.
  private async withSessionTurnLock<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previousTail =
      this.sessionTurnTails.get(sessionId) ?? Promise.resolve();
    let releaseCurrentTurn: (() => void) | undefined;
    const currentTurn = new Promise<void>((resolve) => {
      releaseCurrentTurn = resolve;
    });
    const currentTail = previousTail.then(() => currentTurn);
    this.sessionTurnTails.set(sessionId, currentTail);

    await previousTail;
    try {
      return await operation();
    } finally {
      releaseCurrentTurn?.();
      if (this.sessionTurnTails.get(sessionId) === currentTail) {
        this.sessionTurnTails.delete(sessionId);
      }
    }
  }

  // Lấy dữ liệu phiên.
  async getSessions(
    query: ChatSessionsQueryDto,
    user: AuthenticatedUser,
  ): Promise<ChatSessionListResponseDto> {
    const where = {
      userId: user.id,
      mode: query.mode,
      documentId: query.documentId,
    };
    const [items, totalItems] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              ownerId: true,
              visibility: true,
              moderationStatus: true,
              status: true,
            },
          },
          messages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              id: true,
              sender: true,
              content: true,
              createdAt: true,
              sources: {
                select: {
                  document: {
                    select: {
                      ownerId: true,
                      visibility: true,
                      moderationStatus: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.chatSession.count({ where }),
    ]);
    return {
      items: items.map((session) => {
        const canReadSessionDocument = session.document
          ? this.canReadHistoricalDocument(session.document, user)
          : true;
        const lastMessage = session.messages[0];

        return {
          id: session.id,
          mode: session.mode,
          documentId: canReadSessionDocument ? session.documentId : null,
          title: session.title,
          document:
            canReadSessionDocument && session.document
              ? { id: session.document.id, title: session.document.title }
              : null,
          messageCount: session._count.messages,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                sender: lastMessage.sender,
                content: this.historicalMessageContent(
                  lastMessage.sender,
                  lastMessage.content,
                  lastMessage.sources ?? [],
                  user,
                ),
                createdAt: lastMessage.createdAt,
              }
            : null,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        };
      }),
      meta: this.pagination(query.page, query.limit, totalItems),
    };
  }

  // Lấy dữ liệu phiên.
  async getSession(
    sessionId: string,
    user: AuthenticatedUser,
  ): Promise<ChatSessionDetailDto> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            ownerId: true,
            visibility: true,
            moderationStatus: true,
            status: true,
          },
        },
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            sources: {
              include: {
                document: {
                  select: {
                    title: true,
                    ownerId: true,
                    visibility: true,
                    moderationStatus: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
        _count: { select: { messages: true } },
      },
    });
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    this.assertCanReadSession(session.userId, user);

    const canReadSessionDocument = session.document
      ? this.canReadHistoricalDocument(session.document, user)
      : true;
    const authorizedSources = session.messages.flatMap((message) =>
      this.authorizedHistoricalSources(message.sources, user),
    );
    const sourceSummary = this.mapUniqueSources(authorizedSources);
    const lastMessage = session.messages.at(-1);
    return {
      id: session.id,
      mode: session.mode,
      documentId: canReadSessionDocument ? session.documentId : null,
      title: session.title,
      userId: session.userId,
      document:
        canReadSessionDocument && session.document
          ? { id: session.document.id, title: session.document.title }
          : null,
      messageCount: session._count.messages,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            sender: lastMessage.sender,
            content: this.historicalMessageContent(
              lastMessage.sender,
              lastMessage.content,
              lastMessage.sources,
              user,
            ),
            createdAt: lastMessage.createdAt,
          }
        : null,
      sourceSummary,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  // Lấy dữ liệu tin nhắn.
  async getMessages(
    sessionId: string,
    query: ChatMessagesQueryDto,
    user: AuthenticatedUser,
  ): Promise<ChatMessageListResponseDto> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    this.assertCanReadSession(session.userId, user);

    const where = { chatSessionId: sessionId };
    const [messages, totalItems] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          sources: {
            include: {
              document: {
                select: {
                  title: true,
                  ownerId: true,
                  visibility: true,
                  moderationStatus: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.chatMessage.count({ where }),
    ]);
    return {
      items: messages.map((message) => {
        const authorizedSources = this.authorizedHistoricalSources(
          message.sources,
          user,
        );

        return {
          id: message.id,
          sessionId: message.chatSessionId,
          sender: message.sender,
          content: this.historicalMessageContent(
            message.sender,
            message.content,
            message.sources,
            user,
          ),
          ...(message.status
            ? {
                status: message.status,
                interruptionReason: message.interruptionReason ?? null,
              }
            : {}),
          sources: this.mapSources(authorizedSources),
          createdAt: message.createdAt,
        };
      }),
      meta: this.pagination(query.page, query.limit, totalItems),
    };
  }

  // Chuyển đổi hoặc chuẩn hóa phiên.
  private async resolveSession(
    userId: string,
    mode: ChatMode,
    sessionId?: string,
    documentId?: string,
  ): Promise<
    Prisma.ChatSessionGetPayload<{
      include: { messages: { orderBy: { createdAt: 'asc' } } };
    }>
  > {
    if (!sessionId) {
      // Tạo phiên chat trong database.
      return this.prisma.chatSession.create({
        data: {
          userId,
          mode,
          documentId,
        },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    }

    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Chat session access denied');
    }
    if (session.mode !== mode || session.documentId !== (documentId ?? null)) {
      throw new ForbiddenException(
        'Chat session context does not match request',
      );
    }
    return session;
  }

  // Xử lý question.
  private async processQuestion(
    question: string,
    session: {
      id: string;
      mode: ChatMode;
      messages: Array<{ sender: MessageSender; content: string }>;
    },
    sources: ChatSourceContext[],
    timings?: RetrievalTimingContext,
    promptQuestion = question,
  ): Promise<AiChatResponseDto> {
    const sensitiveRequest = this.isSensitivePromptRequest(question);
    const safeSources = sources.map((source) => this.redactSource(source));
    const answerIntent = this.classifyAnswerIntent(question, session.messages);
    const intentAwareQuestion = this.buildIntentAwarePromptQuestion(
      promptQuestion,
      answerIntent,
    );
    const promptSources = this.normalizePromptSources(
      safeSources,
      answerIntent === 'FULL_DOCUMENT_CONTENT',
    );
    const citationSources = this.alignCitationPassages(
      this.normalizeCitations(safeSources),
      promptSources,
    );

    let dbTimeAccumulator = 0;
    const dbStart1 = performance.now();
    // Tạo tin nhắn chat trong database.
    await this.prisma.chatMessage.create({
      data: {
        chatSessionId: session.id,
        sender: MessageSender.USER,
        content: question,
      },
    });
    dbTimeAccumulator += performance.now() - dbStart1;

    const tGeminiStart = performance.now();
    let reply: GeminiSafeResponse;
    if (sensitiveRequest) {
      reply = {
        success: true,
        answer: this.sensitiveRequestRefusal,
        errorCode: null,
        errorMessage: null,
        isMock: false,
      };
    } else {
      const groundedUserTurn = this.promptBuilder.buildGroundedUserTurn(
        intentAwareQuestion,
        promptSources,
      );
      const contents = this.promptBuilder.buildContents(
        session.messages.slice(-this.maxHistoryMessages),
        groundedUserTurn,
      );
      const systemInstruction =
        session.mode === ChatMode.ASK_MY_LIBRARY
          ? this.promptBuilder.buildAskLibraryPrompt(
              intentAwareQuestion,
              promptSources,
            )
          : this.promptBuilder.buildSystemInstruction(
              promptSources,
              session.mode,
            );
      reply = await this.generateSafeReply(
        contents,
        systemInstruction,
        this.toGeminiReplyOptions(answerIntent),
      );
    }
    const tGeminiEnd = performance.now();
    const geminiMs = sensitiveRequest
      ? 0
      : Math.round(tGeminiEnd - tGeminiStart);

    const responseSources = sensitiveRequest ? [] : citationSources;
    const answerStatus: AiAnswerStatus = reply.success
      ? 'ANSWERED'
      : 'FALLBACK_WITH_SOURCES';
    const baseAnswer = reply.success
      ? this.redactSensitiveText(
          this.sanitizeAnswerCitations(reply.answer, responseSources.length),
        )
      : this.buildSourceFallbackAnswer(
          question,
          responseSources,
          promptSources,
          reply.errorCode,
        );
    const partialCoverage = reply.success
      ? this.detectPartialCoverage(baseAnswer, promptSources, answerIntent)
      : false;
    const hasMore =
      reply.success && (reply.truncated === true || partialCoverage);
    const finishReason = reply.truncated
      ? (reply.finishReason ?? 'MAX_TOKENS')
      : partialCoverage
        ? 'PARTIAL_COVERAGE'
        : undefined;
    const answer = hasMore
      ? `${baseAnswer}\n\n_Câu trả lời đã đạt giới hạn. Hãy hỏi "${this.continuationPrompt}" để xem tiếp._`
      : baseAnswer;

    const dbStart2 = performance.now();
    // Tạo tin nhắn chat trong database.
    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        chatSessionId: session.id,
        sender: MessageSender.AI,
        content: answer,
        ...(hasMore
          ? { status: 'incomplete', interruptionReason: finishReason }
          : !reply.success
            ? {
                status: 'fallback',
                interruptionReason: reply.errorCode,
              }
            : {}),
        ...(responseSources.length > 0
          ? {
              sources: {
                // chat_sources is unique per (chatMessageId, documentId);
                // collapse chunk-based retrieval to one citation per document.
                createMany: {
                  data: responseSources.map((source) => ({
                    documentId: source.documentId,
                    documentChunkId: source.chunkId ?? null,
                    chunkIndex: source.chunkIndex ?? null,
                    snippet: source.snippet,
                    sourcePassage: source.passage ?? source.snippet,
                    relevanceScore: source.relevanceScore,
                    sourceLocator: source.sourceLocator,
                  })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
    });
    // Cập nhật phiên chat trong database.
    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { title: question.slice(0, 120) },
    });
    dbTimeAccumulator += performance.now() - dbStart2;

    const saveDbMs = Math.round(dbTimeAccumulator);
    const totalMs = timings
      ? Math.round(performance.now() - timings.startTime)
      : geminiMs + saveDbMs;

    if (timings && this.auditLogService) {
      const fallbackKeyword = sources.some(
        (s) => s.usedFallbackKeyword === true,
      );
      const citedDocumentIds = Array.from(
        new Set(sources.map((s) => s.documentId)),
      );
      this.auditLogService
        .logChatbotQuery(timings.userId, {
          sessionId: session.id,
          mode: session.mode,
          question,
          noSource: sources.length === 0,
          fallbackKeyword,
          sourcesCount: sources.length,
          citedDocumentIds,
          timings: {
            embeddingMs: timings.embeddingMs,
            searchMs: timings.searchMs,
            geminiMs,
            saveDbMs,
            totalMs,
          },
        })
        .catch((err: unknown) => {
          this.logger.error(`Failed to log chatbot query: ${String(err)}`);
        });
    }

    return {
      answer,
      sessionId: session.id,
      messageId: assistantMessage.id,
      suggestedPrompts: hasMore
        ? [this.continuationPrompt, ...this.suggestedPrompts]
        : this.suggestedPrompts,
      sources: responseSources,
      answerStatus,
      errorCode: reply.success ? null : reply.errorCode,
      ...(hasMore
        ? { hasMore: true, finishReason: finishReason ?? 'MAX_TOKENS' }
        : {}),
    };
  }

  // Xử lý no nguồn question.
  private async processNoSourceQuestion(
    question: string,
    session: {
      id: string;
      mode?: ChatMode;
      messages: Array<{ sender: MessageSender; content: string }>;
    },
    timings?: RetrievalTimingContext,
    noSourceAnswer = this.noLibrarySourceAnswer,
  ): Promise<AiChatResponseDto> {
    const dbStart = performance.now();
    // Tạo tin nhắn chat trong database.
    await this.prisma.chatMessage.create({
      data: {
        chatSessionId: session.id,
        sender: MessageSender.USER,
        content: question,
      },
    });
    const answer = this.isSensitivePromptRequest(question)
      ? this.sensitiveRequestRefusal
      : noSourceAnswer;
    // Tạo tin nhắn chat trong database.
    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        chatSessionId: session.id,
        sender: MessageSender.AI,
        content: answer,
      },
    });
    // Cập nhật phiên chat trong database.
    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { title: question.slice(0, 120) },
    });
    const saveDbMs = Math.round(performance.now() - dbStart);
    const totalMs = timings
      ? Math.round(performance.now() - timings.startTime)
      : saveDbMs;

    if (timings && this.auditLogService) {
      this.auditLogService
        .logChatbotQuery(timings.userId, {
          sessionId: session.id,
          mode: session.mode ?? ChatMode.ASK_MY_LIBRARY,
          question,
          noSource: true,
          fallbackKeyword: false,
          sourcesCount: 0,
          citedDocumentIds: [],
          timings: {
            embeddingMs: timings.embeddingMs,
            searchMs: timings.searchMs,
            geminiMs: 0,
            saveDbMs,
            totalMs,
          },
        })
        .catch((err: unknown) => {
          this.logger.error(`Failed to log chatbot query: ${String(err)}`);
        });
    }

    return {
      answer,
      sessionId: session.id,
      messageId: assistantMessage.id,
      suggestedPrompts: this.suggestedPrompts,
      sources: [],
      answerStatus: 'NO_SOURCES',
      errorCode: null,
    };
  }

  // Chuyển đổi hoặc chuẩn hóa nguồn fallback answer.
  private buildSourceFallbackAnswer(
    question: string,
    citationSources: CitationDto[],
    promptSources: CitationDto[],
    errorCode: GeminiErrorCode | null,
  ): string {
    const reason = this.toUserFacingAiFailureReason(errorCode);
    const promptSourceByDocument = new Map(
      promptSources.map((source) => [source.documentId, source]),
    );
    const sourceLines = citationSources
      .slice(0, 3)
      .map((source) => {
        const promptSource = promptSourceByDocument.get(source.documentId);
        const excerpt = this.truncateFallbackExcerpt(
          promptSource?.snippet ?? source.snippet,
        );
        return `- [${source.sourceNumber}] ${source.title}${excerpt ? `:\n${excerpt}` : ''}`;
      })
      .join('\n\n');
    const sources = citationSources;

    return [
      `${reason} Mình vẫn tìm được ${sources.length} tài liệu liên quan đến câu hỏi: "${question}".`,
      '',
      sourceLines,
      '',
      'Bạn có thể mở các trích dẫn bên cạnh để xem đoạn nguồn, hoặc thử gửi lại câu hỏi sau khi cấu hình AI ổn định.',
    ].join('\n');
  }

  // Thực hiện chức năng truncate fallback excerpt.
  private truncateFallbackExcerpt(value: string | null | undefined): string {
    const normalized = this.normalizeSnippet(value);
    if (normalized.length <= 1200) {
      return normalized;
    }

    return `${normalized.slice(0, 1200)}...`;
  }

  // Chuyển đổi hoặc chuẩn hóa người dùng facing ai failure reason.
  private toUserFacingAiFailureReason(
    errorCode: GeminiErrorCode | null,
  ): string {
    switch (errorCode) {
      case 'GEMINI_MISSING_API_KEY':
        return 'AI chưa thể viết câu trả lời vì hệ thống chưa cấu hình khóa Gemini.';
      case 'GEMINI_RATE_LIMIT':
        return 'AI chưa thể viết câu trả lời vì Gemini đang hết quota hoặc bị giới hạn tần suất.';
      case 'GEMINI_TIMEOUT':
        return 'AI chưa thể viết câu trả lời vì Gemini phản hồi quá lâu.';
      case 'GEMINI_NETWORK_ERROR':
        return 'AI chưa thể viết câu trả lời vì kết nối đến Gemini gặp lỗi mạng.';
      case 'GEMINI_API_ERROR':
        return 'AI chưa thể viết câu trả lời vì Gemini trả về lỗi dịch vụ.';
      case 'GEMINI_INVALID_RESPONSE':
        return 'AI chưa thể viết câu trả lời vì Gemini trả về phản hồi rỗng.';
      default:
        return 'AI chưa thể viết câu trả lời vì dịch vụ tạo sinh đang gặp lỗi.';
    }
  }

  // Kiểm tra điều kiện read tài liệu.
  private canReadDocument(
    document: {
      ownerId: string;
      visibility: DocumentVisibility;
      moderationStatus: ModerationStatus;
    },
    user: AuthenticatedUser,
  ): boolean {
    return (
      document.ownerId === user.id ||
      user.role.name === RoleName.ADMIN ||
      (document.visibility === DocumentVisibility.PUBLIC &&
        document.moderationStatus === ModerationStatus.APPROVED &&
        user.status === UserStatus.ACTIVE)
    );
  }

  // Thực hiện chức năng assert can read phiên.
  private assertCanReadSession(ownerId: string, user: AuthenticatedUser): void {
    if (ownerId !== user.id && user.role.name !== RoleName.ADMIN) {
      throw new ForbiddenException('Chat session access denied');
    }
  }

  // Kiểm tra điều kiện read historical tài liệu.
  private canReadHistoricalDocument(
    document: HistoricalSourceDocument,
    user: AuthenticatedUser,
  ): boolean {
    return (
      document.status === DocumentStatus.ACTIVE &&
      this.canReadDocument(document, user)
    );
  }

  // Thực hiện chức năng authorized historical nguồn.
  private authorizedHistoricalSources<T extends HistoricalSource>(
    sources: T[],
    user: AuthenticatedUser,
  ): T[] {
    return sources.filter((source) =>
      this.canReadHistoricalDocument(source.document, user),
    );
  }

  // Thực hiện chức năng historical tin nhắn nội dung.
  private historicalMessageContent(
    sender: MessageSender,
    content: string,
    sources: HistoricalSource[],
    user: AuthenticatedUser,
  ): string {
    const hasRevokedSource = sources.some(
      (source) => !this.canReadHistoricalDocument(source.document, user),
    );

    return sender === MessageSender.AI && hasRevokedSource
      ? this.revokedSourceAnswer
      : content;
  }

  // Chuyển đổi hoặc chuẩn hóa citation snippet.
  private toCitationSnippet(content: {
    extractedText?: string | null;
    contentSummary?: string | null;
  }): string {
    const snippet = content.extractedText?.trim() || '';

    return snippet.replace(/\s+/g, ' ').slice(0, this.citationSnippetLimit);
  }

  // Chuyển đổi hoặc chuẩn hóa prompt context.
  private toPromptContext(extractedText: string): string {
    return extractedText.slice(0, this.documentContextLimit);
  }

  // Xử lý safe reply.
  private async generateSafeReply(
    contents: Parameters<GeminiService['generateReply']>[0],
    systemInstruction: string,
    options?: GeminiReplyOptions,
  ): ReturnType<GeminiService['generateReply']> {
    try {
      return await this.withTimeout(
        options
          ? this.geminiService.generateReply(
              contents,
              systemInstruction,
              options,
            )
          : this.geminiService.generateReply(contents, systemInstruction),
        options?.timeoutMs,
      );
    } catch {
      return {
        success: false,
        answer:
          'Xin lỗi, hiện tại AI chưa thể tạo câu trả lời. Vui lòng thử lại sau.',
        errorCode: 'GEMINI_UNKNOWN_ERROR',
        errorMessage: 'Gemini request failed unexpectedly.',
        isMock: false,
      };
    }
  }

  // Thực hiện chức năng with timeout.
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new GatewayTimeoutException('AI request timed out')),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  // Chuyển đổi hoặc chuẩn hóa nguồn.
  private mapSources(
    sources: Array<{
      documentId: string;
      documentChunkId?: string | null;
      chunkIndex?: number | null;
      snippet: string | null;
      sourcePassage?: string | null;
      relevanceScore: number | null;
      document: { title: string };
    }>,
  ): CitationDto[] {
    return this.normalizeCitations(
      sources.map((source, index) => ({
        sourceNumber: index + 1,
        documentId: source.documentId,
        title: source.document.title,
        chunkId: source.documentChunkId ?? null,
        chunkIndex: source.chunkIndex ?? null,
        snippet: source.snippet ?? '',
        passage: source.sourcePassage ?? source.snippet ?? '',
        relevanceScore: source.relevanceScore,
      })),
    );
  }

  // Chuyển đổi hoặc chuẩn hóa unique nguồn.
  private mapUniqueSources(
    sources: Array<{
      documentId: string;
      documentChunkId?: string | null;
      chunkIndex?: number | null;
      snippet: string | null;
      sourcePassage?: string | null;
      relevanceScore: number | null;
      document: { title: string };
    }>,
  ): CitationDto[] {
    const unique = [
      ...new Map(sources.map((source) => [source.documentId, source])).values(),
    ];
    return this.mapSources(unique);
  }

  // Chuyển đổi hoặc chuẩn hóa citations.
  private normalizeCitations(
    sources: CitationDto[],
    truncateSnippet = true,
  ): CitationDto[] {
    const uniqueSources = [
      ...new Map(
        sources.map((source) => [
          source.chunkId ?? `${source.documentId}:${source.snippet}`,
          source,
        ]),
      ).values(),
    ];

    return uniqueSources
      .map((source, index) => ({ source, index }))
      .sort((left, right) => {
        const leftScore = left.source.relevanceScore;
        const rightScore = right.source.relevanceScore;

        if (leftScore !== null && rightScore !== null) {
          if (rightScore !== leftScore) {
            return rightScore - leftScore;
          }
        } else if (leftScore !== null) {
          return -1;
        } else if (rightScore !== null) {
          return 1;
        }

        return left.index - right.index;
      })
      .map(({ source }, index) => ({
        citationId: source.citationId,
        sourceNumber: index + 1,
        documentId: source.documentId,
        title: source.title,
        chunkId: source.chunkId ?? null,
        chunkIndex: source.chunkIndex ?? null,
        snippet: truncateSnippet
          ? this.truncateCitationSnippet(source.snippet)
          : this.normalizeSnippet(source.snippet),
        passage: source.passage ?? source.snippet,
        quote: source.quote
          ? this.truncateCitationSnippet(source.quote)
          : undefined,
        relevanceScore: source.relevanceScore,
        sourceLocator: source.sourceLocator,
      }));
  }

  // Chuyển đổi hoặc chuẩn hóa prompt nguồn.
  private normalizePromptSources(
    sources: ChatSourceContext[],
    wholeDocumentQuestion = false,
  ): CitationDto[] {
    const grouped = new Map<string, CitationDto>();
    const perSourceLimit = wholeDocumentQuestion
      ? this.maxPromptContextCharacters
      : this.defaultPromptContextPerSource;

    for (const source of sources) {
      const context = source.promptContext ?? source.snippet;
      const existing = grouped.get(source.documentId);
      if (!existing) {
        grouped.set(source.documentId, {
          citationId: source.citationId,
          sourceNumber: source.sourceNumber,
          documentId: source.documentId,
          title: source.title,
          chunkId: source.chunkId ?? null,
          chunkIndex: source.chunkIndex ?? null,
          snippet: this.truncatePromptContext(context, perSourceLimit),
          passage: this.truncatePromptContext(context, perSourceLimit),
          quote: source.quote,
          relevanceScore: source.relevanceScore,
          sourceLocator: source.sourceLocator,
        });
        continue;
      }

      grouped.set(source.documentId, {
        ...existing,
        snippet: this.truncatePromptContext(
          this.joinUniqueContextBlocks(existing.snippet, context),
          perSourceLimit,
        ),
        passage: this.truncatePromptContext(
          this.joinUniqueContextBlocks(existing.snippet, context),
          perSourceLimit,
        ),
        relevanceScore: this.maxRelevanceScore(
          existing.relevanceScore,
          source.relevanceScore,
        ),
        sourceLocator: [
          ...new Set([
            ...(existing.sourceLocator ?? []),
            ...(source.sourceLocator ?? []),
          ]),
        ],
      });
    }

    return this.limitPromptContext(
      this.normalizeCitations([...grouped.values()], false),
    );
  }

  // Thực hiện chức năng sanitize answer citations.
  private sanitizeAnswerCitations(answer: string, sourceCount: number): string {
    // Gemini emits single citations ([1], [Source 2]) as well as grouped ones
    // ([1, 2, 3]); keep only numbers that map to a returned source.
    return answer.replace(
      /\[(?:Source\s+)?(\d+(?:\s*,\s*\d+)*)\]/gi,
      (_citation, numbers: string) => {
        const valid = numbers
          .split(',')
          .map((value) => Number(value.trim()))
          .filter((value) => value >= 1 && value <= sourceCount);

        return valid.length > 0 ? `[${valid.join(', ')}]` : '';
      },
    );
  }

  // Thực hiện chức năng redact nguồn.
  private redactSource(source: ChatSourceContext): ChatSourceContext {
    return {
      ...source,
      title: this.redactSensitiveText(source.title),
      snippet: this.redactSensitiveText(source.snippet),
      promptContext: source.promptContext
        ? this.redactSensitiveText(source.promptContext)
        : source.promptContext,
      passage: source.passage
        ? this.redactSensitiveText(source.passage)
        : source.passage,
      quote: source.quote
        ? this.redactSensitiveText(source.quote)
        : source.quote,
    };
  }

  // Thực hiện chức năng redact sensitive text.
  private redactSensitiveText(value: string): string {
    return value
      .replace(
        /-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z]+)* PRIVATE KEY-----/gi,
        '[REDACTED]',
      )
      .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, 'Bearer [REDACTED]')
      .replace(
        /\b([A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD))\s*[:=]\s*["']?[^\s"'`]+/gi,
        '$1=[REDACTED]',
      );
  }

  // Kiểm tra điều kiện sensitive prompt yêu cầu.
  private isSensitivePromptRequest(question: string): boolean {
    const normalized = this.normalizeForRetrieval(question);
    const disclosureIntent =
      /\b(reveal|show|print|display|expose|leak|tell me|give me|tiet lo|hien thi|in ra|cho toi|xem)\b/.test(
        normalized,
      );
    const sensitiveTarget =
      /\b(system prompt|developer prompt|hidden prompt|api key|api_key|secret|token|password|credential|config|configuration|chi dan he thong|khoa api|bi mat|cau hinh)\b/.test(
        normalized,
      );
    const overrideAttempt =
      /\b(ignore|disregard|forget|override|bo qua|quen|thay the)\b.*\b(instruction|instructions|rule|rules|system|chi dan|quy tac)\b/.test(
        normalized,
      );

    return (disclosureIntent && sensitiveTarget) || overrideAttempt;
  }

  // Thực hiện chức năng limit prompt context.
  private limitPromptContext(sources: CitationDto[]): CitationDto[] {
    let remaining = this.maxPromptContextCharacters;

    return sources
      .map((source) => {
        if (remaining <= 0) return null;
        const snippet = source.snippet.slice(0, remaining);
        remaining -= snippet.length;
        return { ...source, snippet };
      })
      .filter((source): source is CitationDto => source !== null);
  }

  // Thực hiện chức năng align citation passages.
  private alignCitationPassages(
    citations: CitationDto[],
    promptSources: CitationDto[],
  ): CitationDto[] {
    const promptByDocument = new Map(
      promptSources.map((source) => [source.documentId, source]),
    );

    return citations.map((citation) => {
      const promptSource = promptByDocument.get(citation.documentId);
      return {
        ...citation,
        chunkId: promptSource?.chunkId ?? citation.chunkId ?? null,
        chunkIndex: promptSource?.chunkIndex ?? citation.chunkIndex ?? null,
        passage:
          promptSource?.passage ??
          promptSource?.snippet ??
          citation.passage ??
          citation.snippet,
      };
    });
  }

  // Thực hiện chức năng join unique context blocks.
  private joinUniqueContextBlocks(left: string, right: string): string {
    const blocks = [left, right]
      .flatMap((value) => value.split(/\n{2,}/))
      .map((value) => value.trim())
      .filter(Boolean);
    return [...new Set(blocks)].join('\n\n');
  }

  // Thực hiện chức năng truncate prompt context.
  private truncatePromptContext(
    value: string,
    limit = this.defaultPromptContextPerSource,
  ): string {
    return value
      .trim()
      .replace(/[ \t]+/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, limit);
  }

  // Kiểm tra điều kiện whole tài liệu question.
  private isWholeDocumentQuestion(question: string): boolean {
    const normalized = this.normalizeForRetrieval(question);
    return (
      /\b(tiep tuc|phan tiep theo|phan con lai|continue|next part)\b/.test(
        normalized,
      ) ||
      /\b(toan bo|day du|noi dung cua file nay|noi dung chi tiet cua file nay|noi dung cua tai lieu nay|noi dung chi tiet cua tai lieu nay|chi tiet cua file nay|chi tiet cua tai lieu nay|file nay noi gi|tai lieu nay noi gi)\b/.test(
        normalized,
      )
    );
  }

  // Thực hiện chức năng max relevance score.
  private maxRelevanceScore(
    left: number | null,
    right: number | null,
  ): number | null {
    if (left === null) return right;
    if (right === null) return left;
    return Math.max(left, right);
  }

  // Ghép ngữ cảnh các câu hỏi trước để truy vấn tiếp nối không bị mất chủ đề.
  private buildRetrievalQuery(
    question: string,
    history: Array<{ sender: MessageSender; content: string }>,
  ): string {
    if (!this.isVagueFollowUp(question)) {
      return question;
    }

    const prevUserMessages = history
      .filter((m) => m.sender === MessageSender.USER)
      .slice(-2)
      .map((m) => m.content);

    if (prevUserMessages.length === 0) {
      return question;
    }

    return `${prevUserMessages.join(' ')} ${question}`.slice(0, 500);
  }

  // Chuyển đổi hoặc chuẩn hóa prompt question.
  private buildPromptQuestion(
    question: string,
    history: Array<{ sender: MessageSender; content: string }>,
  ): string {
    if (!this.isVagueFollowUp(question)) {
      return question;
    }

    const previousUserQuestion = history
      .filter((message) => message.sender === MessageSender.USER)
      .at(-1)?.content;

    if (!previousUserQuestion) {
      return question;
    }

    return [
      `Câu hỏi trước đó: ${previousUserQuestion}`,
      `Yêu cầu hiện tại: ${question}`,
      'Hãy trả lời yêu cầu hiện tại bằng cách mở rộng chi tiết đúng chủ đề/câu hỏi trước đó, chỉ dựa trên nguồn được cung cấp.',
    ].join('\n');
  }

  // Thực hiện chức năng classify answer intent.
  private classifyAnswerIntent(
    question: string,
    history: Array<{ sender: MessageSender; content: string }>,
  ): AnswerIntent {
    if (this.hasExplicitSectionReference(question)) {
      return 'EXPLICIT_SECTION_DETAIL';
    }

    if (this.isWholeDocumentQuestion(question)) {
      return 'FULL_DOCUMENT_CONTENT';
    }

    if (
      this.isDetailedQuestion(question) &&
      history.some((message) => message.sender === MessageSender.USER)
    ) {
      return 'DETAILED_FOLLOW_UP';
    }

    if (this.isSummaryQuestion(question)) {
      return 'SUMMARY';
    }

    return 'DIRECT_QUESTION';
  }

  // Chuyển đổi hoặc chuẩn hóa intent aware prompt question.
  private buildIntentAwarePromptQuestion(
    promptQuestion: string,
    answerIntent: AnswerIntent,
  ): string {
    if (answerIntent === 'DIRECT_QUESTION') {
      return promptQuestion;
    }

    const instruction = this.answerIntentInstruction(answerIntent);

    return [
      `ANSWER_INTENT: ${answerIntent}`,
      `ANSWER_INTENT_INSTRUCTION: ${instruction}`,
      `USER_QUESTION: ${promptQuestion}`,
    ].join('\n');
  }

  // Thực hiện chức năng answer intent instruction.
  private answerIntentInstruction(answerIntent: AnswerIntent): string {
    switch (answerIntent) {
      case 'FULL_DOCUMENT_CONTENT':
        return 'Cover all major sections, lessons, pages, slides, sheets, tables, rows, and important details visible in the supplied evidence. Do not stop at the first section. If the evidence is too long for one answer, provide the first complete part and explicitly say the user can ask to continue.';
      case 'EXPLICIT_SECTION_DETAIL':
        return 'Answer only for every explicitly requested numbered section/page/slide/lesson. Include each requested number as its own heading. If a requested section is not present in the supplied evidence, say which section is missing instead of substituting another section.';
      case 'DETAILED_FOLLOW_UP':
        return 'Expand the previous topic or answer with more concrete details from the supplied evidence. Keep the same scope as the user request and do not switch to unrelated sections.';
      case 'SUMMARY':
        return 'Summarize the supplied evidence in a structured way, preserving the main sections and important details without inventing missing information.';
      case 'DIRECT_QUESTION':
        return 'Answer the question directly from the supplied evidence.';
    }
  }

  // Thực hiện chức năng detect partial coverage.
  private detectPartialCoverage(
    answer: string,
    sources: CitationDto[],
    answerIntent: AnswerIntent,
  ): boolean {
    if (
      ![
        'FULL_DOCUMENT_CONTENT',
        'EXPLICIT_SECTION_DETAIL',
        'DETAILED_FOLLOW_UP',
      ].includes(answerIntent)
    ) {
      return false;
    }

    const expectedSections = new Set(
      sources.flatMap((source) =>
        this.extractNumberedSectionKeys(source.snippet),
      ),
    );
    if (expectedSections.size < 2) {
      return false;
    }

    const coveredSections = new Set(this.extractNumberedSectionKeys(answer));
    const missingSections = [...expectedSections].filter(
      (section) => !coveredSections.has(section),
    );

    return missingSections.length > 0;
  }

  // Xử lý numbered section keys.
  private extractNumberedSectionKeys(value: string): string[] {
    const normalized = this.normalizeForRetrieval(value);
    const keys: string[] = [];
    const pattern =
      /\b(bai|lesson|section|muc|phan|chuong|chapter|unit|slide|page|trang)\s+(\d+)\b/g;

    for (const match of normalized.matchAll(pattern)) {
      keys.push(`${match[1]}:${match[2]}`);
    }

    return [...new Set(keys)];
  }

  // Chuyển đổi hoặc chuẩn hóa gemini reply options.
  private toGeminiReplyOptions(
    answerIntent: AnswerIntent,
  ): GeminiReplyOptions | undefined {
    if (
      [
        'FULL_DOCUMENT_CONTENT',
        'EXPLICIT_SECTION_DETAIL',
        'DETAILED_FOLLOW_UP',
      ].includes(answerIntent)
    ) {
      return { timeoutMs: this.longAnswerTimeoutMs };
    }

    return undefined;
  }

  // Kiểm tra điều kiện vague follow up.
  private isVagueFollowUp(question: string): boolean {
    if (this.hasExplicitSectionReference(question)) {
      return false;
    }

    return question.trim().length < 30 || this.isContextualFollowUp(question);
  }

  // Kiểm tra điều kiện explicit section reference.
  private hasExplicitSectionReference(question: string): boolean {
    const normalized = this.normalizeForRetrieval(question);

    return /\b(?:bai|lesson|section|muc|phan|chuong|chapter|unit|slide|page|trang)\s*\d+\b/.test(
      normalized,
    );
  }

  // Kiểm tra điều kiện detailed question.
  private isDetailedQuestion(question: string): boolean {
    const normalized = this.normalizeForRetrieval(question);

    return (
      /\b(chi tiet|day du|toan bo|tat ca|full|complete|detailed|detail|details)\b/.test(
        normalized,
      ) ||
      /\b(chi tiet hon|ro hon|them nua|hon nua|mo rong|expand|more detail|more details)\b/.test(
        normalized,
      )
    );
  }

  // Kiểm tra điều kiện summary question.
  private isSummaryQuestion(question: string): boolean {
    const normalized = this.normalizeForRetrieval(question);

    return /\b(tom tat|summary|summarize|overview|tong quan)\b/.test(
      normalized,
    );
  }

  // Kiểm tra điều kiện contextual follow up.
  private isContextualFollowUp(question: string): boolean {
    const normalized = this.normalizeForRetrieval(question);
    const contextualPhrases = [
      'noi dung nay',
      'cai nay',
      'viec nay',
      'van de nay',
      'dieu nay',
      'dieu do',
      'phan nay',
      'muc nay',
      'chu de nay',
      'ngu canh nay',
      'tai lieu nay',
      'file nay',
      'nguon nay',
      'cau tra loi tren',
      've no',
      'o tren',
      'ben tren',
      'vua roi',
    ];

    return contextualPhrases.some((phrase) => normalized.includes(phrase));
  }

  // Chuyển đổi hoặc chuẩn hóa for retrieval.
  private normalizeForRetrieval(value: string): string {
    return value
      .toLowerCase()
      .replace(/\u0111/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Thực hiện chức năng truncate citation snippet.
  private truncateCitationSnippet(
    snippet: string | null | undefined,
    limit = this.citationSnippetLimit,
  ): string {
    return this.normalizeSnippet(snippet).slice(0, limit);
  }

  // Chuyển đổi hoặc chuẩn hóa snippet.
  private normalizeSnippet(snippet: string | null | undefined): string {
    return (snippet ?? '').trim().replace(/\s+/g, ' ');
  }

  // Thực hiện chức năng pagination.
  private pagination(
    page: number,
    limit: number,
    totalItems: number,
  ): PaginationMetaDto {
    const totalPages = Math.ceil(totalItems / limit);
    return {
      page,
      limit,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    };
  }
}
