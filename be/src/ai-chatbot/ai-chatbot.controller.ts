// ============================================================================
// MF3 — AI Chatbot Controller (tầng REST/HTTP)
// ----------------------------------------------------------------------------
// File này định nghĩa tất cả endpoint HTTP dưới tiền tố /chat cho tính năng
// AI Chatbot. Controller trong NestJS là "lớp cửa ngõ": nó KHÔNG chứa nghiệp vụ,
// chỉ làm 3 việc:
//   1. Nhận & định tuyến request (decorator @Post/@Get + đường dẫn).
//   2. Rút dữ liệu ra khỏi request (body/query/param) + validate qua DTO.
//   3. Uỷ thác toàn bộ logic cho AiChatbotService, rồi trả kết quả về client.
//
// Ngoài ra file này còn xử lý riêng cơ chế SSE (Server-Sent Events) để "stream"
// câu trả lời của AI về trình duyệt theo thời gian thực (xem streamAnswer bên dưới).
//
// Các nhóm import:
//   - Từ '@nestjs/common' : các decorator định tuyến & tiện ích HTTP.
//   - Từ '@nestjs/swagger': các decorator sinh tài liệu API (OpenAPI/Swagger UI),
//     chỉ ảnh hưởng tài liệu, KHÔNG đổi hành vi runtime.
// ============================================================================
import {
  Body, // @Body(): lấy phần thân (JSON) của request, ánh xạ vào DTO.
  Controller, // @Controller('chat'): đánh dấu class là controller + tiền tố route.
  Get, // @Get(): map một method sang HTTP GET.
  HttpCode, // @HttpCode(): ép mã HTTP trả về (mặc định POST là 201).
  HttpStatus, // enum chứa các mã HTTP (OK = 200, ...).
  Param, // @Param(): lấy tham số động trên URL (vd :id).
  ParseUUIDPipe, // pipe kiểm tra tham số phải là UUID hợp lệ, sai → 400.
  Post, // @Post(): map một method sang HTTP POST.
  Query, // @Query(): lấy query string (?page=1&limit=20) ánh xạ vào DTO.
  Res, // @Res(): tiêm đối tượng Response gốc của Express (dùng cho SSE).
  UseGuards, // @UseGuards(): gắn guard chạy TRƯỚC handler (chặn/kiểm tra request).
} from '@nestjs/common';
// `import type { Response }` : chỉ import KIỂU (type-only) của Response từ Express,
// dùng để khai báo kiểu tham số @Res(); `type` giúp TS xoá hẳn import này khi biên dịch.
import type { Response } from 'express';
import {
  // Các decorator @Api...Response chỉ khai báo cho Swagger biết endpoint CÓ THỂ
  // trả về mã lỗi/mã thành công nào, kèm mô tả. Chúng KHÔNG tự sinh lỗi lúc chạy.
  ApiBadRequestResponse, // tài liệu hoá phản hồi 400.
  ApiBearerAuth, // báo Swagger endpoint cần Bearer token (nút "Authorize").
  ApiBody, // mô tả/ví dụ cho request body.
  ApiConflictResponse, // tài liệu hoá phản hồi 409.
  ApiForbiddenResponse, // tài liệu hoá phản hồi 403.
  ApiNotFoundResponse, // tài liệu hoá phản hồi 404.
  ApiOkResponse, // tài liệu hoá phản hồi 200 kèm kiểu DTO.
  ApiOperation, // đặt tiêu đề/summary cho endpoint trong Swagger UI.
  ApiTags, // gom nhóm các endpoint dưới một "tag" trong Swagger UI.
  ApiUnauthorizedResponse, // tài liệu hoá phản hồi 401.
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
// @CurrentUser: custom param decorator, rút user đã xác thực từ request (do guard gắn vào).
import { CurrentUser } from '../auth/decorators/current-user.decorator';
// FirebaseAuthGuard: guard xác thực token Firebase; hợp lệ mới cho request đi tiếp.
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { ApiWrappedOkResponse } from '../common/swagger/api-wrapped-response.decorator';
import { AiChatbotService } from './ai-chatbot.service';
import { AiChatResponseDto } from './dto/ai-chat-response.dto';
import { AskDocumentDto } from './dto/ask-document.dto';
import { AskLibraryDto } from './dto/ask-library.dto';
import { ChatMessagesQueryDto } from './dto/chat-messages-query.dto';
import {
  ChatMessageListResponseDto,
  ChatSessionDetailDto,
  ChatSessionListResponseDto,
} from './dto/chat-session-response.dto';
import { ChatSessionsQueryDto } from './dto/chat-sessions-query.dto';

// Dữ liệu ví dụ hiển thị trong Swagger UI cho các endpoint hỏi–đáp. Chỉ dùng làm
// mẫu tài liệu, không tác động runtime. Cấu trúc mô phỏng "envelope" chuẩn của dự án:
// { success, data, timestamp } — với `data` là AiChatResponseDto (answer, sources...).
const AI_CHAT_RESPONSE_EXAMPLE = {
  success: true,
  data: {
    answer:
      'Supervised learning trains a model with labeled examples and checks predictions against known answers.',
    sessionId: '33333333-3333-4333-8333-333333333333',
    messageId: '55555555-5555-4555-8555-555555555555',
    suggestedPrompts: [
      'Summarize this document',
      'Explain the main ideas',
      'Create review questions',
    ],
    sources: [
      {
        sourceNumber: 1,
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Machine Learning Notes',
        snippet: 'Supervised learning uses labeled examples to train a model.',
        relevanceScore: 0.92,
      },
    ],
  },
  timestamp: '2026-06-22T00:00:00.000Z',
};

// Các decorator đặt TRƯỚC class áp dụng cho MỌI endpoint trong controller:
@ApiTags('AI Chatbot') // gom tất cả route /chat vào nhóm "AI Chatbot" trong Swagger.
@ApiBearerAuth() // Swagger: mọi route yêu cầu Bearer token (Firebase ID token).
@UseGuards(FirebaseAuthGuard) // BẮT BUỘC xác thực: guard chạy trước, request thiếu/sai token → 401.
@Controller('chat') // mọi route dưới đây có tiền tố '/chat' (vd '/chat/ask-document').
export class AiChatbotController {
  // Constructor injection: NestJS tự tạo & tiêm AiChatbotService vào đây.
  //   - `private readonly service` : vừa khai báo tham số vừa tạo thuộc tính `this.service`
  //     (cú pháp "parameter property" của TypeScript). `readonly` = không gán lại sau khởi tạo.
  constructor(private readonly service: AiChatbotService) {}

  // --------------------------------------------------------------------------
  // POST /chat/ask-document — Hỏi về MỘT tài liệu cụ thể (non-streaming).
  // Luồng: request → FirebaseAuthGuard xác thực → validate AskDocumentDto →
  //        handler này → service.askDocument() → trả AiChatResponseDto (JSON).
  // --------------------------------------------------------------------------
  @HttpCode(HttpStatus.OK) // ép trả 200 (mặc định POST là 201 Created — ở đây không tạo tài nguyên mới).
  @ApiWrappedOkResponse( // Swagger: mô tả body 200 đã bọc trong envelope { success, data }.
    AiChatResponseDto,
    'AI answer for one document.',
    AI_CHAT_RESPONSE_EXAMPLE,
  )
  @ApiOperation({ summary: 'Ask a question about one document' })
  askDocument(
    // @Body() dto: NestJS lấy JSON body, tạo instance AskDocumentDto và validate nó
    //   bằng class-validator (nhờ ValidationPipe toàn cục). Không hợp lệ → 400 tự động.
    @Body() dto: AskDocumentDto,
    // @CurrentUser(): rút user đã xác thực (do FirebaseAuthGuard gắn vào request).
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiChatResponseDto> {
    // Controller mỏng: chuyển thẳng cho service. `return Promise` → NestJS tự await
    // rồi serialize kết quả thành JSON gửi về client.
    return this.service.askDocument(dto, user);
  }

  // --------------------------------------------------------------------------
  // POST /chat/ask-library — Hỏi trên TOÀN BỘ thư viện (tài liệu sở hữu + đã lưu).
  // --------------------------------------------------------------------------
  @Post('ask-library')
  @HttpCode(HttpStatus.OK)
  @ApiWrappedOkResponse(
    AiChatResponseDto,
    'AI answer across owned and saved documents.',
    AI_CHAT_RESPONSE_EXAMPLE,
  )
  @ApiOperation({ summary: 'Ask a question across owned and saved documents' })
  @ApiBody({
    type: AskLibraryDto,
    examples: {
      default: {
        summary: 'Ask My Library',
        value: {
          question: 'Summarize the key ideas about machine learning.',
          sessionId: '33333333-3333-4333-8333-333333333333',
          limit: 5,
        },
      },
    },
  })
  // Các @Api...Response chỉ liệt kê mã lỗi có thể gặp cho Swagger; lỗi thực tế do
  // service ném (NotFound/Forbidden/Conflict) và NestJS map sang mã HTTP tương ứng.
  @ApiBadRequestResponse({ description: 'Invalid request body.' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Firebase token.',
  })
  @ApiForbiddenResponse({ description: 'Chat session access denied.' })
  @ApiNotFoundResponse({ description: 'Chat session not found.' })
  @ApiConflictResponse({ description: 'Library content is not ready.' })
  askLibrary(
    @Body() dto: AskLibraryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiChatResponseDto> {
    return this.service.askLibrary(dto, user);
  }

  // --------------------------------------------------------------------------
  // POST /chat/ask-library/stream — Cùng nghiệp vụ askLibrary NHƯNG trả về theo
  // kiểu SSE (streaming) để UI hiển thị câu trả lời dần dần thay vì chờ trọn gói.
  //   - `async ... : Promise<void>` : không `return` dữ liệu; ta tự ghi thẳng vào
  //     `response` (SSE) nên hàm trả về void.
  //   - @Res() response: tiêm thẳng đối tượng Response của Express để tự kiểm soát
  //     việc ghi từng "event". LƯU Ý: khi dùng @Res(), NestJS KHÔNG tự gửi phản hồi;
  //     ta phải tự `write()`/`end()`.
  // --------------------------------------------------------------------------
  @Post('ask-library/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stream an answer across the user library' })
  async streamLibrary(
    @Body() dto: AskLibraryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    // Truyền một "factory" `() => service.askLibrary(...)` để streamAnswer quyết
    // định thời điểm gọi service (sau khi đã gửi các event trạng thái đầu tiên).
    await this.streamAnswer(response, () => this.service.askLibrary(dto, user));
  }

  // --------------------------------------------------------------------------
  // POST /chat/ask-document/stream — Bản streaming (SSE) của askDocument.
  // --------------------------------------------------------------------------
  @Post('ask-document/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stream an answer for one document' })
  async streamDocument(
    @Body() dto: AskDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    await this.streamAnswer(response, () =>
      this.service.askDocument(dto, user),
    );
  }

  // --------------------------------------------------------------------------
  // GET /chat/sessions — Liệt kê các phiên chat gần đây của user (có phân trang).
  //   - @Query() query: gom các tham số query string (?mode=&page=&limit=) vào DTO.
  // --------------------------------------------------------------------------
  @Get('sessions')
  @ApiOkResponse({ type: ChatSessionListResponseDto })
  @ApiOperation({ summary: 'List recent chat sessions' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Firebase token.',
  })
  getSessions(
    @Query() query: ChatSessionsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChatSessionListResponseDto> {
    return this.service.getSessions(query, user);
  }

  // --------------------------------------------------------------------------
  // GET /chat/sessions/:id — Lấy chi tiết một phiên chat theo id.
  //   - `:id` là route param động; @Param('id', ParseUUIDPipe) rút giá trị này và
  //     dùng ParseUUIDPipe kiểm tra phải là UUID — không hợp lệ trả 400 ngay.
  // --------------------------------------------------------------------------
  @Get('sessions/:id')
  @ApiOkResponse({ type: ChatSessionDetailDto })
  @ApiOperation({ summary: 'Get a chat session' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Firebase token.',
  })
  @ApiForbiddenResponse({ description: 'Chat session access denied.' })
  @ApiNotFoundResponse({ description: 'Chat session not found.' })
  getSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChatSessionDetailDto> {
    return this.service.getSession(id, user);
  }

  // --------------------------------------------------------------------------
  // GET /chat/messages/:sessionId — Liệt kê tin nhắn trong một phiên (phân trang).
  //   Kết hợp cả @Param (id phiên trên URL) và @Query (page/limit) trong 1 handler.
  // --------------------------------------------------------------------------
  @Get('messages/:sessionId')
  @ApiOkResponse({ type: ChatMessageListResponseDto })
  @ApiOperation({ summary: 'List chat messages in a session' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Firebase token.',
  })
  @ApiForbiddenResponse({ description: 'Chat session access denied.' })
  @ApiNotFoundResponse({ description: 'Chat session not found.' })
  getMessages(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: ChatMessagesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChatMessageListResponseDto> {
    return this.service.getMessages(sessionId, query, user);
  }

  // ==========================================================================
  // SSE — Streaming câu trả lời AI (private helper dùng chung cho 2 endpoint /stream)
  // --------------------------------------------------------------------------
  // SSE (Server-Sent Events) là kỹ thuật để server đẩy nhiều "event" liên tiếp qua
  // MỘT kết nối HTTP giữ mở (khác REST thường: 1 request → 1 response rồi đóng).
  // Trình duyệt dùng EventSource để nhận. Định dạng mỗi event là text thuần:
  //     event: <tên-loại>\n
  //     data: <chuỗi JSON>\n
  //     \n                       ← dòng trống báo kết thúc 1 event
  //
  // Trình tự các loại event ta phát cho UI:
  //   status  → cập nhật giai đoạn: retrieving (đang tìm nguồn) → generating
  //             (đang sinh) → verifying (đang kiểm chứng).
  //   sources → danh sách nguồn/citation dùng để trả lời.
  //   delta   → từng mẩu nhỏ của câu trả lời (gõ dần ra màn hình).
  //   done    → gói kết quả cuối cùng đầy đủ (AiChatResponseDto).
  //   error   → khi có lỗi trong lúc xử lý.
  //
  // Tham số:
  //   - response   : đối tượng Response Express (tiêm qua @Res) để tự ghi từng event.
  //   - createAnswer: callback trả Promise<AiChatResponseDto>. Truyền dạng hàm để
  //     hoãn việc gọi service tới sau khi đã gửi các event trạng thái ban đầu.
  // ==========================================================================
  private async streamAnswer(
    response: Response,
    createAnswer: () => Promise<AiChatResponseDto>,
  ): Promise<void> {
    // Thiết lập các HTTP header đặc trưng của SSE TRƯỚC khi ghi dữ liệu:
    //   - Content-Type: text/event-stream → báo client đây là luồng SSE.
    //   - Cache-Control: no-cache, no-transform → cấm cache/nén làm hỏng luồng.
    //   - Connection: keep-alive → giữ kết nối mở để đẩy nhiều event.
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders(); // gửi ngay header đi (mở luồng) mà chưa cần body.

    // Gửi event trạng thái đầu tiên: "đang truy hồi nguồn". writeEvent trả false
    // nếu client đã ngắt kết nối → dừng sớm và đóng luồng.
    if (!this.writeEvent(response, 'status', { phase: 'retrieving' })) {
      this.endStream(response);
      return;
    }

    try {
      // Báo chuyển sang giai đoạn "đang sinh câu trả lời".
      if (!this.writeEvent(response, 'status', { phase: 'generating' })) {
        return; // client đã rời đi → khối finally vẫn đóng luồng.
      }
      // GỌI service để lấy câu trả lời đầy đủ (retrieve + generate ở tầng service).
      const result = await createAnswer();

      // Gửi trước danh sách nguồn để UI dựng khối citation.
      if (!this.writeEvent(response, 'sources', result.sources)) {
        return;
      }

      // Cắt câu trả lời thành từng mẩu để mô phỏng hiệu ứng "gõ dần":
      //   - result.answer.match(/\S+\s*/g) : regex bắt "1 cụm không-khoảng-trắng +
      //     khoảng trắng theo sau" → tách gần đúng theo từng từ.
      //   - `?? []` : nullish coalescing — match() có thể trả null (không khớp gì)
      //     thì dùng mảng rỗng để vòng for không lỗi.
      for (const part of result.answer.match(/\S+\s*/g) ?? []) {
        // Mỗi mẩu là một event "delta" chứa { text }.
        if (!this.writeEvent(response, 'delta', { text: part })) {
          return; // client ngắt giữa chừng → dừng gửi tiếp.
        }
      }

      // Báo giai đoạn "đang kiểm chứng" trước khi chốt.
      if (!this.writeEvent(response, 'status', { phase: 'verifying' })) {
        return;
      }
      // Event cuối: gói kết quả đầy đủ để client dùng làm dữ liệu chính thức.
      this.writeEvent(response, 'done', result);
    } catch {
      // Bất kỳ lỗi nào (service ném, mất kết nối...) → phát event "error".
      // `retryable: true` gợi ý client có thể thử lại.
      this.writeEvent(response, 'error', {
        code: 'STREAM_REQUEST_FAILED',
        retryable: true,
      });
    } finally {
      // `finally` LUÔN chạy dù thành công hay lỗi → đảm bảo đóng luồng, không rò rỉ kết nối.
      this.endStream(response);
    }
  }

  // --------------------------------------------------------------------------
  // writeEvent: ghi MỘT event SSE xuống luồng. Trả về boolean cho biết ghi được không.
  //   - `data: unknown` : nhận dữ liệu bất kỳ; sẽ được JSON.stringify.
  //   - Kiểm tra trước: nếu response.destroyed (đã huỷ) hoặc writableEnded (đã đóng)
  //     thì bỏ qua, trả false — tránh lỗi "write after end".
  // --------------------------------------------------------------------------
  private writeEvent(
    response: Response,
    event: string,
    data: unknown,
  ): boolean {
    if (response.destroyed || response.writableEnded) {
      return false; // client đã rời đi → không ghi nữa.
    }

    try {
      // Đúng định dạng SSE: "event: <tên>\n" + "data: <json>\n" + "\n" (dòng trống kết thúc).
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false; // ghi thất bại (vd socket vừa đóng) → coi như không gửi được.
    }
  }

  // --------------------------------------------------------------------------
  // endStream: đóng luồng SSE một cách an toàn (idempotent — gọi nhiều lần vô hại).
  // --------------------------------------------------------------------------
  private endStream(response: Response): void {
    if (response.destroyed || response.writableEnded) {
      return; // đã đóng rồi thì thôi.
    }

    try {
      response.end(); // kết thúc phản hồi, đóng kết nối.
    } catch {
      // Việc client tự ngắt kết nối là bình thường, không nên coi là lỗi backend.
      // Client disconnects should not surface as backend failures.
    }
  }
}
