import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RoleName, UserStatus } from '../generated/prisma/client';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { AiChatbotController } from './ai-chatbot.controller';
import { AiChatbotService } from './ai-chatbot.service';
import { AskDocumentDto } from './dto/ask-document.dto';
import { AskLibraryDto } from './dto/ask-library.dto';
import { ChatMessagesQueryDto } from './dto/chat-messages-query.dto';
import { ChatSessionsQueryDto } from './dto/chat-sessions-query.dto';

describe('AiChatbotController', () => {
  let controller: AiChatbotController;

  const service = {
    askDocument: jest.fn(),
    askLibrary: jest.fn(),
    getSessions: jest.fn(),
    getSession: jest.fn(),
    getMessages: jest.fn(),
  };
  const firebaseAuthGuard = { canActivate: jest.fn(() => true) };
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    firebaseUid: 'firebase-uid',
    email: 'user@example.com',
    fullName: 'Test User',
    status: UserStatus.ACTIVE,
    role: { name: RoleName.USER },
  };
  const sessionId = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiChatbotController],
      providers: [{ provide: AiChatbotService, useValue: service }],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useValue(firebaseAuthGuard)
      .compile();

    controller = module.get(AiChatbotController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('gets sessions for the current user', async () => {
    const query = { page: 1, limit: 20 };
    const response = { items: [], meta: { page: 1, limit: 20 } };
    service.getSessions.mockResolvedValue(response);

    await expect(controller.getSessions(query, user)).resolves.toBe(response);

    expect(service.getSessions).toHaveBeenCalledWith(query, user);
  });

  it('gets a session by id for the current user', async () => {
    const response = { id: sessionId };
    service.getSession.mockResolvedValue(response);

    await expect(controller.getSession(sessionId, user)).resolves.toBe(
      response,
    );

    expect(service.getSession).toHaveBeenCalledWith(sessionId, user);
  });

  it('gets messages by session id for the current user', async () => {
    const query = { page: 1, limit: 50 };
    const response = { items: [], meta: { page: 1, limit: 50 } };
    service.getMessages.mockResolvedValue(response);

    await expect(controller.getMessages(sessionId, query, user)).resolves.toBe(
      response,
    );

    expect(service.getMessages).toHaveBeenCalledWith(sessionId, query, user);
  });

  it('protects ask-library with Firebase authentication guard', () => {
    const classGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      AiChatbotController,
    ) as unknown[] | undefined;

    expect(classGuards).toContain(FirebaseAuthGuard);
  });

  it('delegates ask-library requests to the service', async () => {
    const dto = {
      question: 'What is machine learning?',
      sessionId,
      limit: 5,
    };
    const response = {
      answer: 'Answer',
      sessionId,
      messageId: '55555555-5555-4555-8555-555555555555',
      suggestedPrompts: ['Summarize this document'],
      sources: [
        {
          sourceNumber: 1,
          documentId: '22222222-2222-4222-8222-222222222222',
          title: 'Document',
          snippet: 'Citation snippet',
          relevanceScore: 0.92,
        },
      ],
    };
    service.askLibrary.mockResolvedValue(response);

    await expect(controller.askLibrary(dto, user)).resolves.toBe(response);

    expect(service.askLibrary).toHaveBeenCalledWith(dto, user);
    expect(Array.isArray(response.suggestedPrompts)).toBe(true);
    expect(Array.isArray(response.sources)).toBe(true);
    expect(response.sources[0]).toEqual(
      expect.objectContaining({
        sourceNumber: 1,
        documentId: '22222222-2222-4222-8222-222222222222',
        title: 'Document',
        snippet: 'Citation snippet',
        relevanceScore: 0.92,
      }),
    );
  });

  it('delegates ask-document requests and returns citation sources', async () => {
    const dto = {
      documentId: '22222222-2222-4222-8222-222222222222',
      question: 'Summarize this document.',
    };
    const response = {
      answer: 'Answer',
      sessionId,
      messageId: '55555555-5555-4555-8555-555555555555',
      suggestedPrompts: [],
      sources: [
        {
          sourceNumber: 1,
          documentId: dto.documentId,
          title: 'Document',
          snippet: 'Citation snippet',
          relevanceScore: null,
        },
      ],
    };
    service.askDocument.mockResolvedValue(response);

    await expect(controller.askDocument(dto, user)).resolves.toBe(response);

    expect(service.askDocument).toHaveBeenCalledWith(dto, user);
  });

  it('propagates ask-document not-ready conflicts from the service', async () => {
    const dto = {
      documentId: '22222222-2222-4222-8222-222222222222',
      question: 'Summarize this document.',
    };
    service.askDocument.mockRejectedValue(
      new ConflictException('Document content is not ready'),
    );

    await expect(controller.askDocument(dto, user)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(service.askDocument).toHaveBeenCalledWith(dto, user);
  });

  it('propagates ask-document permission errors from the service', async () => {
    const dto = {
      documentId: '22222222-2222-4222-8222-222222222222',
      question: 'Summarize this document.',
    };
    service.askDocument.mockRejectedValue(
      new ForbiddenException('Document access denied'),
    );

    await expect(controller.askDocument(dto, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(service.askDocument).toHaveBeenCalledWith(dto, user);
  });

  it('returns ask-library empty retrieval responses with an empty sources array', async () => {
    const dto = {
      question: 'No matching topic',
    };
    const response = {
      answer: 'No relevant documents found in your library.',
      sessionId,
      messageId: '55555555-5555-4555-8555-555555555555',
      suggestedPrompts: [],
      sources: [],
    };
    service.askLibrary.mockResolvedValue(response);

    await expect(controller.askLibrary(dto, user)).resolves.toBe(response);

    expect(service.askLibrary).toHaveBeenCalledWith(dto, user);
    expect(response.sources).toEqual([]);
  });

  it('streams status, sources, ordered deltas, and one final response', async () => {
    const dto = { question: 'Explain this topic' };
    const result = {
      answer: 'First second',
      sessionId,
      messageId: '55555555-5555-4555-8555-555555555555',
      suggestedPrompts: [],
      sources: [],
    };
    const writes: string[] = [];
    const response = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => writes.push(chunk)),
      end: jest.fn(),
    };
    service.askLibrary.mockResolvedValue(result);

    await controller.streamLibrary(dto, user, response as never);

    expect(service.askLibrary).toHaveBeenCalledTimes(1);
    expect(writes.map((chunk) => chunk.match(/^event: (\w+)/)?.[1])).toEqual([
      'status',
      'status',
      'sources',
      'delta',
      'delta',
      'status',
      'done',
    ]);
    expect(
      writes.filter((chunk) => chunk.startsWith('event: done')),
    ).toHaveLength(1);
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it('keeps concurrent stream responses isolated', async () => {
    const firstWrites: string[] = [];
    const secondWrites: string[] = [];
    const firstResponse = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => firstWrites.push(chunk)),
      end: jest.fn(),
    };
    const secondResponse = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => secondWrites.push(chunk)),
      end: jest.fn(),
    };
    service.askLibrary.mockImplementation(
      (dto: { question: string }) =>
        Promise.resolve({
          answer:
            dto.question === 'First stream'
              ? 'alpha beta'
              : 'gamma delta',
          sessionId,
          messageId: '55555555-5555-4555-8555-555555555555',
          suggestedPrompts: [],
          sources: [],
        }),
    );

    await Promise.all([
      controller.streamLibrary(
        { question: 'First stream' },
        user,
        firstResponse as never,
      ),
      controller.streamLibrary(
        { question: 'Second stream' },
        user,
        secondResponse as never,
      ),
    ]);

    expect(firstWrites.join('')).toContain('alpha');
    expect(firstWrites.join('')).toContain('beta');
    expect(firstWrites.join('')).not.toContain('gamma');
    expect(secondWrites.join('')).toContain('gamma');
    expect(secondWrites.join('')).toContain('delta');
    expect(secondWrites.join('')).not.toContain('alpha');
    expect(firstResponse.end).toHaveBeenCalledTimes(1);
    expect(secondResponse.end).toHaveBeenCalledTimes(1);
  });

  it('ends a failed stream with a stable retryable error event', async () => {
    const writes: string[] = [];
    const response = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => writes.push(chunk)),
      end: jest.fn(),
    };
    service.askLibrary.mockRejectedValue(
      new Error('upstream stack and secret must not be streamed'),
    );

    await controller.streamLibrary(
      { question: 'Explain this topic' },
      user,
      response as never,
    );

    expect(writes.at(-1)).toContain('event: error');
    expect(writes.at(-1)).toContain('STREAM_REQUEST_FAILED');
    expect(writes.join('')).not.toContain('upstream stack');
    expect(writes.some((chunk) => chunk.startsWith('event: done'))).toBe(false);
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  it('does not create a stream answer when the client disconnects before retrieval starts', async () => {
    const response = {
      destroyed: true,
      writableEnded: false,
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };

    await controller.streamLibrary(
      { question: 'Explain this topic' },
      user,
      response as never,
    );

    expect(service.askLibrary).not.toHaveBeenCalled();
    expect(response.write).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
  });

  it('stops a stream without done/error events when the client disconnects during answer delivery', async () => {
    const writes: string[] = [];
    const response = {
      destroyed: false,
      writableEnded: false,
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => {
        if (chunk.startsWith('event: delta')) {
          response.destroyed = true;
          throw new Error('socket closed by client');
        }
        writes.push(chunk);
      }),
      end: jest.fn(),
    };
    service.askLibrary.mockResolvedValue({
      answer: 'First second',
      sessionId,
      messageId: '55555555-5555-4555-8555-555555555555',
      suggestedPrompts: [],
      sources: [],
    });

    await controller.streamLibrary(
      { question: 'Explain this topic' },
      user,
      response as never,
    );

    expect(service.askLibrary).toHaveBeenCalledTimes(1);
    expect(writes.some((chunk) => chunk.startsWith('event: done'))).toBe(false);
    expect(writes.some((chunk) => chunk.startsWith('event: error'))).toBe(false);
    expect(response.end).not.toHaveBeenCalled();
  });

  it('rejects empty ask-library questions at DTO validation', async () => {
    const dto = plainToInstance(AskLibraryDto, { question: '   ' });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('question');
  });

  it('rejects blank ask-document questions at DTO validation', async () => {
    const dto = plainToInstance(AskDocumentDto, {
      documentId: '22222222-2222-4222-8222-222222222222',
      question: '   ',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('question');
  });

  it('rejects invalid ask-document ids at DTO validation', async () => {
    const dto = plainToInstance(AskDocumentDto, {
      documentId: 'not-a-uuid',
      question: 'Question?',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('documentId');
  });

  it('accepts 4000 ask-document characters and rejects 4001', async () => {
    const validDto = plainToInstance(AskDocumentDto, {
      documentId: '22222222-2222-4222-8222-222222222222',
      question: 'a'.repeat(4000),
    });
    const invalidDto = plainToInstance(AskDocumentDto, {
      documentId: '22222222-2222-4222-8222-222222222222',
      question: 'a'.repeat(4001),
    });

    await expect(validate(validDto)).resolves.toHaveLength(0);
    const errors = await validate(invalidDto);
    expect(errors.map((error) => error.property)).toContain('question');
  });

  it.each([1, 10])('accepts ask-library limit %s', async (limit) => {
    const dto = plainToInstance(AskLibraryDto, {
      question: 'Question?',
      limit,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([0, 11, 'not-a-number'])(
    'rejects invalid ask-library limit %s',
    async (limit) => {
      const dto = plainToInstance(AskLibraryDto, {
        question: 'Question?',
        limit,
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('limit');
    },
  );

  it.each([
    [ChatMessagesQueryDto, { page: 0 }],
    [ChatMessagesQueryDto, { limit: 0 }],
    [ChatMessagesQueryDto, { limit: 101 }],
    [ChatSessionsQueryDto, { page: 0 }],
    [ChatSessionsQueryDto, { limit: 0 }],
    [ChatSessionsQueryDto, { limit: 101 }],
    [ChatSessionsQueryDto, { mode: 'INVALID_MODE' }],
    [ChatSessionsQueryDto, { documentId: 'not-a-uuid' }],
  ])('rejects invalid chat query input %#', async (DtoClass, input) => {
    const dto = plainToInstance(DtoClass, input);

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
