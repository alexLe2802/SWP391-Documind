type RegistrationEmailInput = {
  fullName: string;
  actionUrl: string;
  logoUrl: string;
};

type PasswordResetEmailInput = {
  actionUrl: string;
  logoUrl: string;
};

// Thực hiện chức năng escape html.
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character]!,
  );
}

// Chuyển đổi hoặc chuẩn hóa email layout.
function buildEmailLayout(input: {
  preheader: string;
  title: string;
  greeting: string;
  body: string;
  buttonLabel: string;
  actionUrl: string;
  notice: string;
  logoUrl: string;
}): string {
  const actionUrl = escapeHtml(input.actionUrl);
  const logoUrl = escapeHtml(input.logoUrl);

  return `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(23,32,51,.08)">
          <tr><td style="background:#163b65;padding:20px 32px">
            <table role="presentation" cellspacing="0" cellpadding="0"><tr>
              <td style="padding-right:12px"><img src="${logoUrl}" width="48" height="48" alt="DocuMind" style="display:block;width:48px;height:48px;border:0;border-radius:12px;object-fit:contain;background:#ffffff"></td>
              <td style="color:#ffffff;font-size:24px;font-weight:700;line-height:1.2">DocuMind</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:36px 32px">
            <h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;color:#172033">${escapeHtml(input.title)}</h1>
            <p style="margin:0 0 14px;font-size:16px;line-height:1.65">${escapeHtml(input.greeting)}</p>
            <p style="margin:0 0 26px;font-size:16px;line-height:1.65;color:#46546a">${escapeHtml(input.body)}</p>
            <p style="margin:0 0 28px"><a href="${actionUrl}" style="display:inline-block;background:#f0a23a;color:#172033;text-decoration:none;font-weight:700;padding:14px 24px;border-radius:10px">${escapeHtml(input.buttonLabel)}</a></p>
            <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#66758b">Nếu nút không hoạt động, hãy sao chép liên kết này vào trình duyệt:</p>
            <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all"><a href="${actionUrl}" style="color:#285f96">${actionUrl}</a></p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#66758b">${escapeHtml(input.notice)}</p>
          </td></tr>
          <tr><td style="border-top:1px solid #e8edf4;padding:20px 32px;font-size:12px;line-height:1.6;color:#7a8799">Email tự động từ DocuMind. Vui lòng không trả lời email này.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// Chuyển đổi hoặc chuẩn hóa registration email.
export function buildRegistrationEmail(input: RegistrationEmailInput): string {
  return buildEmailLayout({
    preheader: 'Xác thực email để kích hoạt tài khoản DocuMind.',
    title: 'Xác thực email',
    greeting: `Xin chào ${input.fullName},`,
    body: 'Cảm ơn bạn đã đăng ký DocuMind. Hãy xác thực địa chỉ email để kích hoạt tài khoản của bạn.',
    buttonLabel: 'Xác thực email',
    actionUrl: input.actionUrl,
    logoUrl: input.logoUrl,
    notice:
      'Nếu bạn không tạo tài khoản DocuMind, bạn có thể bỏ qua email này.',
  });
}

// Chuyển đổi hoặc chuẩn hóa password reset email.
export function buildPasswordResetEmail(
  input: PasswordResetEmailInput,
): string {
  return buildEmailLayout({
    preheader: 'Yêu cầu đặt lại mật khẩu tài khoản DocuMind.',
    title: 'Đặt lại mật khẩu',
    greeting: 'Xin chào,',
    body: 'DocuMind nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Chọn nút bên dưới để tạo mật khẩu mới.',
    buttonLabel: 'Đặt lại mật khẩu',
    actionUrl: input.actionUrl,
    logoUrl: input.logoUrl,
    notice:
      'Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu hiện tại của bạn vẫn được giữ nguyên.',
  });
}
