import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Prisma, RoleName, User, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { AdminMutableUserStatus } from './dto/update-user-status.dto';

type UserWithRole = User & {
  role: { name: RoleName };
};

export type AdminUserDto = {
  id: string;
  firebaseUid: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  authProvider: string;
  role: RoleName;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
};

export type AdminUsersResponse = {
  items: AdminUserDto[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
};

@Injectable()
export class AdminUsersService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Lấy danh sách dữ liệu phù hợp.
  async findAll(query: AdminUsersQueryDto): Promise<AdminUsersResponse> {
    const where = this.buildWhere(query);
    const page = query.page;
    const limit = query.limit;
    const [items, totalItems] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { role: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    const totalPages = Math.ceil(totalItems / limit);

    return {
      items: items.map((user) => this.toAdminUserDto(user)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  // Cập nhật trạng thái.
  async updateStatus(
    id: string,
    status: AdminMutableUserStatus,
    reason?: string,
    actorUserId = id,
  ): Promise<AdminUserDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    if (id === actorUserId && status === AdminMutableUserStatus.BLOCKED) {
      throw new BadRequestException('Admins cannot block their own account.');
    }

    if (
      existingUser.role.name === RoleName.ADMIN &&
      status === AdminMutableUserStatus.BLOCKED
    ) {
      throw new BadRequestException(
        'Admins cannot block other admin accounts.',
      );
    }

    if (existingUser.status === UserStatus.INACTIVE) {
      throw new BadRequestException(
        'Pending email verification users must be activated through email verification.',
      );
    }

    // Cập nhật người dùng trong database.
    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
      include: { role: true },
    });

    await this.auditLogService.create({
      userId: actorUserId,
      action: 'admin.user_status_updated',
      targetType: 'User',
      targetId: id,
      metadata: {
        status,
        reason: reason ?? null,
      },
    });

    return this.toAdminUserDto(user);
  }

  // Chuyển đổi hoặc chuẩn hóa where.
  private buildWhere(query: AdminUsersQueryDto): Prisma.UserWhereInput {
    return {
      status: query.status,
      role: query.role ? { name: query.role } : undefined,
      OR: query.keyword
        ? [
            { email: { contains: query.keyword, mode: 'insensitive' } },
            { fullName: { contains: query.keyword, mode: 'insensitive' } },
          ]
        : undefined,
    };
  }

  // Chuyển đổi hoặc chuẩn hóa admin người dùng dto.
  private toAdminUserDto(user: UserWithRole): AdminUserDto {
    return {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      authProvider: user.authProvider,
      role: user.role.name,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastLogin: null,
    };
  }
}
