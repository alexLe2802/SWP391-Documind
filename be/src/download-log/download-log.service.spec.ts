import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { DownloadLogService } from './download-log.service';

describe('DownloadLogService', () => {
  let service: DownloadLogService;

  const mockPrismaService = {
    downloadLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DownloadLogService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DownloadLogService>(DownloadLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a download log for an authorized document download', async () => {
      const createdLog = {
        id: 'download-log-1',
        userId: 'user-1',
        documentId: 'document-1',
        downloadedAt: new Date('2026-06-17T10:00:00Z'),
      };
      mockPrismaService.downloadLog.create.mockResolvedValue(createdLog);

      const result = await service.create({
        userId: 'user-1',
        documentId: 'document-1',
      });

      expect(result).toBe(createdLog);
      expect(mockPrismaService.downloadLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          documentId: 'document-1',
        },
      });
    });
  });

  describe('findAll', () => {
    it('should return an empty paginated state with default pagination', async () => {
      mockPrismaService.downloadLog.findMany.mockResolvedValue([]);
      mockPrismaService.downloadLog.count.mockResolvedValue(0);

      const result = await service.findAll({});

      expect(result).toEqual({
        items: [],
        meta: {
          page: 1,
          limit: 10,
          totalItems: 0,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
        },
      });
      expect(mockPrismaService.downloadLog.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: { downloadedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          document: {
            select: {
              id: true,
              title: true,
              fileName: true,
              fileType: true,
            },
          },
        },
      });
      expect(mockPrismaService.downloadLog.count).toHaveBeenCalledWith({
        where: {},
      });
    });

    it('should filter logs by user and document with requested pagination', async () => {
      const query = {
        userId: 'user-1',
        documentId: 'document-1',
        page: 2,
        limit: 5,
      };
      mockPrismaService.downloadLog.findMany.mockResolvedValue([]);
      mockPrismaService.downloadLog.count.mockResolvedValue(0);

      await service.findAll(query);

      expect(mockPrismaService.downloadLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            documentId: 'document-1',
          },
          skip: 5,
          take: 5,
        }),
      );
      expect(mockPrismaService.downloadLog.count).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          documentId: 'document-1',
        },
      });
    });
  });

  describe('getMostDownloaded', () => {
    it('should return most downloaded documents in grouped count order', async () => {
      mockPrismaService.downloadLog.groupBy.mockResolvedValue([
        { documentId: 'document-2', _count: { _all: 5 } },
        { documentId: 'document-1', _count: { _all: 3 } },
        { documentId: 'missing-document', _count: { _all: 1 } },
      ]);
      mockPrismaService.document.findMany.mockResolvedValue([
        {
          id: 'document-1',
          title: 'Lecture 1',
          fileName: 'lecture-1.pdf',
          fileType: 'application/pdf',
        },
        {
          id: 'document-2',
          title: 'Lecture 2',
          fileName: 'lecture-2.pdf',
          fileType: 'application/pdf',
        },
      ]);

      const result = await service.getMostDownloaded({
        fromDate: '2026-06-01T00:00:00Z',
        toDate: '2026-06-17T23:59:59Z',
        limit: 3,
      });

      expect(result).toEqual([
        {
          documentId: 'document-2',
          title: 'Lecture 2',
          fileName: 'lecture-2.pdf',
          fileType: 'application/pdf',
          downloadCount: 5,
        },
        {
          documentId: 'document-1',
          title: 'Lecture 1',
          fileName: 'lecture-1.pdf',
          fileType: 'application/pdf',
          downloadCount: 3,
        },
      ]);
      expect(mockPrismaService.downloadLog.groupBy).toHaveBeenCalledWith({
        by: ['documentId'],
        where: {
          downloadedAt: {
            gte: new Date('2026-06-01T00:00:00Z'),
            lte: new Date('2026-06-17T23:59:59Z'),
          },
        },
        _count: { _all: true },
        orderBy: { _count: { documentId: 'desc' } },
        take: 3,
      });
      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['document-2', 'document-1', 'missing-document'],
          },
        },
        select: {
          id: true,
          title: true,
          fileName: true,
          fileType: true,
        },
      });
    });

    it('should return an empty list without loading documents when no logs exist', async () => {
      mockPrismaService.downloadLog.groupBy.mockResolvedValue([]);

      const result = await service.getMostDownloaded();

      expect(result).toEqual([]);
      expect(mockPrismaService.downloadLog.groupBy).toHaveBeenCalledWith({
        by: ['documentId'],
        where: {},
        _count: { _all: true },
        orderBy: { _count: { documentId: 'desc' } },
        take: 10,
      });
      expect(mockPrismaService.document.findMany).not.toHaveBeenCalled();
    });
  });
});
