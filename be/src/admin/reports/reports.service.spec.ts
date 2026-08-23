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

  it('returns empty data when no download logs exist', async () => {
    mockPrisma.downloadLog.groupBy.mockResolvedValue([]);

    const result = await service.getMostDownloaded({ limit: 10 });

    expect(result.data).toEqual([]);
    expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
  });

  it('returns empty data when no saved documents exist', async () => {
    mockPrisma.savedDocument.groupBy.mockResolvedValue([]);

    const result = await service.getMostSaved({ limit: 10 });

    expect(result.data).toEqual([]);
    expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
  });

  it('aggregates download counts and maps document metadata', async () => {
    mockPrisma.downloadLog.groupBy.mockResolvedValue([
      { documentId: 'doc-1', _count: { _all: 42 } },
    ]);
    mockPrisma.document.findMany.mockResolvedValue([
      { id: 'doc-1', title: 'Lecture 1', fileName: 'lec1.pdf', fileType: 'application/pdf' },
    ]);

    const result = await service.getMostDownloaded({ limit: 10 });

    expect(result.data).toEqual([
      { documentId: 'doc-1', title: 'Lecture 1', fileName: 'lec1.pdf', fileType: 'application/pdf', downloadCount: 42 },
    ]);
  });

  it('aggregates save counts and maps document metadata', async () => {
    mockPrisma.savedDocument.groupBy.mockResolvedValue([
      { documentId: 'doc-2', _count: { _all: 15 } },
    ]);
    mockPrisma.document.findMany.mockResolvedValue([
      { id: 'doc-2', title: 'Notes 2', fileName: 'notes2.docx', fileType: 'application/docx' },
    ]);

    const result = await service.getMostSaved({ limit: 10 });

    expect(result.data).toEqual([
      { documentId: 'doc-2', title: 'Notes 2', fileName: 'notes2.docx', fileType: 'application/docx', saveCount: 15 },
    ]);
  });

  it('throws BadRequestException when fromDate is after toDate', async () => {
    await expect(
      service.getMostDownloaded({ fromDate: '2026-09-01', toDate: '2026-08-01', limit: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
