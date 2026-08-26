import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationType =
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_PENDING_REVIEW'
  | 'DOCUMENT_PUBLISHED'
  | 'DOCUMENT_APPROVED'
  | 'DOCUMENT_REJECTED';

export type UserNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  documentId: string | null;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
};

@Injectable()
export class NotificationsService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly prisma: PrismaService) {}

  // Tạo hoặc lưu create.
  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    documentId?: string;
  }): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "notifications" ("user_id", "type", "title", "message", "document_id")
      VALUES (${input.userId}::uuid, ${input.type}, ${input.title}, ${input.message}, ${input.documentId ?? null}::uuid)
    `);
  }

  // Lấy dữ liệu list.
  async list(
    userId: string,
    limit = 20,
  ): Promise<{
    items: UserNotification[];
    unreadCount: number;
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const [items, countRows] = await Promise.all([
      this.prisma.$queryRaw<UserNotification[]>(Prisma.sql`
        SELECT "id", "type", "title", "message", "document_id" AS "documentId",
               "is_read" AS "isRead", "created_at" AS "createdAt", "read_at" AS "readAt"
        FROM "notifications"
        WHERE "user_id" = ${userId}::uuid
        ORDER BY "created_at" DESC
        LIMIT ${safeLimit}
      `),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "notifications"
        WHERE "user_id" = ${userId}::uuid AND "is_read" = false
      `),
    ]);
    return { items, unreadCount: Number(countRows[0]?.count ?? 0) };
  }

  // Thực hiện chức năng mark read.
  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "notifications"
      SET "is_read" = true, "read_at" = COALESCE("read_at", NOW())
      WHERE "id" = ${id}::uuid AND "user_id" = ${userId}::uuid
    `);
  }

  // Thực hiện chức năng mark danh sách read.
  async markAllRead(userId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "notifications"
      SET "is_read" = true, "read_at" = COALESCE("read_at", NOW())
      WHERE "user_id" = ${userId}::uuid AND "is_read" = false
    `);
  }
}
