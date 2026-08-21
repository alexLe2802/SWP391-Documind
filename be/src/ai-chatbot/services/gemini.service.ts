// ============================================================================
// MF3 — GeminiService: client HTTP gọi Google Gemini API
// ----------------------------------------------------------------------------
// File này là "tầng hạ nguồn" của pipeline RAG (Retrieval-Augmented Generation).
// Sau khi tầng trên (AiChatbotService + PromptBuilderService) đã dựng xong prompt
// và ngữ cảnh, service này chịu trách nhiệm THỰC SỰ gọi mạng tới Gemini để:
//   1) generateEmbedding : biến 1 đoạn text thành vector số (768 chiều) dùng cho
//      vector search (pgvector) trong chặng Retrieve.
//   2) generateReply     : sinh câu trả lời (chặng Generate).
//
// Điểm cốt lõi cần nắm ở file này (mang tính "chống chịu lỗi" cho hệ thống thật):
//   - FAILOVER NHIỀU API KEY: nếu 1 key hết quota (HTTP 429) → tự chuyển sang key
//     khác, và đánh dấu key vừa lỗi "nghỉ" (cooldown) một khoảng thời gian.
//   - FAILOVER NHIỀU MODEL: nếu 1 model lỗi/timeout/rỗng → thử model dự phòng.
//   - GeminiSafeResponse: generateReply KHÔNG ném lỗi ra ngoài, mà luôn trả về
//     một OBJECT mô tả kết quả (success:true/false + errorCode). Nhờ vậy tầng trên
//     không cần try/catch dày đặc và luôn có thể hiển thị fallback thân thiện.
//   - AbortController + timeout: hủy request nếu Gemini phản hồi quá lâu.
//   - Mock mode: khi bật cờ GEMINI_MOCK, trả câu trả lời giả (test không tốn quota).
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getNextMockResponse } from '../mocks/mock-ai-response';

// GeminiContent: hình dạng 1 "lượt" trong hội thoại gửi lên Gemini.
//   - `role: 'user' | 'model'` : union type — chỉ nhận đúng 2 chuỗi này.
//     'user' = tin người dùng, 'model' = tin do AI đã trả lời trước đó (lịch sử).
//   - `parts: Array<{ text: string }>` : nội dung dạng mảng các phần văn bản
//     (Gemini cho phép nhiều part; ở đây ta chỉ dùng text). Đây đúng cấu trúc
//     mà REST API generateContent của Gemini yêu cầu.
export interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

// GeminiErrorCode: bảng mã lỗi chuẩn hóa của service (union type các literal).
// Thay vì để lộ lỗi kỹ thuật thô, ta quy mọi sự cố về đúng 1 trong các mã dưới
// đây, giúp tầng trên dịch sang thông báo tiếng Việt thân thiện cho người dùng:
//   - GEMINI_MISSING_API_KEY : chưa cấu hình khóa Gemini.
//   - GEMINI_NETWORK_ERROR   : lỗi mạng (DNS, mất kết nối...).
//   - GEMINI_TIMEOUT         : gọi quá lâu → bị hủy bởi timeout.
//   - GEMINI_RATE_LIMIT      : bị giới hạn tần suất / hết quota (HTTP 429).
//   - GEMINI_INVALID_RESPONSE: Gemini trả về rỗng / sai định dạng.
//   - GEMINI_API_ERROR       : Gemini trả HTTP lỗi khác (4xx/5xx ngoài 429).
//   - GEMINI_UNKNOWN_ERROR   : lỗi không phân loại được.
export type GeminiErrorCode =
  | 'GEMINI_MISSING_API_KEY'
  | 'GEMINI_NETWORK_ERROR'
  | 'GEMINI_TIMEOUT'
  | 'GEMINI_RATE_LIMIT'
  | 'GEMINI_INVALID_RESPONSE'
  | 'GEMINI_API_ERROR'
  | 'GEMINI_UNKNOWN_ERROR';

// GeminiSafeResponse: kiểu trả về "an toàn" của generateReply.
// TRIẾT LÝ THIẾT KẾ: thay vì `throw` khi có lỗi (buộc mọi nơi gọi phải try/catch),
// service gói kết quả — dù thành công hay thất bại — vào 1 object thống nhất.
//   - success      : true nếu tạo được câu trả lời; false nếu thất bại.
//   - answer       : nội dung trả lời (khi thất bại là câu xin lỗi mặc định).
//   - errorCode    : mã lỗi (một GeminiErrorCode) khi success=false, ngược lại null.
//   - errorMessage : mô tả lỗi kỹ thuật để log; null khi thành công.
//   - isMock       : câu trả lời này có phải do mock mode sinh ra không.
//   - finishReason?: lý do Gemini kết thúc sinh (vd 'STOP', 'MAX_TOKENS').
//     Dấu `?` = optional (có thể vắng mặt).
//   - truncated?   : true khi câu trả lời bị CẮT do chạm trần token (MAX_TOKENS)
//     → tầng trên dựa vào cờ này để gợi ý người dùng hỏi "tiếp tục".
export interface GeminiSafeResponse {
  success: boolean;
  answer: string;
  errorCode: GeminiErrorCode | null;
  errorMessage: string | null;
  isMock: boolean;
  finishReason?: string | null;
  truncated?: boolean;
}

