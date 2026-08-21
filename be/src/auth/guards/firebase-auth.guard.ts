import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import { Prisma, UserStatus } from '../../generated/prisma/client';
import { FIREBASE_AUTH } from '../../firebase/firebase.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { getAuthSessionCookie } from '../auth-session';
import { AuthenticatedRequest } from '../auth.types';
import { createMockAdminUser, isMockAuthEnabled } from '../mock-auth';

const AUTHENTICATED_USER_SELECT = {
  id: true,
  firebaseUid: true,
  email: true,
  fullName: true,
  status: true,
  termsAcceptedAt: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    @Inject(FIREBASE_AUTH) private readonly firebaseAuth: Auth,
    private readonly prisma: PrismaService,
  ) {}

  // Kiểm tra điều kiện activate.
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (isMockAuthEnabled()) {
      request.user = createMockAdminUser();
      return true;
    }

    const bearerToken = this.extractBearerToken(request.headers.authorization);
    const sessionCookie = getAuthSessionCookie(request);

    if (!bearerToken && !sessionCookie) {
      throw new UnauthorizedException('Missing authentication session');
    }

    try {
      const decodedToken = await this.verifyCredential(
        bearerToken,
        sessionCookie,
      );
      const dbUser = await this.prisma.user.findUnique({
        where: { firebaseUid: decodedToken.uid },
        select: AUTHENTICATED_USER_SELECT,
      });

      if (!dbUser) {
        throw new ForbiddenException('Account registration is required');
      }

      if (!dbUser.termsAcceptedAt) {
        throw new ForbiddenException('Account registration is required');
      }

      if (dbUser.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException('User is inactive or blocked');
      }

      request.user = dbUser;
      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
  }

  // Xử lý bearer token.
  private extractBearerToken(authorization?: string): string | undefined {
    const [scheme, token] = authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }

  // Kiểm tra điều kiện credential.
  private verifyCredential(
    bearerToken?: string,
    sessionCookie?: string,
  ): Promise<DecodedIdToken> {
    if (bearerToken) {
      return this.firebaseAuth.verifyIdToken(bearerToken);
    }

    return this.firebaseAuth.verifySessionCookie(sessionCookie!, true);
  }
}
