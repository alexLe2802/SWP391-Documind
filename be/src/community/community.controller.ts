import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { OptionalFirebaseAuthGuard } from '../auth/guards/optional-firebase-auth.guard';
import { CommunityService } from './community.service';
import { CommunityDocumentQueryDto } from './dto/community-document-query.dto';

@ApiTags('community')
@Controller('community')
export class CommunityController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly service: CommunityService) {}

  // Lấy dữ liệu tài liệu.
  @Get('documents')
  @UseGuards(OptionalFirebaseAuthGuard)
  @ApiOperation({ summary: 'List public community documents' })
  findDocuments(
    @Query() query: CommunityDocumentQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): ReturnType<CommunityService['findDocuments']> {
    return this.service.findDocuments(query, user?.id);
  }

  // Tạo hoặc lưu xem trước url.
  @Get('documents/:id/preview')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a preview URL for a public document' })
  createPreviewUrl(
    @Param('id', ParseUUIDPipe) id: string,
  ): ReturnType<CommunityService['createPreviewUrl']> {
    return this.service.createPreviewUrl(id);
  }

  // Lấy dữ liệu chi tiết tài liệu.
  @Get('documents/:id')
  @UseGuards(OptionalFirebaseAuthGuard)
  @ApiOperation({ summary: 'Get a public community document detail' })
  findOneDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): ReturnType<CommunityService['findOneDocument']> {
    return this.service.findOneDocument(id, user?.id);
  }

  // Tạo hoặc lưu tài liệu.
  @Post('documents/:id/save')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save a public community document to my library' })
  saveDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<CommunityService['saveDocument']> {
    return this.service.saveDocument(id, user.id);
  }

  // Thực hiện chức năng unsave tài liệu.
  @Delete('documents/:id/save')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({ summary: 'Unsave a public community document' })
  unsaveDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.service.unsaveDocument(id, user.id);
  }
}
