import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentStatus,
  DocumentVisibility,
  UserStatus,
  RoleName,
} from '../generated/prisma/client';

describe('DashboardService', () => {
  let service: DashboardService;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    user: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    role: {
      findMany: jest.fn(),
    },
    document: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    chatSession: {
      count: jest.fn(),
    },
    downloadLog: {
      count: jest.fn(),
    },
    subject: {
      findMany: jest.fn(),
    },
    category: {
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
    chatSource: {
      groupBy: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSummary', () => {
    it('should retrieve dashboard summary metrics', async () => {
      mockPrismaService.user.count.mockResolvedValue(10);
      mockPrismaService.document.count.mockImplementation(
        (args?: {
          where?: { status?: DocumentStatus; visibility?: DocumentVisibility };
        }) => {
          if (!args?.where) return Promise.resolve(0);
          if (args.where.visibility === DocumentVisibility.PUBLIC) {
            return Promise.resolve(5);
          }
          if (args.where.visibility === DocumentVisibility.PRIVATE) {
            return Promise.resolve(3);
          }
          return Promise.resolve(8); // status = ACTIVE
        },
      );
      mockPrismaService.chatSession.count.mockResolvedValue(12);
      mockPrismaService.downloadLog.count.mockResolvedValue(15);

      const result = await service.getSummary();

      expect(result).toEqual({
        totalUsers: 10,
        totalDocuments: 8,
        totalPublicDocuments: 5,
        totalPrivateDocuments: 3,
        totalChats: 12,
        totalDownloads: 15,
        message: 'Dashboard summary retrieved successfully',
      });
    });

    it('should return zero counts when dashboard source data is empty', async () => {
      mockPrismaService.user.count.mockResolvedValue(0);
      mockPrismaService.document.count.mockResolvedValue(0);
      mockPrismaService.chatSession.count.mockResolvedValue(0);
      mockPrismaService.downloadLog.count.mockResolvedValue(0);

      const result = await service.getSummary();

      expect(result).toEqual({
        totalUsers: 0,
        totalDocuments: 0,
        totalPublicDocuments: 0,
        totalPrivateDocuments: 0,
        totalChats: 0,
        totalDownloads: 0,
        message: 'Dashboard summary retrieved successfully',
      });
    });
  });

  describe('getUserStats', () => {
    it('should return user counts by role and status', async () => {
      mockPrismaService.role.findMany.mockResolvedValue([
        { name: RoleName.ADMIN, _count: { users: 2 } },
        { name: RoleName.USER, _count: { users: 8 } },
      ]);
      mockPrismaService.user.groupBy.mockResolvedValue([
        { status: UserStatus.ACTIVE, _count: { _all: 9 } },
        { status: UserStatus.BLOCKED, _count: { _all: 1 } },
      ]);

      const result = await service.getUserStats();

      expect(result).toEqual({
        byRole: [
          { role: RoleName.ADMIN, count: 2 },
          { role: RoleName.USER, count: 8 },
        ],
        byStatus: [
          { status: UserStatus.ACTIVE, count: 9 },
          { status: UserStatus.BLOCKED, count: 1 },
        ],
        message: 'User statistics retrieved successfully',
      });
      expect(mockPrismaService.role.findMany).toHaveBeenCalled();
      expect(mockPrismaService.user.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        _count: { _all: true },
      });
    });

    it('should return empty arrays when no role or status rows exist', async () => {
      mockPrismaService.role.findMany.mockResolvedValue([]);
      mockPrismaService.user.groupBy.mockResolvedValue([]);

      const result = await service.getUserStats();

      expect(result).toEqual({
        byRole: [],
        byStatus: [],
        message: 'User statistics retrieved successfully',
      });
    });
  });

  describe('getDocumentStats', () => {
    it('should return document counts by status and visibility', async () => {
      mockPrismaService.document.groupBy.mockImplementation(
        (args: { by: string[] }) => {
          if (args.by.includes('status')) {
            return Promise.resolve([
              { status: DocumentStatus.ACTIVE, _count: { _all: 8 } },
              { status: DocumentStatus.HIDDEN, _count: { _all: 2 } },
            ]);
          }
          if (args.by.includes('visibility')) {
            return Promise.resolve([
              { visibility: DocumentVisibility.PUBLIC, _count: { _all: 5 } },
              { visibility: DocumentVisibility.PRIVATE, _count: { _all: 5 } },
            ]);
          }
          return Promise.resolve([]);
        },
      );

      const result = await service.getDocumentStats();

      expect(result).toEqual({
        byStatus: [
          { status: DocumentStatus.ACTIVE, count: 8 },
          { status: DocumentStatus.HIDDEN, count: 2 },
        ],
        byVisibility: [
          { visibility: DocumentVisibility.PUBLIC, count: 5 },
          { visibility: DocumentVisibility.PRIVATE, count: 5 },
        ],
        message: 'Document statistics retrieved successfully',
      });
    });

    it('should return empty arrays when no document status data exists', async () => {
      mockPrismaService.document.groupBy.mockResolvedValue([]);

      const result = await service.getDocumentStats();

      expect(result).toEqual({
        byStatus: [],
        byVisibility: [],
        message: 'Document statistics retrieved successfully',
      });
    });
  });

  describe('getStatistics', () => {
    it('should return combined user and document statistics', async () => {
      mockPrismaService.role.findMany.mockResolvedValue([
        { name: RoleName.ADMIN, _count: { users: 1 } },
        { name: RoleName.USER, _count: { users: 4 } },
      ]);
      mockPrismaService.user.groupBy.mockResolvedValue([
        { status: UserStatus.ACTIVE, _count: { _all: 4 } },
        { status: UserStatus.BLOCKED, _count: { _all: 1 } },
      ]);
      mockPrismaService.document.groupBy.mockImplementation(
        (args: { by: string[] }) => {
          if (args.by.includes('status')) {
            return Promise.resolve([
              { status: DocumentStatus.ACTIVE, _count: { _all: 3 } },
              { status: DocumentStatus.HIDDEN, _count: { _all: 1 } },
            ]);
          }
          if (args.by.includes('visibility')) {
            return Promise.resolve([
              { visibility: DocumentVisibility.PUBLIC, _count: { _all: 2 } },
              { visibility: DocumentVisibility.PRIVATE, _count: { _all: 2 } },
            ]);
          }
          return Promise.resolve([]);
        },
      );
      mockPrismaService.subject.findMany.mockResolvedValue([
        {
          id: 'subject-1',
          code: 'MATH101',
          name: 'Mathematics',
          _count: { documents: 2 },
        },
      ]);
      mockPrismaService.category.findMany.mockResolvedValue([
        {
          id: 'category-1',
          name: 'Lecture Notes',
          _count: { documents: 3 },
        },
      ]);

      const result = await service.getStatistics();

      expect(result).toEqual({
        users: {
          byRole: [
            { role: RoleName.ADMIN, count: 1 },
            { role: RoleName.USER, count: 4 },
          ],
          byStatus: [
            { status: UserStatus.ACTIVE, count: 4 },
            { status: UserStatus.BLOCKED, count: 1 },
          ],
        },
        documents: {
          byStatus: [
            { status: DocumentStatus.ACTIVE, count: 3 },
            { status: DocumentStatus.HIDDEN, count: 1 },
          ],
          byVisibility: [
            { visibility: DocumentVisibility.PUBLIC, count: 2 },
            { visibility: DocumentVisibility.PRIVATE, count: 2 },
          ],
          bySubject: [
            {
              id: 'subject-1',
              code: 'MATH101',
              name: 'Mathematics',
              count: 2,
            },
          ],
          byCategory: [{ id: 'category-1', name: 'Lecture Notes', count: 3 }],
        },
        message: 'Dashboard statistics retrieved successfully',
      });
    });

    it('should preserve stable response shape for missing dashboard data', async () => {
      mockPrismaService.role.findMany.mockResolvedValue([]);
      mockPrismaService.user.groupBy.mockResolvedValue([]);
      mockPrismaService.document.groupBy.mockResolvedValue([]);
      mockPrismaService.subject.findMany.mockResolvedValue([]);
      mockPrismaService.category.findMany.mockResolvedValue([]);

      const result = await service.getStatistics();

      expect(result).toEqual({
        users: {
          byRole: [],
          byStatus: [],
        },
        documents: {
          byStatus: [],
          byVisibility: [],
          bySubject: [],
          byCategory: [],
        },
        message: 'Dashboard statistics retrieved successfully',
      });
    });
  });

  describe('getDocumentsBySubject', () => {
    it('should return documents grouped by subject', async () => {
      const query = {
        from: '2026-06-01T00:00:00Z',
        to: '2026-06-10T23:59:59Z',
      };
      mockPrismaService.subject.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          code: 'MATH101',
          name: 'Mathematics',
          _count: { documents: 3 },
        },
      ]);

      const result = await service.getDocumentsBySubject(query);

      expect(result).toEqual({
        filters: query,
        data: [{ id: 'sub-1', code: 'MATH101', name: 'Mathematics', count: 3 }],
        message: 'Documents by subject retrieved successfully',
      });

      expect(mockPrismaService.subject.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          code: true,
          name: true,
          _count: {
            select: {
              documents: {
                where: {
                  status: DocumentStatus.ACTIVE,
                  createdAt: {
                    gte: new Date(query.from),
                    lte: new Date(query.to),
                  },
                },
              },
            },
          },
        },
      });
    });
  });

  describe('getDocumentsByCategory', () => {
    it('should return documents grouped by category', async () => {
      const query = { from: '2026-06-01T00:00:00Z' };
      mockPrismaService.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'Lecture Notes', _count: { documents: 4 } },
      ]);

      const result = await service.getDocumentsByCategory(query);

      expect(result).toEqual({
        filters: query,
        data: [{ id: 'cat-1', name: 'Lecture Notes', count: 4 }],
        message: 'Documents by category retrieved successfully',
      });
    });

    it('should merge categories with the same name in dashboard statistics', async () => {
      const query = {};
      mockPrismaService.category.findMany.mockResolvedValue([
        { id: 'cat-1', name: 'TEST', _count: { documents: 2 } },
        { id: 'cat-2', name: 'TEST', _count: { documents: 3 } },
        { id: 'cat-3', name: 'Other', _count: { documents: 1 } },
      ]);

      const result = await service.getDocumentsByCategory(query);

      expect(result.data).toEqual([
        { id: 'cat-1', name: 'TEST', count: 5 },
        { id: 'cat-3', name: 'Other', count: 1 },
      ]);
    });
  });

  describe('getUploadStatistics', () => {
    it('should group uploads by day', async () => {
      const query = { groupBy: 'day' as const };
      mockPrismaService.$queryRaw.mockResolvedValue([
        { date: '2026-06-01', count: 2n },
        { date: '2026-06-02', count: 1n },
      ]);

      const result = await service.getUploadStatistics(query);

      expect(result).toEqual({
        filters: query,
        data: [
          { date: '2026-06-01', count: 2 },
          { date: '2026-06-02', count: 1 },
        ],
        message: 'Upload statistics retrieved successfully',
      });
      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });

    it('should return an empty upload series when no documents match', async () => {
      const query = { from: '2026-06-01T00:00:00Z', groupBy: 'day' as const };
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.getUploadStatistics(query);

      expect(result).toEqual({
        filters: query,
        data: [],
        message: 'Upload statistics retrieved successfully',
      });
      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('getChatbotStats', () => {
    it('should aggregate chatbot analytics metrics', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([
        {
          metadata: {
            noSource: false,
            fallbackKeyword: true,
            timings: {
              embeddingMs: 40,
              searchMs: 100,
              geminiMs: 1000,
              saveDbMs: 30,
              totalMs: 1170,
            },
          },
        },
        {
          metadata: {
            noSource: true,
            fallbackKeyword: false,
            timings: {
              embeddingMs: 20,
              searchMs: 50,
              geminiMs: 0,
              saveDbMs: 10,
              totalMs: 80,
            },
          },
        },
      ]);

      mockPrismaService.chatSource.groupBy.mockResolvedValue([
        { documentId: 'doc-1', _count: { documentId: 5 } },
      ]);
      mockPrismaService.document.findMany.mockResolvedValue([
        { id: 'doc-1', title: 'Test Doc' },
      ]);

      const result = await service.getChatbotStats();

      expect(result).toEqual({
        totalQuestions: 2,
        avgResponseTime: {
          avgEmbeddingMs: 30,
          avgSearchMs: 75,
          avgGeminiMs: 500,
          avgSaveDbMs: 20,
          avgTotalMs: 625,
        },
        noSourceCount: 1,
        fallbackKeywordCount: 1,
        topCitedDocuments: [
          { documentId: 'doc-1', title: 'Test Doc', citeCount: 5 },
        ],
        message: 'Chatbot statistics retrieved successfully',
      });
    });
  });
});
