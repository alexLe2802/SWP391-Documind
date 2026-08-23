import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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

@ApiTags('AI Chatbot')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('chat')
export class AiChatbotController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly service: AiChatbotService) {}

  // Thực hiện chức năng ask tài liệu.
  @Post('ask-document')
  @HttpCode(HttpStatus.OK)
  @ApiWrappedOkResponse(
    AiChatResponseDto,
    'AI answer for one document.',
    AI_CHAT_RESPONSE_EXAMPLE,
  )
  @ApiOperation({ summary: 'Ask a question about one document' })
  askDocument(
    @Body() dto: AskDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AiChatResponseDto> {
    return this.service.askDocument(dto, user);
  }

  // Thực hiện chức năng ask library.
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

  // Thực hiện chức năng stream library.
  @Post('ask-library/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stream an answer across the user library' })
  async streamLibrary(
    @Body() dto: AskLibraryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ): Promise<void> {
    await this.streamAnswer(response, () => this.service.askLibrary(dto, user));
  }

  // Thực hiện chức năng stream tài liệu.
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

  // Lấy dữ liệu phiên.
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

  // Lấy dữ liệu phiên.
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

  // Lấy dữ liệu tin nhắn.
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

  // Thực hiện chức năng stream answer.
  private async streamAnswer(
    response: Response,
    createAnswer: () => Promise<AiChatResponseDto>,
  ): Promise<void> {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    if (!this.writeEvent(response, 'status', { phase: 'retrieving' })) {
      this.endStream(response);
      return;
    }

    try {
      if (!this.writeEvent(response, 'status', { phase: 'generating' })) {
        return;
      }
      const result = await createAnswer();
      if (!this.writeEvent(response, 'sources', result.sources)) {
        return;
      }
      for (const part of result.answer.match(/\S+\s*/g) ?? []) {
        if (!this.writeEvent(response, 'delta', { text: part })) {
          return;
        }
      }
      if (!this.writeEvent(response, 'status', { phase: 'verifying' })) {
        return;
      }
      this.writeEvent(response, 'done', result);
    } catch {
      this.writeEvent(response, 'error', {
        code: 'STREAM_REQUEST_FAILED',
        retryable: true,
      });
    } finally {
      this.endStream(response);
    }
  }

  // Thực hiện chức năng write event.
  private writeEvent(
    response: Response,
    event: string,
    data: unknown,
  ): boolean {
    if (response.destroyed || response.writableEnded) {
      return false;
    }

    try {
      response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  }

  // Thực hiện chức năng end stream.
  private endStream(response: Response): void {
    if (response.destroyed || response.writableEnded) {
      return;
    }

    try {
      response.end();
    } catch {
      // Client disconnects should not surface as backend failures.
    }
  }
}
