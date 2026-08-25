import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
  ModerationFlag,
  ModerationStatus,
} from '../../generated/prisma/client';
import { AdminDocumentsController } from './admin-documents.controller';

describe('AdminDocumentsController – moderation actions', () => {
  const mockPrisma = {
    document: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue(undefined),
    },
  };

  const controller = new AdminDocumentsController(mockPrisma as never);
  const admin = { id: 'admin-id' };
  const now = new Date('2026-08-21T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.auditLog.create.mockResolvedValue(undefined);
  });

  // ── Listing ──────────────────────────────────────────────────────────────

  it('lists only PUBLIC documents for the moderation console', async () => {
    mockPrisma.document.findMany.mockResolvedValue([]);
    mockPrisma.document.count.mockResolvedValue(0);

    await controller.findAll({ page: 1, limit: 20 });

    expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ visibility: DocumentVisibility.PUBLIC }),
      }),
    );
  });

  it('filters documents by keyword across title owner and subject', async () => {
    mockPrisma.document.findMany.mockResolvedValue([]);
    mockPrisma.document.count.mockResolvedValue(0);

    await controller.findAll({
      page: 1,
      limit: 20,
      aiStatus: ExtractionStatus.COMPLETED,
      keyword: 'student@example.com',
    });

    const call = mockPrisma.document.findMany.mock.calls[0][0] as {
      where: { OR?: unknown[] };
    };
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toHaveLength(7);
  });

  // ── Approve ──────────────────────────────────────────────────────────────

  it('approves a document and sets status to ACTIVE', async () => {
    mockPrisma.document.findUnique.mockResolvedValue({ id: 'doc-1', ownerId: 'owner-1', title: 'Test' });
    mockPrisma.document.update.mockResolvedValue({
      id: 'doc-1',
      moderationStatus: ModerationStatus.APPROVED,
      moderationFlag: ModerationFlag.NORMAL,
      rejectionReason: null,
      reviewedAt: now,
      reviewedBy: admin.id,
      updatedAt: now,
    });

    const result = await controller.approve('doc-1', admin);

    expect(result.moderationStatus).toBe(ModerationStatus.APPROVED);
    expect(mockPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: expect.objectContaining({
          moderationStatus: ModerationStatus.APPROVED,
          status: DocumentStatus.ACTIVE,
          rejectionReason: null,
        }),
      }),
    );
  });

  it('does not reveal private documents through the approve endpoint', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(null);

    await expect(controller.approve('doc-private', admin)).rejects.toThrow('Document not found');
    expect(mockPrisma.document.findUnique).toHaveBeenCalledWith({
      where: { id: 'doc-private', visibility: DocumentVisibility.PUBLIC },
      select: { id: true, ownerId: true, title: true },
    });
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  // ── Reject ───────────────────────────────────────────────────────────────

  it('rejects a document and persists the reason', async () => {
    mockPrisma.document.findUnique.mockResolvedValue({ id: 'doc-1', ownerId: 'owner-1', title: 'Test' });
    mockPrisma.document.update.mockResolvedValue({
      id: 'doc-1',
      moderationStatus: ModerationStatus.REJECTED,
      moderationFlag: ModerationFlag.NORMAL,
      rejectionReason: 'Duplicate content',
      reviewedAt: now,
      reviewedBy: admin.id,
      updatedAt: now,
    });

    const result = await controller.reject('doc-1', { reason: 'Duplicate content' }, admin);

    expect(result.moderationStatus).toBe(ModerationStatus.REJECTED);
    expect(result.rejectionReason).toBe('Duplicate content');
    expect(mockPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moderationStatus: ModerationStatus.REJECTED,
          status: DocumentStatus.HIDDEN,
          rejectionReason: 'Duplicate content',
        }),
      }),
    );
  });

  it('does not reveal private documents through the reject endpoint', async () => {
    mockPrisma.document.findUnique.mockResolvedValue(null);

    await expect(
      controller.reject('doc-private', { reason: 'Not applicable' }, admin),
    ).rejects.toThrow('Document not found');
    expect(mockPrisma.document.update).not.toHaveBeenCalled();
  });

  // ── Hide ─────────────────────────────────────────────────────────────────

  it('hides a document and returns HIDDEN status', async () => {
    mockPrisma.document.findUnique.mockResolvedValue({ id: 'doc-1' });
    mockPrisma.document.update.mockResolvedValue({
      id: 'doc-1',
      status: DocumentStatus.HIDDEN,
      updatedAt: now,
    });

    const result = await controller.hide('doc-1', { hidden: true, reason: 'Violation' }, admin);

    expect(result.status).toBe(DocumentStatus.HIDDEN);
    expect(result.moderationReason).toBe('Violation');
  });

  it('unhides a document and returns ACTIVE status', async () => {
    mockPrisma.document.findUnique.mockResolvedValue({ id: 'doc-1' });
    mockPrisma.document.update.mockResolvedValue({
      id: 'doc-1',
      status: DocumentStatus.ACTIVE,
      updatedAt: now,
    });

    const result = await controller.hide('doc-1', { hidden: false }, admin);

    expect(result.status).toBe(DocumentStatus.ACTIVE);
  });
});
