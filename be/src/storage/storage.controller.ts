import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';
import { StorageObjectDto } from './dto/storage-object.dto';
import {
  DownloadUrlResponse,
  PreviewUrlResponse,
  StorageService,
} from './storage.service';

@Controller('storage')
@UseGuards(FirebaseAuthGuard)
export class StorageController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly storageService: StorageService) {}

  // Tạo hoặc lưu tải lên url.
  @Post('upload-url')
  createUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateUploadUrlDto,
  ): ReturnType<StorageService['createUploadUrl']> {
    return this.storageService.createUploadUrl(user.id, dto);
  }

  // Tạo hoặc lưu tải xuống url.
  @Post('download-url')
  createDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StorageObjectDto,
  ): Promise<DownloadUrlResponse> {
    return this.storageService.createDownloadUrl(user.id, dto.key);
  }

  // Tạo hoặc lưu xem trước url.
  @Post('preview-url')
  createPreviewUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StorageObjectDto,
  ): Promise<PreviewUrlResponse> {
    return this.storageService.createPreviewUrl(user.id, dto.key);
  }

  // Xóa hoặc giải phóng object.
  @Delete('object')
  deleteObject(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StorageObjectDto,
  ): Promise<{ message: string }> {
    return this.storageService.deleteObject(user.id, dto.key);
  }
}
