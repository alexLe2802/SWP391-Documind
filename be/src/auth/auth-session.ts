import type { CookieOptions } from 'express';

export const AUTH_SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;
export const AUTH_SESSION_COOKIE_NAME = 'documind_session';

// Lấy dữ liệu xác thực phiên cookie options.
export function getAuthSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: AUTH_SESSION_DURATION_MS,
  };
}

type RequestWithCookieHeader = {
  headers: { cookie?: string };
};

// Lấy dữ liệu xác thực phiên cookie.
export function getAuthSessionCookie(
  request: RequestWithCookieHeader,
): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const entry of cookieHeader.split(';')) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex < 0) continue;

    const name = entry.slice(0, separatorIndex).trim();
    if (name !== AUTH_SESSION_COOKIE_NAME) continue;

    const value = entry.slice(separatorIndex + 1).trim();
    return value ? decodeURIComponent(value) : undefined;
  }

  return undefined;
}
