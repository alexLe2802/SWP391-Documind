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
import { FirebaseAuthGuard } from '../../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RoleName } from '../../generated/prisma/client';
import {
  AdminUsersService,
  AdminUserDto,
  AdminUsersResponse,
} from './admin-users.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@ApiTags('admin-users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with optional keyword, role and status filters' })
  findAll(@Query() query: AdminUsersQueryDto): Promise<AdminUsersResponse> {
    return this.adminUsersService.findAll(query);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Block or activate a user account' })
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() payload: UpdateUserStatusDto,
  ): Promise<AdminUserDto> {
    return this.adminUsersService.updateStatus(
      id,
      payload.status,
      payload.reason,
    );
  }
}
