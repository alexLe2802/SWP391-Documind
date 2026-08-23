import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditLogService', () => {
  let service: AuditLogService;

  const mockPrismaService = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an audit log entry', async () => {
      const logData = {
        userId: 'user-uuid',
        action: 'DOCUMENT_UPLOAD',
        targetType: 'DOCUMENT',
        targetId: 'doc-uuid',
        metadata: { fileName: 'test.pdf' },
      };

      const expectedResult = {
        id: 'log-uuid',
        ...logData,
        createdAt: new Date(),
      };

      mockPrismaService.auditLog.create.mockResolvedValue(expectedResult);

      const result = await service.create(logData);

      expect(result).toEqual(expectedResult);
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: logData,
      });
    });

    it('should create an audit log entry without optional fields', async () => {
      const logData = {
        action: 'USER_LOGIN',
        targetType: 'USER',
      };

      const expectedResult = {
        id: 'log-uuid',
        userId: null,
        targetId: null,
        metadata: null,
        ...logData,
        createdAt: new Date(),
      };

      mockPrismaService.auditLog.create.mockResolvedValue(expectedResult);

      const result = await service.create(logData);

      expect(result).toEqual(expectedResult);
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'USER_LOGIN',
          targetType: 'USER',
          userId: undefined,
          targetId: undefined,
          metadata: undefined,
        },
      });
    });
  });

  describe('action helpers', () => {
    beforeEach(() => {
      mockPrismaService.auditLog.create.mockResolvedValue({
        id: 'log-uuid',
        createdAt: new Date(),
      });
    });

    it('should log user login actions', async () => {
      await service.logLogin('user-uuid', { provider: 'firebase' });

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid',
          action: 'USER_LOGIN',
          targetType: 'USER',
          targetId: 'user-uuid',
          metadata: { provider: 'firebase' },
        },
      });
    });

    it('should log document upload actions', async () => {
      await service.logDocumentUpload('user-uuid', 'doc-uuid', {
        fileName: 'lecture.pdf',
      });

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid',
          action: 'DOCUMENT_UPLOAD',
          targetType: 'DOCUMENT',
          targetId: 'doc-uuid',
          metadata: { fileName: 'lecture.pdf' },
        },
      });
    });

    it('should log document delete actions', async () => {
      await service.logDocumentDelete('user-uuid', 'doc-uuid');

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid',
          action: 'DOCUMENT_DELETE',
          targetType: 'DOCUMENT',
          targetId: 'doc-uuid',
          metadata: undefined,
        },
      });
    });

    it('should log document hide actions', async () => {
      await service.logDocumentHide('admin-uuid', 'doc-uuid', {
        reason: 'Policy violation',
      });

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'admin-uuid',
          action: 'DOCUMENT_HIDE',
          targetType: 'DOCUMENT',
          targetId: 'doc-uuid',
          metadata: { reason: 'Policy violation' },
        },
      });
    });

    it('should log public document save actions', async () => {
      await service.logSavePublicDocument('user-uuid', 'doc-uuid');

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid',
          action: 'PUBLIC_DOCUMENT_SAVE',
          targetType: 'DOCUMENT',
          targetId: 'doc-uuid',
          metadata: undefined,
        },
      });
    });

    it('should log chatbot query actions with timing and retrieval metadata', async () => {
      const metadata = {
        sessionId: 'session-uuid',
        mode: 'ASK_THIS_DOCUMENT',
        question: 'What is NextJS?',
        noSource: false,
        fallbackKeyword: false,
        sourcesCount: 2,
        citedDocumentIds: ['doc-1', 'doc-2'],
        timings: {
          embeddingMs: 50,
          searchMs: 100,
          geminiMs: 1200,
          saveDbMs: 30,
          totalMs: 1380,
        },
      };

      await service.logChatbotQuery('user-uuid', metadata);

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-uuid',
          action: 'CHATBOT_QUERY',
          targetType: 'CHATBOT',
          targetId: 'session-uuid',
          metadata,
        },
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs with no filters', async () => {
      const query = { page: 1, limit: 10 };
      const mockLogs = [
        {
          id: 'log-1',
          action: 'LOGIN',
          targetType: 'USER',
          createdAt: new Date(),
        },
      ];

      mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);
      mockPrismaService.auditLog.count.mockResolvedValue(1);

      const result = await service.findAll(query);

      expect(result).toEqual({
        items: mockLogs,
        meta: {
          page: 1,
          limit: 10,
          totalItems: 1,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
      expect(mockPrismaService.auditLog.count).toHaveBeenCalledWith({
        where: {},
      });
    });

    it('should apply filters for userId, action, and keyword search', async () => {
      const query = {
        page: 2,
        limit: 5,
        userId: 'user-uuid',
        action: 'UPLOAD',
        keyword: 'pdf',
      };

      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findAll(query);

      const expectedWhere = {
        userId: 'user-uuid',
        action: 'UPLOAD',
        OR: [
          { action: { contains: 'pdf', mode: 'insensitive' } },
          { targetType: { contains: 'pdf', mode: 'insensitive' } },
        ],
      };

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        skip: 5,
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
      expect(mockPrismaService.auditLog.count).toHaveBeenCalledWith({
        where: expectedWhere,
      });
    });
  });
});
