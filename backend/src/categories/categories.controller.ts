import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoriesService } from './categories.service';

@ApiBearerAuth()
@Controller('categories')
@UseGuards(FirebaseAuthGuard)
export class CategoriesController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly service: CategoriesService) {}

  // Lấy danh sách dữ liệu phù hợp.
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('subjectId') subjectId?: string,
  ): ReturnType<CategoriesService['findAll']> {
    return this.service.findAll(user.id, subjectId);
  }

  // Lấy một bản ghi dữ liệu phù hợp.
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<CategoriesService['findOne']> {
    return this.service.findOne(id, user.id);
  }

  // Tạo hoặc lưu create.
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ): ReturnType<CategoriesService['create']> {
    return this.service.create(user.id, dto);
  }

  // Cập nhật update.
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCategoryDto,
  ): ReturnType<CategoriesService['update']> {
    return this.service.update(id, user.id, dto);
  }

  // Xóa hoặc giải phóng remove.
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<CategoriesService['remove']> {
    return this.service.remove(id, user.id);
  }
}
