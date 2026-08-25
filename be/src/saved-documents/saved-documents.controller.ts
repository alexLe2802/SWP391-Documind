import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { SavedDocumentQueryDto } from './dto/saved-document-query.dto';
import { SavedDocumentsService } from './saved-documents.service';

@ApiTags('saved-documents')
@ApiBearerAuth()
@Controller('saved-documents')
@UseGuards(FirebaseAuthGuard)
export class SavedDocumentsController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly service: SavedDocumentsService) {}

  // Lấy danh sách dữ liệu phù hợp.
  @Get()
  @ApiOperation({ summary: 'List saved documents for the current user' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SavedDocumentQueryDto,
  ): ReturnType<SavedDocumentsService['findAll']> {
    return this.service.findAll(user.id, query);
  }
}
