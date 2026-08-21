import { UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const authService = {
    firebaseLogin: jest.fn(),
    createSessionCookie: jest.fn(),
    register: jest.fn(),
    forgotPassword: jest.fn(),
    getCurrentUser: jest.fn(),
  };
  const controller = new AuthController(authService as unknown as AuthService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function requestWithAuthorization(authorization?: string): Request {
    return {
      headers: { authorization },
    } as Request;
  }

  const cookie = jest.fn();
  const clearCookie = jest.fn();
  const response = {
    cookie,
    clearCookie,
  } as unknown as Response;

  it('uses the Firebase ID token from the authorization header', async () => {
    authService.firebaseLogin.mockResolvedValue({ user: { id: 'user-1' } });
    authService.createSessionCookie.mockResolvedValue('session-cookie');

    await controller.firebaseLogin(
      requestWithAuthorization('Bearer header-token'),
      response,
    );

    expect(authService.firebaseLogin).toHaveBeenCalledWith('header-token');
    expect(authService.createSessionCookie).toHaveBeenCalledWith(
      'header-token',
    );
    expect(cookie).toHaveBeenCalledWith(
      'documind_session',
      'session-cookie',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      }),
    );
  });

  it('rejects login when no Firebase ID token is provided', async () => {
    await expect(
      controller.firebaseLogin(requestWithAuthorization(), response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('registers with the Firebase token and validated form data', async () => {
    const payload = { fullName: 'Nguyen Van A', acceptedTerms: true };
    authService.register.mockResolvedValue({ user: { id: 'user-1' } });

    await controller.register(
      requestWithAuthorization('Bearer register-token'),
      payload,
    );

    expect(authService.register).toHaveBeenCalledWith(
      'register-token',
      payload,
    );
  });

  it('accepts a password-reset request without exposing account state', async () => {
    authService.forgotPassword.mockResolvedValue(undefined);

    await controller.forgotPassword({ email: 'student@example.com' });

    expect(authService.forgotPassword).toHaveBeenCalledWith(
      'student@example.com',
    );
  });

  it('clears the secure session cookie on logout', () => {
    controller.logout(response);

    expect(clearCookie).toHaveBeenCalledWith(
      'documind_session',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      }),
    );
  });
});
