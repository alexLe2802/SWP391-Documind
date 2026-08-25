import { BadRequestException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const prisma = {
    category: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    subject: {
      findFirst: jest.fn(),
    },
    document: {
      count: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const storage = { deleteObject: jest.fn() };
  const service = new CategoriesService(prisma as never, storage as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects duplicate category names', async () => {
    prisma.subject.findFirst.mockResolvedValue({ id: 'subject-id' });
    prisma.category.findFirst.mockResolvedValue({ id: 'category-id' });

    await expect(
      service.create('owner-id', {
        name: 'Lecture notes',
        subjectId: 'subject-id',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects deleting a category owned by another user', async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat-1',
      ownerId: 'other-owner',
      name: 'Backend',
    });

    await expect(service.remove('cat-1', 'owner-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('deletes owned category documents from the database and storage', async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: 'cat-2',
      ownerId: 'owner-id',
      name: 'Empty',
    });
    prisma.document.findMany.mockResolvedValue([
      { id: 'doc-1', storagePath: 'users/owner-id/doc-1.pdf' },
    ]);
    prisma.document.deleteMany.mockResolvedValue({ count: 1 });
    prisma.category.update.mockResolvedValue({ id: 'cat-2' });
    prisma.$transaction.mockResolvedValue([]);

    const result = await service.remove('cat-2', 'owner-id');
    expect(result).toEqual({ message: 'Category deleted' });
    expect(prisma.document.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner-id', categoryId: 'cat-2' },
    });
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'owner-id',
      'users/owner-id/doc-1.pdf',
    );
    type UpdateArgs = {
      data: { deletedAt: unknown };
      where: { id: string };
    };
    const updateMock = prisma.category.update as jest.MockedFunction<
      (args: UpdateArgs) => unknown
    >;
    const updateCall = updateMock.mock.calls[0]?.[0];
    expect(updateCall).toBeDefined();
    if (!updateCall) return;
    expect(updateCall.where).toEqual({ id: 'cat-2' });
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });
});
