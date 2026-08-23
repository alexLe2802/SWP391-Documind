import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Prisma, RoleName, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadedFile } from '../storage/storage.types';
import { UpdateProfileDto } from './dto/update-profile.dto';

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

const PROFILE_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

type UserWithRole = Prisma.UserGetPayload<{
  select: typeof PROFILE_USER_SELECT;
}>;

export type UserProfileResponse = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: RoleName;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type AvatarRetrievalResult =
  | { type: 'redirect'; url: string }
  | { type: 'buffer'; buffer: Buffer<ArrayBufferLike>; contentType: string };

@Injectable()
export class UsersService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  // Lấy dữ liệu hồ sơ.
  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.findUser(userId);
    return this.toProfileResponse(user);
  }

  // Cập nhật hồ sơ.
  async updateProfile(
    userId: string,
    payload: UpdateProfileDto,
  ): Promise<UserProfileResponse> {
    if (payload.fullName === undefined && payload.avatarUrl === undefined) {
      throw new BadRequestException(
        'At least one profile field must be provided',
      );
    }

    await this.findUser(userId);

    // Cập nhật người dùng trong database.
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: payload.fullName,
        avatarUrl: payload.avatarUrl,
      },
      select: PROFILE_USER_SELECT,
    });

    await this.auditLogService.create({
      userId,
      action: 'user.profile_updated',
      targetType: 'User',
      targetId: userId,
      metadata: {
        updatedFields: Object.keys(payload),
      },
    });

    return this.toProfileResponse(user);
  }

  // Tải ảnh đại diện lên Cloudflare R2 và cập nhật hồ sơ.
  async uploadAvatar(
    userId: string,
    file: UploadedFile,
    baseUrl: string,
  ): Promise<UserProfileResponse> {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }

    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Invalid image format. Allowed formats: JPEG, PNG, WebP, GIF',
      );
    }

    if (file.size > MAX_AVATAR_SIZE) {
      throw new BadRequestException('Avatar image must be 5MB or smaller');
    }

    await this.findUser(userId);

    const objectKey = `users/${userId}/avatar.jpg`;
    await this.storageService.uploadObject({
      objectKey,
      body: file.buffer,
      contentType: file.mimetype,
      contentLength: file.size,
    });

    const publicUrl = this.configService.get<string>('R2_PUBLIC_URL', '');
    const avatarUrl = publicUrl
      ? `${publicUrl.replace(/\/$/, '')}/${objectKey}?t=${Date.now()}`
      : `${baseUrl.replace(/\/$/, '')}/users/${userId}/avatar?t=${Date.now()}`;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: PROFILE_USER_SELECT,
    });

    await this.auditLogService.create({
      userId,
      action: 'user.avatar_updated',
      targetType: 'User',
      targetId: userId,
      metadata: { avatarUrl, objectKey },
    });

    return this.toProfileResponse(user);
  }

  // Lấy dữ liệu ảnh đại diện từ Cloudflare R2 hoặc URL ngoài.
  async getAvatar(userId: string): Promise<AvatarRetrievalResult> {
    const user = await this.findUser(userId);

    if (!user.avatarUrl) {
      throw new NotFoundException('User has no avatar');
    }

    // Nếu là URL ngoài (Google, ảnh mạng), chuyển hướng trực tiếp
    if (
      user.avatarUrl.startsWith('http://') ||
      user.avatarUrl.startsWith('https://')
    ) {
      if (!user.avatarUrl.includes(`/users/${userId}/avatar`)) {
        return { type: 'redirect', url: user.avatarUrl };
      }
    }

    const objectKey = `users/${userId}/avatar.jpg`;
    const object = await this.storageService.getObjectWithMetadata(objectKey);

    return {
      type: 'buffer',
      buffer: object.buffer,
      contentType: object.contentType || 'image/jpeg',
    };
  }

  // Lấy dữ liệu người dùng.
  async findUser(userId: string): Promise<UserWithRole> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  // Chuyển đổi hoặc chuẩn hóa hồ sơ phản hồi.
  private toProfileResponse(user: UserWithRole): UserProfileResponse {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role.name,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}

