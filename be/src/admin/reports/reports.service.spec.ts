import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const mockPrisma = {
    downloadLog: { groupBy: jest.fn() },
    savedDocument: { groupBy: jest.fn() },
    document: { findMany: jest.fn() },
  };
  const service = new ReportsService(mockPrisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('returns empty when no download logs', async () => {
    mockPrisma.downloadLog.groupBy.mockResolvedValue([]);
    const result = await service.getMostDownloaded({ limit: 10 });
    expect(result.data).toEqual([]);
  });

  it('returns empty when no saved documents', async () => {
    mockPrisma.savedDocument.groupBy.mockResolvedValue([]);
    const result = await service.getMostSaved({ limit: 10 });
    expect(result.data).toEqual([]);
  });

  it('aggregates download counts correctly', async () => {
    mockPrisma.downloadLog.groupBy.mockResolvedValue([{ documentId: 'doc-1', _count: { _all: 42 } }]);
    mockPrisma.document.findMany.mockResolvedValue([{ id: 'doc-1', title: 'Lecture 1', fileName: 'lec1.pdf', fileType: 'application/pdf' }]);
    const result = await service.getMostDownloaded({ limit: 10 });
    expect(result.data[0].downloadCount).toBe(42);
  });

  it('aggregates save counts correctly', async () => {
    mockPrisma.savedDocument.groupBy.mockResolvedValue([{ documentId: 'doc-2', _count: { _all: 15 } }]);
    mockPrisma.document.findMany.mockResolvedValue([{ id: 'doc-2', title: 'Notes', fileName: 'notes.docx', fileType: 'application/docx' }]);
    const result = await service.getMostSaved({ limit: 10 });
    expect(result.data[0].saveCount).toBe(15);
  });

  it('throws when fromDate is after toDate', async () => {
    await expect(service.getMostDownloaded({ fromDate: '2026-09-01', toDate: '2026-08-01', limit: 10 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
