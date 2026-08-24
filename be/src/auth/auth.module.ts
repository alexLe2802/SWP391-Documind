import { forwardRef, Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { OptionalFirebaseAuthGuard } from './guards/optional-firebase-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [forwardRef(() => AuditLogModule), MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    FirebaseAuthGuard,
    OptionalFirebaseAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    FirebaseAuthGuard,
    OptionalFirebaseAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
