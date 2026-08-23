import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { ApiWrappedOkResponse } from '../common/swagger/api-wrapped-response.decorator';
import { UploadedFile as StorageUploadedFile } from '../storage/storage.types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UserProfileResponse, UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly usersService: UsersService) { }

  // Lấy dữ liệu hồ sơ.
  @Get('profile')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiWrappedOkResponse(UserProfileResponseDto, 'Current user profile.')
  getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserProfileResponse> {
    return this.usersService.getProfile(user.id);
  }

  // Cập nhật hồ sơ.
  @Patch('profile')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiWrappedOkResponse(UserProfileResponseDto, 'Updated current user profile.')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: UpdateProfileDto,
  ): Promise<UserProfileResponse> {
    return this.usersService.updateProfile(user.id, payload);
  }

  // Tải lên ảnh đại diện lên Cloudflare R2.
  @Post('avatar')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload user avatar image to Cloudflare R2' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiWrappedOkResponse(UserProfileResponseDto, 'Updated current user profile.')
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: StorageUploadedFile,
    @Req() req: Request,
  ): Promise<UserProfileResponse> {
    const forwardedProto = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = `${forwardedProto}://${host}/api`;
    return this.usersService.uploadAvatar(user.id, file, baseUrl);
  }

  // Lấy dữ liệu file ảnh đại diện công khai.
  @Get(':userId/avatar')
  @ApiOperation({ summary: 'Get user avatar image' })
  async getAvatar(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.usersService.getAvatar(userId);
    if (result.type === 'redirect') {
      res.redirect(result.url);
      return;
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(result.buffer);
  }
}


