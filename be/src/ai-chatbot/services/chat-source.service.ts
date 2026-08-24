// ============================================================================
// ChatSourceService — LÕI RAG (Retrieval-Augmented Generation) của MF3
// ----------------------------------------------------------------------------
// Nhiệm vụ tổng quát: cho một câu hỏi của người dùng, tìm và trả về các "nguồn"
// (source) liên quan trong tài liệu để làm NGỮ CẢNH (context) cho LLM sinh câu
// trả lời có căn cứ (grounded). Service này KHÔNG gọi LLM sinh câu trả lời cuối;
// nó chỉ chịu trách nhiệm khâu RETRIEVE (truy hồi) trong pipeline RAG.
//
// Có 2 entry point chính:
//   • getSourcesForDocument — hỏi trong phạm vi MỘT tài liệu (LUỒNG 1 / askDocument).
//   • getSourcesForLibrary  — hỏi trên TOÀN THƯ VIỆN của user (LUỒNG 2 / askLibrary).
//
// getSourcesForLibrary có 4 NHÁNH xử lý theo bản chất câu hỏi:
//   [Nhánh A] Selected docs + hỏi "toàn bộ tài liệu": người dùng đã chọn sẵn 1
//             vài tài liệu và muốn tóm tắt/đọc toàn bộ → lấy nguyên văn các tài
//             liệu đã chọn (getSelectedDocumentSources).
//   [Nhánh B] Câu lệnh tìm kiếm tường minh nhưng coreTerms rỗng (vd chỉ gõ "tìm
//             tài liệu" mà không có từ khóa nội dung) → không đủ tín hiệu để tìm,
//             trả [] (hoặc rơi về selected docs nếu có).
//   [Nhánh C] Document discovery: câu hỏi mang ý định "tìm/liệt kê tài liệu về X"
//             → chấm điểm theo METADATA (title, subject, category, tags, mô tả),
//             không dùng vector (executeDocumentDiscovery).
//   [Nhánh D] Semantic search (mặc định): tạo embedding cho câu hỏi → vector
//             search bằng pgvector trên bảng document_chunks → re-rank → lọc theo
//             ngưỡng → gom chunk theo tài liệu. Nếu semantic thất bại (lỗi kỹ
//             thuật) thì fallback sang keyword search (fallbackKeywordSearch).
//
// Điểm nhấn kỹ thuật:
//   • Vector search dùng toán tử pgvector `<=>` (cosine distance) trên cột
//     `embedding vector(768)`; distance càng nhỏ = càng giống → điểm relevance
//     = 1 - distance.
//   • Xử lý song ngữ Việt–Anh: normalize() bỏ dấu tiếng Việt + hạ chữ thường để
//     so khớp keyword; đồng thời có cơ chế fallback lấy nguyên văn tài liệu vì
//     câu hỏi tiếng Việt trên nội dung tiếng Anh thường tụt dưới ngưỡng semantic.
//   • Có nhiều heuristic phát hiện ý định câu hỏi: hỏi toàn bộ tài liệu, hỏi chi
//     tiết, hỏi tiếp (continuation), trích section được đánh số cụ thể, câu hỏi
//     về cấu trúc bảng...
// ============================================================================
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
// Các enum sinh tự động bởi Prisma (từ schema.prisma). Dùng để lọc theo trạng
// thái tài liệu/nội dung thay vì hard-code chuỗi, tránh sai chính tả.
import {
  DocumentStatus, // trạng thái tài liệu: ACTIVE / ...
  ExtractionQuality, // chất lượng trích xuất: READY / PARTIAL / UNREADABLE
  ExtractionStatus, // tiến độ trích xuất: PENDING / COMPLETED / MOCKED / ...
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service'; // truy cập DB (ORM + SQL thô)
import { LibraryFiltersDto } from '../dto/ask-library.dto'; // bộ lọc: subject, category, fileType, documentIds...
import { CitationDto } from '../dto/citation.dto'; // DTO trích dẫn nguồn trả về cho client
import { GeminiService } from './gemini.service'; // sinh embedding cho câu hỏi (vector 768 chiều)

// Kiểu union cho bộ lọc file type: hoặc một chuỗi MIME đơn (vd "application/pdf"),
// hoặc dạng `{ in: [...] }` (khớp một trong nhiều MIME — vd alias "audio" → nhiều loại).
type FileTypeFilter = string | { in: string[] };

// ─── CÁC HẰNG SỐ CẤU HÌNH RAG ───────────────────────────────────────────────
// Độ dài tối đa (ký tự) của snippet trích dẫn hiển thị cho người dùng. Snippet
// chỉ để "xem trước", không phải toàn bộ ngữ cảnh đưa vào LLM.
const CITATION_SNIPPET_LIMIT = 280;
// Ngưỡng điểm tối thiểu cho KEYWORD search (scoreDocument): tài liệu phải đạt ≥ 5
// điểm thô mới được coi là liên quan. Giá trị thấp vì điểm keyword có trọng số
// theo vị trí khớp (title x10, description x5, content x1...).
const MIN_RELEVANCE_SCORE = 5;
// Ngưỡng điểm tối thiểu cho SEMANTIC search (relevance = 1 - cosine distance).
// 0.35 tương ứng distance ≈ 0.65 — đủ lỏng để giữ lại câu hỏi song ngữ (Việt hỏi
// nội dung Anh) nhưng vẫn loại các chunk hoàn toàn lạc đề.
const MIN_SEMANTIC_SCORE = 0.35;
// Ngưỡng cho DOCUMENT DISCOVERY (chấm điểm theo metadata): cao hơn (0.62) vì
// khớp metadata (title/tags/subject) là tín hiệu mạnh, phải chắc chắn mới trả về.
const MIN_METADATA_RELEVANCE_SCORE = 0.62;
// Số chunk tối đa gộp từ MỘT tài liệu vào kết quả (tránh 1 tài liệu chiếm hết
// context). Câu hỏi "chi tiết" sẽ được nới rộng lên 5 (xem groupChunksByDocument).
const MAX_CHUNKS_PER_DOCUMENT = 2;
// Ngân sách ký tự cho phần promptContext của MỖI nguồn khi trả lời thường.
const PROMPT_CONTEXT_LIMIT = 3000;
// Ngân sách ký tự khi người dùng yêu cầu ĐỌC TOÀN BỘ tài liệu (dấu `_` chỉ là
// dấu phân cách hàng nghìn trong số literal của JS: 16_000 === 16000).
const WHOLE_DOCUMENT_CONTEXT_LIMIT = 16_000;
// Số "block" (đoạn) tối đa lấy mẫu đều khi rút gọn toàn bộ tài liệu quá dài,
// nhằm giữ được cả đầu–giữa–cuối tài liệu thay vì chỉ phần đầu.
const WHOLE_DOCUMENT_MAX_BLOCKS = 24;

// Chỉ tài liệu ở các trạng thái này mới đủ điều kiện tìm kiếm: đã trích xuất xong
// (COMPLETED) hoặc dữ liệu giả lập cho môi trường test (MOCKED).
const SEARCHABLE_EXTRACTION_STATUSES = [
  ExtractionStatus.COMPLETED,
  ExtractionStatus.MOCKED,
];
// Chỉ nội dung có chất lượng READY (đọc tốt) hoặc PARTIAL (đọc được một phần)
// mới dùng được; UNREADABLE (vd scan mờ) bị loại vì AI không grounding được.
const SEARCHABLE_EXTRACTION_QUALITIES = [
  ExtractionQuality.READY,
  ExtractionQuality.PARTIAL,
];

// Bảng ánh xạ "tên thân thiện" (do người dùng/UI gửi lên) → danh sách MIME type
// thực tế lưu trong DB. `Record<string, string[]>` là generic của TS: object mà
// key là string, value là mảng string. Vd chọn lọc "docx" sẽ khớp đúng MIME dài
// của Word; "audio"/"video" gộp nhiều MIME nên value có nhiều phần tử.
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

// STOPWORDS = tập các "từ dừng" — từ chức năng phổ biến không mang ý nghĩa nội
// dung (vd "là", "và", "the", "how"...). Chúng bị loại khỏi việc tách từ khóa để
// không làm nhiễu điểm số. Lưu trong `Set` thay vì mảng vì kiểm tra thành viên
// bằng .has() là O(1) (rất nhanh dù danh sách dài). Các từ tiếng Việt đã được
// NORMALIZE trước (bỏ dấu, thường hóa) nên viết dạng "huong dan" chứ không "hướng dẫn".
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

// SEARCH_INTENT_WORDS = các từ báo hiệu ý định TÌM/LIỆT KÊ tài liệu (vd "tìm",
// "liệt kê", "danh sách"...). Nếu câu hỏi chứa các từ này → nghiêng về nhánh
// document discovery thay vì semantic search nội dung.
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

// TABLE_STRUCTURE_QUERY_TERMS = từ khóa cho biết câu hỏi liên quan đến CẤU TRÚC
// BẢNG/DỮ LIỆU (quan hệ thực thể, hàng/cột/ô...). Khi phát hiện, các chunk dạng
// bảng (trích từ DOCX/XLSX) được cộng điểm ưu tiên (xem tableChunkBonus).
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

// Các CỤM TỪ (đã normalize, bỏ dấu) báo hiệu câu hỏi về cấu trúc bảng: "quan he"
// = quan hệ, "thuc the" = thực thể, "bang trung gian" = bảng trung gian (many-to-many).
const TABLE_STRUCTURE_QUERY_PHRASES = [
  'quan he',
  'moi quan he',
  'thuc the',
  'bang trung gian',
];

// Các từ KHÔNG dùng làm "topic filter" khi lọc kết quả semantic theo chủ đề, vì
// chúng là từ chung về cấu trúc bảng chứ không phải chủ đề nội dung thực sự.
// Cú pháp `...TABLE_STRUCTURE_QUERY_TERMS` là SPREAD của một Set vào Set mới: sao
// chép toàn bộ phần tử của Set kia rồi bổ sung thêm các từ liệt kê phía dưới.
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

// DETAILED_QUERY_TERMS = từ khóa cho biết người dùng muốn câu trả lời CHI TIẾT/
// ĐẦY ĐỦ (vd "full", "toàn bộ", "chi tiết", "các bước"...). Khi phát hiện, hệ
// thống nới rộng ngân sách context và lấy nhiều chunk hơn để trả lời sâu hơn.
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

// Các CỤM TỪ (đã normalize) tương đương ý "trả lời chi tiết/đầy đủ": "giai thich
// chi tiet", "toan bo", "file nay noi gi" (file này nói gì)... Bổ sung cho
// DETAILED_QUERY_TERMS vì có ý định chỉ nhận ra được qua cụm chứ không qua 1 từ.
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

// Kết quả nguồn trả về. `extends CitationDto` = KẾ THỪA mọi trường của CitationDto
// (sourceNumber, title, snippet, relevanceScore...) rồi thêm 2 trường tùy chọn.
// Dấu `?` = optional (có thể undefined).
export interface ChatSourceResult extends CitationDto {
  promptContext?: string; // đoạn văn bản thực sự nhồi vào prompt LLM (dài hơn snippet)
  usedFallbackKeyword?: boolean; // đánh dấu kết quả đến từ keyword fallback (để log/hiển thị)
}

// Một dòng chunk THÔ trả về trực tiếp từ SQL vector search (trước khi re-rank/gom).
interface RawChunk {
  chunkId?: string; // id của chunk
  chunkIndex?: number; // thứ tự chunk trong tài liệu
  content: string; // nội dung văn bản của chunk
  documentId: string; // id tài liệu chứa chunk
  title: string; // tiêu đề tài liệu (JOIN từ bảng documents)
  distance: number; // cosine distance (toán tử <=>): CÀNG NHỎ CÀNG GIỐNG câu hỏi
  sourceLocator?: string[] | null; // vị trí nguồn trong file (vd trang/section) để trích dẫn
}

// Kết quả sau khi GOM nhiều chunk của cùng một tài liệu lại thành một "nguồn".
interface GroupedDocument {
  chunkId?: string;
  chunkIndex?: number;
  documentId: string;
  title: string;
  relevanceScore: number; // điểm liên quan của tài liệu (lấy từ chunk tốt nhất)
  snippet: string; // đoạn xem trước ngắn cho người dùng
  promptContext: string; // ngữ cảnh ghép từ các chunk, dùng cho LLM
  sourceLocator: string[]; // hợp nhất locator của các chunk (đã khử trùng)
}

// Hình dạng một tài liệu nạp cho DOCUMENT DISCOVERY (chấm điểm theo metadata).
// Các trường `?`/`| null` phản ánh quan hệ có thể thiếu (chưa gán subject/tag...).
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

// Kết quả PHÂN TÍCH câu hỏi (analyzeQuery) — dùng chung cho nhiều nhánh xử lý.
interface QueryAnalysis {
  normalized: string; // câu hỏi đã chuẩn hóa (thường, bỏ dấu)
  coreTerms: string[]; // các từ khóa "lõi" (đã bỏ stopword/từ ý-định)
  corePhrases: string[]; // các cụm từ ghép từ coreTerms (n-gram) để khớp chính xác hơn
  explicitSearchIntent: boolean; // có từ tìm/liệt kê tường minh không
  documentSearchIntent: boolean; // có nên đi nhánh document discovery không
  conciseTopicQuery: boolean; // câu hỏi ngắn gọn kiểu chỉ nêu một chủ đề (vd tên riêng/acronym)
}

// Kết quả CHẤM ĐIỂM một tài liệu theo METADATA (dùng trong document discovery).
interface MetadataScore {
  rawScore: number; // điểm thô cộng dồn theo trọng số từng vùng khớp
  relevanceScore: number; // điểm chuẩn hóa về khoảng [0,1] để so với ngưỡng
  metadataOverlap: number; // số lượng từ/cụm khớp ở vùng metadata (không tính content)
  titlePhraseMatch: boolean; // khớp nguyên một cụm trong tiêu đề (tín hiệu mạnh nhất)
  strongTitleTokenOverlap: boolean; // phần lớn từ khóa xuất hiện trong tiêu đề
  taxonomyMatch: boolean; // khớp subject/category/tags (phân loại)
  strongDescriptionMatch: boolean; // phần lớn từ khóa khớp trong mô tả
  passesTopicGate: boolean; // có vượt "cổng chủ đề" để đủ tin cậy trả về không
}

@Injectable()
export class ChatSourceService {
  private readonly logger = new Logger(ChatSourceService.name);

  // NestJS DI (Dependency Injection): các dependency được TIÊM vào qua constructor.
  // Từ khóa `private readonly` trên tham số vừa khai báo, vừa gán vào thuộc tính
  // của instance (this.prisma / this.geminiService), lại đảm bảo không gán lại
  //   - prisma        : truy cập DB (ORM + SQL thô cho vector search).
  //   - geminiService : sinh embedding 768 chiều cho câu hỏi.
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  // ==========================================================================
  // getSourcesForDocument — RETRIEVE trong phạm vi MỘT tài liệu (LUỒNG 1)
  // --------------------------------------------------------------------------
  // Input : documentId (tài liệu cần hỏi), question (câu hỏi, có thể undefined),
  //         limit (số nguồn tối đa, mặc định 5 qua `limit = 5`).
  // Output: mảng ChatSourceResult (mỗi phần tử là một đoạn nguồn + ngữ cảnh).
  // Ba tình huống: (1) không có câu hỏi / hỏi "tiếp tục" → lấy nguyên văn; (2)
  // có câu hỏi thường → vector search trên chunk của riêng tài liệu này; (3) lỗi
  // → fallback lấy nguyên văn tài liệu.
  // ==========================================================================
  async getSourcesForDocument(
    documentId: string,
    question?: string,
    limit = 5,
  ): Promise<ChatSourceResult[]> {
    // [BƯỚC 1] Xác nhận tài liệu tồn tại (chỉ cần id + title cho việc trích dẫn).
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, title: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // [BƯỚC 2] Trường hợp ĐẶC BIỆT: không có câu hỏi, HOẶC câu hỏi kiểu "tiếp tục/
    // phần còn lại". Khi đó không tìm chunk theo ngữ nghĩa mà lấy NGUYÊN VĂN.
    //   - `!question`               : không truyền câu hỏi.
    //   - `||`                      : hoặc.
    //   - isContinuationQuery(...)  : câu hỏi kiểu "tiếp tục", "phần con lai"...
    if (!question || this.isContinuationQuery(question)) {
      const content = await this.prisma.documentContent.findUnique({
        where: { documentId },
        select: { extractedText: true },
      });
      // Ternary lồng ý nghĩa:
      //   - Có câu hỏi (continuation) → dựng ngữ cảnh TOÀN BỘ tài liệu (rút gọn đều).
      //     `content?.extractedText ?? ''`: optional chaining `?.` (nếu content null
      //     → undefined) rồi nullish coalescing `??` (nếu undefined/null → chuỗi rỗng).
      //   - Không câu hỏi → extractFullText (ưu tiên summary/đoạn liên quan).
      const fullText = question
        ? this.buildWholeDocumentContext(content?.extractedText ?? '')
        : this.extractFullText(content ?? null, question);
      // Ngân sách context tương ứng: đọc-toàn-bộ dùng hạn mức lớn (16k), còn lại 3k.
      const contextLimit = question
        ? WHOLE_DOCUMENT_CONTEXT_LIMIT
        : PROMPT_CONTEXT_LIMIT;
      // Trả về đúng 1 nguồn là chính tài liệu, relevance cố định 0.9 (đã đúng phạm vi).
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

    // [BƯỚC 3] Trường hợp thường: SEMANTIC SEARCH bằng vector.
    // Bọc trong try/catch: nếu embedding lỗi hoặc không có chunk → nhảy sang
    // catch để fallback lấy nguyên văn (đảm bảo luôn có nguồn để trả lời).
    try {
      // [3a] Sinh embedding cho câu hỏi: vector số thực 768 chiều biểu diễn
      // ngữ nghĩa câu hỏi. `await` vì gọi API bên ngoài (Gemini) là I/O bất đồng bộ.
      const queryEmbedding =
        await this.geminiService.generateEmbedding(question);
      // Chuyển mảng số → chuỗi JSON dạng "[0.1,0.2,...]" để nhúng vào SQL và ép
      // kiểu `::vector` (pgvector hiểu literal này thành vector).
      const queryVector = JSON.stringify(queryEmbedding);

      // [3b] Câu hỏi chi tiết → lấy NHIỀU chunk hơn (>= 12) để có đủ dữ liệu bao
      // quát; câu hỏi thường → chỉ lấy `limit`. Math.max đảm bảo tối thiểu 12.
      const detailedAnswer = this.isDetailedAnswerQuery(question);
      const chunkLimit = detailedAnswer ? Math.max(limit * 4, 12) : limit;
      // [3c] VECTOR SEARCH bằng SQL thô (`$queryRaw` — an toàn vì dùng tham số
      // hóa `${...}`, không nối chuỗi trực tiếp). Generic `<Array<{...}>>` khai
      // báo kiểu dòng kết quả để TS kiểm tra.
      //   - `embedding <=> ${queryVector}::vector` : toán tử `<=>` của pgvector =
      //     COSINE DISTANCE giữa vector chunk và vector câu hỏi. Giá trị trong
      //     [0,2]; CÀNG NHỎ = CÀNG GIỐNG. Đặt tên cột kết quả là `distance`.
      //   - `WHERE document_id = ${documentId}::uuid` : chỉ trong tài liệu này
      //     (ép kiểu `::uuid` để so đúng kiểu khóa).
      //   - `ORDER BY distance ASC` : sắp tăng dần → chunk giống nhất lên đầu.
      //   - `LIMIT ${chunkLimit}` : chỉ lấy top-K để tiết kiệm.
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

      // Không có chunk (tài liệu chưa được chia/embedding) → ném lỗi để rơi vào
      // catch và fallback nguyên văn.
      if (chunks.length === 0) {
        throw new Error('No chunks found in database');
      }

      // [3d] Re-rank lại các chunk theo điểm relevance (có cộng thưởng chunk dạng
      // bảng nếu câu hỏi về bảng), rồi chọn ra tập chunk phù hợp cho prompt
      // (khử trùng section khi hỏi chi tiết).
      const selectedChunks = this.selectChunksForPrompt(
        this.reRankChunks(chunks, question),
        question,
        limit,
      );

      // [3e] Ánh xạ mỗi chunk → một ChatSourceResult. `.map((chunk, index) => ({...}))`:
      // tham số thứ hai `index` (bắt đầu từ 0) → sourceNumber = index + 1 (đánh số từ 1).
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
        sourceLocator: chunk.sourceLocator ?? [], // `?? []`: nếu null/undefined thì mảng rỗng
      }));
    } catch {
      // [BƯỚC 4 — FALLBACK] Vector search thất bại (embedding lỗi / không có chunk):
      // vẫn phải trả lời được → lấy nguyên văn (hoặc đoạn liên quan) của tài liệu.
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

  // ==========================================================================
  // getSourcesForLibrary — RETRIEVE trên TOÀN THƯ VIỆN của user (LUỒNG 2)
  // --------------------------------------------------------------------------
  // Input : userId (chỉ tìm trong tài liệu user sở hữu hoặc đã lưu), question,
  //         limit, filters (subject/category/fileType/documentIds tùy chọn).
  // Output: mảng ChatSourceResult xếp theo độ liên quan giảm dần.
  // Đây là "bộ định tuyến" 4 nhánh A/B/C/D đã mô tả ở block đầu file.
  // ==========================================================================
  async getSourcesForLibrary(
    userId: string,
    question: string,
    limit = 5,
    filters?: LibraryFiltersDto,
  ): Promise<ChatSourceResult[]> {
    // [BƯỚC 0] Phân tích câu hỏi một lần, dùng lại cho các nhánh (tránh phân tích lặp).
    const queryAnalysis = this.analyzeQuery(question);

    // [NHÁNH A] Người dùng đã chọn sẵn tài liệu VÀ hỏi kiểu "đọc/tóm tắt toàn bộ"
    // → lấy nguyên văn các tài liệu đã chọn, bỏ qua vector search.
    if (
      this.hasSelectedDocumentFilter(filters) &&
      this.isWholeDocumentContextQuery(question)
    ) {
      return this.getSelectedDocumentSources(userId, filters, limit, question);
    }

    // [NHÁNH B] Câu lệnh tìm kiếm tường minh nhưng KHÔNG có từ khóa nội dung nào
    // (coreTerms rỗng) — vd chỉ gõ "tìm tài liệu". Không đủ tín hiệu để tìm:
    //   - Nếu có tài liệu đã chọn → trả nguyên văn các tài liệu đó.
    //   - Ngược lại → trả mảng rỗng (không đoán mò).
    if (
      queryAnalysis.explicitSearchIntent &&
      queryAnalysis.coreTerms.length === 0
    ) {
      if (this.hasSelectedDocumentFilter(filters)) {
        return this.getSelectedDocumentSources(userId, filters, limit);
      }
      return [];
    }

    // [NHÁNH C] Ý định "tìm/liệt kê tài liệu về chủ đề X" → DOCUMENT DISCOVERY:
    // chấm điểm theo METADATA (title/subject/category/tags/mô tả), không dùng vector.
    if (queryAnalysis.documentSearchIntent) {
      this.logger.log(`Document discovery intent detected: "${question}"`);
      const discoveredSources = await this.executeDocumentDiscovery(
        userId,
        question,
        limit,
        filters,
        queryAnalysis,
      );
      // Có kết quả metadata đủ tin cậy → trả luôn. Nếu rỗng → KHÔNG return, mà
      // rơi xuống nhánh D (semantic) như một fallback tự nhiên.
      if (discoveredSources.length > 0) {
        return discoveredSources;
      }
      this.logger.log(
        `Document discovery found no metadata match; falling back to semantic search for "${question}"`,
      );
    }

    // [NHÁNH D] SEMANTIC SEARCH (mặc định). Bọc try/catch: catch chỉ bắt LỖI KỸ
    // THUẬT (embedding API lỗi, DB exception) → mới fallback keyword.
    try {
      // [D1] Sinh embedding cho câu hỏi (vector 768 chiều).
      const queryEmbedding =
        await this.geminiService.generateEmbedding(question);

      // [D2] Lấy dư nhiều hơn `limit` (>= 20) để còn re-rank/lọc ngưỡng/gom tài
      // liệu rồi mới cắt về `limit` cuối cùng — tăng chất lượng top-K.
      const dbLimit = Math.max(limit * 4, 20);
      // Danh sách tham số cho SQL tham số hóa ($1, $2, ...). Kiểu `unknown[]` vì
      // các phần tử khác kiểu nhau (string, mảng, số). Thứ tự cố định:
      //   $1 = vector câu hỏi, $2 = ownerId, $3 = userId (cho JOIN saved), $4 = limit.
      const queryParams: unknown[] = [
        JSON.stringify(queryEmbedding),
        userId,
        userId,
        dbLimit,
      ];
      // Chuỗi SQL lọc bổ sung, được nối động tùy filter. `let` (không phải const)
      // vì sẽ được gán lại (+=).
      let filterSql = '';

      // Mỗi filter: PUSH giá trị vào queryParams rồi tham chiếu bằng `$` + vị trí
      // hiện tại (`queryParams.length`) — nhờ đó số thứ tự placeholder luôn khớp,
      // và giá trị được tham số hóa (chống SQL injection).
      if (filters?.subjectId) {
        queryParams.push(filters.subjectId);
        filterSql += ` AND d.subject_id = $${queryParams.length}::uuid`;
      }
      // `ANY($n::uuid[])` = khớp nếu subject_id nằm TRONG mảng (lọc nhiều môn).
      if (filters?.subjectIds && filters.subjectIds.length > 0) {
        queryParams.push(filters.subjectIds);
        filterSql += ` AND d.subject_id = ANY($${queryParams.length}::uuid[])`;
      }
      if (filters?.categoryId) {
        queryParams.push(filters.categoryId);
        filterSql += ` AND d.category_id = $${queryParams.length}::uuid`;
      }
      // Chuẩn hóa fileType về MIME. `typeof ... === 'string'` phân biệt: một MIME
      // đơn (so `=`) hay nhiều MIME (`ANY(...::text[])`).
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
      // Giới hạn theo danh sách tài liệu đã chọn (nếu người dùng scope sẵn).
      if (filters?.documentIds && filters.documentIds.length > 0) {
        queryParams.push(filters.documentIds);
        filterSql += ` AND d.id = ANY($${queryParams.length}::uuid[])`;
      }

      // [D3] Câu VECTOR SEARCH toàn thư viện. Dùng chuỗi (template literal) vì cần
      // chèn `filterSql` động → phải dùng $queryRawUnsafe (xem D4). Các placeholder
      // $1..$n vẫn được tham số hóa an toàn, chỉ có phần filterSql do ta tự sinh.
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

      // Ý NGHĨA CÁC ĐIỀU KIỆN TRONG sqlQuery ở trên:
      //   • JOIN documents d, document_contents dc  : ghép chunk với tài liệu & nội dung.
      //   • LEFT JOIN saved_documents sd ... user_id = $3 : biết user có LƯU tài liệu không.
      //   • WHERE (d.owner_id = $2 OR sd.id IS NOT NULL) : chỉ tài liệu user SỞ HỮU
      //     HOẶC ĐÃ LƯU (quyền truy cập).
      //   • d.status = 'ACTIVE'                     : bỏ tài liệu xóa mềm/khóa.
      //   • d.extraction_status IN (COMPLETED,MOCKED) & dc.extraction_status IN (...)
      //                                             : tài liệu & nội dung đã trích xuất xong.
      //   • dc.quality_status IN (READY,PARTIAL)    : loại nội dung UNREADABLE.
      //   • (c.embedding <=> $1::vector) as distance: cosine distance (pgvector).
      //   • ORDER BY distance ASC / LIMIT $4        : lấy các chunk giống nhất trước.
      //
      // [D4] Thực thi bằng $queryRawUnsafe (bản "unsafe" cho phép truyền chuỗi SQL
      // đã dựng sẵn + mảng tham số). `...queryParams` là SPREAD: bung mảng thành
      // các đối số rời $1, $2, ... An toàn vì mọi GIÁ TRỊ đều đi qua placeholder.
      const chunks = await this.prisma.$queryRawUnsafe<RawChunk[]>(
        sqlQuery,
        ...queryParams,
      );
      // [D5] Nếu người dùng đã scope theo documentIds, lọc lại lần nữa ở tầng app
      // để chắc chắn chỉ giữ chunk thuộc các tài liệu đã chọn (phòng hờ).
      const scopedChunks = this.hasSelectedDocumentFilter(filters)
        ? chunks.filter((chunk) =>
            filters.documentIds.includes(chunk.documentId),
          )
        : chunks;

      // [D6] Semantic đã chạy THÀNH CÔNG → lọc theo NGƯỠNG tương đồng.
      // Nếu không tài liệu nào đạt ngưỡng thì trả [] (không rơi sang keyword
      // fallback — vì fallback chỉ dành cho LỖI KỸ THUẬT ở khối catch).
      const relevantChunks = this.reRankChunks(scopedChunks, question).filter(
        (c) => this.chunkRelevanceScore(c, question) >= MIN_SEMANTIC_SCORE,
      );

      if (relevantChunks.length === 0) {
        // XỬ LÝ SONG NGỮ: người dùng đã chọn cụ thể tài liệu → tuyệt đối KHÔNG trả
        // "không có nguồn" trong khi tài liệu vẫn tồn tại. Câu hỏi tiếng Việt trên
        // nội dung tiếng Anh thường tụt dưới ngưỡng semantic, nên fallback lấy
        // nguyên văn các tài liệu đã chọn thay vì bỏ chúng.
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

      // [D7] Gom các chunk còn lại theo TÀI LIỆU (mỗi tài liệu tối đa N chunk),
      // rồi map thành ChatSourceResult (đánh số nguồn từ 1).
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
      // [D8] Lọc thêm theo CHỦ ĐỀ: loại các nguồn tuy giống về ngữ nghĩa nhưng
      // không chứa đủ từ khóa chủ đề (chống trôi chủ đề khi câu hỏi rõ ý định).
      const sources = this.filterSemanticSourcesForTopic(
        semanticSources,
        queryAnalysis,
      );

      // Nếu lọc chủ đề làm rỗng NHƯNG user đã chọn tài liệu → vẫn trả nguyên văn.
      if (sources.length === 0 && this.hasSelectedDocumentFilter(filters)) {
        return this.getSelectedDocumentSources(
          userId,
          filters,
          limit,
          question,
        );
      }

      // [D9] Re-rank lần cuối (cộng thưởng khớp tiêu đề) rồi cắt về `limit`.
      return this.reRankSources(sources, question, limit);
    } catch {
      // [CATCH] Chỉ tới đây khi LỖI KỸ THUẬT: API embedding lỗi, DB exception...
      //   - Có tài liệu đã chọn → trả nguyên văn tài liệu đó.
      //   - Không → dùng KEYWORD SEARCH thuần (không cần embedding) làm cứu cánh.
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

  // ==========================================================================
  // fallbackKeywordSearch — TÌM KIẾM TỪ KHÓA (không dùng embedding)
  // --------------------------------------------------------------------------
  // Vai trò: mạng lưới an toàn khi semantic search hỏng. Nạp danh sách tài liệu
  // đủ điều kiện rồi chấm điểm bằng cách đếm số lần khớp từ khóa trên các trường
  // (title/description/summary/tags/nội dung) theo trọng số.
  // Input : userId, question, limit, filters. Output: ChatSourceResult[] (mỗi
  // phần tử được đánh cờ usedFallbackKeyword = true).
  // ==========================================================================
  async fallbackKeywordSearch(
    userId: string,
    question: string,
    limit = 5,
    filters?: LibraryFiltersDto,
  ): Promise<ChatSourceResult[]> {
    // [BƯỚC 1] Nạp mọi tài liệu ĐỦ ĐIỀU KIỆN tìm kiếm của user (dùng Prisma ORM,
    // không phải SQL thô vì không cần vector).
    //   - `OR: [{ownerId}, {savedBy:{some:{userId}}}]` : sở hữu HOẶC đã lưu.
    //   - `{ in: SEARCHABLE_... }`  : trạng thái/chất lượng nằm trong tập cho phép.
    //   - `content.is.OR`           : phải có ít nhất extractedText HOẶC contentSummary.
    //   - `id: ... ? {in} : undefined`: ternary — có lọc documentIds thì áp, không thì
    //     `undefined` = Prisma bỏ qua điều kiện này.
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
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], // mới cập nhật trước; id để ổn định thứ tự
    });

    // [BƯỚC 2] PIPELINE hàm mảng nối chuỗi (mỗi bước trả mảng mới, không đột biến):
    const rawSources = documents
      // .map: kèm điểm keyword cho mỗi tài liệu. `{ document, relevanceScore }` là
      // object literal rút gọn.
      .map((document) => ({
        document,
        relevanceScore: this.scoreDocument(document, question),
      }))
      // .filter: loại tài liệu dưới ngưỡng. `({ relevanceScore })` là DESTRUCTURING
      // tham số — lấy thẳng trường relevanceScore ra khỏi object.
      .filter(({ relevanceScore }) => relevanceScore >= MIN_RELEVANCE_SCORE)
      // .sort: điểm cao trước; nếu bằng điểm thì sắp theo tên (localeCompare) cho
      // kết quả ỔN ĐỊNH (tránh thứ tự nhảy loạn giữa các lần chạy).
      .sort((left, right) => {
        if (right.relevanceScore !== left.relevanceScore) {
          return right.relevanceScore - left.relevanceScore;
        }

        return left.document.title.localeCompare(right.document.title);
      })
      // .slice: giữ dư (>= 20) để re-rank sau còn lựa.
      .slice(0, Math.max(20, limit * 3))
      // .map cuối: CHUẨN HÓA điểm thô về [0.1, 0.99] bằng công thức bão hòa
      // score/(score+20): điểm càng cao càng tiệm cận trần 0.99 nhưng không vượt.
      .map(({ document, relevanceScore }, index) => {
        const normalizedScore = Math.min(
          0.99,
          0.1 + (relevanceScore / (relevanceScore + 20)) * 0.89,
        );
        return this.toCitation(document, index + 1, normalizedScore, question);
      });

    // [BƯỚC 3] Re-rank + cắt về `limit`, rồi gắn cờ usedFallbackKeyword cho mỗi
    // phần tử. `{ ...item, usedFallbackKeyword: true }` = SPREAD object: sao chép
    // mọi trường của item rồi thêm/ghi đè trường mới (tạo object mới, bất biến).
    const results = this.reRankSources(rawSources, question, limit);
    return results.map((item) => ({ ...item, usedFallbackKeyword: true }));
  }

  // ==========================================================================
  // hasSelectedDocumentFilter — kiểm tra user có scope theo documentIds không
  // --------------------------------------------------------------------------
  // Kiểu trả về `filters is LibraryFiltersDto & { documentIds: string[] }` là
  // TYPE GUARD của TS: khi hàm trả true, ở nơi gọi TS tự "thu hẹp" kiểu của
  // `filters`, coi như documentIds CHẮC CHẮN tồn tại → truy cập không cần `?.`.
  // ==========================================================================
  private hasSelectedDocumentFilter(
    filters?: LibraryFiltersDto,
  ): filters is LibraryFiltersDto & { documentIds: string[] } {
    return Boolean(filters?.documentIds && filters.documentIds.length > 0);
  }

  // ==========================================================================
  // getSelectedDocumentSources — trả NGUYÊN VĂN các tài liệu user đã chọn
  // --------------------------------------------------------------------------
  // Dùng cho nhánh A/B và các fallback khi user đã scope documentIds. Không tìm
  // theo ngữ nghĩa; chỉ nạp tài liệu hợp lệ rồi đưa cả nội dung làm nguồn, GIỮ
  // ĐÚNG THỨ TỰ người dùng đã chọn.
  // Output: tối đa `limit` nguồn, relevance cố định 0.9 (đã đúng tài liệu yêu cầu).
  // ==========================================================================
  private async getSelectedDocumentSources(
    userId: string,
    filters: LibraryFiltersDto & { documentIds: string[] },
    limit: number,
    question?: string,
  ): Promise<ChatSourceResult[]> {
    // [BƯỚC 1] Nạp tài liệu theo documentIds (vẫn kiểm tra quyền + trạng thái đủ
    // điều kiện, tránh trả tài liệu user không được đọc dù đã "chọn").
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

    // [BƯỚC 2] Tạo Map documentId → thứ tự người dùng chọn. `Map` giữ cặp key→value
    // và tra cứu O(1). Ở đây value là chỉ số (index) để dùng làm khóa sắp xếp.
    const selectedOrder = new Map(
      filters.documentIds.map((documentId, index) => [documentId, index]),
    );

    // [BƯỚC 3] Lọc lại (chỉ giữ tài liệu thực sự nằm trong danh sách chọn) → SẮP
    // theo đúng thứ tự đã chọn → cắt `limit` → map thành nguồn.
    return documents
      .filter((document) => selectedOrder.has(document.id))
      // So sánh index đã lưu; `?? Number.MAX_SAFE_INTEGER` đẩy phần tử thiếu index
      // xuống cuối (thực tế filter phía trên đã đảm bảo luôn có index).
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

  // ==========================================================================
  // groupChunksByDocument — GOM nhiều chunk cùng tài liệu thành một nguồn
  // --------------------------------------------------------------------------
  // Vào: danh sách chunk ĐÃ re-rank (chunk tốt nhất đứng trước). Ra: mỗi tài liệu
  // một GroupedDocument, ghép tối đa N chunk đầu của tài liệu đó làm ngữ cảnh.
  // ==========================================================================
  private groupChunksByDocument(
    chunks: RawChunk[],
    question?: string,
  ): GroupedDocument[] {
    // Câu hỏi chi tiết → cho phép tối đa 5 chunk/tài liệu và gấp đôi ngân sách
    // context (để trả lời sâu hơn). `question && ...` : nếu question undefined
    // thì cả biểu thức false → dùng mặc định.
    const maxChunksPerDocument =
      question && this.isDetailedAnswerQuery(question)
        ? Math.max(MAX_CHUNKS_PER_DOCUMENT, 5)
        : MAX_CHUNKS_PER_DOCUMENT;
    const promptContextLimit =
      question && this.isDetailedAnswerQuery(question)
        ? PROMPT_CONTEXT_LIMIT * 2
        : PROMPT_CONTEXT_LIMIT;
    // Map documentId → mảng chunk của tài liệu đó (chỉ giữ tối đa maxChunksPerDocument).
    const byDocument = new Map<string, RawChunk[]>();

    // Duyệt theo THỨ TỰ đã re-rank: chunk tốt nhất của mỗi tài liệu vào trước.
    for (const chunk of chunks) {
      const existing = byDocument.get(chunk.documentId) ?? [];
      if (existing.length < maxChunksPerDocument) {
        existing.push(chunk);
        byDocument.set(chunk.documentId, existing);
      }
    }

    // `Array.from(map.values())` : chuyển các value (mảng chunk) của Map thành mảng
    // để .map. Vì chunk vào theo thứ tự relevance, phần tử [0] là chunk tốt nhất.
    return Array.from(byDocument.values()).map((docChunks) => {
      const best = docChunks[0];
      const relevanceScore = this.chunkRelevanceScore(best, question);
      // Ghép nội dung các chunk bằng 2 dòng trống để LLM phân biệt đoạn.
      const combinedText = docChunks.map((c) => c.content).join('\n\n');

      return {
        chunkId: best.chunkId,
        chunkIndex: best.chunkIndex,
        documentId: best.documentId,
        title: best.title,
        relevanceScore,
        snippet: this.toSourceSnippet(best.content, question),
        promptContext: combinedText.slice(0, promptContextLimit),
        // KHỬ TRÙNG locator: `flatMap` gộp tất cả mảng sourceLocator của các chunk
        // thành một mảng phẳng, `?? []` phòng null; bọc `new Set([...])` để loại
        // trùng, rồi spread `[...]` về lại mảng.
        sourceLocator: [
          ...new Set(docChunks.flatMap((chunk) => chunk.sourceLocator ?? [])),
        ],
      };
    });
  }

  // ==========================================================================
  // selectChunksForPrompt — chọn chunk cho prompt, ĐA DẠNG HÓA theo section
  // --------------------------------------------------------------------------
  // Generic `<T extends { content: string; distance: number }>` : chấp nhận bất
  // kỳ kiểu chunk nào miễn có content + distance (tái dùng cho nhiều dạng chunk).
  // Câu hỏi thường → lấy top `limit`. Câu hỏi chi tiết → cố lấy chunk từ CÁC
  // SECTION KHÁC NHAU (tránh trùng section) để bao quát tài liệu rộng hơn.
  // ==========================================================================
  private selectChunksForPrompt<
    T extends { content: string; distance: number },
  >(chunks: T[], question: string, limit: number): T[] {
    // Không phải câu hỏi chi tiết → đơn giản cắt top `limit`.
    if (!this.isDetailedAnswerQuery(question)) {
      return chunks.slice(0, limit);
    }

    const selected: T[] = [];
    const seenLocations = new Set<string>(); // các section đã lấy, để không lặp

    // [Vòng 1] Ưu tiên chunk ở SECTION mới (đa dạng vị trí).
    for (const chunk of chunks) {
      const location = this.extractStructureLocation(chunk.content);
      if (location && seenLocations.has(location)) {
        continue; // section này đã có → bỏ qua để đa dạng hóa
      }
      selected.push(chunk);
      if (location) {
        seenLocations.add(location);
      }
      if (selected.length >= limit) {
        break;
      }
    }

    // [Vòng 2] Nếu vẫn chưa đủ `limit` (do nhiều chunk trùng section bị loại), bù
    // thêm các chunk còn lại bất kể section. `!selected.includes(chunk)` tránh
    // thêm trùng chính chunk đã chọn.
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

  // ==========================================================================
  // extractStructureLocation — lấy nhãn vị trí cấu trúc của chunk (nếu có)
  // --------------------------------------------------------------------------
  // Trích phần đầu dạng `[SECTION:...]`/`[PAGE:...]`/`[SLIDE:...]`/`[SHEET:...]`
  // do bộ trích xuất chèn vào. Regex: `[^\]]+` = một hoặc nhiều ký tự KHÔNG phải
  // `]`. `.exec(...)?.[0]` lấy toàn bộ chuỗi khớp; `?? ''` → rỗng nếu không khớp.
  // ==========================================================================
  private extractStructureLocation(content: string): string {
    return /\[(?:SECTION|PAGE|SLIDE|SHEET):[^\]]+\]/.exec(content)?.[0] ?? '';
  }

  // ==========================================================================
  // toCitation — dựng một ChatSourceResult từ nguyên tài liệu (không theo chunk)
  // --------------------------------------------------------------------------
  // Dùng khi nguồn là CẢ TÀI LIỆU (discovery / selected / keyword fallback).
  // Chọn độ dài ngữ cảnh (promptContextLimit) tùy loại câu hỏi và trích snippet.
  // `relevanceScore: number | null = null` : tham số MẶC ĐỊNH null nếu không truyền.
  // ==========================================================================
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
    // `Boolean(question && ...)` : ép về true/false rõ ràng (nếu question rỗng → false).
    const wholeDocumentQuestion = Boolean(
      question && this.isWholeDocumentContextQuery(question),
    );
    const explicitSectionQuestion = Boolean(
      question && this.hasExplicitNumberedSectionReference(question),
    );
    // Hỏi toàn bộ → dựng ngữ cảnh cả tài liệu (ưu tiên extractedText, thiếu thì
    // contentSummary, `??` chuỗi thứ hai/rỗng). Ngược lại → chỉ đoạn liên quan.
    const fullText = wholeDocumentQuestion
      ? this.buildWholeDocumentContext(
          document.content?.extractedText ??
            document.content?.contentSummary ??
            '',
        )
      : this.extractFullText(document.content, question);
    const snippetText = this.extractSnippetText(document.content, question);
    // TERNARY LỒNG chọn ngân sách context theo mức độ "cần nhiều chữ":
    //   hỏi toàn bộ HOẶC hỏi section cụ thể → 16k;
    //   hỏi chi tiết → gấp đôi (6k);
    //   còn lại → 3k.
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

  // ==========================================================================
  // extractSnippetText — chọn đoạn văn bản để tạo SNIPPET (xem trước)
  // --------------------------------------------------------------------------
  // Ưu tiên: (1) section được yêu cầu tường minh; (2) đoạn liên quan nhất; nếu
  // đều không có → trả toàn bộ extractedText. `?.trim() || ''` : bỏ null + cắt
  // khoảng trắng; nếu kết quả rỗng ("" là falsy) thì lấy '' bên phải `||`.
  // ==========================================================================
  private extractSnippetText(
    content: {
      extractedText?: string | null;
    } | null,
    question?: string,
  ): string {
    const extractedText = content?.extractedText?.trim() || '';

    if (question) {
      // (1) Người dùng nhắc "mục 3", "bài 2"... → cắt đúng section đó.
      const explicitSectionText = this.extractExplicitSectionPassage(
        extractedText,
        question,
      );
      if (explicitSectionText) {
        return explicitSectionText;
      }

      // (2) Đoạn khớp từ khóa nhiều nhất.
      const relevantText = this.extractRelevantPassage(extractedText, question);
      if (relevantText) {
        return relevantText;
      }
    }

    return extractedText;
  }

  // ==========================================================================
  // extractFullText — chọn văn bản làm NGỮ CẢNH prompt (nhiều chữ hơn snippet)
  // --------------------------------------------------------------------------
  // Thứ tự ưu tiên: section tường minh → (nếu hỏi chi tiết) toàn văn → đoạn liên
  // quan → cuối cùng là bản tóm tắt (hoặc toàn văn nếu không có tóm tắt).
  // ==========================================================================
  private extractFullText(
    content: {
      extractedText?: string | null;
      contentSummary?: string | null;
    } | null,
    question?: string,
  ): string {
    const extractedText = content?.extractedText?.trim() || '';
    const contentSummary = content?.contentSummary?.trim() || '';

    // (1) Section được nêu cụ thể → trả đúng section.
    if (question) {
      const explicitSectionText = this.extractExplicitSectionPassage(
        extractedText,
        question,
      );
      if (explicitSectionText) {
        return explicitSectionText;
      }
    }

    // (2) Hỏi chi tiết + có toàn văn → trả TOÀN VĂN (cần bao quát).
    if (question && this.isDetailedAnswerQuery(question) && extractedText) {
      return extractedText;
    }

    // (3) Đoạn liên quan nhất theo từ khóa.
    if (question) {
      const relevantText = this.extractRelevantPassage(extractedText, question);
      if (relevantText) {
        return relevantText;
      }
    }

    // (4) Mặc định: ưu tiên bản tóm tắt (ngắn gọn), thiếu thì dùng toàn văn.
    return contentSummary || extractedText;
  }

  // ==========================================================================
  // scoreDocument — CHẤM ĐIỂM keyword một tài liệu theo câu truy vấn
  // --------------------------------------------------------------------------
  // `query: string | QueryAnalysis` : nhận câu hỏi thô HOẶC kết quả phân tích sẵn.
  // Cộng điểm khớp từ khóa ở nhiều trường với TRỌNG SỐ giảm dần theo độ tin cậy:
  // title (10) > description/summary (5) > tags (4) > nội dung toàn văn (1).
  // ==========================================================================
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
    // `typeof query === 'string'` : chuỗi → tự tách token; QueryAnalysis → dùng
    // coreTerms có sẵn (không tách lại).
    const terms =
      typeof query === 'string' ? this.tokenize(query) : query.coreTerms;
    if (terms.length === 0) {
      return 0; // không có từ khóa → không thể chấm
    }

    // Tổng = tổng khớp từng trường × trọng số. tags gộp thành chuỗi để chấm chung.
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

  // ==========================================================================
  // scoreText — đếm số lần các từ khóa xuất hiện trong đoạn, nhân trọng số
  // --------------------------------------------------------------------------
  // Dùng .reduce cộng dồn: reduce((acc, cur) => ..., giá_trị_khởi_đầu).
  // ==========================================================================
  private scoreText(
    value: string | null | undefined,
    terms: string[],
    weight: number,
  ): number {
    if (!value) {
      return 0; // null/undefined/rỗng → 0 điểm
    }

    const normalized = this.normalize(value);
    return terms.reduce((score, term) => {
      // Escape ký tự đặc biệt của regex trong từ khóa để hiểu như ký tự thường
      // (vd "c++"). `$&` = phần vừa khớp.
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // `\b...\b` = ranh giới từ → chỉ khớp NGUYÊN từ. Cờ 'gi': g = đếm mọi lần
      // khớp, i = không phân biệt hoa/thường.
      const regex = new RegExp(`\\b${escapedTerm}\\b`, 'gi');
      // Số lần khớp; `.match(...)?.length || 0` → 0 khi không khớp (match trả null).
      const matches = normalized.match(regex)?.length || 0;
      return score + matches * weight;
    }, 0);
  }

  // ==========================================================================
  // tokenize — tách chuỗi thành TOKEN tìm kiếm (chuẩn hóa + khử trùng)
  // --------------------------------------------------------------------------
  // `[...new Set(tokens)]` : Set loại token trùng rồi spread về mảng.
  // ==========================================================================
  private tokenize(value: string): string[] {
    const tokens = this.normalize(value)
      .split(' ')
      .filter((token) => this.isSearchToken(token));

    return [...new Set(tokens)];
  }

  // ==========================================================================
  // isSearchToken — token có đáng dùng để tìm kiếm không
  // --------------------------------------------------------------------------
  // Loại stopword; giữ token ≥ 2 ký tự HOẶC là SỐ thuần (vd "3", "2024" có nghĩa
  // dù chỉ 1 ký tự).
  // ==========================================================================
  private isSearchToken(token: string): boolean {
    return (
      !STOPWORDS.has(token) && (token.length >= 2 || /^[0-9]+$/.test(token))
    );
  }

  // ==========================================================================
  // normalize — CHUẨN HÓA chuỗi để so khớp không phân biệt dấu/hoa-thường
  // --------------------------------------------------------------------------
  // Mấu chốt xử lý SONG NGỮ Việt–Anh. Chuỗi phép biến đổi:
  //   .toLowerCase()                   : hạ chữ thường.
  //   .replace(/đ/g,'d')          : 'đ' → 'd' (đ là mã Unicode của 'đ';
  //                                      NFD không tách được 'đ' nên xử lý riêng).
  //   .normalize('NFD')                : tách ký tự có dấu → chữ cái + dấu tổ hợp.
  //   .replace(/[̀-ͯ]/g,'')  : xóa các dấu tổ hợp (dải Unicode dấu thanh).
  //   .replace(/[^a-z0-9]+/g,' ')      : ký tự không phải chữ/số → khoảng trắng.
  //   .replace(/\s+/g,' ').trim()      : gộp khoảng trắng, cắt hai đầu.
  // Kết quả: "Hướng Dẫn Sử Dụng" → "huong dan su dung".
  // ==========================================================================
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

  // ==========================================================================
  // toFileTypeFilter — đổi "tên loại file" của user thành bộ lọc MIME
  // --------------------------------------------------------------------------
  // Trả: undefined (không lọc) | { in: [...] } (alias nhiều MIME) | string (MIME
  // nguyên bản nếu không phải alias đã biết).
  // ==========================================================================
  private toFileTypeFilter(
    fileType: string | undefined,
  ): FileTypeFilter | undefined {
    if (!fileType) {
      return undefined;
    }

    const normalized = fileType.trim().toLowerCase();
    const mimeTypes = FILE_TYPE_ALIASES[normalized]; // tra bảng alias
    // Có alias → { in: [...] }; không → coi chính chuỗi là MIME.
    return mimeTypes ? { in: mimeTypes } : normalized;
  }

  // ==========================================================================
  // reRankSources — SẮP XẾP LẠI nguồn: cộng thưởng khớp tiêu đề rồi cắt top-limit
  // --------------------------------------------------------------------------
  // Vào: danh sách nguồn + câu hỏi + limit. Ra: top `limit` nguồn, đánh số lại.
  // Ý tưởng: nguồn nào có tiêu đề chứa từ khóa câu hỏi thì được cộng nhẹ điểm
  // (tối đa +0.10) để nhích lên trên.
  // ==========================================================================
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

        // Mỗi từ khóa khớp NGUYÊN từ trong tiêu đề → +0.05; TRẦN tổng +0.10 (2 từ).
        for (const term of terms) {
          const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`\\b${escapedTerm}\\b`, 'i').test(titleLower)) {
            bonus += 0.05;
            if (bonus >= 0.1) break; // Total title bonus capped at +0.10
          }
        }

        // `?? 0.5` : nếu chưa có điểm thì lấy mặc định 0.5. Math.min chặn trần 0.99.
        const rawScore = source.relevanceScore ?? 0.5;
        const boostedScore = Math.min(0.99, rawScore + bonus);

        return {
          ...source, // spread giữ nguyên các trường cũ
          relevanceScore: boostedScore, // ghi đè điểm bằng điểm đã cộng thưởng
        };
      })
      // Sắp giảm dần theo điểm; `?? 0` phòng trường hợp thiếu điểm.
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, limit)
      // Đánh lại sourceNumber từ 1 theo thứ tự cuối cùng.
      .map((source, index) => ({
        ...source,
        sourceNumber: index + 1,
      }));
  }

  // ==========================================================================
  // filterSemanticSourcesForTopic — LỌC nguồn semantic theo CHỦ ĐỀ câu hỏi
  // --------------------------------------------------------------------------
  // Vấn đề: vector search có thể trả nguồn "gần nghĩa" nhưng lệch chủ đề. Hàm
  // này yêu cầu nguồn phải chứa đủ SỐ TỪ KHÓA chủ đề tối thiểu mới được giữ.
  // Nếu không đủ tín hiệu chủ đề (ít từ, ý định yếu) → không lọc (trả nguyên).
  // ==========================================================================
  private filterSemanticSourcesForTopic(
    sources: ChatSourceResult[],
    queryAnalysis: QueryAnalysis,
  ): ChatSourceResult[] {
    const topicTerms = this.extractTopicFilterTerms(queryAnalysis);
    // Bỏ lọc khi: không có từ chủ đề, HOẶC (không phải ý định tìm tài liệu VÀ
    // tín hiệu chủ đề yếu) → tránh lọc nhầm khi tín hiệu mơ hồ.
    if (
      topicTerms.length === 0 ||
      (!queryAnalysis.documentSearchIntent &&
        !this.hasStrongTopicSignal(topicTerms))
    ) {
      return sources;
    }

    // Số từ tối thiểu phải khớp: nếu có identifier (chứa '_', vd tên biến/bảng) →
    // đòi khớp TẤT CẢ (rất đặc trưng); ≤ 2 từ → cần 1; nhiều từ → cần 2.
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

  // ==========================================================================
  // extractTopicFilterTerms — lấy các từ khóa CHỦ ĐỀ (loại từ về cấu trúc bảng)
  // ==========================================================================
  private extractTopicFilterTerms(queryAnalysis: QueryAnalysis): string[] {
    return queryAnalysis.coreTerms.filter(
      (term) => !TOPIC_FILTER_EXCLUDED_TERMS.has(term),
    );
  }

  // ==========================================================================
  // hasStrongTopicSignal — chủ đề có đủ "mạnh" để đáng lọc không
  // --------------------------------------------------------------------------
  // Đủ mạnh nếu có ≥ 2 từ, HOẶC có ít nhất 1 từ dài ≥ 3 ký tự (từ ngắn dễ nhiễu).
  // ==========================================================================
  private hasStrongTopicSignal(topicTerms: string[]): boolean {
    return (
      topicTerms.length >= 2 || topicTerms.some((term) => term.length >= 3)
    );
  }

  // ==========================================================================
  // countTopicMatches — đếm số từ khóa chủ đề XUẤT HIỆN trong một nguồn
  // --------------------------------------------------------------------------
  // `Pick<ChatSourceResult, 'title' | 'snippet' | 'promptContext'>` : kiểu tiện
  // ích của TS — chỉ lấy 3 trường đó từ ChatSourceResult (hàm chỉ cần chừng ấy).
  // Mỗi từ có thể có nhiều BIẾN THỂ (vd nodejs/node js); khớp 1 biến thể là tính.
  // ==========================================================================
  private countTopicMatches(
    source: Pick<ChatSourceResult, 'title' | 'snippet' | 'promptContext'>,
    coreTerms: string[],
  ): number {
    // Gộp 3 vùng văn bản của nguồn thành 1 "đống rơm" (haystack) để tìm kim.
    const sourceText = [
      source.title,
      source.snippet,
      source.promptContext,
    ].join(' ');
    const haystack = this.normalize(sourceText); // bản bỏ '_' (chữ/số thường)
    const haystackWithUnderscores = this.normalizeWithUnderscores(sourceText); // giữ '_' cho identifier

    // Với mỗi từ khóa: nếu BẤT KỲ biến thể nào khớp (some) thì tính là +1.
    return coreTerms.reduce((count, term) => {
      const variants = this.getTermVariants(term);
      const matched = variants.some((variant) =>
        this.matchesNormalizedTerm(haystack, haystackWithUnderscores, variant),
      );
      return matched ? count + 1 : count;
    }, 0);
  }

  // ==========================================================================
  // getTermVariants — sinh các BIẾN THỂ tương đương của một từ khóa
  // --------------------------------------------------------------------------
  // Giúp khớp linh hoạt: "nodejs" ↔ "node js"; "api" ↔ "apis"; "chuc_nang" ↔
  // "chuc nang". Dùng Set để tự khử trùng, rồi spread về mảng.
  // ==========================================================================
  private getTermVariants(term: string): string[] {
    const variants = new Set([term]);
    // Kết thúc bằng "js" (và dài > 2) → thêm biến thể tách "... js".
    if (term.endsWith('js') && term.length > 2) {
      variants.add(`${term.slice(0, -2)} js`); // slice(0,-2): bỏ 2 ký tự cuối
    }
    if (term === 'api') {
      variants.add('apis'); // số nhiều thường gặp
    }
    // Identifier có '_' → thêm biến thể thay '_' bằng khoảng trắng.
    if (term.includes('_')) {
      variants.add(term.replace(/_/g, ' '));
    }
    return [...variants];
  }

  // ==========================================================================
  // matchesNormalizedTerm — khớp từ trên bản normalize phù hợp (có/không '_')
  // --------------------------------------------------------------------------
  // Từ chứa '_' phải khớp trên bản GIỮ '_'; ngược lại khớp trên bản thường.
  // ==========================================================================
  private matchesNormalizedTerm(
    normalizedValue: string,
    normalizedValueWithUnderscores: string,
    term: string,
  ): boolean {
    return term.includes('_')
      ? this.containsTerm(normalizedValueWithUnderscores, term)
      : this.containsTerm(normalizedValue, term);
  }

  // ==========================================================================
  // containsTerm — value có chứa NGUYÊN từ `term` không (khớp ranh giới từ)
  // ==========================================================================
  private containsTerm(value: string, term: string): boolean {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escapedTerm}\\b`, 'i').test(value);
  }

  // Trả về true nếu câu hỏi mang ý định document discovery (bọc analyzeQuery).
  private isDocumentDiscoveryIntent(question: string): boolean {
    return this.analyzeQuery(question).documentSearchIntent;
  }

  // Lấy nhanh danh sách coreTerms của câu hỏi (bọc analyzeQuery).
  private extractCoreTerms(question: string): string[] {
    return this.analyzeQuery(question).coreTerms;
  }

  // ==========================================================================
  // scoreDocumentMetadata — CHẤM ĐIỂM tài liệu theo METADATA (document discovery)
  // --------------------------------------------------------------------------
  // Không dùng vector. Khớp coreTerms/corePhrases của câu hỏi với các vùng
  // metadata (title, subject, category, tags, description) và một phần content,
  // cộng điểm theo TRỌNG SỐ (title cao nhất). Trả về MetadataScore gồm điểm thô,
  // điểm chuẩn hóa và các cờ tín hiệu để quyết định "cổng chủ đề" (topic gate).
  //
  // `query: QueryAnalysis | string[]` : nhận phân tích sẵn HOẶC chỉ mảng từ khóa.
  // Chuẩn bị chuẩn hóa 2 dạng cho mỗi vùng: bản thường + bản GIỮ '_' (cho khớp
  // identifier như "user_id").
  // ==========================================================================
  private scoreDocumentMetadata(
    doc: DocumentDiscoveryRow,
    query: QueryAnalysis | string[],
  ): MetadataScore {
    // `Array.isArray(query)` : nếu truyền mảng từ khóa → tự dựng một QueryAnalysis
    // tối thiểu; ngược lại dùng luôn phân tích đã có.
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
    // Chuẩn hóa từng vùng (bỏ null bằng `? ... : ''`). Mỗi vùng có 2 biến thể.
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

    // Các biến tích lũy trong quá trình chấm (khai báo `let` vì bị cộng dồn):
    let metadataOverlap = 0; // tổng "độ phủ" ở vùng metadata
    let rawScore = 0; // điểm thô cộng dồn theo trọng số
    let titleTokenMatches = 0; // số từ khóa khớp trong tiêu đề
    let descriptionTokenMatches = 0; // số từ khóa khớp trong mô tả
    let titlePhraseMatch = false; // có khớp nguyên một CỤM trong tiêu đề không
    let taxonomyMatch = false; // có khớp subject/category/tags không
    let strongDescriptionMatch = false; // mô tả khớp mạnh không

    // [PHẦN 1] Chấm theo CỤM (phrase) — tín hiệu mạnh hơn từ đơn vì khớp cả cụm.
    // Trọng số: title 50 > subject 35 > category 28 > tags 26 > description 18 > content 4.
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

    // [PHẦN 2] Chấm theo TỪ ĐƠN (term) — trọng số thấp hơn cụm nhưng vẫn theo
    // thứ hạng vùng: title 10 > subject 8 > category 6 > tags 5 > description 4 > content 1.
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

    // [PHẦN 3] Suy ra các CỜ TÍN HIỆU tổng hợp:
    // "khớp mạnh tiêu đề" = có khớp VÀ (chỉ 1 từ khóa, hoặc ≥ 67% số từ khóa khớp ở title).
    const strongTitleTokenOverlap =
      titleTokenMatches > 0 &&
      (coreTerms.length === 1 || titleTokenMatches / coreTerms.length >= 0.67);
    // "khớp mạnh mô tả" giữ giá trị cũ HOẶC ≥ 67% từ khóa khớp trong mô tả.
    strongDescriptionMatch =
      strongDescriptionMatch ||
      (descriptionTokenMatches > 0 &&
        descriptionTokenMatches / coreTerms.length >= 0.67);
    // CỔNG CHỦ ĐỀ (topic gate): phải có phủ metadata VÀ ít nhất một tín hiệu mạnh
    // (khớp cụm tiêu đề / khớp mạnh tiêu đề / khớp taxonomy / khớp mạnh mô tả).
    // Chỉ tài liệu qua cổng này mới đủ tin cậy để trả về trong discovery.
    const passesTopicGate =
      metadataOverlap > 0 &&
      (titlePhraseMatch ||
        strongTitleTokenOverlap ||
        taxonomyMatch ||
        strongDescriptionMatch);
    // CHUẨN HÓA điểm thô về [0.55, 0.99] bằng hàm bão hòa rawScore/(rawScore+25).
    // Sàn 0.55 vì đã qua cổng chủ đề thì mặc nhiên khá liên quan; 0 nếu không có điểm.
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

  // ==========================================================================
  // analyzeQuery — PHÂN TÍCH câu hỏi → QueryAnalysis (dùng chung nhiều nhánh)
  // --------------------------------------------------------------------------
  // Tách token, rút identifier (từ có '_'), lọc bỏ stopword/từ-ý-định để lấy
  // coreTerms, sinh corePhrases, và suy ra các cờ ý định (search/document/concise).
  // ==========================================================================
  private analyzeQuery(question: string): QueryAnalysis {
    const normalized = this.normalize(question);
    // `.filter(Boolean)` : bỏ chuỗi rỗng (Boolean('') === false) sau khi split.
    const allTokens = normalized.split(' ').filter(Boolean);
    const identifierTerms = this.extractIdentifierTerms(question);
    // Tách các phần con của identifier (vd "user_id" → {user, id}) thành Set để
    // sau này KHÔNG đếm lại chúng như token đơn (tránh trùng tín hiệu).
    const identifierParts = new Set(
      identifierTerms.flatMap((term) => term.split('_')),
    );
    // coreTerms = identifier + các token "sạch" (đủ dài, không stopword, không từ
    // ý-định, không là mảnh của identifier). Bọc Set để khử trùng.
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
    // Câu hỏi về CẤU TRÚC BẢNG → tắt hết ý định discovery (đây là câu hỏi nội
    // dung, phải đi semantic để lấy đúng chunk bảng).
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

    // explicitSearchIntent: có ít nhất 1 token là từ tìm/liệt kê tường minh.
    const explicitSearchIntent = allTokens.some((token) =>
      SEARCH_INTENT_WORDS.has(token),
    );
    // conciseTopicQuery: câu hỏi ngắn gọn chỉ nêu một chủ đề (acronym / tên riêng
    // Title Case), không phải câu hỏi tường minh và không có identifier.
    const conciseTopicQuery =
      !explicitSearchIntent &&
      identifierTerms.length === 0 &&
      this.isConciseTopicQuery(question, coreTerms);
    // documentSearchIntent: đi nhánh discovery khi có từ khóa VÀ (tường minh HOẶC
    // là câu hỏi chủ đề ngắn gọn).
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

  // ==========================================================================
  // extractIdentifierTerms — rút các "identifier" dạng snake_case (vd user_id)
  // --------------------------------------------------------------------------
  // Chỉ giữ token chứa '_' MÀ MỌI phần con đều dài ≥ 2 và không phải stopword
  // (`.every(...)` = tất cả phần con thỏa). Đây là tín hiệu chủ đề rất đặc trưng.
  // ==========================================================================
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

  // ==========================================================================
  // extractCorePhrases — sinh các CỤM n-gram liền kề từ danh sách coreTerms
  // --------------------------------------------------------------------------
  // Tạo mọi cụm liền nhau độ dài từ min(4, số từ) xuống 2 (vd 3 từ A B C → "a b c",
  // "a b", "b c"). Cụm dài ưu tiên trước (điểm cao hơn). Bọc Set khử trùng.
  // ==========================================================================
  private extractCorePhrases(coreTerms: string[]): string[] {
    const phrases: string[] = [];
    const maxPhraseLength = Math.min(4, coreTerms.length);

    // Vòng ngoài: kích thước cụm giảm dần từ dài → ngắn.
    for (let size = maxPhraseLength; size >= 2; size -= 1) {
      // Vòng trong: trượt cửa sổ size trên coreTerms. `slice(index, index+size)`
      // lấy đúng size phần tử liền kề rồi `.join(' ')` ghép thành cụm.
      for (let index = 0; index <= coreTerms.length - size; index += 1) {
        phrases.push(coreTerms.slice(index, index + size).join(' '));
      }
    }

    return [...new Set(phrases)];
  }

  // ==========================================================================
  // isConciseTopicQuery — có phải câu hỏi CHỦ ĐỀ ngắn gọn (không có dấu ?) không
  // --------------------------------------------------------------------------
  // Điều kiện: 1..5 từ khóa, KHÔNG có dấu '?', VÀ chứa acronym (vd "SQL", "ERD")
  // HOẶC cụm Title Case nhiều từ (vd "Machine Learning"). Ý là kiểu người dùng gõ
  // tên chủ đề để tra tài liệu, không phải câu hỏi hội thoại.
  // ==========================================================================
  private isConciseTopicQuery(
    originalQuestion: string,
    coreTerms: string[],
  ): boolean {
    if (coreTerms.length === 0 || coreTerms.length > 5) {
      return false;
    }

    const trimmed = originalQuestion.trim();
    const hasQuestionMark = trimmed.includes('?');
    // `\b[A-Z0-9]{2,}\b` : ≥ 2 ký tự HOA/số liền nhau = acronym (dùng CHUỖI GỐC,
    // chưa normalize, để còn phân biệt hoa/thường).
    const hasAcronym = /\b[A-Z0-9]{2,}\b/.test(trimmed);
    // Cụm ≥ 2 từ đều viết hoa chữ cái đầu (Title Case) = tên chủ đề/riêng.
    const hasTitleCaseTopic = /\b[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)+\b/.test(
      trimmed,
    );

    return !hasQuestionMark && (hasAcronym || hasTitleCaseTopic);
  }

  // ==========================================================================
  // containsPhrase — value có chứa NGUYÊN cụm `phrase` (khớp ranh giới từ) không
  // ==========================================================================
  private containsPhrase(value: string, phrase: string): boolean {
    if (!value || !phrase) {
      return false;
    }

    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escapedPhrase}\\b`, 'i').test(value);
  }

  // ==========================================================================
  // applyScoreGapFilter — cắt "đuôi" điểm thấp khi có nguồn nổi trội rõ rệt
  // --------------------------------------------------------------------------
  // Chỉ áp dụng cho discovery và khi có > 1 kết quả. Nếu điểm cao nhất rất cao
  // (≥ 0.84), loại các kết quả cách top quá xa (> 0.22) — tránh trộn tài liệu
  // đúng chủ đề với tài liệu chỉ khớp mờ. Generic T chỉ cần có relevanceScore.
  // ==========================================================================
  private applyScoreGapFilter<T extends { relevanceScore: number }>(
    items: T[],
    queryAnalysis: QueryAnalysis,
  ): T[] {
    if (!queryAnalysis.documentSearchIntent || items.length <= 1) {
      return items;
    }

    const topScore = items[0]?.relevanceScore ?? 0;
    if (topScore < 0.84) {
      return items; // không có nguồn nào đủ nổi trội → không cắt đuôi
    }

    // Ngưỡng giữ lại = max(ngưỡng metadata tối thiểu, topScore - 0.22).
    const minAllowedScore = Math.max(
      MIN_METADATA_RELEVANCE_SCORE,
      topScore - 0.22,
    );
    return items.filter((item) => item.relevanceScore >= minAllowedScore);
  }

  // ==========================================================================
  // executeDocumentDiscovery — NHÁNH C: tìm tài liệu theo METADATA
  // --------------------------------------------------------------------------
  // Nạp tài liệu đủ điều kiện (kèm subject/category/tags/content) → chấm điểm
  // metadata → lọc qua "cổng chủ đề" và ngưỡng → sắp xếp → cắt gap → map thành
  // nguồn. KHÔNG dùng embedding. `queryAnalysis = this.analyzeQuery(question)` là
  // tham số MẶC ĐỊNH: nếu nơi gọi không truyền thì tự phân tích.
  // ==========================================================================
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
      return []; // không có từ khóa chủ đề → không thể discovery
    }

    // [BƯỚC 1] Nạp tài liệu của user (sở hữu/đã lưu, ACTIVE) kèm quan hệ cần cho
    // chấm metadata. `include` khác `select`: nạp cả object quan hệ.
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

    // [BƯỚC 2] Nếu user đã scope documentIds, chỉ giữ tài liệu trong danh sách.
    const scopedDocuments = this.hasSelectedDocumentFilter(filters)
      ? documents.filter((document) =>
          filters.documentIds.includes(document.id),
        )
      : documents;

    // [BƯỚC 3] Chấm điểm + lọc + sắp xếp:
    const scoredDocs = scopedDocuments
      // .map: kèm điểm metadata cho từng tài liệu.
      .map((doc) => {
        const metadataScore = this.scoreDocumentMetadata(doc, queryAnalysis);
        return {
          doc,
          rawScore: metadataScore.rawScore,
          relevanceScore: metadataScore.relevanceScore,
          metadataScore,
        };
      })
      // .filter: phải qua CỔNG CHỦ ĐỀ và đạt ngưỡng metadata (0.62).
      .filter(
        (item) =>
          item.metadataScore.passesTopicGate &&
          item.relevanceScore >= MIN_METADATA_RELEVANCE_SCORE,
      )
      // .sort: điểm thô cao trước; bằng điểm → theo tên (kết quả ổn định).
      .sort((a, b) => {
        if (b.rawScore !== a.rawScore) {
          return b.rawScore - a.rawScore;
        }

        return a.doc.title.localeCompare(b.doc.title);
      });

    // [BƯỚC 4] Cắt "đuôi" điểm thấp (nếu có nguồn nổi trội) → lấy top `limit` →
    // map thành ChatSourceResult (đánh số nguồn từ 1).
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

  // ==========================================================================
  // reRankChunks — SẮP XẾP LẠI chunk theo điểm relevance giảm dần
  // --------------------------------------------------------------------------
  // `[...chunks]` : tạo BẢN SAO trước khi .sort (vì sort đột biến mảng gốc — ta
  // không muốn thay đổi input). So sánh right - left → giảm dần (điểm cao trước).
  // ==========================================================================
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

  // ==========================================================================
  // tableChunkBonus — điểm CỘNG THÊM cho chunk dạng bảng khi hỏi về bảng
  // --------------------------------------------------------------------------
  // +0.08 nếu chunk có nhãn 'table'/'section' và câu hỏi về cấu trúc; +0.06 mỗi
  // từ khóa câu hỏi khớp trong chunk. Chặn TRẦN 0.3 để không lấn át điểm semantic.
  // ==========================================================================
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
      // Khớp như token riêng (tokens.has) hoặc như chuỗi con (includes).
      if (tokens.has(term) || normalized.includes(term)) {
        bonus += 0.06;
      }
    }

    return Math.min(bonus, 0.3);
  }

  // ==========================================================================
  // chunkRelevanceScore — ĐIỂM LIÊN QUAN của một chunk với câu hỏi
  // --------------------------------------------------------------------------
  // Điểm cơ sở = 1 - cosine distance (distance nhỏ → điểm cao). Chỉ khi chunk là
  // dạng bảng HOẶC câu hỏi về cấu trúc bảng thì mới cộng thêm tableChunkBonus.
  // Không có câu hỏi → chỉ trả điểm cơ sở.
  // ==========================================================================
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
    // Không liên quan gì đến bảng → giữ nguyên điểm cơ sở (không thưởng).
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

  // ==========================================================================
  // isTableStructureQuery — câu hỏi có liên quan CẤU TRÚC BẢNG/DỮ LIỆU không
  // --------------------------------------------------------------------------
  // Đúng nếu có token thuộc TABLE_STRUCTURE_QUERY_TERMS, HOẶC chứa một trong các
  // cụm TABLE_STRUCTURE_QUERY_PHRASES (dùng bản normalize GIỮ '_').
  // ==========================================================================
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

  // ==========================================================================
  // isDetailedAnswerQuery — người dùng có muốn trả lời CHI TIẾT/ĐẦY ĐỦ không
  // --------------------------------------------------------------------------
  // Đúng nếu là câu "tiếp tục", HOẶC có token trong DETAILED_QUERY_TERMS, HOẶC
  // chứa một cụm trong DETAILED_QUERY_PHRASES.
  // ==========================================================================
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

  // ==========================================================================
  // isWholeDocumentContextQuery — câu hỏi có yêu cầu ĐỌC TOÀN BỘ tài liệu không
  // --------------------------------------------------------------------------
  // Đúng nếu là "tiếp tục", HOẶC (là câu chi tiết VÀ có dấu hiệu nói về cả file:
  // "toan bo"/"day du"/"file nay noi gi"/nhắc từ file/document/tai lieu).
  // Quyết định việc nới ngân sách context lên 16k và lấy nguyên văn.
  // ==========================================================================
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

  // ==========================================================================
  // isContinuationQuery — câu hỏi kiểu "tiếp tục / phần còn lại / continue"
  // --------------------------------------------------------------------------
  // Người dùng muốn XEM TIẾP phần chưa trả lời → lấy nguyên văn để đọc tuần tự.
  // ==========================================================================
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

  // ==========================================================================
  // buildWholeDocumentContext — RÚT GỌN ĐỀU toàn bộ tài liệu vào ngân sách 16k
  // --------------------------------------------------------------------------
  // Nếu tài liệu ngắn hơn hạn mức → trả nguyên. Nếu dài → chia thành block, lấy
  // mẫu đều đầu-giữa-cuối (không chỉ phần đầu), cắt bớt mỗi block rồi ghép với
  // dải phân cách báo "phần giữa đã rút gọn". Bảo toàn cái nhìn tổng thể tài liệu.
  // ==========================================================================
  private buildWholeDocumentContext(text: string): string {
    const normalized = text.trim();
    if (normalized.length <= WHOLE_DOCUMENT_CONTEXT_LIMIT) {
      return normalized;
    }

    // Tách theo ≥ 2 dòng trống (`\n{2,}`) thành các đoạn; nếu tài liệu không có
    // ranh giới đoạn (1 khối duy nhất) → chia thành 3 cửa sổ đầu/giữa/cuối.
    const blocks = normalized
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    const allCandidates =
      blocks.length > 1 ? blocks : this.splitIntoWindows(normalized);
    // Lấy tối đa WHOLE_DOCUMENT_MAX_BLOCKS block phân bố đều.
    const candidates = this.selectEvenlyDistributedBlocks(allCandidates);
    const separator = '\n\n[... phần giữa đã được rút gọn ...]\n\n';
    // Ngân sách còn lại cho NỘI DUNG sau khi trừ độ dài các dải phân cách (số dải
    // = số block - 1). Math.max(1, ...) để không âm.
    const contentBudget = Math.max(
      1,
      WHOLE_DOCUMENT_CONTEXT_LIMIT - separator.length * (candidates.length - 1),
    );
    // Chia đều ngân sách cho từng block (làm tròn xuống).
    const blockBudget = Math.max(
      1,
      Math.floor(contentBudget / candidates.length),
    );

    // Cắt mỗi block về blockBudget, ghép bằng separator, chốt lại ≤ hạn mức tổng.
    return candidates
      .map((block) => block.slice(0, blockBudget))
      .join(separator)
      .slice(0, WHOLE_DOCUMENT_CONTEXT_LIMIT);
  }

  // ==========================================================================
  // splitIntoWindows — chia văn bản 1-khối thành 3 CỬA SỔ đầu / giữa / cuối
  // --------------------------------------------------------------------------
  // Dùng khi tài liệu không có ranh giới đoạn. `text.slice(-windowSize)` : chỉ số
  // âm = lấy từ CUỐI chuỗi (windowSize ký tự cuối).
  // ==========================================================================
  private splitIntoWindows(text: string): string[] {
    const windowSize = Math.floor(WHOLE_DOCUMENT_CONTEXT_LIMIT / 3);
    const middleStart = Math.max(0, Math.floor((text.length - windowSize) / 2));
    return [
      text.slice(0, windowSize), // đầu
      text.slice(middleStart, middleStart + windowSize), // giữa
      text.slice(-windowSize), // cuối
    ];
  }

  // ==========================================================================
  // selectEvenlyDistributedBlocks — LẤY MẪU ĐỀU tối đa N block trên toàn dải
  // --------------------------------------------------------------------------
  // Nếu số block ≤ N → giữ hết. Ngược lại chọn N block với chỉ số rải đều từ 0
  // đến cuối. `Array.from({length:N}, (_, index) => ...)` : tạo mảng N phần tử,
  // callback nhận (phần_tử_bỏ_qua `_`, index) để tính chỉ số nguồn tương ứng.
  // ==========================================================================
  private selectEvenlyDistributedBlocks(blocks: string[]): string[] {
    if (blocks.length <= WHOLE_DOCUMENT_MAX_BLOCKS) {
      return blocks;
    }

    return Array.from({ length: WHOLE_DOCUMENT_MAX_BLOCKS }, (_, index) => {
      // Ánh xạ tuyến tính index (0..N-1) → chỉ số block (0..len-1), làm tròn.
      const sourceIndex = Math.round(
        (index * (blocks.length - 1)) / (WHOLE_DOCUMENT_MAX_BLOCKS - 1),
      );
      return blocks[sourceIndex];
    });
  }

  // ==========================================================================
  // extractExplicitSectionPassage — TRÍCH đúng (các) section người dùng nêu SỐ
  // --------------------------------------------------------------------------
  // Vd hỏi "giải thích bài 3 và 5" → tìm các block mở đầu bằng "bai 3"/"bai 5"
  // rồi gom nội dung của đúng những section đó. Khử trùng section (seenSections).
  // Trả '' nếu không có yêu cầu số cụ thể (để hàm gọi thử phương án khác).
  // ==========================================================================
  private extractExplicitSectionPassage(
    text: string,
    question: string,
  ): string {
    if (!text) {
      return '';
    }

    const requestedNumbers = this.extractRequestedSectionNumbers(question);
    if (requestedNumbers.size === 0) {
      return ''; // câu hỏi không nêu số section nào
    }

    const blocks = text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    const selectedSections: string[] = [];
    const seenSections = new Set<string>();

    for (let index = 0; index < blocks.length; index += 1) {
      // Lấy SỐ section nếu block này là dòng mở đầu section (vd "bai 3 ...").
      const sectionNumber = this.numberedSectionLead(blocks[index]);
      // Không phải mở đầu section HOẶC số không nằm trong yêu cầu → bỏ qua.
      if (!sectionNumber || !requestedNumbers.has(sectionNumber)) {
        continue;
      }

      // Gom các block thuộc section này (đến khi gặp section mới / hết ngân sách).
      const sectionText = this.collectSectionBlocks(blocks, index);
      if (!sectionText || seenSections.has(sectionText)) {
        continue; // rỗng hoặc đã lấy rồi
      }

      selectedSections.push(sectionText);
      seenSections.add(sectionText);
    }

    return selectedSections.join('\n\n').slice(0, WHOLE_DOCUMENT_CONTEXT_LIMIT);
  }

  // ==========================================================================
  // extractRequestedSectionNumbers — rút các SỐ section mà câu hỏi yêu cầu
  // --------------------------------------------------------------------------
  // Regex bắt "bai/lesson/section/muc/phan/chuong/.../trang" theo sau bởi một
  // hoặc nhiều số (có thể ngăn cách bởi ',', 'va', 'and'). `matchAll` duyệt mọi
  // lần khớp; với mỗi lần, tách tiếp các số bằng `/\d+/g`. Trả về Set các số.
  // ==========================================================================
  private extractRequestedSectionNumbers(question: string): Set<string> {
    const normalized = this.normalize(question);
    const requestedNumbers = new Set<string>();
    const sectionPattern =
      /\b(?:bai|lesson|section|muc|phan|chuong|chapter|unit|slide|page|trang)\s+((?:\d+\s*(?:,|va|and)?\s*)+)/g;

    for (const match of normalized.matchAll(sectionPattern)) {
      // `match[1]` = nhóm bắt các số; `?.match(/\d+/g) ?? []` lấy từng số riêng.
      const numbers = match[1]?.match(/\d+/g) ?? [];
      for (const number of numbers) {
        requestedNumbers.add(number);
      }
    }

    return requestedNumbers;
  }

  // ==========================================================================
  // hasExplicitNumberedSectionReference — câu hỏi có nêu số section cụ thể không
  // ==========================================================================
  private hasExplicitNumberedSectionReference(question: string): boolean {
    return this.extractRequestedSectionNumbers(question).size > 0;
  }

  // ==========================================================================
  // extractRelevantPassage — tìm ĐOẠN liên quan nhất theo từ khóa (không có số)
  // --------------------------------------------------------------------------
  // Chia văn bản thành block, chấm điểm từng block theo passageScore, chọn block
  // điểm cao nhất. Nếu block đó là mở đầu một section được đánh số → lấy cả
  // section; ngược lại lấy block (đã focus vào vùng khớp) + kèm block liền trước
  // làm ngữ cảnh. Cuối cùng giữ trong ngân sách PROMPT_CONTEXT_LIMIT.
  // ==========================================================================
  private extractRelevantPassage(text: string, question: string): string {
    if (!text) {
      return '';
    }

    const queryTerms = this.tokenizeWithUnderscores(question);
    const blocks = text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    // Chấm điểm từng block, giữ block điểm > 0; sắp giảm dần, bằng điểm thì ưu
    // tiên block xuất hiện TRƯỚC (index nhỏ hơn) → ổn định và bám ngữ cảnh đầu.
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
      return ''; // không block nào khớp từ khóa
    }

    const best = scoredBlocks[0];
    // Block tốt nhất là mở đầu một section được đánh số → trả nguyên section đó.
    if (this.isNumberedSectionLead(best.block)) {
      return this.collectSectionBlocks(blocks, best.index);
    }

    const previous = blocks[best.index - 1]; // block liền trước (có thể undefined)
    const bestBlock = this.focusPassageWithinBlock(
      best.block,
      queryTerms,
      this.isTableStructureQuery(question),
    );
    // `[previous, bestBlock].filter(Boolean)` : bỏ phần tử falsy (previous có thể
    // undefined khi best là block đầu) rồi ghép lại.
    const context = [previous, bestBlock].filter(Boolean).join('\n\n');

    // Giữ đúng vùng khớp ngay cả khi bảng DOCX / trang PDF / slide PPTX / sheet
    // XLSX lớn hơn ngân sách. Trước đây cắt cả block từ đầu làm mất các dòng khớp
    // ở cuối → nay nếu ghép cả context vượt hạn mức thì chỉ lấy bestBlock (đã
    // focus vào vùng khớp) cắt về hạn mức.
    return context.length <= PROMPT_CONTEXT_LIMIT
      ? context
      : bestBlock.slice(0, PROMPT_CONTEXT_LIMIT);
  }

  // ==========================================================================
  // focusPassageWithinBlock — với block quá dài, LẤY VÙNG quanh dòng khớp nhất
  // --------------------------------------------------------------------------
  // Chấm điểm từng dòng, tìm dòng khớp cao nhất, rồi MỞ RỘNG hai phía (trên/dưới)
  // đối xứng cho tới khi chạm ngân sách. Nhờ vậy giữ được ngữ cảnh quanh vùng
  // khớp thay vì cắt cứng từ đầu block.
  // ==========================================================================
  private focusPassageWithinBlock(
    block: string,
    queryTerms: string[],
    includeTableStructureBonus: boolean,
  ): string {
    if (block.length <= PROMPT_CONTEXT_LIMIT) {
      return block; // block đã vừa ngân sách → giữ nguyên
    }

    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    // Xếp hạng dòng theo điểm; `right.score - left.score || left.index - right.index`
    // = ưu tiên điểm cao, hòa thì ưu tiên dòng trước (dùng `||` chọn tiêu chí phụ).
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
    let start = bestLineIndex; // con trỏ mở rộng lên trên
    let end = bestLineIndex; // con trỏ mở rộng xuống dưới
    let length = 0; // tổng độ dài đã chọn

    // Closure thêm một dòng vào selected nếu chưa vượt ngân sách. `prepend = true`
    // (tham số mặc định) → chèn đầu (unshift) cho dòng phía trên; ngược lại push.
    // Trả về true nếu thêm được (dùng để biết còn chỗ không).
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

    addLine(lines[bestLineIndex] ?? ''); // bắt đầu từ dòng khớp nhất
    // Mở rộng đối xứng hai phía cho tới khi hết dòng hoặc không thêm được nữa.
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
      if (!added) break; // cả hai phía đều đầy → dừng
    }

    return selected.join('\n');
  }

  // ==========================================================================
  // isNumberedSectionLead — block có phải DÒNG MỞ ĐẦU một section đánh số không
  // ==========================================================================
  private isNumberedSectionLead(block: string): boolean {
    return this.numberedSectionLead(block) !== null;
  }

  // ==========================================================================
  // numberedSectionLead — nếu block mở đầu section đánh số, trả về SỐ đó (string)
  // --------------------------------------------------------------------------
  // Bỏ qua block bắt đầu bằng '[' (đó là nhãn cấu trúc [SECTION:...] của trích
  // xuất, không phải tiêu đề section do người dùng đánh số). Regex `^(...)\s+(\d+)\b`
  // khớp từ khóa section ở ĐẦU chuỗi + một số; `?.[2]` lấy nhóm bắt thứ 2 (con số).
  // ==========================================================================
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

  // ==========================================================================
  // collectSectionBlocks — gom các block THUỘC một section (từ startIndex)
  // --------------------------------------------------------------------------
  // Bắt đầu từ block mở đầu section, tiếp tục gộp các block SAU cho tới khi: gặp
  // một section mới (dòng mở đầu đánh số khác), hoặc vượt ngân sách. Nhờ đó lấy
  // trọn vẹn một section thay vì chỉ dòng tiêu đề.
  // ==========================================================================
  private collectSectionBlocks(blocks: string[], startIndex: number): string {
    const selected: string[] = [];
    let totalLength = 0;

    for (let index = startIndex; index < blocks.length; index += 1) {
      const block = blocks[index];
      // Gặp section mới (không phải block bắt đầu) → dừng.
      if (index > startIndex && this.isNumberedSectionLead(block)) {
        break;
      }

      const nextLength = totalLength + block.length + 2; // +2 cho '\n\n'
      // Đã có ít nhất 1 block và thêm nữa sẽ vượt ngân sách → dừng.
      if (selected.length > 0 && nextLength > PROMPT_CONTEXT_LIMIT) {
        break;
      }

      selected.push(block);
      totalLength = nextLength;
    }

    return selected.join('\n\n');
  }

  // ==========================================================================
  // toSourceSnippet — tạo SNIPPET hiển thị (gọn 1 dòng, ≤ CITATION_SNIPPET_LIMIT)
  // --------------------------------------------------------------------------
  // Có câu hỏi → ưu tiên đoạn quanh dòng khớp nhất; không có → lấy đầu văn bản.
  // `.replace(/\s+/g, ' ')` gộp mọi khoảng trắng/xuống dòng thành 1 dấu cách.
  // ==========================================================================
  private toSourceSnippet(text: string, question?: string): string {
    const relevantSnippet = question
      ? this.extractRelevantSnippetText(text, question)
      : '';
    const snippetSource = relevantSnippet || text; // rỗng thì lùi về nguyên văn

    return snippetSource.replace(/\s+/g, ' ').slice(0, CITATION_SNIPPET_LIMIT);
  }

  // ==========================================================================
  // extractRelevantSnippetText — lấy CỬA SỔ dòng quanh dòng khớp nhất (cho snippet)
  // --------------------------------------------------------------------------
  // Chấm điểm từng DÒNG, chọn dòng cao điểm nhất, lấy 2 dòng trước + 3 dòng sau
  // (bestIndex-2 .. bestIndex+4) làm ngữ cảnh xem trước ngắn gọn.
  // ==========================================================================
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
        return left.index - right.index; // hòa điểm → dòng trước ưu tiên
      });

    if (scored.length === 0) {
      return ''; // không dòng nào khớp → để hàm gọi lùi về nguyên văn
    }

    const bestIndex = scored[0].index;
    // `Math.max(0, ...)` / `Math.min(lines.length, ...)` : chặn biên mảng (không
    // âm, không vượt độ dài) khi mở cửa sổ quanh dòng khớp.
    const start = Math.max(0, bestIndex - 2);
    const end = Math.min(lines.length, bestIndex + 4);

    return lines.slice(start, end).join('\n');
  }

  // ==========================================================================
  // passageScore — CHẤM ĐIỂM mức khớp của một đoạn/dòng với các từ khóa
  // --------------------------------------------------------------------------
  // +0.08 nếu (khi hỏi về bảng) có nhãn cấu trúc table/section/page/slide/sheet;
  // +0.1 mỗi từ khóa khớp. Số thuần (isNumericIdentifier) CHỈ tính khi khớp như
  // token nguyên, không tính khớp chuỗi con (tránh "3" khớp bừa trong "1234").
  // ==========================================================================
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
      const isNumericIdentifier = /^[0-9]+$/.test(term); // từ là số thuần?
      if (
        tokens.has(term) || // khớp token nguyên
        (!isNumericIdentifier && normalized.includes(term)) // hoặc khớp chuỗi con (trừ số)
      ) {
        score += 0.1;
      }
    }

    return score;
  }

  // ==========================================================================
  // isStructuredText — chunk có phải văn bản CÓ CẤU TRÚC (bảng/trang/slide...) không
  // --------------------------------------------------------------------------
  // Nhận diện qua nhãn `[SECTION:`/`[TABLE:`/`[PAGE:`/`[SLIDE:`/`[SHEET:`/`[ROW:`
  // do bộ trích xuất chèn khi tài liệu có cấu trúc.
  // ==========================================================================
  private isStructuredText(value: string): boolean {
    return /\[(?:SECTION|TABLE|PAGE|SLIDE|SHEET|ROW):/.test(value);
  }

  // ==========================================================================
  // tokenizeWithUnderscores — như tokenize nhưng GIỮ dấu '_' (cho identifier)
  // --------------------------------------------------------------------------
  // Nhờ giữ '_', identifier như "user_id" không bị vỡ thành "user"/"id", giúp
  // khớp chính xác tên biến/bảng/cột trong câu hỏi kỹ thuật.
  // ==========================================================================
  private tokenizeWithUnderscores(value: string): string[] {
    return [
      ...new Set(
        this.normalizeWithUnderscores(value)
          .split(' ')
          .filter((token) => this.isSearchToken(token)),
      ),
    ];
  }

  // ==========================================================================
  // normalizeWithUnderscores — chuẩn hóa giống normalize NHƯNG giữ lại '_'
  // --------------------------------------------------------------------------
  // Khác biệt duy nhất so với normalize(): lớp lọc ký tự cho phép thêm '_' (dùng
  // `[^a-z0-9_]+`). Mọi bước còn lại (hạ chữ thường, đổi 'đ'→'d', tách + bỏ dấu
  // tiếng Việt bằng NFD, gộp khoảng trắng, trim) giống hệt normalize().
  // ==========================================================================
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
