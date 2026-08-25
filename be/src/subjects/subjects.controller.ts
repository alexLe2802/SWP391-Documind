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
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectsService } from './subjects.service';

@ApiBearerAuth()
@Controller('subjects')
@UseGuards(FirebaseAuthGuard)
export class SubjectsController {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly subjectsService: SubjectsService) {}

  // Lấy danh sách dữ liệu phù hợp.
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<SubjectsService['findAll']> {
    return this.subjectsService.findAll(user.id);
  }

  // Lấy một bản ghi dữ liệu phù hợp.
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<SubjectsService['findOne']> {
    return this.subjectsService.findOne(id, user.id);
  }

  // Tạo hoặc lưu create.
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSubjectDto,
  ): ReturnType<SubjectsService['create']> {
    return this.subjectsService.create(user.id, dto);
  }

  // Cập nhật update.
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSubjectDto,
  ): ReturnType<SubjectsService['update']> {
    return this.subjectsService.update(id, user.id, dto);
  }

  // Xóa hoặc giải phóng remove.
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): ReturnType<SubjectsService['remove']> {
    return this.subjectsService.remove(id, user.id);
  }
}
