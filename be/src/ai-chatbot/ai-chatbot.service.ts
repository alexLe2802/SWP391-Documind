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

// `type X = Y` : tạo một "type alias" (bí danh kiểu). Ở đây ChatSourceContext chỉ
// là tên gọi khác của ChatSourceResult (kiểu 1 nguồn đã retrieve từ ChatSourceService),
// giúp code trong file này đọc dễ hiểu hơn theo ngữ cảnh "context cho chat".
type ChatSourceContext = ChatSourceResult;

// RetrievalTimingContext: gom các mốc đo hiệu năng của 1 lượt hỏi để ghi audit log.
//   - `export interface` : khai báo kiểu dạng object và cho phép module khác import.
//   - userId      : ai đang hỏi (dùng khi log).
//   - startTime   : mốc performance.now() lúc bắt đầu luồng (để tính tổng thời gian totalMs).
//   - embeddingMs : thời gian tạo embedding (hoặc chuẩn bị) — chặng đầu của pipeline RAG.
//   - searchMs    : thời gian vector search / truy hồi nguồn (chặng Retrieve).
export interface RetrievalTimingContext {
  userId: string;
  startTime: number;
  embeddingMs: number;
  searchMs: number;
}

// AnswerIntent: "union type" (kiểu hợp) — biến kiểu này CHỈ được nhận đúng 1 trong 5
// chuỗi literal dưới đây (dấu `|` = HOẶC). Đây là cách TypeScript mô phỏng enum bằng
// string. Nó phân loại ý định câu hỏi để điều chỉnh prompt + timeout khi Generate:
//   - FULL_DOCUMENT_CONTENT  : hỏi toàn bộ nội dung tài liệu.
//   - EXPLICIT_SECTION_DETAIL: hỏi đích danh mục/phần/trang cụ thể.
//   - DETAILED_FOLLOW_UP     : câu hỏi nối tiếp yêu cầu chi tiết hơn.
//   - SUMMARY                : yêu cầu tóm tắt.
//   - DIRECT_QUESTION        : câu hỏi trực tiếp thông thường (mặc định).
type AnswerIntent =
  | 'FULL_DOCUMENT_CONTENT'
  | 'EXPLICIT_SECTION_DETAIL'
  | 'DETAILED_FOLLOW_UP'
  | 'SUMMARY'
  | 'DIRECT_QUESTION';

// HistoricalSourceDocument: hình dạng tối thiểu của 1 tài liệu nguồn được lưu kèm
// tin nhắn CŨ (lịch sử). Dùng để kiểm tra lại quyền đọc khi hiển thị lại lịch sử,
// vì quyền có thể đã thay đổi kể từ lúc trả lời (tài liệu bị gỡ PUBLIC, bị khóa...).
//   - ownerId          : chủ sở hữu tài liệu.
//   - visibility       : PUBLIC/PRIVATE.
//   - moderationStatus : trạng thái kiểm duyệt (APPROVED...).
//   - status           : ACTIVE hay đã bị vô hiệu.
type HistoricalSourceDocument = {
  ownerId: string;
  visibility: DocumentVisibility;
  moderationStatus: ModerationStatus;
  status: DocumentStatus;
};

// HistoricalSource: 1 nguồn lịch sử = bản ghi có tham chiếu tới document ở trên.
// Bọc trong object `{ document }` để khớp cấu trúc dữ liệu Prisma trả về (chat_sources
// có quan hệ tới documents).
type HistoricalSource = {
  document: HistoricalSourceDocument;
};

// `@Injectable()` : decorator của NestJS đánh dấu class này là 1 "provider" có thể
// được DI (Dependency Injection) container tạo và tiêm vào nơi khác. Đây là service
// trung tâm (orchestrator) của MF3 — điều phối toàn bộ pipeline RAG.
@Injectable()
export class AiChatbotService {
  // ---- Nhóm hằng số cấu hình (private readonly = chỉ đọc, không đổi sau khi gán) ----
  // Lưu ý: `30_000` dùng dấu `_` làm ký tự ngăn cách hàng nghìn cho dễ đọc; giá trị vẫn là 30000.

  // Timeout mặc định (ms) chờ Gemini trả lời cho câu hỏi thường (30 giây).
  private readonly timeoutMs = 30_000;
  // Timeout dài hơn (90 giây) cho câu trả lời "nặng" (toàn tài liệu, chi tiết theo mục).
  private readonly longAnswerTimeoutMs = 90_000;
  // Số ký tự tối đa của toàn văn tài liệu dùng làm ngữ cảnh cho 1 câu hỏi.
  private readonly documentContextLimit = 12_000;
  // Độ dài tối đa của đoạn snippet hiển thị trong citation (280 ký tự).
  private readonly citationSnippetLimit = 280;
  // Số ký tự ngữ cảnh mặc định dành cho MỖI nguồn khi nhồi vào prompt.
  private readonly defaultPromptContextPerSource = 4_000;
  // Số tài liệu tối đa mặc định truy hồi ở luồng hỏi cả thư viện (ask library).
  private readonly defaultLibraryLimit = 5;
  // Số tin nhắn lịch sử tối đa (gần nhất) đưa vào prompt để giữ mạch hội thoại.
  private readonly maxHistoryMessages = 4;
  // Tổng ngân sách ký tự ngữ cảnh tối đa cho toàn bộ prompt (tránh vượt token limit).
  private readonly maxPromptContextCharacters = 16_000;
  // Cụm từ quy ước để người dùng yêu cầu AI viết tiếp phần còn lại khi bị cắt.
  private readonly continuationPrompt = 'Tiếp tục phần còn lại';
  // Câu từ chối chuẩn khi phát hiện yêu cầu lộ prompt hệ thống/khóa/bí mật (chống prompt injection).
  private readonly sensitiveRequestRefusal =
    'Tôi không thể cung cấp chỉ dẫn hệ thống, thông tin xác thực hoặc cấu hình bí mật. Tôi chỉ có thể trả lời dựa trên tài liệu mà bạn được phép truy cập.';
  // Câu trả lời khi không tìm được tài liệu phù hợp trong thư viện (ask library, 0 nguồn).
  private readonly noLibrarySourceAnswer =
    'Không tìm thấy tài liệu phù hợp trong thư viện của bạn.';
  // Câu trả lời khi hỏi 1 tài liệu nhưng không đủ căn cứ để trả lời (ask document, 0 nguồn).
  private readonly noDocumentSourceAnswer =
    'Không tìm thấy đủ căn cứ trong tài liệu để trả lời chính xác câu hỏi này.';
  // Thông báo thay thế khi hiển thị lại tin nhắn cũ mà nguồn của nó đã mất quyền truy cập.
  private readonly revokedSourceAnswer =
    'Nội dung này không còn khả dụng vì quyền truy cập tài liệu nguồn đã thay đổi.';
  // Các gợi ý câu hỏi mặc định trả về kèm mỗi phản hồi (hiển thị nút gợi ý ở UI).
  private readonly suggestedPrompts = [
    'Tóm tắt tài liệu này',
    'Giải thích nội dung chính',
    'Tạo câu hỏi ôn tập',
  ];
  // `Map<string, Promise<void>>` : cấu trúc key-value có kiểu (generic <K, V>).
  // Lưu "đuôi" (tail) của chuỗi lượt hội thoại theo sessionId → dùng để xếp hàng
  // (serialize) các câu hỏi trong cùng 1 phiên, tránh chạy song song ghi đè lịch sử.
  private readonly sessionTurnTails = new Map<string, Promise<void>>();
  // Logger của NestJS, gắn tên class để log dễ truy nguồn.
  private readonly logger = new Logger(AiChatbotService.name);

