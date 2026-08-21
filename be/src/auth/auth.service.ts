import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  AuthProvider,
  Prisma,
  RoleName,
  UserStatus,
} from '../generated/prisma/client';
import { FIREBASE_AUTH } from '../firebase/firebase.constants';
import { PrismaService } from '../prisma/prisma.service';
import { AuthEmailService } from '../mail/auth-email.service';
import { AuthenticatedUser } from './auth.types';
import { RegisterUserDto } from './dto/register-user.dto';
import { AUTH_SESSION_DURATION_MS } from './auth-session';

export type CurrentUserResponse = {
  id: string;
  roleId: string;
  firebaseUid: string;
  authProvider: AuthProvider;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: RoleName;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLogin: string | null;
};

export type AuthLoginResponse = {
  user: CurrentUserResponse;
  role: RoleName;
  permissions: string[];
  isNewUser: boolean;
};

export type AuthMeResponse = Omit<AuthLoginResponse, 'isNewUser'>;

const AUTH_USER_SELECT = {
  id: true,
  roleId: true,
  firebaseUid: true,
  authProvider: true,
  fullName: true,
  email: true,
  avatarUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  termsAcceptedAt: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

export type UserWithRole = Prisma.UserGetPayload<{
  select: typeof AUTH_USER_SELECT;
}>;

@Injectable()
export class AuthService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    @Inject(FIREBASE_AUTH) private readonly firebaseAuth: Auth,
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly authEmailService: AuthEmailService,
  ) {}

  // Thực hiện chức năng firebase đăng nhập.
  async firebaseLogin(idToken: string): Promise<AuthLoginResponse> {
    const decodedToken = await this.verifyIdToken(idToken);
    const user = await this.findFirebaseUser(decodedToken.uid);

    if (user.status === UserStatus.INACTIVE) {
      if (!decodedToken.email_verified) {
        throw new ForbiddenException('Email verification is required');
      }

      // Cập nhật người dùng trong database.
      const activatedUser = await this.prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE },
        select: AUTH_USER_SELECT,
      });
      await this.createAuditLog(activatedUser.id, 'auth.account_activated');
      await this.createAuditLog(activatedUser.id, 'auth.firebase_login');
      return this.toAuthLoginResponse(activatedUser, false);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User is blocked');
    }

    await this.createAuditLog(user.id, 'auth.firebase_login');
    return this.toAuthLoginResponse(user, false);
  }

  // Tạo hoặc lưu phiên cookie.
  async createSessionCookie(idToken: string): Promise<string> {
    try {
      return await this.firebaseAuth.createSessionCookie(idToken, {
        expiresIn: AUTH_SESSION_DURATION_MS,
      });
    } catch {
      throw new UnauthorizedException(
        'Could not create a secure authentication session',
      );
    }
  }

  // Tạo hoặc lưu đăng ký.
  async register(
    idToken: string,
    payload: RegisterUserDto,
  ): Promise<AuthLoginResponse> {
    if (!payload.acceptedTerms) {
      throw new ForbiddenException(
        'Terms of service and privacy policy must be accepted',
      );
    }

    const decodedToken = await this.verifyIdToken(idToken);
    const email = this.getRequiredEmail(decodedToken);
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ firebaseUid: decodedToken.uid }, { email }],
      },
      select: AUTH_USER_SELECT,
    });

    const isGoogleRegistration = this.hasProviderIdentity(
      decodedToken,
      'google.com',
    );

    if (existingUser) {
      if (
        existingUser.firebaseUid === decodedToken.uid &&
        !existingUser.termsAcceptedAt
      ) {
        if (isGoogleRegistration && decodedToken.email_verified) {
          await this.firebaseAuth.updateUser(decodedToken.uid, {
            emailVerified: false,
          });
        }
        // Cập nhật người dùng trong database.
        const repairedUser = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            fullName: payload.fullName.trim(),
            avatarUrl: this.resolveAvatarUrl(decodedToken),
            authProvider: isGoogleRegistration
              ? AuthProvider.GOOGLE
              : AuthProvider.EMAIL_PASSWORD,
            status: UserStatus.INACTIVE,
            termsAcceptedAt: new Date(),
          },
          select: AUTH_USER_SELECT,
        });
        await this.createAuditLog(repairedUser.id, 'auth.registration_pending');
        await this.authEmailService.sendRegistrationEmail(
          email,
          payload.fullName.trim(),
        );
        return this.toAuthLoginResponse(repairedUser, false);
      }
      if (
        existingUser.firebaseUid === decodedToken.uid &&
        existingUser.status === UserStatus.INACTIVE
      ) {
        // Cập nhật người dùng trong database.
        const pendingUser = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            fullName: payload.fullName.trim(),
            termsAcceptedAt: existingUser.termsAcceptedAt ?? new Date(),
          },
          select: AUTH_USER_SELECT,
        });
        await this.authEmailService.sendRegistrationEmail(
          email,
          payload.fullName.trim(),
        );
        return this.toAuthLoginResponse(pendingUser, false);
      }
      throw new ForbiddenException('Account is already registered');
    }

    // Tạo mới hoặc cập nhật vai trò trong database.
    const role = await this.prisma.role.upsert({
      where: { name: RoleName.USER },
      update: {},
      create: { name: RoleName.USER },
    });
    if (isGoogleRegistration && decodedToken.email_verified) {
      await this.firebaseAuth.updateUser(decodedToken.uid, {
        emailVerified: false,
      });
    }

    // Tạo người dùng trong database.
    const user = await this.prisma.user.create({
      data: {
        firebaseUid: decodedToken.uid,
        email,
        fullName: payload.fullName.trim(),
        avatarUrl: this.resolveAvatarUrl(decodedToken),
        authProvider: isGoogleRegistration
          ? AuthProvider.GOOGLE
          : AuthProvider.EMAIL_PASSWORD,
        roleId: role.id,
        status: UserStatus.INACTIVE,
        termsAcceptedAt: new Date(),
      },
      select: AUTH_USER_SELECT,
    });

    await this.createAuditLog(user.id, 'auth.registration_pending');
    await this.authEmailService.sendRegistrationEmail(
      email,
      payload.fullName.trim(),
    );
    return this.toAuthLoginResponse(user, true);
  }

  // Thực hiện chức năng forgot password.
  forgotPassword(email: string): Promise<void> {
    return this.authEmailService.sendPasswordResetEmail(email);
  }

  // Lấy dữ liệu hiện tại người dùng.
  async getCurrentUser(
    authenticatedUser: AuthenticatedUser,
  ): Promise<AuthMeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: authenticatedUser.id },
      select: AUTH_USER_SELECT,
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User is inactive or blocked');
    }

    return this.toAuthMeResponse(user);
  }

  // Kiểm tra điều kiện id token.
  private async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    try {
      return await this.firebaseAuth.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
  }

  // Lấy dữ liệu or create firebase người dùng.
  async findOrCreateFirebaseUser(
    decodedToken: DecodedIdToken,
  ): Promise<{ user: UserWithRole; isNewUser: boolean }> {
    const email = this.getRequiredEmail(decodedToken);
    const existingUser = await this.prisma.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
      select: AUTH_USER_SELECT,
    });

    if (existingUser) {
      // Cập nhật người dùng trong database.
      const user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email,
          fullName: this.resolveFullName(decodedToken),
          avatarUrl: this.resolveAvatarUrl(decodedToken),
          authProvider: this.resolveAuthProvider(decodedToken),
        },
        select: AUTH_USER_SELECT,
      });
      return { user, isNewUser: false };
    }

    const existingUserByEmail = await this.prisma.user.findUnique({
      where: { email },
      select: AUTH_USER_SELECT,
    });

    if (existingUserByEmail) {
      // Cập nhật người dùng trong database.
      const user = await this.prisma.user.update({
        where: { id: existingUserByEmail.id },
        data: {
          firebaseUid: decodedToken.uid,
          avatarUrl: this.resolveAvatarUrl(decodedToken),
          authProvider: this.resolveAuthProvider(decodedToken),
        },
        select: AUTH_USER_SELECT,
      });
      return { user, isNewUser: false };
    }

    // Tạo mới hoặc cập nhật vai trò trong database.
    const role = await this.prisma.role.upsert({
      where: { name: RoleName.USER },
      update: {},
      create: { name: RoleName.USER },
    });

    // Tạo người dùng trong database.
    const user = await this.prisma.user.create({
      data: {
        firebaseUid: decodedToken.uid,
        email,
        fullName: this.resolveFullName(decodedToken),
        avatarUrl: this.resolveAvatarUrl(decodedToken),
        authProvider: this.resolveAuthProvider(decodedToken),
        roleId: role.id,
        status: UserStatus.ACTIVE,
      },
      select: AUTH_USER_SELECT,
    });
    return { user, isNewUser: true };
  }

  // Lấy dữ liệu firebase người dùng.
  private async findFirebaseUser(firebaseUid: string): Promise<UserWithRole> {
    const user = await this.prisma.user.findUnique({
      where: { firebaseUid },
      select: AUTH_USER_SELECT,
    });

    if (!user || !user.termsAcceptedAt) {
      throw new ForbiddenException('Account registration is required');
    }

    return user;
  }

  // Lấy dữ liệu required email.
  private getRequiredEmail(decodedToken: DecodedIdToken): string {
    if (!decodedToken.email) {
      throw new UnauthorizedException('Firebase user email is required');
    }

    return decodedToken.email;
  }

  // Chuyển đổi hoặc chuẩn hóa full name.
  private resolveFullName(decodedToken: DecodedIdToken): string {
    if (typeof decodedToken.name === 'string' && decodedToken.name.trim()) {
      return decodedToken.name;
    }

    return decodedToken.email ?? 'AI Study Hub User';
  }

  // Chuyển đổi hoặc chuẩn hóa avatar url.
  private resolveAvatarUrl(decodedToken: DecodedIdToken): string | null {
    return typeof decodedToken.picture === 'string'
      ? decodedToken.picture
      : null;
  }

  // Kiểm tra điều kiện provider identity.
  private hasProviderIdentity(
    decodedToken: DecodedIdToken,
    provider: string,
  ): boolean {
    const firebaseClaims = decodedToken.firebase as {
      identities?: Record<string, unknown>;
    };
    const identity = firebaseClaims.identities?.[provider];

    return Array.isArray(identity) && identity.length > 0;
  }

  // Chuyển đổi hoặc chuẩn hóa xác thực provider.
  private resolveAuthProvider(decodedToken: DecodedIdToken): AuthProvider {
    const signInProvider = decodedToken.firebase.sign_in_provider;
    return signInProvider === 'password'
      ? AuthProvider.EMAIL_PASSWORD
      : AuthProvider.GOOGLE;
  }

  // Tạo hoặc lưu audit log.
  private async createAuditLog(userId: string, action: string): Promise<void> {
    await this.auditLogService.create({
      userId,
      action,
      targetType: 'User',
      targetId: userId,
    });
  }

  // Chuyển đổi hoặc chuẩn hóa hiện tại người dùng phản hồi.
  private toCurrentUserResponse(user: UserWithRole): CurrentUserResponse {
    return {
      id: user.id,
      roleId: user.roleId,
      firebaseUid: user.firebaseUid,
      authProvider: user.authProvider,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role.name,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastLogin: null,
    };
  }

  // Chuyển đổi hoặc chuẩn hóa xác thực đăng nhập phản hồi.
  private toAuthLoginResponse(
    user: UserWithRole,
    isNewUser: boolean,
  ): AuthLoginResponse {
    return {
      user: this.toCurrentUserResponse(user),
      role: user.role.name,
      permissions: this.resolvePermissions(user.role.name),
      isNewUser,
    };
  }

  // Chuyển đổi hoặc chuẩn hóa xác thực me phản hồi.
  private toAuthMeResponse(user: UserWithRole): AuthMeResponse {
    return {
      user: this.toCurrentUserResponse(user),
      role: user.role.name,
      permissions: this.resolvePermissions(user.role.name),
    };
  }

  // Chuyển đổi hoặc chuẩn hóa permissions.
  private resolvePermissions(role: RoleName): string[] {
    return role === RoleName.ADMIN
      ? ['admin:read', 'admin:write', 'user:read', 'profile:write']
      : ['user:read', 'profile:write'];
  }
}
