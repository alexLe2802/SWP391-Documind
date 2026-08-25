import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard/dashboard.service';
import { DownloadLogService } from '../download-log/download-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockDashboardService = {
    getUploadStatistics: jest.fn(),
  };

  const mockDownloadLogService = {
    getMostDownloaded: jest.fn(),
  };

  const mockPrismaService = {
    savedDocument: {
      groupBy: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: DashboardService,
          useValue: mockDashboardService,
        },
        {
          provide: DownloadLogService,
          useValue: mockDownloadLogService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('delegates upload statistics to the dashboard service', async () => {
    const query = { groupBy: 'day' as const };
    const response = {
      filters: query,
      data: [{ date: '2026-06-01', count: 2 }],
      message: 'Upload statistics retrieved successfully',
    };
    mockDashboardService.getUploadStatistics.mockResolvedValue(response);

    await expect(service.getUploadStatistics(query)).resolves.toBe(response);
    expect(mockDashboardService.getUploadStatistics).toHaveBeenCalledWith(
      query,
    );
  });

  it('returns most downloaded documents from download log aggregation', async () => {
    const query = {
      fromDate: '2026-06-01T00:00:00Z',
      toDate: '2026-06-30T23:59:59Z',
      limit: 5,
    };
    const data = [
      {
        documentId: 'document-1',
        title: 'Lecture 1',
        fileName: 'lecture-1.pdf',
        fileType: 'application/pdf',
        downloadCount: 4,
      },
    ];
    mockDownloadLogService.getMostDownloaded.mockResolvedValue(data);

    await expect(service.getMostDownloaded(query)).resolves.toEqual({
      filters: query,
      data,
      message: 'Most downloaded documents retrieved successfully',
    });
    expect(mockDownloadLogService.getMostDownloaded).toHaveBeenCalledWith(
      query,
    );
  });

  it('returns most saved documents in grouped count order', async () => {
    mockPrismaService.savedDocument.groupBy.mockResolvedValue([
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

    const query = {
      fromDate: '2026-06-01T00:00:00Z',
      toDate: '2026-06-30T23:59:59Z',
      limit: 3,
    };
    const result = await service.getMostSaved(query);

    expect(result).toEqual({
      filters: query,
      data: [
        {
          documentId: 'document-2',
          title: 'Lecture 2',
          fileName: 'lecture-2.pdf',
          fileType: 'application/pdf',
          saveCount: 5,
        },
        {
          documentId: 'document-1',
          title: 'Lecture 1',
          fileName: 'lecture-1.pdf',
          fileType: 'application/pdf',
          saveCount: 3,
        },
      ],
      message: 'Most saved documents retrieved successfully',
    });
    expect(mockPrismaService.savedDocument.groupBy).toHaveBeenCalledWith({
      by: ['documentId'],
      where: {
        savedAt: {
          gte: new Date('2026-06-01T00:00:00Z'),
          lte: new Date('2026-06-30T23:59:59Z'),
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

  it('returns an empty most-saved report without loading documents', async () => {
    mockPrismaService.savedDocument.groupBy.mockResolvedValue([]);

    await expect(service.getMostSaved({})).resolves.toEqual({
      filters: {},
      data: [],
      message: 'Most saved documents retrieved successfully',
    });
    expect(mockPrismaService.savedDocument.groupBy).toHaveBeenCalledWith({
      by: ['documentId'],
      where: {},
      _count: { _all: true },
      orderBy: { _count: { documentId: 'desc' } },
      take: 10,
    });
    expect(mockPrismaService.document.findMany).not.toHaveBeenCalled();
  });
});
