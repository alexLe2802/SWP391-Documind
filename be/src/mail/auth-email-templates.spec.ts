import {
  buildPasswordResetEmail,
  buildRegistrationEmail,
} from './auth-email-templates';

describe('authentication email templates', () => {
  it('renders the registration action without allowing HTML injection', () => {
    const html = buildRegistrationEmail({
      fullName: '<script>alert(1)</script>',
      actionUrl: 'https://documind.icu/verify-email?oobCode=code',
      logoUrl: 'https://documind.icu/Logo.png',
    });

    expect(html).toContain('Xác thực email');
    expect(html).toContain('https://documind.icu/verify-email?oobCode=code');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('src="https://documind.icu/Logo.png"');
    expect(html).toContain('alt="DocuMind"');
  });

  it('renders the password-reset action', () => {
    const html = buildPasswordResetEmail({
      actionUrl: 'https://documind.icu/reset-password?oobCode=code',
      logoUrl: 'https://documind.icu/Logo.png',
    });

    expect(html).toContain('Đặt lại mật khẩu');
    expect(html).toContain('https://documind.icu/reset-password?oobCode=code');
  });
});