  // Constructor: NestJS DI tự tiêm các dependency dưới đây khi tạo service.
  //   - `private readonly x` trong tham số : cú pháp rút gọn của TS, vừa khai báo
  //     vừa gán thành thuộc tính this.x (không cần viết this.x = x thủ công).
  //   - `auditLogService?` : dấu `?` = optional — có thể undefined (log là tùy chọn).
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly sourceService: ChatSourceService,
    private readonly auditLogService?: AuditLogService,
  ) {}

  // ==========================================================================
  // MF3 — LUỒNG 1: Hỏi 1 tài liệu cụ thể (askDocument)
  // --------------------------------------------------------------------------
  // Đây là endpoint POST /chat/ask-document. Nhiệm vụ: nhận câu hỏi về MỘT tài
  // liệu, kiểm tra quyền + trạng thái tài liệu, truy hồi (retrieve) các đoạn
  // nguồn liên quan trong phạm vi tài liệu đó, rồi sinh câu trả lời grounded.
  //
  // Cú pháp tổng quát của signature:
  //   - `async`  : hàm bất đồng bộ, luôn trả về một Promise; cho phép dùng `await`.
  //   - `dto`    : dữ liệu request đã được validate (class-validator) từ @Body().
  //   - `user`   : người dùng đã xác thực, do FirebaseAuthGuard/@CurrentUser gắn vào.
  //   - `: Promise<AiChatResponseDto>` : kiểu trả về — Promise chứa DTO phản hồi chuẩn.
  // ==========================================================================
  async askDocument(
    dto: AskDocumentDto,
    user: AuthenticatedUser,
  ): Promise<AiChatResponseDto> {
    // [MỐC THỜI GIAN t0] performance.now() trả về mốc thời gian (ms, có phần thập
    // phân) tính từ khi tiến trình khởi động. Dùng để đo hiệu năng, KHÔNG phải
    // giờ thực. Hiệu các mốc (t1-t0, t2-t1) chính là thời lượng từng giai đoạn.
    const t0 = performance.now();

    // [BƯỚC 1] Truy vấn tài liệu theo id.
    //   - `await`             : tạm dừng cho tới khi Prisma trả kết quả (DB là I/O bất đồng bộ).
    //   - `findUnique`        : tìm đúng 1 bản ghi theo khóa duy nhất; không thấy → trả null.
    //   - `where: { id }`     : điều kiện lọc theo primary key.
    //   - `include`           : nạp kèm quan hệ `content` (bảng document_contents) trong 1 query (JOIN).
    //   - `select` bên trong  : chỉ lấy đúng 4 cột cần thiết của content (tối ưu băng thông/bộ nhớ),
    //                           thay vì lấy toàn bộ cột. `true` = "lấy cột này".
    const document = await this.prisma.document.findUnique({
      where: { id: dto.documentId },
      include: {
        content: {
          select: {
            extractedText: true, // toàn văn đã trích xuất — nguồn ngữ cảnh cho RAG
            contentSummary: true, // bản tóm tắt (dự phòng khi cần)
            extractionStatus: true, // trạng thái trích xuất: PENDING/COMPLETED/...
            qualityStatus: true, // chất lượng trích xuất: READY/PARTIAL/UNREADABLE
          },
        },
      },
    });

    // [BƯỚC 2 — Guard 1: tồn tại + đang ACTIVE]
    //   - `!document`            : findUnique trả null (không có tài liệu) → true.
    //   - `||`                   : HOẶC — chỉ cần 1 vế đúng là vào nhánh lỗi.
    //   - `!== DocumentStatus.ACTIVE` : tài liệu bị khóa/xóa mềm/ẩn.
    //   Ném NotFoundException → NestJS tự map thành HTTP 404. Không tiết lộ lý do
    //   chi tiết (ẩn hay không tồn tại) để tránh rò rỉ thông tin.
    if (!document || document.status !== DocumentStatus.ACTIVE) {
      throw new NotFoundException('Document not found');
    }

    // [BƯỚC 3 — Guard 2: phân quyền đọc]
    //   `canReadDocument` trả true nếu: là chủ sở hữu, HOẶC là ADMIN, HOẶC tài liệu
    //   PUBLIC đã được duyệt (APPROVED) và user đang ACTIVE. Không thỏa → 403 Forbidden.
    if (!this.canReadDocument(document, user)) {
      throw new ForbiddenException('Document access denied');
    }

    // [BƯỚC 4 — Guard 3 & 4: nội dung đã sẵn sàng cho AI chưa]
    const content = document.content;
    if (
      // `content?.extractedText` : optional chaining `?.` — nếu content là null/undefined
      //   thì cả biểu thức = undefined (không ném lỗi truy cập thuộc tính của null).
      // `!content?.extractedText`: chưa có văn bản trích xuất (null/rỗng).
      !content?.extractedText ||
      // Hoặc quá trình trích xuất chưa hoàn tất (khác COMPLETED).
      content.extractionStatus !== ExtractionStatus.COMPLETED
    ) {
      // 409 Conflict: tài liệu tồn tại & được phép đọc, nhưng chưa ở trạng thái dùng được.
      throw new ConflictException('Document content is not ready');
    }
    if (content.qualityStatus === 'UNREADABLE') {
      // Đã trích xuất nhưng nội dung không đọc được (vd scan mờ) → AI không thể grounding.
      throw new ConflictException(
        'Document extraction is incomplete and cannot be used by AI yet',
      );
    }

    // [BƯỚC 5] Lấy hoặc tạo phiên chat.
    //   - `dto.sessionId` có → nối tiếp phiên cũ (kiểm tra khớp chủ sở hữu + mode + documentId).
    //   - Không có → tạo phiên mới với mode ASK_THIS_DOCUMENT gắn documentId.
    //   Enum `ChatMode.ASK_THIS_DOCUMENT` phân biệt luồng này với luồng hỏi cả thư viện.
    const session = await this.resolveSession(
      user.id,
      ChatMode.ASK_THIS_DOCUMENT,
      dto.sessionId,
      dto.documentId,
    );

    // [MỐC THỜI GIAN t1] Sau khi tra tài liệu + tạo/lấy phiên. (t1 - t0) được ghi
    // vào audit log dưới nhãn `embeddingMs` — xem chú thích ở phần timings bên dưới.
    const t1 = performance.now();

    // [BƯỚC 6 — RETRIEVE] Truy hồi các đoạn nguồn liên quan CHỈ TRONG tài liệu này.
    //   Bên trong getSourcesForDocument: tạo embedding cho câu hỏi → vector search
    //   (pgvector) trên document_chunks → re-rank → trả về danh sách ChatSourceResult.
    //   Với câu hỏi kiểu "toàn bộ tài liệu"/"tiếp tục", nó lấy nguyên văn extractedText.
    const sources = await this.sourceService.getSourcesForDocument(
      dto.documentId,
      dto.question,
    );

    // [MỐC THỜI GIAN t2] Sau khi retrieve xong. (t2 - t1) = thời gian tìm nguồn (`searchMs`).
    const t2 = performance.now();

    // [BƯỚC 7] Gói các mốc thời gian để ghi audit log (đo hiệu năng từng chặng).
    //   Chú thích kiểu tường minh `: RetrievalTimingContext` để TypeScript kiểm tra
    //   đủ/đúng trường. `Math.round` làm tròn về số nguyên ms cho gọn log.
    const timings: RetrievalTimingContext = {
      userId: user.id,
      startTime: t0, // dùng để tính totalMs = now - startTime ở cuối luồng
      embeddingMs: Math.round(t1 - t0), // (ở luồng document: gồm tra tài liệu + tạo phiên)
      searchMs: Math.round(t2 - t1), // thời gian retrieval nguồn
    };

    // [BƯỚC 8 — GENERATE] Sinh câu trả lời, được bọc trong "khóa lượt hội thoại".
    //   - `withSessionTurnLock(session.id, () => ...)`: đảm bảo các câu hỏi trong
    //     CÙNG một phiên chạy tuần tự (tránh đua ghi tin nhắn, xáo trộn lịch sử).
    //   - Đối số thứ 2 là một arrow function (callback) trả về Promise — công việc
    //     thực sự chỉ chạy khi tới lượt của phiên này.
    //   - `sources.length === 0 ? A : B` : toán tử ba ngôi (ternary) — chọn nhánh:
    //       + Không có nguồn nào → processNoSourceQuestion: trả câu "không đủ căn cứ"
    //         (`this.noDocumentSourceAnswer`) và vẫn ghi log/lưu tin nhắn.
    //       + Có nguồn → processQuestion: dựng prompt grounded, gọi Gemini, hậu xử lý,
    //         lưu tin nhắn USER/AI + citation, cập nhật title phiên.
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

  // ==========================================================================
  // MF3 — LUỒNG 2: Hỏi trên toàn THƯ VIỆN của người dùng (askLibrary)
  // --------------------------------------------------------------------------
  // Endpoint POST /chat/ask-library. Khác askDocument ở chỗ retrieve trên NHIỀU
  // tài liệu mà user sở hữu/được phép, thay vì 1 tài liệu cố định. Vì phạm vi rộng
  // hơn nên có thêm bước "làm giàu truy vấn" (buildRetrievalQuery / buildPromptQuestion)
  // để giữ ngữ cảnh cho các câu hỏi nối tiếp mơ hồ.
  // Input: dto (question, sessionId?, limit?, filters?), user đã xác thực.
  // Output: Promise<AiChatResponseDto>.
  // ==========================================================================
  async askLibrary(
    dto: AskLibraryDto,
    user: AuthenticatedUser,
  ): Promise<AiChatResponseDto> {
    // [MỐC t0] Bắt đầu đo hiệu năng toàn luồng.
    const t0 = performance.now();

    // [BƯỚC 1] Lấy/tạo phiên chat ở chế độ ASK_MY_LIBRARY (không gắn documentId).
    const session = await this.resolveSession(
      user.id,
      ChatMode.ASK_MY_LIBRARY,
      dto.sessionId,
    );
    // [MỐC t1] Sau khi có phiên → (t1 - t0) = chặng chuẩn bị (embeddingMs).
    const t1 = performance.now();

    // [BƯỚC 2] Chuẩn bị 2 dạng câu hỏi khác nhau cho 2 mục đích:
    //   - retrievalQuery : câu dùng để TÌM nguồn (retrieve). Nếu là follow-up mơ hồ,
    //     nó được ghép thêm câu hỏi trước để không mất chủ đề khi vector search.
    const retrievalQuery = this.buildRetrievalQuery(
      dto.question,
      session.messages,
    );
    //   - promptQuestion : câu đưa vào prompt cho Gemini (Augment/Generate). Với
    //     follow-up mơ hồ, nó gắn thêm ngữ cảnh câu hỏi trước dưới dạng chỉ dẫn.
    const promptQuestion = this.buildPromptQuestion(
      dto.question,
      session.messages,
    );

    // [BƯỚC 3 — RETRIEVE] Truy hồi nguồn trên toàn thư viện của user.
    //   `dto.limit ?? this.defaultLibraryLimit` : nullish coalescing `??` — nếu
    //   dto.limit là null/undefined thì dùng giá trị mặc định (5). Khác với `||`:
    //   `??` KHÔNG coi 0 hay '' là "thiếu" (an toàn hơn cho số).
    const sources = await this.sourceService.getSourcesForLibrary(
      user.id,
      retrievalQuery,
      dto.limit ?? this.defaultLibraryLimit,
      dto.filters,
    );
    // [MỐC t2] Sau retrieve → (t2 - t1) = thời gian tìm nguồn (searchMs).
    const t2 = performance.now();

    // [BƯỚC 4] Gói mốc thời gian để ghi audit log (kiểu tường minh RetrievalTimingContext).
    const timings: RetrievalTimingContext = {
      userId: user.id,
      startTime: t0,
      embeddingMs: Math.round(t1 - t0),
      searchMs: Math.round(t2 - t1),
    };

    // [BƯỚC 5 — GENERATE] Bọc trong khóa lượt hội thoại và rẽ nhánh theo số nguồn:
    //   - 0 nguồn → processNoSourceQuestion (trả câu "không tìm thấy" mặc định).
    //   - có nguồn → processQuestion (dựng prompt grounded, gọi Gemini, lưu DB),
    //     truyền thêm promptQuestion để dùng đúng câu đã làm giàu ngữ cảnh.
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

  // ==========================================================================
  // KHÓA LƯỢT HỘI THOẠI THEO PHIÊN (withSessionTurnLock)
  // --------------------------------------------------------------------------
  // Không thuộc pipeline RAG, nhưng là "hạ tầng" bảo vệ tính nhất quán: đảm bảo
  // các câu hỏi trong CÙNG 1 phiên chạy TUẦN TỰ (không đua nhau ghi tin nhắn/lịch sử),
  // trong khi các phiên KHÁC NHAU vẫn chạy song song bình thường.
  //   - `<T>` : generic — hàm giữ nguyên kiểu kết quả T mà `operation` trả về.
  //   - operation : callback trả Promise<T>, chính là "công việc thực sự" cần khóa.
  // Kỹ thuật: nối các Promise thành 1 hàng đợi (queue) theo sessionId. Mỗi lượt mới
  // phải đợi "đuôi" (tail) của lượt trước hoàn tất rồi mới chạy.
  // ==========================================================================
  private async withSessionTurnLock<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    // [BƯỚC 1] Lấy đuôi hàng đợi hiện tại của phiên. Nếu chưa có (`??`), coi như
    //   một Promise đã resolve (Promise.resolve()) → lượt này chạy được ngay.
    const previousTail =
      this.sessionTurnTails.get(sessionId) ?? Promise.resolve();

    // [BƯỚC 2] Tạo 1 "cổng" (Promise thủ công) cho lượt hiện tại. `releaseCurrentTurn`
    //   giữ hàm resolve để gọi khi lượt này xong → mở đường cho lượt kế tiếp.
    //   Union type `(() => void) | undefined` vì ban đầu chưa gán.
    let releaseCurrentTurn: (() => void) | undefined;
    const currentTurn = new Promise<void>((resolve) => {
      releaseCurrentTurn = resolve;
    });

    // [BƯỚC 3] Đuôi mới = đợi đuôi cũ xong rồi mới tới lượt hiện tại. Ghi lại làm
    //   đuôi mới cho phiên để lượt sau nữa biết phải đợi ai.
    const currentTail = previousTail.then(() => currentTurn);
    this.sessionTurnTails.set(sessionId, currentTail);

    // [BƯỚC 4] Chờ đến lượt của mình (đợi tất cả lượt trước trong phiên hoàn tất).
    await previousTail;
    try {
      // [BƯỚC 5] Đã tới lượt → chạy công việc thực sự và trả kết quả về.
      return await operation();
    } finally {
      // [BƯỚC 6] Dù thành công hay lỗi (finally): mở cổng cho lượt kế tiếp.
      //   `releaseCurrentTurn?.()` : optional call — chỉ gọi nếu hàm đã được gán.
      releaseCurrentTurn?.();
      // Dọn Map nếu KHÔNG có lượt mới nào chen vào sau ta (đuôi vẫn là của ta) →
      // tránh rò rỉ bộ nhớ khi phiên đã "rảnh".
      if (this.sessionTurnTails.get(sessionId) === currentTail) {
        this.sessionTurnTails.delete(sessionId);
      }
    }
  }

  // ==========================================================================
  // LỊCH SỬ CHAT — Danh sách phiên (getSessions)
  // --------------------------------------------------------------------------
  // Ngoài pipeline RAG: phục vụ endpoint GET /chat/sessions, trả về danh sách phiên
  // chat của user (có phân trang + tin nhắn cuối mỗi phiên). Điểm quan trọng về bảo
  // mật: mỗi phiên/tin nhắn phải RE-CHECK quyền đọc tài liệu nguồn tại thời điểm hiện
  // tại, vì quyền có thể đã bị thu hồi sau khi trả lời.
  // ==========================================================================
  async getSessions(
    query: ChatSessionsQueryDto,
    user: AuthenticatedUser,
  ): Promise<ChatSessionListResponseDto> {
    // [BƯỚC 1] Điều kiện lọc: chỉ phiên của chính user, có thể lọc thêm theo mode/documentId.
    const where = {
      userId: user.id,
      mode: query.mode,
      documentId: query.documentId,
    };
    // [BƯỚC 2] Chạy SONG SONG 2 truy vấn: lấy trang dữ liệu + đếm tổng.
    //   - `Promise.all([...])` : chờ TẤT CẢ promise xong, trả mảng kết quả theo thứ tự.
    //   - `const [items, totalItems] = ...` : destructuring mảng — tách 2 phần tử ra 2 biến.
    const [items, totalItems] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          // Nạp kèm tài liệu gắn với phiên (nếu là luồng hỏi 1 tài liệu), chỉ lấy
          // các cột cần để kiểm tra quyền + hiển thị tiêu đề.
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
          // Chỉ lấy 1 tin nhắn MỚI NHẤT của mỗi phiên (orderBy desc + take: 1) để
          // hiển thị preview "lastMessage" trong danh sách.
          messages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              id: true,
              sender: true,
              content: true,
              createdAt: true,
              // Kèm nguồn của tin nhắn để kiểm tra quyền đọc trước khi hiển thị.
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
          // `_count` : Prisma trả về số lượng tin nhắn của phiên (không tải hết nội dung).
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.chatSession.count({ where }),
    ]);
    // [BƯỚC 3] Chuyển mỗi bản ghi phiên thành DTO trả cho client (map = duyệt & biến đổi mảng).
    return {
      items: items.map((session) => {
        // Kiểm tra quyền đọc tài liệu của phiên NGAY BÂY GIỜ. Nếu phiên không gắn
        // tài liệu (`session.document` falsy) thì mặc định cho đọc (`: true`).
        const canReadSessionDocument = session.document
          ? this.canReadHistoricalDocument(session.document, user)
          : true;
        // Tin nhắn cuối (phần tử đầu vì đã orderBy desc + take 1). Có thể undefined nếu phiên rỗng.
        const lastMessage = session.messages[0];

        return {
          id: session.id,
          mode: session.mode,
          // Nếu mất quyền đọc tài liệu → ẩn documentId (trả null) để không rò rỉ liên kết.
          documentId: canReadSessionDocument ? session.documentId : null,
          title: session.title,
          // Chỉ trả object document (id + title) khi còn quyền đọc, ngược lại null.
          document:
            canReadSessionDocument && session.document
              ? { id: session.document.id, title: session.document.title }
              : null,
          messageCount: session._count.messages,
          // Tin nhắn cuối: nếu có thì dựng preview; `historicalMessageContent` sẽ
          // thay nội dung bằng câu "nội dung không còn khả dụng" nếu nguồn bị thu hồi.
          //   `lastMessage.sources ?? []` : phòng khi sources undefined → dùng mảng rỗng.
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
      // Metadata phân trang (page/limit/totalPages/hasNext...).
      meta: this.pagination(query.page, query.limit, totalItems),
    };
  }

  // ==========================================================================
  // LỊCH SỬ CHAT — Chi tiết 1 phiên (getSession)
  // --------------------------------------------------------------------------
  // Endpoint GET /chat/sessions/:id. Trả về chi tiết 1 phiên gồm toàn bộ tin nhắn
  // (theo thứ tự thời gian) và bản tổng hợp các nguồn đã trích dẫn. Vẫn re-check
  // quyền đọc phiên + quyền đọc từng tài liệu nguồn tại thời điểm hiện tại.
  // ==========================================================================
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
    // Guard: không có phiên → 404.
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    // Guard phân quyền: chỉ chủ phiên hoặc ADMIN mới được đọc (ném 403 nếu không).
    this.assertCanReadSession(session.userId, user);

    // Re-check quyền đọc tài liệu gắn phiên (nếu có).
    const canReadSessionDocument = session.document
      ? this.canReadHistoricalDocument(session.document, user)
      : true;
    // Gom TẤT CẢ nguồn (đã lọc theo quyền) của mọi tin nhắn thành 1 mảng phẳng.
    //   `flatMap` : vừa map vừa "làm phẳng" 1 cấp — mỗi tin nhắn trả 1 mảng nguồn,
    //   flatMap nối tất cả các mảng đó lại thành 1 mảng duy nhất.
    const authorizedSources = session.messages.flatMap((message) =>
      this.authorizedHistoricalSources(message.sources, user),
    );
    // Tổng hợp nguồn theo tài liệu (loại trùng) để hiển thị "sourceSummary".
    const sourceSummary = this.mapUniqueSources(authorizedSources);
    // `.at(-1)` : lấy phần tử CUỐI mảng (chỉ số âm đếm ngược từ cuối) → tin nhắn mới nhất.
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

  // ==========================================================================
  // LỊCH SỬ CHAT — Danh sách tin nhắn của 1 phiên (getMessages)
  // --------------------------------------------------------------------------
  // Endpoint GET /chat/sessions/:id/messages (có phân trang). Trả về từng tin nhắn
  // kèm nguồn đã lọc theo quyền. Vẫn giữ nguyên tin nhắn trong DB, chỉ ẩn/thay nội
  // dung ở tầng trình bày khi nguồn không còn quyền đọc.
  // ==========================================================================
  async getMessages(
    sessionId: string,
    query: ChatMessagesQueryDto,
    user: AuthenticatedUser,
  ): Promise<ChatMessageListResponseDto> {
    // [BƯỚC 1] Xác thực phiên tồn tại + quyền đọc (chỉ cần id + userId để check).
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true },
    });
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    this.assertCanReadSession(session.userId, user);

    // [BƯỚC 2] Lấy trang tin nhắn (asc theo thời gian) + đếm tổng, chạy song song.
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
    // [BƯỚC 3] Biến mỗi tin nhắn DB thành DTO trả về.
    return {
      items: messages.map((message) => {
        // Lọc nguồn theo quyền đọc hiện tại (bỏ nguồn đã bị thu hồi).
        const authorizedSources = this.authorizedHistoricalSources(
          message.sources,
          user,
        );

        return {
          id: message.id,
          sessionId: message.chatSessionId,
          sender: message.sender,
          // Nội dung hiển thị: thay bằng câu "không còn khả dụng" nếu là tin AI có nguồn bị thu hồi.
          content: this.historicalMessageContent(
            message.sender,
            message.content,
            message.sources,
            user,
          ),
          // Spread có điều kiện: CHỈ chèn các field status/interruptionReason khi
          //   message.status có giá trị. `...(cond ? {a,b} : {})` là mẹo TS/JS để
          //   thêm thuộc tính động vào object literal. `?? null` chuẩn hóa undefined→null.
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

  // ==========================================================================
  // LẤY HOẶC TẠO PHIÊN (resolveSession) — bước chuẩn bị trước RAG
  // --------------------------------------------------------------------------
  // Dùng chung cho askDocument/askLibrary. Nếu không truyền sessionId → tạo phiên
  // mới; nếu có → tải phiên cũ và xác thực nó KHỚP với ngữ cảnh request (đúng chủ,
  // đúng mode, đúng documentId) để chống nối nhầm phiên / vượt quyền.
  //   Kiểu trả về `Prisma.ChatSessionGetPayload<{...}>` : generic của Prisma sinh ra
  //   đúng kiểu bản ghi ChatSession KÈM quan hệ `messages` đã include (type-safe).
  // ==========================================================================
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
    // [BƯỚC 1] Không có sessionId → tạo phiên mới, kèm mảng messages rỗng (sắp xếp asc).
    if (!sessionId) {
      return this.prisma.chatSession.create({
        data: {
          userId,
          mode,
          documentId,
        },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    }

    // [BƯỚC 2] Có sessionId → tải phiên hiện có cùng toàn bộ tin nhắn (asc theo thời gian).
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    // Guard: phiên không tồn tại → 404.
    if (!session) {
      throw new NotFoundException('Chat session not found');
    }
    // Guard phân quyền: phiên không thuộc user hiện tại → 403.
    if (session.userId !== userId) {
      throw new ForbiddenException('Chat session access denied');
    }
    // Guard nhất quán ngữ cảnh: mode/documentId của phiên phải khớp request.
    //   `documentId ?? null` : chuẩn hóa undefined→null để so khớp đúng với DB (cột nullable).
    if (session.mode !== mode || session.documentId !== (documentId ?? null)) {
      throw new ForbiddenException(
        'Chat session context does not match request',
      );
    }
    return session;
  }

  // ==========================================================================
  // TRÁI TIM PIPELINE RAG — Augment + Generate + Persist (processQuestion)
  // --------------------------------------------------------------------------
  // Chạy khi ĐÃ có ít nhất 1 nguồn. Nhiệm vụ (theo thứ tự):
  //   Augment  : phân loại ý định, redact dữ liệu nhạy cảm, chuẩn hóa nguồn thành
  //              ngữ cảnh prompt + danh sách citation.
  //   Generate : dựng system instruction + contents, gọi Gemini (có timeout), hoặc
  //              trả câu từ chối nếu là yêu cầu nhạy cảm.
  //   Persist  : lưu tin nhắn USER + AI (kèm citation), cập nhật tiêu đề phiên, ghi audit.
  // Tham số `promptQuestion = question` : giá trị mặc định — nếu người gọi không
  //   truyền thì promptQuestion = question (askDocument dùng mặc định; askLibrary
  //   truyền câu đã làm giàu ngữ cảnh).
  // ==========================================================================
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
    // [BƯỚC 1 — Bảo mật] Phát hiện câu hỏi cố moi prompt hệ thống/khóa/bí mật.
    const sensitiveRequest = this.isSensitivePromptRequest(question);
    // [BƯỚC 2 — Redact] Che thông tin nhạy cảm (private key, API key...) trong nguồn
    //   TRƯỚC khi đưa vào prompt hoặc trả về, tránh AI/phản hồi làm rò rỉ.
    const safeSources = sources.map((source) => this.redactSource(source));
    // [BƯỚC 3 — Phân loại ý định] Suy ra AnswerIntent dựa trên câu hỏi + lịch sử.
    const answerIntent = this.classifyAnswerIntent(question, session.messages);
    // [BƯỚC 4] Gắn chỉ dẫn theo ý định vào câu hỏi (VD: "trả lời đầy đủ mọi mục...").
    const intentAwareQuestion = this.buildIntentAwarePromptQuestion(
      promptQuestion,
      answerIntent,
    );
    // [BƯỚC 5 — Augment] Chuẩn hóa nguồn thành ngữ cảnh nhồi prompt. Nếu hỏi toàn bộ
    //   tài liệu thì cho phép ngữ cảnh dài hơn (tham số thứ 2 = true khi FULL_DOCUMENT_CONTENT).
    const promptSources = this.normalizePromptSources(
      safeSources,
      answerIntent === 'FULL_DOCUMENT_CONTENT',
    );
    // [BƯỚC 6] Dựng danh sách citation trả cho client, căn (align) passage của
    //   citation theo đúng ngữ cảnh đã đưa vào prompt (để trích dẫn khớp nội dung).
    const citationSources = this.alignCitationPassages(
      this.normalizeCitations(safeSources),
      promptSources,
    );

    // [BƯỚC 7 — Persist USER] Lưu tin nhắn của người dùng vào DB.
    //   `dbTimeAccumulator` cộng dồn thời gian ghi DB (2 lần) để log saveDbMs.
    let dbTimeAccumulator = 0;
    const dbStart1 = performance.now();
    await this.prisma.chatMessage.create({
      data: {
        chatSessionId: session.id,
        sender: MessageSender.USER,
        content: question,
      },
    });
    dbTimeAccumulator += performance.now() - dbStart1;

    // [BƯỚC 8 — GENERATE] Sinh câu trả lời. Đo thời gian gọi Gemini (geminiMs).
    const tGeminiStart = performance.now();
    let reply: GeminiSafeResponse;
    if (sensitiveRequest) {
      // Yêu cầu nhạy cảm → KHÔNG gọi Gemini, trả thẳng câu từ chối (vẫn coi là success).
      reply = {
        success: true,
        answer: this.sensitiveRequestRefusal,
        errorCode: null,
        errorMessage: null,
        isMock: false,
      };
    } else {
      // Dựng lượt hỏi "grounded": câu hỏi + các đoạn nguồn được đánh số → ép AI bám nguồn.
      const groundedUserTurn = this.promptBuilder.buildGroundedUserTurn(
        intentAwareQuestion,
        promptSources,
      );
      // Ghép lịch sử (chỉ N tin gần nhất, `slice(-N)` lấy N phần tử cuối) + lượt hỏi mới.
      const contents = this.promptBuilder.buildContents(
        session.messages.slice(-this.maxHistoryMessages),
        groundedUserTurn,
      );
      // System instruction khác nhau theo chế độ: hỏi thư viện dùng prompt riêng
      //   (ternary chọn nhánh theo session.mode).
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
      // Gọi Gemini có bọc timeout + bắt lỗi an toàn (không ném ra ngoài, luôn trả reply).
      //   toGeminiReplyOptions cấp timeout dài hơn cho câu trả lời "nặng".
      reply = await this.generateSafeReply(
        contents,
        systemInstruction,
        this.toGeminiReplyOptions(answerIntent),
      );
    }
    const tGeminiEnd = performance.now();
    // Câu từ chối không tốn thời gian Gemini → geminiMs = 0; ngược lại đo chênh lệch.
    const geminiMs = sensitiveRequest
      ? 0
      : Math.round(tGeminiEnd - tGeminiStart);

    // [BƯỚC 9 — Hậu xử lý câu trả lời]
    // Yêu cầu nhạy cảm thì không kèm nguồn nào; ngược lại dùng citationSources.
    const responseSources = sensitiveRequest ? [] : citationSources;
    // Trạng thái trả về: thành công = ANSWERED; Gemini lỗi = FALLBACK_WITH_SOURCES
    //   (vẫn còn nguồn để người dùng tự đọc). Chú thích kiểu `: AiAnswerStatus`.
    const answerStatus: AiAnswerStatus = reply.success
      ? 'ANSWERED'
      : 'FALLBACK_WITH_SOURCES';
    // Nội dung gốc câu trả lời:
    //   - Thành công → dọn citation "ảo" (số nguồn không tồn tại) rồi redact lần nữa.
    //   - Thất bại   → dựng câu fallback nêu lý do + liệt kê nguồn liên quan.
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
    // Phát hiện câu trả lời mới "phủ 1 phần" (thiếu mục) với các ý định cần đầy đủ.
    const partialCoverage = reply.success
      ? this.detectPartialCoverage(baseAnswer, promptSources, answerIntent)
      : false;
    // Còn nội dung để viết tiếp nếu: bị cắt do token (truncated) HOẶC phủ thiếu mục.
    const hasMore =
      reply.success && (reply.truncated === true || partialCoverage);
    // Lý do dừng: ưu tiên nhãn của Gemini khi bị cắt; nếu thiếu mục → PARTIAL_COVERAGE;
    //   không có gì → undefined (ternary lồng nhau).
    const finishReason = reply.truncated
      ? (reply.finishReason ?? 'MAX_TOKENS')
      : partialCoverage
        ? 'PARTIAL_COVERAGE'
        : undefined;
    // Nếu còn tiếp → thêm gợi ý "Hãy hỏi ... để xem tiếp" (template literal chèn biến qua `${}`).
    const answer = hasMore
      ? `${baseAnswer}\n\n_Câu trả lời đã đạt giới hạn. Hãy hỏi "${this.continuationPrompt}" để xem tiếp._`
      : baseAnswer;

    // [BƯỚC 10 — Persist AI] Lưu tin nhắn của AI kèm citation.
    const dbStart2 = performance.now();
    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        chatSessionId: session.id,
        sender: MessageSender.AI,
        content: answer,
        // Spread có điều kiện cho trạng thái tin nhắn:
        //   - hasMore → 'incomplete' (còn phần tiếp) kèm lý do dừng.
        //   - Gemini lỗi → 'fallback' kèm errorCode.
        //   - bình thường → không thêm field nào ({}).
        ...(hasMore
          ? { status: 'incomplete', interruptionReason: finishReason }
          : !reply.success
            ? {
                status: 'fallback',
                interruptionReason: reply.errorCode,
              }
            : {}),
        // Chỉ ghi quan hệ sources khi có nguồn. `createMany` tạo nhiều bản ghi chat_sources.
        ...(responseSources.length > 0
          ? {
              sources: {
                // chat_sources is unique per (chatMessageId, documentId);
                // collapse chunk-based retrieval to one citation per document.
                // (Ràng buộc unique theo (message, document); skipDuplicates bỏ qua trùng.)
                createMany: {
                  data: responseSources.map((source) => ({
                    documentId: source.documentId,
                    // `?? null` : chuẩn hóa các trường tùy chọn về null cho cột nullable.
                    documentChunkId: source.chunkId ?? null,
                    chunkIndex: source.chunkIndex ?? null,
                    snippet: source.snippet,
                    // `passage ?? snippet` : ưu tiên passage đầy đủ, thiếu thì dùng snippet.
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
    // Cập nhật tiêu đề phiên = 120 ký tự đầu của câu hỏi (dùng làm tên hiển thị lịch sử).
    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { title: question.slice(0, 120) },
    });
    dbTimeAccumulator += performance.now() - dbStart2;

    // [BƯỚC 11 — Audit log] Ghi lại số liệu hiệu năng + metadata truy vấn (không chặn phản hồi).
    const saveDbMs = Math.round(dbTimeAccumulator);
    // Tổng thời gian: nếu có mốc startTime thì tính từ đầu luồng; nếu không, cộng 2 chặng đã đo.
    const totalMs = timings
      ? Math.round(performance.now() - timings.startTime)
      : geminiMs + saveDbMs;

    if (timings && this.auditLogService) {
      // `.some(...)` : true nếu CÓ ÍT NHẤT 1 nguồn dùng cơ chế fallback theo keyword.
      const fallbackKeyword = sources.some(
        (s) => s.usedFallbackKeyword === true,
      );
      // Danh sách documentId đã trích dẫn, loại trùng: `new Set(...)` bỏ trùng,
      //   `Array.from(...)` chuyển Set về mảng.
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
        // Log lỗi audit KHÔNG được làm hỏng phản hồi chính → nuốt lỗi vào .catch và chỉ ghi log.
        //   `err: unknown` : kiểu an toàn nhất cho catch; ép về chuỗi qua String(err).
        .catch((err: unknown) => {
          this.logger.error(`Failed to log chatbot query: ${String(err)}`);
        });
    }

    // [BƯỚC 12] Trả DTO phản hồi chuẩn cho controller.
    return {
      answer,
      sessionId: session.id,
      messageId: assistantMessage.id,
      // Nếu còn phần tiếp → đặt gợi ý "tiếp tục" lên đầu (spread `...` để gộp mảng).
      suggestedPrompts: hasMore
        ? [this.continuationPrompt, ...this.suggestedPrompts]
        : this.suggestedPrompts,
      sources: responseSources,
      answerStatus,
      errorCode: reply.success ? null : reply.errorCode,
      // Chỉ thêm cờ hasMore/finishReason khi thực sự còn nội dung.
      ...(hasMore
        ? { hasMore: true, finishReason: finishReason ?? 'MAX_TOKENS' }
        : {}),
    };
  }

  // ==========================================================================
  // NHÁNH KHÔNG CÓ NGUỒN (processNoSourceQuestion)
  // --------------------------------------------------------------------------
  // Chạy khi Retrieve trả về 0 nguồn: KHÔNG gọi Gemini (không có gì để grounding),
  // chỉ lưu tin nhắn USER + câu trả lời mặc định "không tìm thấy", cập nhật tiêu đề
  // và ghi audit. Vẫn chặn yêu cầu nhạy cảm.
  //   `noSourceAnswer = this.noLibrarySourceAnswer` : mặc định câu cho luồng thư viện;
  //   askDocument truyền câu riêng (noDocumentSourceAnswer).
  // ==========================================================================
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
    // [BƯỚC 1 — Persist USER] Lưu câu hỏi của người dùng.
    const dbStart = performance.now();
    await this.prisma.chatMessage.create({
      data: {
        chatSessionId: session.id,
        sender: MessageSender.USER,
        content: question,
      },
    });
    // [BƯỚC 2] Chọn nội dung trả lời: câu từ chối nếu yêu cầu nhạy cảm, ngược lại câu "không tìm thấy".
    const answer = this.isSensitivePromptRequest(question)
      ? this.sensitiveRequestRefusal
      : noSourceAnswer;
    // [BƯỚC 3 — Persist AI] Lưu tin nhắn trả lời (không kèm nguồn).
    const assistantMessage = await this.prisma.chatMessage.create({
      data: {
        chatSessionId: session.id,
        sender: MessageSender.AI,
        content: answer,
      },
    });
    // Cập nhật tiêu đề phiên từ 120 ký tự đầu câu hỏi.
    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { title: question.slice(0, 120) },
    });
    const saveDbMs = Math.round(performance.now() - dbStart);
    const totalMs = timings
      ? Math.round(performance.now() - timings.startTime)
      : saveDbMs;

    // [BƯỚC 4 — Audit] Ghi log với noSource=true, geminiMs=0 (không gọi AI).
    //   `session.mode ?? ChatMode.ASK_MY_LIBRARY` : mode có thể undefined → mặc định thư viện.
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

    // Trả DTO với answerStatus = 'NO_SOURCES' và mảng nguồn rỗng.
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

  // ==========================================================================
  // FALLBACK KHI GEMINI LỖI (buildSourceFallbackAnswer)
  // --------------------------------------------------------------------------
  // Khi Generate thất bại nhưng ĐÃ có nguồn: thay vì báo lỗi trơ, dựng câu trả lời
  // nêu lý do lỗi + liệt kê tối đa 3 nguồn liên quan để người dùng tự đọc. Đây là
  // cơ chế "degrade gracefully" của pipeline RAG.
  // ==========================================================================
  private buildSourceFallbackAnswer(
    question: string,
    citationSources: CitationDto[],
    promptSources: CitationDto[],
    errorCode: GeminiErrorCode | null,
  ): string {
    // Chuyển mã lỗi kỹ thuật thành câu giải thích thân thiện với người dùng.
    const reason = this.toUserFacingAiFailureReason(errorCode);
    // Tạo Map documentId → promptSource để tra nhanh đoạn ngữ cảnh đầy đủ hơn theo tài liệu.
    const promptSourceByDocument = new Map(
      promptSources.map((source) => [source.documentId, source]),
    );
    // Dựng tối đa 3 dòng nguồn: "- [số] tiêu đề: trích đoạn".
    const sourceLines = citationSources
      .slice(0, 3)
      .map((source) => {
        const promptSource = promptSourceByDocument.get(source.documentId);
        // Ưu tiên snippet dài từ promptSource; thiếu thì dùng snippet của citation.
        const excerpt = this.truncateFallbackExcerpt(
          promptSource?.snippet ?? source.snippet,
        );
        // Chỉ thêm phần trích đoạn nếu có (ternary trong template literal).
        return `- [${source.sourceNumber}] ${source.title}${excerpt ? `:\n${excerpt}` : ''}`;
      })
      .join('\n\n');
    const sources = citationSources;

    // Ghép các dòng thành 1 chuỗi nhiều đoạn (join theo '\n').
    return [
      `${reason} Mình vẫn tìm được ${sources.length} tài liệu liên quan đến câu hỏi: "${question}".`,
      '',
      sourceLines,
      '',
      'Bạn có thể mở các trích dẫn bên cạnh để xem đoạn nguồn, hoặc thử gửi lại câu hỏi sau khi cấu hình AI ổn định.',
    ].join('\n');
  }

  // Cắt bớt đoạn trích trong câu fallback về tối đa 1200 ký tự (thêm "..." nếu bị cắt).
  //   `string | null | undefined` : union — nhận cả 3 dạng, được chuẩn hóa an toàn.
  private truncateFallbackExcerpt(value: string | null | undefined): string {
    const normalized = this.normalizeSnippet(value);
    if (normalized.length <= 1200) {
      return normalized;
    }

    return `${normalized.slice(0, 1200)}...`;
  }

  // Ánh xạ mã lỗi Gemini (kỹ thuật) → câu giải thích tiếng Việt cho người dùng cuối.
  //   `switch` : chọn nhánh theo giá trị errorCode; `default` là trường hợp còn lại.
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

  // ==========================================================================
  // PHÂN QUYỀN ĐỌC TÀI LIỆU (canReadDocument) — guard cốt lõi của MF3
  // --------------------------------------------------------------------------
  // Trả true nếu user được phép đọc tài liệu. Ba điều kiện nối bằng `||` (OR):
  //   1) là chủ sở hữu tài liệu, HOẶC
  //   2) là ADMIN, HOẶC
  //   3) tài liệu PUBLIC + đã duyệt (APPROVED) + user đang ACTIVE (dùng `&&` = AND).
  // ==========================================================================
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

  // Guard đọc PHIÊN chat: ném 403 nếu user không phải chủ phiên và không phải ADMIN.
  //   Kiểu trả về `: void` — không trả giá trị, chỉ ném lỗi khi vi phạm ("assert").
  private assertCanReadSession(ownerId: string, user: AuthenticatedUser): void {
    if (ownerId !== user.id && user.role.name !== RoleName.ADMIN) {
      throw new ForbiddenException('Chat session access denied');
    }
  }

  // Quyền đọc tài liệu trong ngữ cảnh LỊCH SỬ: ngoài canReadDocument, tài liệu còn
  // phải đang ACTIVE (chưa bị xóa/khóa). Dùng khi hiển thị lại nguồn của tin nhắn cũ.
  private canReadHistoricalDocument(
    document: HistoricalSourceDocument,
    user: AuthenticatedUser,
  ): boolean {
    return (
      document.status === DocumentStatus.ACTIVE &&
      this.canReadDocument(document, user)
    );
  }

  // Lọc ra CHỈ những nguồn lịch sử mà user còn quyền đọc.
  //   `<T extends HistoricalSource>` : generic có ràng buộc — T phải có ít nhất
  //   hình dạng HistoricalSource, nhưng hàm vẫn giữ nguyên kiểu cụ thể T ở đầu vào/ra.
  //   `.filter(...)` : giữ lại phần tử mà callback trả true.
  private authorizedHistoricalSources<T extends HistoricalSource>(
    sources: T[],
    user: AuthenticatedUser,
  ): T[] {
    return sources.filter((source) =>
      this.canReadHistoricalDocument(source.document, user),
    );
  }

  // Quyết định nội dung hiển thị của 1 tin nhắn cũ:
  //   Nếu là tin của AI VÀ có bất kỳ nguồn nào đã bị thu hồi quyền (`.some` = tồn tại
  //   ít nhất 1) → thay bằng câu "nội dung không còn khả dụng" để tránh rò rỉ nội dung
  //   dựa trên tài liệu mà user không còn được đọc. Ngược lại giữ nguyên content.
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

  // Rút gọn extractedText thành snippet cho citation: cắt trim, gộp mọi khoảng trắng
  //   (`\s+` → 1 space) và giới hạn độ dài. `?.trim() || ''` : nếu null/undefined/rỗng → ''.
  private toCitationSnippet(content: {
    extractedText?: string | null;
    contentSummary?: string | null;
  }): string {
    const snippet = content.extractedText?.trim() || '';

    return snippet.replace(/\s+/g, ' ').slice(0, this.citationSnippetLimit);
  }

  // Cắt toàn văn tài liệu về giới hạn ngữ cảnh (documentContextLimit) trước khi nhồi prompt.
  private toPromptContext(extractedText: string): string {
    return extractedText.slice(0, this.documentContextLimit);
  }

  // ==========================================================================
  // GỌI GEMINI AN TOÀN (generateSafeReply) — bước Generate được bọc bảo vệ
  // --------------------------------------------------------------------------
  // Bọc lời gọi Gemini bằng timeout và try/catch: dù lỗi/hết giờ, hàm KHÔNG ném ra
  // ngoài mà luôn trả về 1 GeminiSafeResponse (success=false) để luồng chính xử lý
  // fallback mượt mà.
  //   - `Parameters<GeminiService['generateReply']>[0]` : utility type lấy kiểu của
  //     THAM SỐ THỨ 0 của hàm generateReply → giữ đồng bộ kiểu tự động.
  //   - `ReturnType<...>` : lấy kiểu TRẢ VỀ của hàm đó làm kiểu trả về ở đây.
  // ==========================================================================
  private async generateSafeReply(
    contents: Parameters<GeminiService['generateReply']>[0],
    systemInstruction: string,
    options?: GeminiReplyOptions,
  ): ReturnType<GeminiService['generateReply']> {
    try {
      // Có options thì gọi bản 3 tham số (kèm timeout tùy chỉnh), không thì bản 2 tham số.
      //   `options?.timeoutMs` : optional chaining — undefined nếu không có options → withTimeout dùng mặc định.
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
      // Bất kỳ lỗi/timeout nào → trả phản hồi thất bại chuẩn hóa (không làm sập request).
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

  // ==========================================================================
  // TIMEOUT CHO PROMISE (withTimeout)
  // --------------------------------------------------------------------------
  // Đua giữa promise thật và 1 promise "hẹn giờ": ai xong trước thắng.
  //   - `Promise.race([...])` : trả về kết quả (hoặc lỗi) của promise HOÀN TẤT ĐẦU TIÊN.
  //   - `new Promise<never>` : promise chỉ để reject khi hết giờ (never = không bao giờ resolve giá trị).
  //   - `finally` : luôn clearTimeout để không rò rỉ bộ đếm khi promise thật xong trước.
  // ==========================================================================
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        // `(_, reject)` : bỏ qua resolve (dấu `_`), chỉ dùng reject sau timeoutMs → ném 504.
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

  // Chuyển các bản ghi chat_source (dạng DB) thành CitationDto trả cho client.
  //   `.map((source, index) => ...)` : callback nhận thêm chỉ số index để đánh sourceNumber.
  //   Các `?? null` / `?? ''` chuẩn hóa giá trị thiếu. Cuối cùng normalizeCitations
  //   sẽ khử trùng + sắp xếp lại theo độ liên quan.
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

  // Như mapSources nhưng gộp về DUY NHẤT 1 nguồn cho mỗi tài liệu (loại trùng theo documentId).
  //   Mẹo khử trùng: `new Map(entries).values()` — Map giữ 1 giá trị cho mỗi key (documentId),
  //   nên các bản ghi cùng tài liệu bị "đè", chỉ còn 1. `[...map.values()]` (spread) đổi về mảng.
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

  // ==========================================================================
  // CHUẨN HÓA DANH SÁCH CITATION (normalizeCitations)
  // --------------------------------------------------------------------------
  // Khử trùng + sắp xếp theo độ liên quan giảm dần + đánh lại sourceNumber liên tục.
  // `truncateSnippet = true` : mặc định cắt ngắn snippet cho hiển thị; đặt false khi
  // cần giữ snippet dài (VD làm ngữ cảnh prompt).
  // ==========================================================================
  private normalizeCitations(
    sources: CitationDto[],
    truncateSnippet = true,
  ): CitationDto[] {
    // [BƯỚC 1] Khử trùng theo chunkId; nếu không có chunkId thì dùng khóa ghép
    //   `documentId:snippet` (template literal) để phân biệt. Map giữ 1 bản mỗi khóa.
    const uniqueSources = [
      ...new Map(
        sources.map((source) => [
          source.chunkId ?? `${source.documentId}:${source.snippet}`,
          source,
        ]),
      ).values(),
    ];

    // [BƯỚC 2] Kèm index gốc (để "stable sort") rồi sắp xếp.
    return uniqueSources
      .map((source, index) => ({ source, index }))
      .sort((left, right) => {
        // So sánh theo relevanceScore. Quy ước sort: trả <0 → left đứng trước,
        //   >0 → right đứng trước, 0 → giữ nguyên thứ tự tương đối.
        const leftScore = left.source.relevanceScore;
        const rightScore = right.source.relevanceScore;

        // Cả hai có điểm → điểm CAO hơn đứng trước (right - left = giảm dần).
        if (leftScore !== null && rightScore !== null) {
          if (rightScore !== leftScore) {
            return rightScore - leftScore;
          }
        } else if (leftScore !== null) {
          return -1; // chỉ left có điểm → left trước
        } else if (rightScore !== null) {
          return 1; // chỉ right có điểm → right trước
        }

        // Hòa điểm (hoặc cả hai null) → giữ thứ tự gốc theo index (ổn định).
        return left.index - right.index;
      })
      // [BƯỚC 3] Sau khi sắp xếp, đánh lại sourceNumber = index + 1 và dựng DTO cuối.
      .map(({ source }, index) => ({
        citationId: source.citationId,
        sourceNumber: index + 1,
        documentId: source.documentId,
        title: source.title,
        chunkId: source.chunkId ?? null,
        chunkIndex: source.chunkIndex ?? null,
        // Snippet: cắt ngắn để hiển thị, hoặc chỉ chuẩn hóa khoảng trắng nếu giữ dài.
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

  // ==========================================================================
  // GỘP NGỮ CẢNH THEO TÀI LIỆU CHO PROMPT (normalizePromptSources) — bước Augment
  // --------------------------------------------------------------------------
  // Retrieval trả về nhiều "chunk" có thể cùng 1 tài liệu. Hàm này GỘP các chunk
  // cùng documentId thành 1 khối ngữ cảnh (nối các đoạn không trùng), giới hạn số
  // ký tự mỗi nguồn, rồi khử trùng + giới hạn tổng ngân sách ngữ cảnh.
  //   `wholeDocumentQuestion = false` : true khi hỏi toàn tài liệu → cho phép ngữ cảnh
  //   dài hơn (dùng maxPromptContextCharacters thay vì mức mặc định mỗi nguồn).
  // ==========================================================================
  private normalizePromptSources(
    sources: ChatSourceContext[],
    wholeDocumentQuestion = false,
  ): CitationDto[] {
    // Map documentId → citation đã gộp. Giới hạn ký tự mỗi nguồn tùy loại câu hỏi.
    const grouped = new Map<string, CitationDto>();
    const perSourceLimit = wholeDocumentQuestion
      ? this.maxPromptContextCharacters
      : this.defaultPromptContextPerSource;

    // `for...of` : duyệt từng nguồn. Ưu tiên promptContext (ngữ cảnh giàu hơn), thiếu thì snippet.
    for (const source of sources) {
      const context = source.promptContext ?? source.snippet;
      const existing = grouped.get(source.documentId);
      // Lần đầu gặp tài liệu này → tạo entry mới với ngữ cảnh đã cắt theo giới hạn.
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
        // `continue` : bỏ qua phần còn lại của vòng lặp, sang nguồn kế tiếp.
        continue;
      }

      // Đã có entry cho tài liệu này → gộp thêm ngữ cảnh mới vào.
      //   `...existing` : sao chép các field cũ, rồi ghi đè vài field bên dưới.
      grouped.set(source.documentId, {
        ...existing,
        // Nối khối ngữ cảnh cũ + mới (bỏ đoạn trùng) rồi cắt lại theo giới hạn.
        snippet: this.truncatePromptContext(
          this.joinUniqueContextBlocks(existing.snippet, context),
          perSourceLimit,
        ),
        passage: this.truncatePromptContext(
          this.joinUniqueContextBlocks(existing.snippet, context),
          perSourceLimit,
        ),
        // Lấy điểm liên quan CAO NHẤT giữa các chunk của cùng tài liệu.
        relevanceScore: this.maxRelevanceScore(
          existing.relevanceScore,
          source.relevanceScore,
        ),
        // Hợp nhất các vị trí nguồn (sourceLocator), loại trùng bằng Set.
        //   `...(x ?? [])` : spread an toàn khi mảng có thể undefined.
        sourceLocator: [
          ...new Set([
            ...(existing.sourceLocator ?? []),
            ...(source.sourceLocator ?? []),
          ]),
        ],
      });
    }

    // Khử trùng/sắp xếp (giữ snippet dài: false) rồi giới hạn TỔNG ngân sách ngữ cảnh.
    return this.limitPromptContext(
      this.normalizeCitations([...grouped.values()], false),
    );
  }

  // ==========================================================================
  // LỌC CITATION "ẢO" TRONG CÂU TRẢ LỜI (sanitizeAnswerCitations) — hậu xử lý
  // --------------------------------------------------------------------------
  // Gemini có thể chèn ký hiệu trích dẫn như [1], [Source 2], [1, 2, 3]. Hàm này
  // chỉ GIỮ những số nằm trong khoảng [1..sourceCount] (nguồn thực sự trả về), loại
  // bỏ số bịa để tránh trích dẫn tới nguồn không tồn tại.
  //   `String.replace(regex, callback)` : với mỗi lần khớp, callback quyết định thay bằng gì.
  //   Cờ regex: `g` = toàn cục (mọi lần khớp), `i` = không phân biệt hoa/thường.
  // ==========================================================================
  private sanitizeAnswerCitations(answer: string, sourceCount: number): string {
    // Gemini emits single citations ([1], [Source 2]) as well as grouped ones
    // ([1, 2, 3]); keep only numbers that map to a returned source.
    return answer.replace(
      /\[(?:Source\s+)?(\d+(?:\s*,\s*\d+)*)\]/gi,
      // Tham số 1 (`_citation`) là toàn bộ chuỗi khớp (không dùng nên đặt `_`),
      //   `numbers` là nhóm bắt các chữ số bên trong ngoặc.
      (_citation, numbers: string) => {
        const valid = numbers
          .split(',') // tách "1, 2, 3" thành ["1"," 2"," 3"]
          .map((value) => Number(value.trim())) // ép về số
          .filter((value) => value >= 1 && value <= sourceCount); // chỉ giữ số hợp lệ

        // Còn số hợp lệ → dựng lại "[1, 2]"; không còn → xóa hẳn ký hiệu ('').
        return valid.length > 0 ? `[${valid.join(', ')}]` : '';
      },
    );
  }

  // Che thông tin nhạy cảm trong 1 nguồn TRƯỚC khi dùng cho prompt/hiển thị.
  //   `...source` : giữ nguyên các field khác, chỉ ghi đè các field văn bản đã redact.
  //   Các field tùy chọn dùng ternary để chỉ redact khi có giá trị.
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

  // ==========================================================================
  // CHE BÍ MẬT TRONG VĂN BẢN (redactSensitiveText)
  // --------------------------------------------------------------------------
  // Chuỗi các .replace() dùng regex để thay các mẫu nhạy cảm bằng "[REDACTED]":
  //   - Private key (khối -----BEGIN...KEY-----).
  //   - Khóa Google API (bắt đầu bằng "AIza..."), khóa dạng "sk-..." (OpenAI-like).
  //   - Header "Bearer <token>".
  //   - Cặp biến môi trường kiểu FOO_API_KEY=..., ...SECRET/TOKEN/PASSWORD=...
  // Đây là lớp phòng vệ chống rò rỉ credential lẫn trong nội dung tài liệu.
  // ==========================================================================
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

  // ==========================================================================
  // PHÁT HIỆN PROMPT INJECTION / YÊU CẦU NHẠY CẢM (isSensitivePromptRequest)
  // --------------------------------------------------------------------------
  // Chuẩn hóa câu hỏi (bỏ dấu, chữ thường) rồi dò 3 mẫu ý định bằng regex:
  //   - disclosureIntent : ý định "moi ra" (reveal/show/tiet lo/hien thi...).
  //   - sensitiveTarget  : mục tiêu nhạy cảm (system prompt/api key/secret/cau hinh...).
  //   - overrideAttempt  : cố ghi đè chỉ dẫn ("ignore ... instructions", "bo qua ... quy tac").
  // Chặn nếu (moi ra VÀ mục tiêu nhạy cảm) HOẶC (có ý định ghi đè chỉ dẫn).
  //   `.test(str)` : trả boolean cho biết chuỗi có khớp regex hay không.
  // ==========================================================================
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

  // ==========================================================================
  // GIỚI HẠN TỔNG NGÂN SÁCH NGỮ CẢNH (limitPromptContext)
  // --------------------------------------------------------------------------
  // Duyệt các nguồn theo thứ tự, cắt dần snippet sao cho TỔNG số ký tự không vượt
  // maxPromptContextCharacters. `remaining` là ngân sách còn lại (dùng `let` vì thay đổi).
  //   - Hết ngân sách (remaining <= 0) → trả null (nguồn bị loại).
  //   - `.filter((s): s is CitationDto => s !== null)` : "type guard" giúp TS thu hẹp
  //     kiểu từ (CitationDto | null)[] về CitationDto[] sau khi lọc bỏ null.
  // ==========================================================================
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

  // ==========================================================================
  // CĂN PASSAGE CỦA CITATION THEO NGỮ CẢNH PROMPT (alignCitationPassages)
  // --------------------------------------------------------------------------
  // Đảm bảo passage/chunk hiển thị trong citation trả về khớp với đoạn ngữ cảnh đã
  // thực sự đưa vào prompt (đã gộp/cắt), thay vì đoạn thô ban đầu → trích dẫn nhất quán.
  // ==========================================================================
  private alignCitationPassages(
    citations: CitationDto[],
    promptSources: CitationDto[],
  ): CitationDto[] {
    // Map documentId → nguồn prompt tương ứng để tra nhanh.
    const promptByDocument = new Map(
      promptSources.map((source) => [source.documentId, source]),
    );

    return citations.map((citation) => {
      const promptSource = promptByDocument.get(citation.documentId);
      return {
        ...citation,
        // Chuỗi `??` : lấy giá trị đầu tiên không null/undefined theo thứ tự ưu tiên
        //   (prompt trước, citation gốc sau) → passage bám sát ngữ cảnh đã gửi Gemini.
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

  // Nối 2 khối văn bản, tách theo các đoạn (2+ newline) và LOẠI ĐOẠN TRÙNG.
  //   `flatMap(v => v.split(/\n{2,}/))` : tách mỗi khối thành nhiều đoạn rồi làm phẳng.
  //   `.filter(Boolean)` : bỏ chuỗi rỗng (Boolean('') = false). `new Set` khử trùng.
  private joinUniqueContextBlocks(left: string, right: string): string {
    const blocks = [left, right]
      .flatMap((value) => value.split(/\n{2,}/))
      .map((value) => value.trim())
      .filter(Boolean);
    return [...new Set(blocks)].join('\n\n');
  }

  // Chuẩn hóa + cắt 1 khối ngữ cảnh: bỏ khoảng trắng thừa (space/tab), chuẩn hóa
  //   xuống dòng (CRLF→LF), gộp 3+ dòng trống về 2, rồi cắt theo `limit` ký tự.
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

  // Nhận biết câu hỏi kiểu "toàn bộ tài liệu" hoặc "viết tiếp": dò các cụm như
  //   "toan bo", "day du", "tiep tuc", "file nay noi gi"... (sau khi bỏ dấu). Dùng để
  //   chọn AnswerIntent = FULL_DOCUMENT_CONTENT và nới ngữ cảnh.
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

  // Trả về điểm liên quan LỚN NHẤT giữa 2 giá trị có thể null.
  //   Nếu một vế null thì lấy vế còn lại; cả hai có giá trị → Math.max.
  private maxRelevanceScore(
    left: number | null,
    right: number | null,
  ): number | null {
    if (left === null) return right;
    if (right === null) return left;
    return Math.max(left, right);
  }

  // ==========================================================================
  // LÀM GIÀU TRUY VẤN RETRIEVE (buildRetrievalQuery) — hỗ trợ chặng Retrieve
  // --------------------------------------------------------------------------
  // Với câu follow-up mơ hồ (VD "giải thích thêm"), ghép nội dung tối đa 2 câu hỏi
  // USER gần nhất vào truy vấn để vector search không mất chủ đề. Câu rõ ràng thì
  // giữ nguyên. Kết quả cắt tối đa 500 ký tự.
  // ==========================================================================
  private buildRetrievalQuery(
    question: string,
    history: Array<{ sender: MessageSender; content: string }>,
  ): string {
    // Không phải follow-up mơ hồ → dùng thẳng câu hỏi.
    if (!this.isVagueFollowUp(question)) {
      return question;
    }

    // Lấy nội dung 2 tin nhắn USER gần nhất (`slice(-2)` = 2 phần tử cuối).
    const prevUserMessages = history
      .filter((m) => m.sender === MessageSender.USER)
      .slice(-2)
      .map((m) => m.content);

    // Không có lịch sử USER → không có gì để ghép, trả câu gốc.
    if (prevUserMessages.length === 0) {
      return question;
    }

    // Ghép "lịch sử + câu hiện tại", giới hạn 500 ký tự cho truy vấn embedding.
    return `${prevUserMessages.join(' ')} ${question}`.slice(0, 500);
  }

  // ==========================================================================
  // LÀM GIÀU CÂU HỎI CHO PROMPT (buildPromptQuestion) — hỗ trợ chặng Augment
  // --------------------------------------------------------------------------
  // Khác buildRetrievalQuery ở đích đến: đây tạo câu hỏi CHO GEMINI. Với follow-up
  // mơ hồ, nó gắn câu hỏi USER trước đó dưới dạng chỉ dẫn rõ ràng để AI hiểu ngữ cảnh
  // mà vẫn chỉ dựa trên nguồn. Câu rõ ràng thì giữ nguyên.
  // ==========================================================================
  private buildPromptQuestion(
    question: string,
    history: Array<{ sender: MessageSender; content: string }>,
  ): string {
    if (!this.isVagueFollowUp(question)) {
      return question;
    }

    // Câu hỏi USER gần nhất. `.at(-1)?.content` : lấy phần tử cuối rồi lấy content
    //   an toàn (optional chaining) — undefined nếu mảng rỗng.
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

  // ==========================================================================
  // PHÂN LOẠI Ý ĐỊNH CÂU HỎI (classifyAnswerIntent) — điều hướng Augment/Generate
  // --------------------------------------------------------------------------
  // Trả về 1 AnswerIntent theo thứ tự ưu tiên (kiểm tra từ trên xuống, khớp là dừng):
  //   1) trích dẫn mục/trang cụ thể → EXPLICIT_SECTION_DETAIL
  //   2) hỏi toàn bộ tài liệu       → FULL_DOCUMENT_CONTENT
  //   3) yêu cầu chi tiết + ĐÃ có lịch sử USER → DETAILED_FOLLOW_UP
  //   4) yêu cầu tóm tắt            → SUMMARY
  //   5) còn lại                    → DIRECT_QUESTION (mặc định)
  // Ý định này chi phối: chỉ dẫn thêm vào prompt, timeout, và cách kiểm tra phủ thiếu.
  // ==========================================================================
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

    // Chỉ coi là "follow-up chi tiết" nếu câu yêu cầu chi tiết VÀ đã có ít nhất 1 tin USER trước đó.
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

  // Gắn khối chỉ dẫn theo ý định vào câu hỏi gửi Gemini (dạng nhãn ANSWER_INTENT...).
  //   DIRECT_QUESTION không cần thêm gì → trả nguyên câu.
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

  // Trả về đoạn chỉ dẫn (tiếng Anh, gửi cho model) tương ứng mỗi ý định — quy định
  //   cách AI nên bao phủ nội dung (đầy đủ/theo mục/mở rộng/tóm tắt/trực tiếp).
  //   `switch` không cần `default` vì AnswerIntent là union hữu hạn, TS đảm bảo phủ hết.
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

  // ==========================================================================
  // PHÁT HIỆN CÂU TRẢ LỜI PHỦ THIẾU (detectPartialCoverage) — hậu xử lý
  // --------------------------------------------------------------------------
  // Với các ý định cần bao phủ nhiều mục, so sánh các "mục được đánh số" xuất hiện
  // trong NGUỒN với các mục xuất hiện trong CÂU TRẢ LỜI. Nếu nguồn có >=2 mục mà câu
  // trả lời bỏ sót mục nào → true (để gợi ý người dùng hỏi tiếp phần còn lại).
  //   `![...].includes(x)` : nếu ý định KHÔNG thuộc nhóm cần đầy đủ → bỏ qua (false).
  // ==========================================================================
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

    // Tập các mục kỳ vọng (trích từ mọi nguồn, gom bằng Set để loại trùng).
    const expectedSections = new Set(
      sources.flatMap((source) =>
        this.extractNumberedSectionKeys(source.snippet),
      ),
    );
    // Ít hơn 2 mục thì không đủ cơ sở để kết luận "phủ thiếu".
    if (expectedSections.size < 2) {
      return false;
    }

    // Tập mục đã được đề cập trong câu trả lời.
    const coveredSections = new Set(this.extractNumberedSectionKeys(answer));
    // Mục có trong kỳ vọng nhưng KHÔNG có trong câu trả lời = mục bị thiếu.
    //   `[...set]` (spread) đổi Set thành mảng để dùng .filter.
    const missingSections = [...expectedSections].filter(
      (section) => !coveredSections.has(section),
    );

    return missingSections.length > 0;
  }

  // Trích các "mục được đánh số" trong văn bản (VD "bai 1", "section 2", "trang 3").
  //   Trả về mảng khóa dạng "loai:so" (VD "bai:1"), đã loại trùng.
  //   `matchAll(regex)` : lặp qua MỌI lần khớp; mỗi match có nhóm bắt match[1]/match[2].
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

  // Cấp options cho Gemini theo ý định: các câu trả lời "nặng" được cấp timeout dài
  //   hơn (longAnswerTimeoutMs). Ý định khác → undefined (dùng cấu hình mặc định).
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

  // Câu hỏi có phải "follow-up mơ hồ" không: KHÔNG tính nếu đã nêu rõ mục/trang.
  //   Coi là mơ hồ khi câu quá ngắn (<30 ký tự) HOẶC chứa từ ngữ tham chiếu ngữ cảnh
  //   ("cái này", "phần này"...). Dùng để quyết định có ghép ngữ cảnh trước hay không.
  private isVagueFollowUp(question: string): boolean {
    if (this.hasExplicitSectionReference(question)) {
      return false;
    }

    return question.trim().length < 30 || this.isContextualFollowUp(question);
  }

  // Câu hỏi có nêu đích danh mục/trang được đánh số không (VD "bài 3", "trang 5").
  //   `\s*\d+` : cho phép 0+ khoảng trắng rồi tới số. Trả boolean qua .test().
  private hasExplicitSectionReference(question: string): boolean {
    const normalized = this.normalizeForRetrieval(question);

    return /\b(?:bai|lesson|section|muc|phan|chuong|chapter|unit|slide|page|trang)\s*\d+\b/.test(
      normalized,
    );
  }

  // Nhận biết yêu cầu "chi tiết/đầy đủ" (chi tiet, day du, full, detailed...) hoặc
  //   yêu cầu "mở rộng thêm" (ro hon, them nua, expand...) → gợi ý ý định chi tiết.
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

  // Nhận biết yêu cầu tóm tắt/tổng quan (tom tat, summary, overview, tong quan).
  private isSummaryQuestion(question: string): boolean {
    const normalized = this.normalizeForRetrieval(question);

    return /\b(tom tat|summary|summarize|overview|tong quan)\b/.test(
      normalized,
    );
  }

  // Nhận biết follow-up dựa theo ngữ cảnh: chứa các cụm chỉ trỏ ("cai nay", "phan nay",
  //   "cau tra loi tren"...). `.some(phrase => normalized.includes(phrase))` = có bất kỳ cụm nào.
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

  // ==========================================================================
  // CHUẨN HÓA VĂN BẢN ĐỂ SO KHỚP (normalizeForRetrieval)
  // --------------------------------------------------------------------------
  // Đưa văn bản về dạng "không dấu, chữ thường, chỉ chữ-số" để mọi regex nhận diện ý
  // định/mục ở trên hoạt động ổn định với tiếng Việt. Chuỗi các .replace():
  //   - toLowerCase()                    : về chữ thường.
  //   - replace(đ,'d')              : ký tự 'đ' → 'd' (NFD không tách được 'đ').
  //   - normalize('NFD')                 : tách ký tự có dấu thành ký tự gốc + dấu tổ hợp.
  //   - replace([̀-ͯ],'')      : xóa các dấu thanh/dấu phụ (combining marks).
  //   - replace([^a-z0-9]+,' ')          : mọi thứ không phải chữ-số → khoảng trắng.
  //   - gộp khoảng trắng + trim.
  // ==========================================================================
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

  // Chuẩn hóa snippet rồi cắt về `limit` ký tự (mặc định citationSnippetLimit) để hiển thị.
  private truncateCitationSnippet(
    snippet: string | null | undefined,
    limit = this.citationSnippetLimit,
  ): string {
    return this.normalizeSnippet(snippet).slice(0, limit);
  }

  // Chuẩn hóa snippet: `?? ''` đổi null/undefined thành chuỗi rỗng, trim, gộp khoảng trắng về 1 space.
  private normalizeSnippet(snippet: string | null | undefined): string {
    return (snippet ?? '').trim().replace(/\s+/g, ' ');
  }

  // Tính metadata phân trang từ page/limit/tổng số bản ghi.
  //   `Math.ceil` làm tròn LÊN để ra tổng số trang. hasNext/hasPrevious suy ra từ page hiện tại.
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
