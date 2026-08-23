import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth.types';
import { getAuthSessionCookie } from '../auth-session';
import { isMockAuthEnabled } from '../mock-auth';
import { FirebaseAuthGuard } from './firebase-auth.guard';

@Injectable()
export class OptionalFirebaseAuthGuard implements CanActivate {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly firebaseAuthGuard: FirebaseAuthGuard) {}

  // Kiểm tra điều kiện activate.
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (
      request.headers.authorization ||
      getAuthSessionCookie(request) ||
      isMockAuthEnabled()
    ) {
      return this.firebaseAuthGuard.canActivate(context);
    }

    return true;
  }
}
