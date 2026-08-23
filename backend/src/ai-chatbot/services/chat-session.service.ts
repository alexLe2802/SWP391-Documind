import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChatMode } from '../enums/chat-mode.enum';
import { MessageSender } from '../enums/message-sender.enum';
import { SessionMessage } from './prompt-builder.service';

// Mô tả đầy đủ dữ liệu nội bộ của một phiên chat.
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

  // Lưu phiên chat theo sessionId trong bộ nhớ tiến trình.
  private readonly sessions = new Map<string, ChatSession>();

  // Tạo phiên chat mới theo phạm vi và tài liệu được chọn.
  create(mode: ChatMode, documentId?: string): ChatSession {
    const session: ChatSession = {
      id: randomUUID(),
      mode,
      documentId,
      createdAt: new Date().toISOString(),
      history: [],
    };

    this.sessions.set(session.id, session);
    this.logger.log(`Session created [${mode}]: ${session.id}`);

    return session;
  }

  // Lấy phiên chat theo ID hoặc báo lỗi khi phiên không tồn tại.
  findById(sessionId: string): ChatSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Chat session not found: ${sessionId}`);
    }
    return session;
  }

  // Thêm một tin nhắn của user hoặc AI vào lịch sử phiên chat.
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

    session.history.push(message);
    return message;
  }
}
