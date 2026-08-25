import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { ApiWrappedOkResponse } from '../common/swagger/api-wrapped-response.decorator';
import { RoleName } from '../generated/prisma/client';
import {
  AdminUsersService,
  AdminUserDto,
  AdminUsersResponse,
} from './admin-users.service';
import {
  AdminUserResponseDto,
  AdminUsersResponseDto,
} from './dto/admin-user-response.dto';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@ApiTags('admin-users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class AdminUsersController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly adminUsersService: AdminUsersService) {}

  // Lấy danh sách dữ liệu phù hợp.
  @Get()
  @ApiOperation({ summary: 'List users for administration' })
  @ApiWrappedOkResponse(AdminUsersResponseDto, 'Paginated admin user list.')
  findAll(@Query() query: AdminUsersQueryDto): Promise<AdminUsersResponse> {
    return this.adminUsersService.findAll(query);
  }

  // Cập nhật trạng thái.
  @Patch(':id/status')
  @ApiOperation({ summary: 'Change a user account status' })
  @ApiWrappedOkResponse(AdminUserResponseDto, 'Updated admin user.')
  updateStatus(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() payload: UpdateUserStatusDto,
  ): Promise<AdminUserDto> {
    return this.adminUsersService.updateStatus(
      id,
      payload.status,
      payload.reason,
      admin.id,
    );
  }
}
