import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Auth } from 'firebase-admin/auth';
import { FIREBASE_AUTH } from '../firebase/firebase.constants';
import {
  buildPasswordResetEmail,
  buildRegistrationEmail,
} from './auth-email-templates';
import { MailService } from './mail.service';

@Injectable()
export class AuthEmailService {
  private readonly frontendUrl: string;
  private readonly logoUrl: string;

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    @Inject(FIREBASE_AUTH) private readonly firebaseAuth: Auth,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {
    this.frontendUrl = this.config
      .getOrThrow<string>('AUTH_EMAIL_FRONTEND_URL')
      .replace(/\/+$/, '');
    this.logoUrl = `${this.frontendUrl}/Logo.png`;
  }

  // Thực hiện nghiệp vụ send registration email.
  async sendRegistrationEmail(email: string, fullName: string): Promise<void> {
    const firebaseLink = await this.firebaseAuth.generateEmailVerificationLink(
      email,
      { url: `${this.frontendUrl}/login?verified=true` },
    );
    const actionUrl = this.buildFrontendActionUrl(
      firebaseLink,
      '/verify-email',
      'verifyEmail',
    );

    await this.mailService.send({
      from: this.config.getOrThrow<string>('REGISTRATION_EMAIL_FROM'),
      to: email,
      subject: 'Xác thực tài khoản DocuMind',
      html: buildRegistrationEmail({
        fullName,
        actionUrl,
        logoUrl: this.logoUrl,
      }),
    });
  }

  // Thực hiện nghiệp vụ send password reset email.
  async sendPasswordResetEmail(email: string): Promise<void> {
    let firebaseLink: string;
    try {
      firebaseLink = await this.firebaseAuth.generatePasswordResetLink(email, {
        url: `${this.frontendUrl}/login?reset=success`,
      });
    } catch (error) {
      if (this.isUnknownUser(error)) return;
      throw error;
    }

    const actionUrl = this.buildFrontendActionUrl(
      firebaseLink,
      '/reset-password',
      'resetPassword',
    );
    await this.mailService.send({
      from: this.config.getOrThrow<string>('RESET_PASSWORD_EMAIL_FROM'),
      to: email,
      subject: 'Đặt lại mật khẩu DocuMind',
      html: buildPasswordResetEmail({ actionUrl, logoUrl: this.logoUrl }),
    });
  }

  // Chuyển đổi hoặc chuẩn hóa frontend action url.
  private buildFrontendActionUrl(
    firebaseLink: string,
    pathname: string,
    expectedMode: string,
  ): string {
    const generatedUrl = new URL(firebaseLink);
    const actionCode = generatedUrl.searchParams.get('oobCode');
    if (!actionCode) throw new Error('Firebase action link has no action code');

    const actionUrl = new URL(pathname, this.frontendUrl);
    actionUrl.searchParams.set('mode', expectedMode);
    actionUrl.searchParams.set('oobCode', actionCode);
    return actionUrl.toString();
  }

  // Kiểm tra điều kiện unknown người dùng.
  private isUnknownUser(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'auth/user-not-found'
    );
  }
}
