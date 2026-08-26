import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('relies on the database UUID default when inserting a notification', async () => {
    const prisma = { $executeRaw: jest.fn().mockResolvedValue(1) };
    const service = new NotificationsService(prisma as never);

    await service.create({
      userId: '11111111-1111-4111-8111-111111111111',
      type: 'DOCUMENT_APPROVED',
      title: 'Approved',
      message: 'Document approved',
      documentId: '22222222-2222-4222-8222-222222222222',
    });

    const query = prisma.$executeRaw.mock.calls[0][0] as Prisma.Sql;
    expect(query.sql).toContain(
      'INSERT INTO "notifications" ("user_id", "type", "title", "message", "document_id")',
    );
    expect(query.sql).not.toContain('("id",');
  });
});
