import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiWrappedOkResponse } from '../common/swagger/api-wrapped-response.decorator';
import {
  AuthLoginResponseDto,
  AuthMeResponseDto,
} from './dto/auth-response.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { FirebaseAuthGuard } from './guards/firebase-auth.guard';
import { AuthLoginResponse, AuthMeResponse, AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';
import { RegisterUserDto } from './dto/register-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import {
  AUTH_SESSION_COOKIE_NAME,
  getAuthSessionCookieOptions,
} from './auth-session';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly authService: AuthService) {}

  // Thực hiện chức năng firebase đăng nhập.
  @Post('firebase-login')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify a Firebase ID token and synchronize the local user',
  })
  @ApiWrappedOkResponse(
    AuthLoginResponseDto,
    'Firebase token verified and user loaded.',
  )
  @ApiUnauthorizedResponse({ description: 'Invalid Firebase ID token.' })
  async firebaseLogin(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthLoginResponse> {
    const authorization = request.headers.authorization;
    const token = this.extractBearerToken(authorization);
    if (!token) {
      throw new UnauthorizedException('Missing Firebase bearer token');
    }

    const result = await this.authService.firebaseLogin(token);
    const sessionCookie = await this.authService.createSessionCookie(token);
    response.cookie(
      AUTH_SESSION_COOKIE_NAME,
      sessionCookie,
      getAuthSessionCookieOptions(),
    );
    return result;
  }

  // Tạo hoặc lưu đăng ký.
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register an inactive account pending email verification',
  })
  @ApiWrappedOkResponse(
    AuthLoginResponseDto,
    'Registration recorded. Email verification is required before login.',
  )
  register(
    @Req() request: Request,
    @Body() payload: RegisterUserDto,
  ): Promise<AuthLoginResponse> {
    const authorization = request.headers.authorization;
    const token = this.extractBearerToken(authorization);
    if (!token) {
      throw new UnauthorizedException('Missing Firebase bearer token');
    }
    return this.authService.register(token, payload);
  }

  // Thực hiện chức năng forgot password.
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send a custom password-reset email' })
  forgotPassword(@Body() payload: ForgotPasswordDto): Promise<void> {
    return this.authService.forgotPassword(payload.email);
  }

  // Thực hiện chức năng me.
  @Get('me')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiWrappedOkResponse(
    AuthMeResponseDto,
    'Current authenticated user profile.',
  )
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Firebase token.',
  })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthMeResponse> {
    return this.authService.getCurrentUser(user);
  }

  // Thực hiện chức năng đăng xuất.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear the secure authentication session' })
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(AUTH_SESSION_COOKIE_NAME, {
      ...getAuthSessionCookieOptions(),
      maxAge: undefined,
    });
  }

  // Xử lý bearer token.
  private extractBearerToken(authorization?: string): string | undefined {
    const [scheme, token] = authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