// GeminiReplyOptions: tùy chọn cho 1 lần gọi generateReply.
//   - timeoutMs? : cho phép caller ghi đè thời gian chờ mặc định (vd câu hỏi
//     "toàn bộ tài liệu" cần thời gian sinh lâu hơn nên nới timeout).
export interface GeminiReplyOptions {
  timeoutMs?: number;
}

// GeminiGenerateContentResponse: hình dạng JSON thô mà endpoint generateContent
// của Gemini trả về (được rút gọn còn các trường ta thực sự đọc).
// Tất cả trường đều `?` (optional) vì API có thể trả thiếu → luôn phải phòng thủ
// bằng optional chaining `?.` khi bóc tách dữ liệu bên trong.
//   - candidates[]        : danh sách phương án trả lời (ta chỉ dùng phần tử [0]).
//   - finishReason        : lý do dừng sinh của phương án đó.
//   - content.parts[].text: các mảnh văn bản ghép lại thành câu trả lời.
interface GeminiGenerateContentResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

// `@Injectable()` : decorator của NestJS đánh dấu class này là 1 "provider" có thể
// được tiêm (inject) vào nơi khác qua Dependency Injection.
@Injectable()
export class GeminiService {
  // --- Hằng cấu hình mặc định (readonly = chỉ gán 1 lần, không đổi sau đó) ---
  private readonly defaultModel = 'gemini-2.5-flash'; // model dùng nếu env không set
  private readonly defaultTimeoutMs = 15_000; // 15 giây (dấu `_` chỉ để dễ đọc số)
  private readonly defaultMaxOutputTokens = 4096; // trần token đầu ra mặc định
  private readonly endpointBase =
    'https://generativelanguage.googleapis.com/v1beta/models'; // gốc URL REST của Gemini
  private readonly logger = new Logger(GeminiService.name);

  // preferredApiKeyIndex: NHỚ key nào vừa dùng thành công lần trước để ưu tiên
  // dùng lại (tránh cứ bắt đầu lại từ key #0 mỗi lần). KHÔNG readonly vì có cập nhật.
  private preferredApiKeyIndex = 0;

  // quotaCooldownMs: khi 1 key dính 429 (hết quota), cho key đó "nghỉ" 60 giây
  // trước khi được thử lại — tránh gọi lặp vào key đang bị chặn.
  private readonly quotaCooldownMs = 60_000;

  // quotaCooldownUntil: Map<apiKey, mốc-thời-gian-hết-cooldown (ms)>.
  //   - `Map` là cấu trúc key→value; ở đây key = chuỗi API key, value = timestamp
  //     (Date.now()) mà tại đó key được phép dùng lại. Còn nhỏ hơn now = đang nghỉ.
  private readonly quotaCooldownUntil = new Map<string, number>();

  // constructor: NestJS tự động tiêm ConfigService (đọc biến môi trường / .env).
  // `private readonly configService` vừa khai báo tham số vừa tạo luôn thuộc tính.
  constructor(private readonly configService: ConfigService) {}

  // ==========================================================================
  // generateEmbedding — Tạo vector embedding cho 1 đoạn text (chặng Retrieve)
  // --------------------------------------------------------------------------
  // Input : text (chuỗi cần vector hóa — thường là câu hỏi hoặc 1 chunk tài liệu).
  // Output: Promise<number[]> — mảng số thực (768 chiều) đại diện ngữ nghĩa text.
  //         Vector này dùng để so khớp độ tương đồng khi vector search.
  // Lưu ý: hàm này DÙNG `throw` (không dùng GeminiSafeResponse) vì embedding là
  //        bước bắt buộc — nếu hỏng thì cả pipeline nên dừng để tầng trên xử lý.
  // ==========================================================================
  async generateEmbedding(text: string): Promise<number[]> {
    // Không có API key nào → không thể gọi → ném lỗi ngay.
    if (this.getApiKeys().length === 0) {
      throw new Error('Gemini API key is not configured.');
    }

    // Gọi qua withApiKeyFailover: nếu key đang dùng bị 429, tự xoay sang key khác.
    // Tham số là 1 arrow function nhận `apiKey` và trả về công việc thật sự.
    return this.withApiKeyFailover((apiKey) =>
      this.invokeEmbedding(text, apiKey),
    );
  }

