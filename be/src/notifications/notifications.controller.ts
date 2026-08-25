import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(FirebaseAuthGuard)
export class NotificationsController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly notifications: NotificationsService) {}

  // Lấy dữ liệu list.
  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): ReturnType<NotificationsService['list']> {
    return this.notifications.list(user.id, Number(limit) || 20);
  }

  // Thực hiện chức năng mark danh sách read.
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.notifications.markAllRead(user.id);
  }

  // Thực hiện chức năng mark read.
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.notifications.markRead(user.id, id);
  }
}
