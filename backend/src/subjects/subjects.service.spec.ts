import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubjectsService } from './subjects.service';

describe('SubjectsService', () => {
  const prisma = {
    subject: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    document: {
      count: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    category: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const storage = { deleteObject: jest.fn() };
  const service = new SubjectsService(prisma as never, storage as never);

  beforeEach(() => jest.clearAllMocks());

  it('returns an existing active subject with the same code', async () => {
    const existingSubject = {
      id: 'subject-id',
      ownerId: 'owner-id',
      code: 'SWE101',
      name: 'Software Engineering',
      deletedAt: null,
    };
    prisma.subject.findFirst.mockResolvedValue(existingSubject);

    await expect(
      service.create('owner-id', {
        code: 'SWE101',
        name: 'Software Engineering',
      }),
    ).resolves.toBe(existingSubject);
    expect(prisma.subject.create).not.toHaveBeenCalled();
  });

  it('restores a soft deleted subject with the same code without restoring documents', async () => {
    const restoredSubject = {
      id: 'deleted-subject-id',
      ownerId: 'owner-id',
      code: 'SCOUT',
      name: 'Huong Dao',
      deletedAt: null,
    };
    prisma.subject.findFirst.mockResolvedValue({
      id: 'deleted-subject-id',
      deletedAt: new Date(),
    });
    prisma.subject.update.mockResolvedValue(restoredSubject);

    await expect(
      service.create('owner-id', { code: 'SCOUT', name: 'Huong Dao' }),
    ).resolves.toBe(restoredSubject);
    expect(prisma.subject.create).not.toHaveBeenCalled();
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(prisma.subject.update).toHaveBeenCalledWith({
      where: { id: 'deleted-subject-id' },
      data: {
        deletedAt: null,
        name: 'Huong Dao',
        description: undefined,
      },
    });
  });

  it('throws when a subject is missing', async () => {
    prisma.subject.findFirst.mockResolvedValue(null);

    await expect(service.findOne('missing', 'owner-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects deleting a subject owned by another user', async () => {
    prisma.subject.findFirst.mockResolvedValue({
      id: 'sub-1',
      ownerId: 'other-owner',
      code: 'SWE',
      name: 'Software Engineering',
    });

    await expect(service.remove('sub-1', 'owner-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.subject.update).not.toHaveBeenCalled();
  });

  it('deletes owned subject documents from the database and storage', async () => {
    prisma.subject.findFirst.mockResolvedValue({
      id: 'sub-2',
      ownerId: 'owner-id',
      code: 'EMPTY',
      name: 'Empty',
    });
    prisma.document.findMany.mockResolvedValue([
      { id: 'doc-1', storagePath: 'users/owner-id/doc-1.pdf' },
    ]);
    prisma.document.deleteMany.mockResolvedValue({ count: 1 });
    prisma.category.updateMany.mockResolvedValue({ count: 0 });
    prisma.subject.update.mockResolvedValue({ id: 'sub-2' });
    prisma.$transaction.mockResolvedValue([]);

    const result = await service.remove('sub-2', 'owner-id');
    expect(result).toEqual({ message: 'Subject deleted' });
    expect(prisma.document.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner-id', subjectId: 'sub-2' },
    });
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'owner-id',
      'users/owner-id/doc-1.pdf',
    );
    type UpdateArgs = {
      data: { deletedAt: unknown };
      where: { id: string };
    };
    const updateMock = prisma.subject.update as jest.MockedFunction<
      (args: UpdateArgs) => unknown
    >;
    const updateCall = updateMock.mock.calls[0]?.[0];
    expect(updateCall).toBeDefined();
    if (!updateCall) return;
    expect(updateCall.where).toEqual({ id: 'sub-2' });
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });
});
