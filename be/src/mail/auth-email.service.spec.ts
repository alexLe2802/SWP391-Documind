import { ConfigService } from '@nestjs/config';
import type { Auth } from 'firebase-admin/auth';
import { MailService, SendMailInput } from './mail.service';
import { AuthEmailService } from './auth-email.service';

describe('AuthEmailService', () => {
  const firebaseAuth = {
    generateEmailVerificationLink: jest.fn(),
    generatePasswordResetLink: jest.fn(),
  };
  let deliveredMessage: SendMailInput | undefined;
  const mailService = {
    send: jest.fn((input: SendMailInput) => {
      deliveredMessage = input;
      return Promise.resolve();
    }),
  };
  const config = new ConfigService({
    AUTH_EMAIL_FRONTEND_URL: 'https://documind.icu',
    REGISTRATION_EMAIL_FROM: 'registration@documind.icu',
    RESET_PASSWORD_EMAIL_FROM: 'reset-password@documind.icu',
  });
  const service = new AuthEmailService(
    firebaseAuth as unknown as Auth,
    mailService as unknown as MailService,
    config,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    deliveredMessage = undefined;
  });

  it('sends a registration email with a DocuMind action URL', async () => {
    firebaseAuth.generateEmailVerificationLink.mockResolvedValue(
      'https://firebase.example/action?mode=verifyEmail&oobCode=verify-code&apiKey=secret',
    );

    await service.sendRegistrationEmail('student@example.com', 'Student');

    const message = deliveredMessage;
    if (!message) throw new Error('Expected an email to be delivered');
    expect(message.from).toBe('registration@documind.icu');
    expect(message.to).toBe('student@example.com');
    expect(message.html).toContain(
      'https://documind.icu/verify-email?mode=verifyEmail&amp;oobCode=verify-code',
    );
    expect(message.html).toContain('src="https://documind.icu/Logo.png"');
  });

  it('sends a password-reset email from the reset address', async () => {
    firebaseAuth.generatePasswordResetLink.mockResolvedValue(
      'https://firebase.example/action?mode=resetPassword&oobCode=reset-code',
    );

    await service.sendPasswordResetEmail('student@example.com');

    const message = deliveredMessage;
    if (!message) throw new Error('Expected an email to be delivered');
    expect(message.from).toBe('reset-password@documind.icu');
    expect(message.to).toBe('student@example.com');
    expect(message.html).toContain(
      'https://documind.icu/reset-password?mode=resetPassword&amp;oobCode=reset-code',
    );
    expect(message.html).toContain('src="https://documind.icu/Logo.png"');
  });

  it('does not reveal an unknown password-reset account', async () => {
    firebaseAuth.generatePasswordResetLink.mockRejectedValue({
      code: 'auth/user-not-found',
    });

    await expect(
      service.sendPasswordResetEmail('missing@example.com'),
    ).resolves.toBeUndefined();
    expect(mailService.send).not.toHaveBeenCalled();
  });
});