  // ==========================================================================
  // invokeEmbedding — 1 LẦN gọi HTTP tới endpoint embedContent (dùng 1 key cụ thể)
  // --------------------------------------------------------------------------
  // Đây là "công việc thật" mà withApiKeyFailover gọi lại với từng apiKey.
  // Input : text + apiKey. Output: Promise<number[]> (vector 768 chiều).
  // ==========================================================================
  private async invokeEmbedding(
    text: string,
    apiKey: string,
  ): Promise<number[]> {
    const model = 'gemini-embedding-001'; // model chuyên tạo embedding
    // Template literal (dấu backtick ``): nội suy biến bằng ${...} để ghép URL.
    const url = `${this.endpointBase}/${model}:embedContent`;

    // `fetch` : API gọi HTTP có sẵn (trả Promise<Response>); `await` chờ phản hồi.
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey, // key xác thực đặt ở header (không lộ trên URL)
      },
      // JSON.stringify: chuyển object JS thành chuỗi JSON để gửi làm body.
      body: JSON.stringify({
        content: {
          // `{ text }` là shorthand cho `{ text: text }`.
          parts: [{ text }],
        },
        // Must match the vector(768) column on document_chunks.
        // Bắt buộc = 768 để khớp cột vector(768) trong bảng document_chunks.
        outputDimensionality: 768,
      }),
    });

    // `response.ok` = true nếu status 2xx. Nếu không ok → chuẩn hóa thành lỗi service.
    if (!response.ok) {
      // Toán tử ba ngôi: 429 → coi là hết quota (RATE_LIMIT), còn lại → API_ERROR.
      // Phân biệt này quan trọng vì chỉ RATE_LIMIT mới kích hoạt cooldown + đổi key.
      throw new GeminiServiceError(
        response.status === 429 ? 'GEMINI_RATE_LIMIT' : 'GEMINI_API_ERROR',
        `Gemini Embedding API returned HTTP ${response.status}.`,
      );
    }

    // `as { ... }` : type assertion — ép kiểu JSON thô để TypeScript biết hình dạng.
    const result = (await response.json()) as {
      embedding?: {
        values?: number[];
      };
    };

    // Optional chaining `?.` : nếu embedding vắng thì values = undefined (không lỗi).
    const embedding = result.embedding?.values;
    if (!embedding) {
      throw new Error('No embedding returned from Gemini');
    }

    return embedding;
  }

  // ==========================================================================
  // generateReply — Sinh câu trả lời từ Gemini (chặng Generate của RAG)
  // --------------------------------------------------------------------------
  // Input :
  //   - contents          : mảng lượt hội thoại (lịch sử + lượt hỏi mới grounded).
  //   - systemInstruction : "luật chơi" cho AI (SECURITY/ANSWER RULES) — do
  //                          PromptBuilderService dựng.
  //   - options?          : tùy chọn (vd timeoutMs).
  // Output: Promise<GeminiSafeResponse> — LUÔN trả object, KHÔNG throw ra ngoài.
  //         Đây chính là điểm khác biệt với invokeEmbedding: sinh câu trả lời có
  //         thể hỏng vì nhiều lý do vận hành, nên ta "nuốt" lỗi và báo qua object
  //         để tầng trên hiển thị fallback thay vì làm sập request.
  // ==========================================================================
  async generateReply(
    contents: GeminiContent[],
    systemInstruction: string,
    options?: GeminiReplyOptions,
  ): Promise<GeminiSafeResponse> {
    // [BƯỚC 1] Mock mode: nếu bật cờ GEMINI_MOCK, trả câu trả lời giả lập ngay
    // (dùng khi dev/test để không tốn quota và cho kết quả tất định).
    if (this.isMockMode()) {
      this.logger.debug('[MOCK] Returning a canned Gemini response');
      return this.success(getNextMockResponse(), true); // isMock = true
    }

    // [BƯỚC 2] Không cấu hình key nào → trả lỗi mềm GEMINI_MISSING_API_KEY.
    if (this.getApiKeys().length === 0) {
      this.logger.warn('Gemini API key is missing while mock mode is disabled');
      return this.failure(
        'GEMINI_MISSING_API_KEY',
        'Gemini API key is not configured.',
      );
    }

    // [BƯỚC 3] Gọi thật, bọc trong 2 lớp failover LỒNG NHAU:
    //   - Lớp NGOÀI  withModelFailover : lặp qua danh sách model (model chính +
    //     các model dự phòng). Nếu 1 model lỗi → thử model kế tiếp.
    //   - Lớp TRONG  withApiKeyFailover: với MỖI model, lại lặp qua các API key
    //     còn khả dụng (chưa bị cooldown). Nếu key dính 429 → xoay sang key khác.
    //   => Tổ hợp: mỗi (model) sẽ được thử với các (key) sẵn có trước khi bỏ cuộc.
    try {
      const response = await this.withModelFailover((model) =>
        this.withApiKeyFailover((apiKey) =>
          this.invokeGemini(
            contents,
            systemInstruction,
            apiKey,
            model,
            options,
          ),
        ),
      );
      // Thành công: gói lại thành GeminiSafeResponse (kèm finishReason để biết
      // câu trả lời có bị cắt do MAX_TOKENS không).
      return this.success(response.answer, false, response.finishReason);
    } catch (error) {
      // [BƯỚC 4] Mọi lỗi (kể cả sau khi failover cạn phương án) được quy về 1
      // GeminiSafeResponse success:false qua handleError — KHÔNG ném ra ngoài.
      return this.handleError(error);
    }
  }

  // ==========================================================================
  // invokeGemini — 1 LẦN gọi HTTP generateContent với 1 (model, apiKey) cụ thể
  // --------------------------------------------------------------------------
  // Đây là "công việc thật" nằm trong lõi của 2 lớp failover. Ném GeminiServiceError
  // khi lỗi để các lớp failover ở trên quyết định có thử tiếp hay không.
  // Output: Promise<GeminiGenerateContentResponse> (JSON thô của Gemini).
  // ==========================================================================
  private async invokeGemini(
    contents: GeminiContent[],
    systemInstruction: string,
    apiKey: string,
    model: string,
    options?: GeminiReplyOptions,
  ): Promise<GeminiGenerateContentResponse> {
    // AbortController: cơ chế chuẩn của trình duyệt/Node để HỦY 1 request đang chạy.
    // `controller.signal` được truyền vào fetch; gọi `controller.abort()` (khi hết
    // timeout) sẽ làm fetch ném AbortError → ta bắt lại và quy về GEMINI_TIMEOUT.
    const controller = new AbortController();

    try {
      const response = await this.fetchWithTimeout(
        this.buildUrl(model), // ghép URL generateContent cho đúng model này
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents, // lịch sử + lượt hỏi
            // systemInstruction phải bọc theo cấu trúc { parts: [{ text }] } của API.
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              // temperature thấp (0.2) → câu trả lời ổn định, ít "bịa", bám nguồn.
              temperature: 0.2,
              maxOutputTokens: this.getMaxOutputTokens(), // trần độ dài đầu ra
            },
          }),
          signal: controller.signal, // gắn signal để có thể abort khi timeout
        },
        controller,
        options,
      );

      if (!response.ok) {
        // 429 → RATE_LIMIT (kích hoạt cooldown + xoay key); còn lại → API_ERROR.
        throw new GeminiServiceError(
          response.status === 429 ? 'GEMINI_RATE_LIMIT' : 'GEMINI_API_ERROR',
          this.toHttpErrorMessage(response.status),
        );
      }

      return (await response.json()) as GeminiGenerateContentResponse;
    } catch (error) {
      // Nếu lỗi là do abort (timeout) → dịch thành GEMINI_TIMEOUT cho rõ nghĩa.
      if (this.isAbortError(error)) {
        throw new GeminiServiceError(
          'GEMINI_TIMEOUT',
          'Gemini request timed out.',
        );
      }

      // Lỗi khác → ném nguyên trạng để lớp trên (failover/handleError) xử lý.
      throw error;
    }
  }

  // ==========================================================================
  // fetchWithTimeout — Gọi fetch nhưng tự hủy nếu quá thời gian cho phép
  // --------------------------------------------------------------------------
  // Kỹ thuật: đua (race) giữa 2 Promise — Promise fetch thật, và Promise "hẹn giờ".
  // Ai xong/ném trước thì thắng. Nếu timer nổ trước → abort fetch + ném TIMEOUT.
  // ==========================================================================
  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    controller: AbortController,
    options?: GeminiReplyOptions,
  ): Promise<Response> {
    // Giữ handle của setTimeout để dọn dẹp ở finally (tránh rò rỉ timer).
    let timeout: NodeJS.Timeout | undefined;

    try {
      // Promise.race([...]): trả về kết quả của Promise nào settle (resolve/reject)
      // ĐẦU TIÊN trong mảng.
      return await Promise.race([
        fetch(url, init), // (a) request thật
        // (b) Promise<never>: chỉ dùng để REJECT khi hết giờ (never = không bao giờ
        // resolve giá trị bình thường). Tham số `(_ , reject)`: bỏ qua resolve (đặt
        // tên `_`), chỉ dùng reject.
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort(); // hủy request (a) đang treo
            reject(
              new GeminiServiceError(
                'GEMINI_TIMEOUT',
                'Gemini request timed out.',
              ),
            );
          }, this.getTimeoutMs(options)); // thời hạn chờ (ms)
        }),
      ]);
    } finally {
      // finally luôn chạy dù thành công hay lỗi → dọn timer nếu fetch về trước.
      if (timeout) clearTimeout(timeout);
    }
  }

  // ==========================================================================
  // withModelFailover — FAILOVER NHIỀU MODEL (lớp ngoài)
  // --------------------------------------------------------------------------
  // Input : operation — hàm nhận 1 `model` (chuỗi) và thực hiện gọi Gemini.
  //         `operation` chính là toàn bộ withApiKeyFailover(...) đã bọc bên trong.
  // Cơ chế: lần lượt thử model chính rồi tới các model dự phòng. Chỉ chuyển model
  //         khi lỗi thuộc loại "đáng thử model khác" (xem canTryFallbackModel).
  // Output: { answer, finishReason } — câu trả lời + lý do dừng của model thắng.
  // ==========================================================================
  private async withModelFailover(
    operation: (model: string) => Promise<GeminiGenerateContentResponse>,
  ): Promise<{ answer: string; finishReason: string | null }> {
    const models = this.getModels(); // [model chính, ...model dự phòng] đã khử trùng
    let lastError: unknown; // nhớ lỗi cuối để ném nếu cạn phương án

    // Vòng lặp qua từng model theo thứ tự ưu tiên.
    for (let index = 0; index < models.length; index += 1) {
      try {
        const response = await operation(models[index]); // gọi thật với model này
        const answer = this.extractAnswer(response); // bóc text ra khỏi JSON
        // Model trả về nhưng RỖNG → coi là INVALID_RESPONSE để có thể thử model kế.
        if (!answer) {
          throw new GeminiServiceError(
            'GEMINI_INVALID_RESPONSE',
            'Gemini returned an empty response.',
          );
        }

        return {
          answer,
          // Optional chaining + nullish coalescing: lấy finishReason của ứng viên
          // đầu tiên; nếu vắng thì dùng null. `??` chỉ thay khi giá trị là null/undefined.
          finishReason: response.candidates?.[0]?.finishReason ?? null,
        };
      } catch (error) {
        lastError = error;
        // Dừng failover nếu: (a) lỗi KHÔNG thuộc loại nên thử model khác, HOẶC
        // (b) đây đã là model cuối cùng. Khi đó ném lỗi ra cho generateReply.
        if (!this.canTryFallbackModel(error) || index === models.length - 1) {
          throw error;
        }
        // Ngược lại: ghi log và để vòng lặp chuyển sang model kế tiếp.
        this.logger.warn(
          `Gemini model ${models[index]} failed; trying fallback model ${models[index + 1]}.`,
        );
      }
    }

    // Về lý thuyết không tới đây (vòng lặp đã return/throw), nhưng để an toàn kiểu.
    throw lastError;
  }

  // ==========================================================================
  // canTryFallbackModel — Lỗi này có ĐÁNG chuyển sang model khác không?
  // --------------------------------------------------------------------------
  // CHỈ nên đổi model với các lỗi có khả năng model khác xử lý được: lỗi API,
  // timeout, phản hồi rỗng, hoặc lỗi mạng. KHÔNG đổi model với lỗi như RATE_LIMIT
  // (đó là vấn đề của KEY, không phải của model → đã xử lý ở lớp key failover).
  // ==========================================================================
  private canTryFallbackModel(error: unknown): boolean {
    // `instanceof` : kiểm tra error có phải đối tượng GeminiServiceError không
    // (nhờ đó TypeScript "thu hẹp kiểu" và cho phép truy cập error.code).
    if (error instanceof GeminiServiceError) {
      return [
        'GEMINI_API_ERROR',
        'GEMINI_TIMEOUT',
        'GEMINI_INVALID_RESPONSE',
      ].includes(error.code);
    }

    return this.isNetworkError(error);
  }

  // buildUrl — Ghép URL endpoint generateContent cho 1 model.
  // encodeURIComponent: mã hóa an toàn tên model (phòng ký tự đặc biệt trong URL).
  private buildUrl(modelName: string): string {
    const model = encodeURIComponent(modelName);
    return `${this.endpointBase}/${model}:generateContent`;
  }

  // ==========================================================================
  // extractAnswer — Bóc chuỗi câu trả lời ra khỏi JSON thô của Gemini
  // --------------------------------------------------------------------------
  // Vì mọi tầng của JSON đều có thể vắng, ta dùng chuỗi optional chaining `?.`
  // để không bị lỗi "Cannot read property of undefined". Trả '' nếu không có text.
  // ==========================================================================
  private extractAnswer(
    response: GeminiGenerateContentResponse | null,
  ): string {
    if (!response || typeof response !== 'object') {
      return '';
    }

    return (
      // Lấy candidates[0].content.parts (nếu tồn tại), rồi:
      response.candidates?.[0]?.content?.parts
        ?.map((part) => part.text?.trim() ?? '') // mỗi part → text đã trim (hoặc '')
        .filter(Boolean) // bỏ các phần rỗng (Boolean('') = false)
        .join('\n') // nối các phần bằng xuống dòng
        .trim() ?? '' // nếu cả chuỗi optional trên = undefined thì trả ''
    );
  }

  // isMockMode — Có đang bật chế độ mock (trả lời giả) không?
  // `?? false` : nếu env GEMINI_MOCK chưa set (undefined) thì mặc định là false.
  private isMockMode(): boolean {
    return this.configService.get<boolean>('GEMINI_MOCK') ?? false;
  }

  // getModel — Lấy model chính: ưu tiên env GEMINI_MODEL, không có → defaultModel.
  // `A || B` : nếu A rỗng/falsy ('' ) thì dùng B.
  private getModel(): string {
    return this.getStringConfig('GEMINI_MODEL') || this.defaultModel;
  }

  // ==========================================================================
  // getModels — Dựng danh sách model theo thứ tự ưu tiên cho failover
  // --------------------------------------------------------------------------
  // Kết quả = [model chính, ...các model dự phòng từ GEMINI_FALLBACK_MODELS].
  // Chuỗi phương thức xử lý mảng:
  //   - spread `...arr.split(',')` : tách chuỗi "a,b,c" thành mảng rồi trải vào.
  //   - .map(trim)                 : bỏ khoảng trắng thừa quanh mỗi tên.
  //   - .filter(Boolean)           : loại phần tử rỗng.
  //   - .filter(...indexOf...===index) : KHỬ TRÙNG LẶP (giữ lần xuất hiện đầu tiên),
  //     tránh thử lại cùng một model hai lần.
  // ==========================================================================
  private getModels(): string[] {
    return [
      this.getModel(),
      ...this.getStringConfig('GEMINI_FALLBACK_MODELS').split(','),
    ]
      .map((model) => model.trim())
      .filter(Boolean)
      .filter((model, index, models) => models.indexOf(model) === index);
  }

  // ==========================================================================
  // getTimeoutMs — Chọn thời gian chờ (ms) theo thứ tự ưu tiên
  // --------------------------------------------------------------------------
  // Ưu tiên: options.timeoutMs (caller truyền) → env GEMINI_TIMEOUT_MS → mặc định.
  // Mỗi mức đều kiểm tra "là số nguyên > 0" trước khi chấp nhận (phòng dữ liệu bẩn).
  // ==========================================================================
  private getTimeoutMs(options?: GeminiReplyOptions): number {
    if (
      typeof options?.timeoutMs === 'number' &&
      Number.isInteger(options.timeoutMs) &&
      options.timeoutMs > 0
    ) {
      return options.timeoutMs;
    }

    const timeout = this.configService.get<number>('GEMINI_TIMEOUT_MS');
    if (
      typeof timeout === 'number' &&
      Number.isInteger(timeout) &&
      timeout > 0
    ) {
      return timeout;
    }

    return this.defaultTimeoutMs; // không có cấu hình hợp lệ → dùng mặc định 15s
  }

  // getMaxOutputTokens — Trần token đầu ra, đọc từ env (chấp nhận cả số lẫn chuỗi).
  //   - `typeof configured === 'number' ? configured : Number(configured)` :
  //     nếu env đã là số thì dùng luôn, nếu là chuỗi "4096" thì Number(...) đổi sang số.
  //   - Chỉ nhận khi là số nguyên dương, ngược lại về defaultMaxOutputTokens.
  private getMaxOutputTokens(): number {
    const configured = this.configService.get<string | number>(
      'GEMINI_MAX_OUTPUT_TOKENS',
    );
    const parsed =
      typeof configured === 'number' ? configured : Number(configured);
    return Number.isInteger(parsed) && parsed > 0
      ? parsed
      : this.defaultMaxOutputTokens;
  }

  // getStringConfig — Đọc 1 biến cấu hình dạng chuỗi, đã trim; thiếu → trả '' .
  // `?.trim()` chỉ chạy nếu giá trị không null/undefined; `?? ''` để luôn ra chuỗi.
  private getStringConfig(key: string): string {
    return this.configService.get<string>(key)?.trim() ?? '';
  }

  // ==========================================================================
  // getApiKeys — Gom TẤT CẢ API key khả dụng thành 1 danh sách đã khử trùng lặp
  // --------------------------------------------------------------------------
  // Hỗ trợ 2 nguồn: GEMINI_API_KEY (1 key) + GEMINI_API_KEYS (nhiều key, ngăn bởi
  // dấu phẩy). Nhiều key = nền tảng cho cơ chế failover khi 1 key hết quota.
  //   - `[...new Set(keys)]` : Set tự loại phần tử trùng; spread trải Set về mảng.
  // ==========================================================================
  private getApiKeys(): string[] {
    const keys = [
      this.getStringConfig('GEMINI_API_KEY'),
      ...this.getStringConfig('GEMINI_API_KEYS').split(','),
    ]
      .map((key) => key.trim())
      .filter(Boolean);

    return [...new Set(keys)];
  }

  // ==========================================================================
  // withApiKeyFailover — FAILOVER NHIỀU API KEY (lớp trong) + quản lý cooldown
  // --------------------------------------------------------------------------
  // Generic `<T>`: hàm này dùng lại được cho cả embedding (T = number[]) lẫn gọi
  // generateContent (T = GeminiGenerateContentResponse). `operation` là công việc
  // thật, nhận 1 apiKey và trả Promise<T>.
  //
  // Ý tưởng:
  //   1) Lọc ra các key CÒN KHẢ DỤNG (chưa trong thời gian cooldown do 429 trước đó).
  //   2) Nếu không còn key nào khả dụng → ném RATE_LIMIT ngay.
  //   3) Thử lần lượt các key khả dụng, BẮT ĐẦU từ key ưu tiên (đã thành công gần
  //      nhất) để tận dụng "sự nóng" của key đó, rồi xoay vòng.
  //   4) Nếu 1 key dính 429 → đặt cooldown cho nó rồi thử key tiếp theo.
  //   5) Lỗi KHÁC 429 → ném ra ngay (không phải vấn đề quota, đổi key vô nghĩa).
  // ==========================================================================
  private async withApiKeyFailover<T>(
    operation: (apiKey: string) => Promise<T>,
  ): Promise<T> {
    const keys = this.getApiKeys();
    const now = Date.now(); // mốc thời gian hiện tại (ms) để so với cooldown

    // [BƯỚC 1] Tìm CHỈ SỐ (index) của các key chưa bị cooldown.
    //   - .map(key,index → {key,index}) : giữ kèm index để sau còn định vị.
    //   - .filter : giữ key mà mốc hết-cooldown (mặc định 0 nếu chưa có) <= now
    //     → tức đã hết thời gian nghỉ, dùng được.
    //   - .map({index} → index) : chỉ lấy lại index.
    const availableIndices = keys
      .map((key, index) => ({ key, index }))
      .filter(({ key }) => (this.quotaCooldownUntil.get(key) ?? 0) <= now)
      .map(({ index }) => index);

    // [BƯỚC 2] Mọi key đều đang cooldown → không thể gọi → báo RATE_LIMIT.
    if (availableIndices.length === 0) {
      throw new GeminiServiceError(
        'GEMINI_RATE_LIMIT',
        'All configured Gemini keys are temporarily rate-limited.',
      );
    }

    let lastError: unknown;

    // [BƯỚC 3] Duyệt các key khả dụng theo kiểu xoay vòng bắt đầu từ key ưu tiên.
    for (let offset = 0; offset < availableIndices.length; offset += 1) {
      // Vị trí muốn thử = (preferredApiKeyIndex + offset) chia lấy dư theo tổng số
      // key (toán tử `%` để xoay vòng). Nếu vị trí đó nằm trong danh sách khả dụng
      // thì dùng, ngược lại (đã bị cooldown) `?? availableIndices[offset]` chọn tạm
      // 1 key khả dụng khác.
      const index =
        availableIndices.find(
          (candidate) =>
            candidate === (this.preferredApiKeyIndex + offset) % keys.length,
        ) ?? availableIndices[offset];
      try {
        const result = await operation(keys[index]);
        // Thành công → GHI NHỚ key này làm key ưu tiên cho lần sau.
        this.preferredApiKeyIndex = index;
        return result;
      } catch (error) {
        lastError = error;
        // [BƯỚC 4] Nếu là 429 → đặt cooldown cho key vừa lỗi (now + quotaCooldownMs).
        if (
          error instanceof GeminiServiceError &&
          error.code === 'GEMINI_RATE_LIMIT'
        ) {
          this.quotaCooldownUntil.set(
            keys[index],
            Date.now() + this.quotaCooldownMs,
          );
        }
        // [BƯỚC 5] Ném ra (dừng failover key) nếu:
        //   - KHÔNG phải GeminiServiceError, HOẶC
        //   - phải nhưng KHÔNG phải 429 (đổi key không giúp gì), HOẶC
        //   - đã là key khả dụng cuối cùng (hết phương án).
        if (
          !(error instanceof GeminiServiceError) ||
          error.code !== 'GEMINI_RATE_LIMIT' ||
          offset === availableIndices.length - 1
        ) {
          throw error;
        }
        // Còn key khác + lỗi là 429 → log và thử key kế tiếp.
        this.logger.warn(
          `Gemini quota exhausted for configured key #${index + 1}; trying the next key.`,
        );
      }
    }

    throw lastError; // an toàn kiểu; thực tế vòng lặp đã return/throw
  }

  // ==========================================================================
  // handleError — Quy MỌI lỗi về 1 GeminiSafeResponse (success:false)
  // --------------------------------------------------------------------------
  // Đây là nơi hiện thực triết lý "không throw ra ngoài" của generateReply.
  // Phân loại lỗi theo độ ưu tiên: lỗi service có mã sẵn → lỗi mạng → lỗi lạ.
  // ==========================================================================
  private handleError(error: unknown): GeminiSafeResponse {
    // Lỗi đã được phân loại sẵn (có .code) → dùng luôn mã đó.
    if (error instanceof GeminiServiceError) {
      this.logger.warn(error.message);
      return this.failure(error.code, error.message);
    }

    // Lỗi mạng (fetch ném TypeError, hoặc error có .code như 'ECONNRESET').
    if (this.isNetworkError(error)) {
      this.logger.warn('Gemini network error');
      return this.failure(
        'GEMINI_NETWORK_ERROR',
        'Gemini request failed due to a network error.',
      );
    }

    // Không nhận diện được → lỗi không xác định.
    this.logger.error('Gemini request failed unexpectedly');
    return this.failure(
      'GEMINI_UNKNOWN_ERROR',
      'Gemini request failed unexpectedly.',
    );
  }

  // ==========================================================================
  // isNetworkError — Đoán xem error có phải lỗi tầng mạng không
  // --------------------------------------------------------------------------
  // `unknown` là kiểu an toàn nhất cho error (buộc kiểm tra trước khi dùng).
  // Ta ép sang shape `{ code?, name? }` để đọc: lỗi mạng Node thường có thuộc tính
  // `code` dạng chuỗi (vd 'ENOTFOUND'), còn fetch thất bại thường ném TypeError.
  // ==========================================================================
  private isNetworkError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const maybeError = error as { code?: unknown; name?: unknown };
    return (
      typeof maybeError.code === 'string' || maybeError.name === 'TypeError'
    );
  }

  // isAbortError — error có phải do AbortController.abort() gây ra không?
  // Khi timeout gọi controller.abort(), fetch ném lỗi có name === 'AbortError'.
  private isAbortError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'AbortError'
    );
  }

  // toHttpErrorMessage — Soạn thông điệp lỗi theo mã HTTP (để ghi log/hiển thị).
  private toHttpErrorMessage(status: number): string {
    if (status === 429) {
      return 'Gemini rate limit or quota exceeded.';
    }

    return `Gemini API returned HTTP ${status}.`;
  }

  // ==========================================================================
  // success — Đóng gói 1 GeminiSafeResponse THÀNH CÔNG
  // --------------------------------------------------------------------------
  // Điểm đáng chú ý: xử lý finishReason để suy ra cờ `truncated`.
  //   - Nếu có finishReason → gắn kèm { finishReason, truncated }.
  //     `truncated = (finishReason === 'MAX_TOKENS')` : câu trả lời bị CẮT vì chạm
  //     trần token → tầng trên sẽ gợi ý người dùng hỏi "tiếp tục".
  //   - Nếu không có → completion là object rỗng {} (không thêm trường nào).
  //   - `...completion` : spread — trải các trường của completion vào object trả về.
  // ==========================================================================
  private success(
    answer: string,
    isMock: boolean,
    finishReason?: string | null,
  ): GeminiSafeResponse {
    const completion = finishReason
      ? {
          finishReason,
          truncated: finishReason === 'MAX_TOKENS',
        }
      : {};
    return {
      success: true,
      answer,
      errorCode: null,
      errorMessage: null,
      isMock,
      ...completion,
    };
  }

  // ==========================================================================
  // failure — Đóng gói 1 GeminiSafeResponse THẤT BẠI
  // --------------------------------------------------------------------------
  // answer luôn là câu xin lỗi tiếng Việt mặc định để UI vẫn có gì đó hiển thị,
  // còn errorCode/errorMessage giữ nguyên chi tiết kỹ thuật để log & phân tích.
  // ==========================================================================
  private failure(
    errorCode: GeminiErrorCode,
    errorMessage: string,
  ): GeminiSafeResponse {
    return {
      success: false,
      answer:
        'Xin lỗi, hiện tại AI chưa thể tạo câu trả lời. Vui lòng thử lại sau.',
      errorCode,
      errorMessage,
      isMock: false,
    };
  }
}

// ============================================================================
// GeminiServiceError — Lớp lỗi tùy biến MANG THEO mã lỗi (code)
// ----------------------------------------------------------------------------
// `extends Error` : kế thừa Error chuẩn để vẫn có message/stack, nhưng bổ sung
// thuộc tính `code: GeminiErrorCode`. Nhờ mã này, các lớp failover và handleError
// biết chính xác loại lỗi (vd RATE_LIMIT) để quyết định cooldown / đổi key / đổi model.
// ============================================================================
export class GeminiServiceError extends Error {
  // `readonly code` trong tham số constructor: vừa nhận vừa tạo thuộc tính chỉ-đọc.
  constructor(
    readonly code: GeminiErrorCode,
    message: string,
  ) {
    super(message); // gọi constructor của Error để set message
    this.name = GeminiServiceError.name; // đặt tên lỗi = 'GeminiServiceError'
  }
}
