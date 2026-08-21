// ============================================================================
// MF3 — AI Chatbot Module
// ----------------------------------------------------------------------------
// Trong NestJS, "module" là đơn vị đóng gói một tính năng: nó gom controller,
// service (provider) và khai báo phụ thuộc giữa các module. NestJS dựa vào metadata
// của @Module để xây "dependency injection container" — tự tạo và tiêm các đối tượng.
// Module này gói toàn bộ tính năng AI Chatbot (MF3).
// ============================================================================
import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { AiChatbotController } from './ai-chatbot.controller';
import { AiChatbotService } from './ai-chatbot.service';
import { ChatSourceService } from './services/chat-source.service';
import { GeminiService } from './services/gemini.service';
import { PromptBuilderService } from './services/prompt-builder.service';

@Module({
  // imports: các module KHÁC mà module này cần dùng provider của họ.
  //   - AuthModule    : cung cấp FirebaseAuthGuard/xác thực dùng ở controller.
  //   - AuditLogModule: cung cấp AuditLogService để service ghi log truy vết.
  imports: [AuthModule, AuditLogModule],
  // controllers: các controller thuộc module này (định tuyến HTTP /chat).
  controllers: [AiChatbotController],
  // providers: các class có thể được inject; NestJS tạo mỗi cái 1 instance (singleton)
  //   trong phạm vi module và tiêm vào nơi khai báo ở constructor.
  providers: [
    AiChatbotService, // nghiệp vụ chính của chatbot.
    GeminiService, // gọi mô hình Gemini (hoặc chạy mock).
    PromptBuilderService, // dựng prompt gửi cho mô hình.
    ChatSourceService, // truy hồi (retrieve) nguồn/tài liệu liên quan.
  ],
  // exports: những provider cho phép module KHÁC import & dùng lại.
  //   Ở đây "mở" AiChatbotService và GeminiService ra ngoài module.
  exports: [AiChatbotService, GeminiService],
})
export class AiChatbotModule {}
