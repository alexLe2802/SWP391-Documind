import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Tag } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly prisma: PrismaService) {}

  // Tạo hoặc lưu create.
  async create(dto: CreateTagDto): Promise<Tag> {
    const name = this.normalize(dto.name);
    if (await this.prisma.tag.findUnique({ where: { name } })) {
      throw new ConflictException('Tag name already exists');
    }
    // Tạo thẻ trong database.
    return this.prisma.tag.create({ data: { name } });
  }

  // Lấy danh sách dữ liệu phù hợp.
  findAll(): Promise<Tag[]> {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  // Lấy một bản ghi dữ liệu phù hợp.
  async findOne(id: string): Promise<Tag> {
    const tag = await this.prisma.tag.findUnique({ where: { id } });
    if (!tag) throw new NotFoundException('Tag not found');
    return tag;
  }

  // Cập nhật update.
  async update(id: string, dto: UpdateTagDto): Promise<Tag> {
    await this.findOne(id);
    const name = dto.name ? this.normalize(dto.name) : undefined;
    if (name) {
      const duplicate = await this.prisma.tag.findUnique({ where: { name } });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Tag name already exists');
      }
    }
    // Cập nhật thẻ trong database.
    return this.prisma.tag.update({ where: { id }, data: { name } });
  }

  // Xóa hoặc giải phóng remove.
  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    // Xóa thẻ trong database.
    await this.prisma.tag.delete({ where: { id } });
    return { message: 'Tag deleted' };
  }

  // Chuyển đổi hoặc chuẩn hóa normalize.
  private normalize(name: string): string {
    return name.trim().toLowerCase();
  }
}
