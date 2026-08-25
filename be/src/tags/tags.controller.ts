import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RoleName } from '../generated/prisma/client';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { TagsService } from './tags.service';

@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly service: TagsService) {}

  // Lấy danh sách dữ liệu phù hợp.
  @Get()
  findAll(): ReturnType<TagsService['findAll']> {
    return this.service.findAll();
  }

  // Lấy một bản ghi dữ liệu phù hợp.
  @Get(':id')
  findOne(@Param('id') id: string): ReturnType<TagsService['findOne']> {
    return this.service.findOne(id);
  }

  // Tạo hoặc lưu create.
  @Post()
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  create(@Body() dto: CreateTagDto): ReturnType<TagsService['create']> {
    return this.service.create(dto);
  }

  // Cập nhật update.
  @Patch(':id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ): ReturnType<TagsService['update']> {
    return this.service.update(id, dto);
  }

  // Xóa hoặc giải phóng remove.
  @Delete(':id')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN)
  remove(@Param('id') id: string): ReturnType<TagsService['remove']> {
    return this.service.remove(id);
  }
}
