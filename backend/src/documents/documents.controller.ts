import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile as UploadedFileDecorator,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { UploadedFile as StorageUploadedFile } from '../storage/storage.types';
import { ContentExtractionService } from '../content-extraction/content-extraction.service';
import {
  DOCUMENT_MIME_TYPE_PATTERN,
  MAX_DOCUMENT_FILE_SIZE,
} from './documents.constants';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentListQueryDto } from './dto/document-list-query.dto';
import { UpdateDocumentVisibilityDto } from './dto/update-document-visibility.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(FirebaseAuthGuard)
export class DocumentsController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly service: DocumentsService,
    private readonly extractionService: ContentExtractionService,
  ) {}

  // Tạo hoặc lưu tải lên.
  @Post(['', 'upload'])
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_FILE_SIZE },
    }),
  )
  @ApiOperation({ summary: 'Upload a document to Cloudflare R2' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'title', 'subjectId', 'categoryId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 2000 },
        subjectId: { type: 'string', format: 'uuid' },
        categoryId: { type: 'string', format: 'uuid' },
        tagIds: {
          oneOf: [
            { type: 'array', items: { type: 'string', format: 'uuid' } },
            { type: 'string', example: 'uuid-1,uuid-2' },
          ],
        },
        tags: {
          oneOf: [
            { type: 'array', maxItems: 10, items: { type: 'string' } },
            { type: 'string', example: '["ai","lecture"]' },
          ],
        },
        visibility: { type: 'string', enum: ['PRIVATE', 'PUBLIC'] },
      },
    },
  })
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentDto,
    @UploadedFileDecorator(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: DOCUMENT_MIME_TYPE_PATTERN,
          fallbackToMimetype: true,
        })
        .addMaxSizeValidator({
          maxSize: MAX_DOCUMENT_FILE_SIZE,
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: StorageUploadedFile,
  ): ReturnType<DocumentsService['upload']> {
    await this.extractionService.validateUpload(file);
    const document = await this.service.upload(user.id, dto, file);
    await this.extractionService.startExtraction(document.id, user);
    return document;
  }

  // Lấy danh sách dữ liệu phù hợp.
  @Get()
  @ApiOperation({ summary: 'List UI-ready documents for the current user' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DocumentListQueryDto,
  ): ReturnType<DocumentsService['findAll']> {
    return this.service.findAll(user.id, query);
  }

  // Tạo hoặc lưu tải xuống url.
  @Get(':id/download-url')
  @ApiOperation({ summary: 'Create a short-lived download URL' })
  createDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<DocumentsService['createDownloadUrl']> {
    return this.service.createDownloadUrl(id, user.id);
  }

  // Thực hiện chức năng tải xuống.
  @Get(':id/download')
  @ApiOperation({ summary: 'Create a short-lived download URL and track it' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<DocumentsService['createDownloadUrl']> {
    return this.service.createDownloadUrl(id, user.id);
  }

  // Tạo hoặc lưu xem trước url.
  @Get([':id/preview', ':id/preview-url'])
  @ApiOperation({ summary: 'Create a short-lived preview URL' })
  createPreviewUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<DocumentsService['createPreviewUrl']> {
    return this.service.createPreviewUrl(id, user.id);
  }

  // Lấy một bản ghi dữ liệu phù hợp.
  @Get(':id')
  @ApiOperation({ summary: 'Get one UI-ready document by id' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<DocumentsService['findOne']> {
    return this.service.findOne(id, user.id);
  }

  // Cập nhật update.
  @Put(':id')
  @ApiOperation({ summary: 'Update document metadata' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDocumentDto,
  ): ReturnType<DocumentsService['update']> {
    return this.service.update(id, user.id, dto);
  }

  // Cập nhật quyền hiển thị.
  @Put(':id/visibility')
  @ApiOperation({ summary: 'Update document visibility' })
  updateVisibility(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDocumentVisibilityDto,
  ): ReturnType<DocumentsService['updateVisibility']> {
    return this.service.updateVisibility(id, user.id, dto.visibility);
  }

  // Xóa hoặc giải phóng remove.
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Permanently delete an owned document' })
  @ApiNoContentResponse({ description: 'Document deleted.' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<DocumentsService['remove']> {
    return this.service.remove(id, user.id);
  }
}
