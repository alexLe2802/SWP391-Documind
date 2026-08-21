import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { ApiWrappedOkResponse } from '../common/swagger/api-wrapped-response.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UserProfileResponse, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(FirebaseAuthGuard)
export class UsersController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly usersService: UsersService) {}

  // Lấy dữ liệu hồ sơ.
  @Get('profile')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiWrappedOkResponse(UserProfileResponseDto, 'Current user profile.')
  getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserProfileResponse> {
    return this.usersService.getProfile(user.id);
  }

  // Cập nhật hồ sơ.
  @Patch('profile')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiWrappedOkResponse(UserProfileResponseDto, 'Updated current user profile.')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: UpdateProfileDto,
  ): Promise<UserProfileResponse> {
    return this.usersService.updateProfile(user.id, payload);
  }
}
