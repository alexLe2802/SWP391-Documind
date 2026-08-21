// ============================================================================
// MF3 — ChatSessionService: quản lý phiên chat TRONG BỘ NHỚ (in-memory)
// ----------------------------------------------------------------------------
// Đây là phiên bản lưu trữ đơn giản: giữ các phiên chat trong 1 Map ngay trong
// bộ nhớ tiến trình Node (KHÔNG ghi database). Dữ liệu sẽ MẤT khi tiến trình khởi
// động lại và KHÔNG chia sẻ được giữa nhiều instance server — phù hợp cho demo/
// thử nghiệm nhẹ. (Luồng chính thức lưu phiên xuống DB nằm ở AiChatbotService.)
// Cung cấp 3 thao tác cơ bản: create (tạo), findById (tra cứu), appendMessage
// (thêm tin nhắn vào lịch sử).
// ============================================================================

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto'; // hàm chuẩn Node sinh UUID v4 ngẫu nhiên
import { ChatMode } from '../enums/chat-mode.enum';
import { MessageSender } from '../enums/message-sender.enum';
import { SessionMessage } from './prompt-builder.service';

// ChatSession: mô tả đầy đủ dữ liệu nội bộ của một phiên chat.
//   - id          : định danh duy nhất của phiên (UUID).
//   - mode        : phạm vi phiên (hỏi 1 tài liệu / hỏi cả thư viện).
//   - documentId? : id tài liệu gắn với phiên (optional — chỉ có ở chế độ hỏi 1 tài liệu).
//   - createdAt   : thời điểm tạo, lưu dạng chuỗi ISO.
//   - history     : mảng các tin nhắn theo thứ tự thời gian.
export interface ChatSession {
  id: string;
  mode: ChatMode;
  documentId?: string;
  createdAt: string;
  history: SessionMessage[];
}

// Quản lý vòng đời, lịch sử và tin nhắn của phiên chat trong bộ nhớ.
@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  // sessions: kho lưu phiên theo sessionId ngay trong bộ nhớ tiến trình.
  //   - `Map<string, ChatSession>` : key = sessionId (chuỗi), value = ChatSession.
  //     Map cho phép tra cứu O(1) theo key, thêm/xóa linh hoạt.
  private readonly sessions = new Map<string, ChatSession>();

  // ==========================================================================
  // create — Tạo phiên chat mới theo phạm vi (mode) và tài liệu được chọn
  // --------------------------------------------------------------------------
  // Input : mode (bắt buộc), documentId? (optional). Output: ChatSession vừa tạo.
  // ==========================================================================
  create(mode: ChatMode, documentId?: string): ChatSession {
    const session: ChatSession = {
      id: randomUUID(), // sinh id duy nhất
      mode,
      documentId,
      createdAt: new Date().toISOString(), // thời điểm hiện tại dạng ISO 8601
      history: [], // lịch sử rỗng ban đầu
    };

    // Lưu vào Map với key = id để lần sau findById tra ra được.
    this.sessions.set(session.id, session);
    // Template literal: chèn mode + id vào chuỗi log.
    this.logger.log(`Session created [${mode}]: ${session.id}`);

    return session;
  }

  // ==========================================================================
  // findById — Lấy phiên theo ID, hoặc ném 404 nếu không tồn tại
  // --------------------------------------------------------------------------
  // `Map.get` trả undefined khi không có key → kiểm tra `!session` rồi ném
  // NotFoundException (NestJS tự map thành HTTP 404).
  // ==========================================================================
  findById(sessionId: string): ChatSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Chat session not found: ${sessionId}`);
    }
    return session;
  }

  // ==========================================================================
  // appendMessage — Thêm 1 tin nhắn (của USER hoặc AI) vào lịch sử phiên
  // --------------------------------------------------------------------------
  // Input : sessionId, sender (USER/AI), content. Output: SessionMessage vừa thêm.
  // Tận dụng findById để vừa lấy phiên vừa đảm bảo phiên tồn tại (nếu không → 404).
  // ==========================================================================
  appendMessage(
    sessionId: string,
    sender: MessageSender,
    content: string,
  ): SessionMessage {
    const session = this.findById(sessionId);

    const message: SessionMessage = {
      sender,
      content,
      timestamp: new Date().toISOString(),
    };

    // `push` thêm vào cuối mảng (giữ đúng thứ tự thời gian). Vì session là tham
    // chiếu tới object trong Map nên sửa history cũng chính là cập nhật kho lưu.
    session.history.push(message);
    return message;
  }
}
