import { ConflictException } from '@nestjs/common';
import { TagsService } from './tags.service';

describe('TagsService', () => {
  const prisma = {
    tag: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new TagsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('normalizes and rejects duplicate tag names', async () => {
    prisma.tag.findUnique.mockResolvedValue({ id: 'tag-id' });

    await expect(service.create({ name: '  Prisma  ' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.tag.findUnique).toHaveBeenCalledWith({
      where: { name: 'prisma' },
    });
  });
});
