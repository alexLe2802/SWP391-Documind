import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('provides an id when inserting a notification', async () => {
    const executeRaw = jest
      .fn<Promise<number>, [unknown]>()
      .mockResolvedValue(1);
    const prisma = {
      $executeRaw: executeRaw,
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    await service.create({
      userId: '11111111-1111-4111-8111-111111111111',
      type: 'DOCUMENT_UPLOADED',
      title: 'Uploaded',
      message: 'Document uploaded',
      documentId: '22222222-2222-4222-8222-222222222222',
    });

    const query = executeRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    expect(query.strings.join('')).toContain(
      'INSERT INTO "notifications" ("id", "user_id", "type", "title", "message", "document_id")',
    );
    expect(query.values[0]).toEqual(expect.any(String));
    expect(query.values[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
