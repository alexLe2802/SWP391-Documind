import { Injectable } from '@nestjs/common';
import { Prisma, RoleName, User, UserStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';

type UserWithRole = User & { role: { name: RoleName } };

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
  constructor(private readonly prisma: PrismaService) {}

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
