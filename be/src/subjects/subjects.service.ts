import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentStatus, Prisma, Subject } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class SubjectsService {
  private readonly logger = new Logger(SubjectsService.name);

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Tạo hoặc lưu create.
  async create(ownerId: string, dto: CreateSubjectDto): Promise<Subject> {
    const code = dto.code.trim().toUpperCase();
    const duplicate = await this.prisma.subject.findFirst({
      where: { ownerId, code },
    });
    if (duplicate) {
      if (duplicate.deletedAt) {
        try {
          // Cập nhật môn học trong database.
          return await this.prisma.subject.update({
            where: { id: duplicate.id },
            data: {
              deletedAt: null,
              name: dto.name.trim(),
              description: dto.description?.trim(),
            },
          });
        } catch (error) {
          this.handlePrismaWriteError(error);
        }
      }

      return duplicate;
    }

    try {
      // Tạo môn học trong database.
      return await this.prisma.subject.create({
        data: {
          ownerId,
          code,
          name: dto.name.trim(),
          description: dto.description?.trim(),
        },
      });
    } catch (error) {
      this.handlePrismaWriteError(error);
    }
  }

  // Lấy danh sách dữ liệu phù hợp.
  findAll(ownerId: string): Promise<Subject[]> {
    return this.prisma.subject.findMany({
      where: this.buildVisibleWhere(ownerId),
      orderBy: { name: 'asc' },
    });
  }

  // Lấy một bản ghi dữ liệu phù hợp.
  async findOne(id: string, ownerId: string): Promise<Subject> {
    const subject = await this.prisma.subject.findFirst({
      where: { id, ...this.buildVisibleWhere(ownerId) },
    });
    if (!subject) throw new NotFoundException('Subject not found');
    return subject;
  }

  // Cập nhật update.
  async update(
    id: string,
    ownerId: string,
    dto: UpdateSubjectDto,
  ): Promise<Subject> {
    await this.findOne(id, ownerId);
    const code = dto.code?.trim().toUpperCase();
    if (code) {
      const duplicate = await this.prisma.subject.findFirst({
        where: { ownerId, code },
      });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Subject code already exists');
      }
    }

    try {
      // Cập nhật môn học trong database.
      return await this.prisma.subject.update({
        where: { id },
        data: {
          code,
          name: dto.name?.trim(),
          description: dto.description?.trim(),
        },
      });
    } catch (error) {
      this.handlePrismaWriteError(error);
    }
  }

  // Xóa hoặc giải phóng remove.
  async remove(id: string, ownerId: string): Promise<{ message: string }> {
    const subject = await this.findOne(id, ownerId);
    if (subject.ownerId && subject.ownerId !== ownerId) {
      throw new BadRequestException(
        'Cannot delete a subject owned by another user',
      );
    }

    const documentWhere = { ownerId, subjectId: id };
    const documents = await this.prisma.document.findMany({
      where: documentWhere,
      select: { id: true, storagePath: true },
    });
    const operations: Prisma.PrismaPromise<unknown>[] = [
      // Xóa các tài liệu trong database.
      this.prisma.document.deleteMany({ where: documentWhere }),
    ];

    if (subject.ownerId === ownerId) {
      operations.push(
        // Cập nhật các danh mục trong database.
        this.prisma.category.updateMany({
          where: {
            ownerId,
            subjectId: id,
            deletedAt: null,
          },
          data: { deletedAt: new Date() },
        }),
        // Cập nhật môn học trong database.
        this.prisma.subject.update({
          where: { id },
          data: { deletedAt: new Date() },
        }),
      );
    }

    // Thực hiện các thay đổi liên quan trong cùng một database transaction.
    await this.prisma.$transaction(operations);
    await this.deleteStorageObjects(ownerId, documents);

    return { message: 'Subject deleted' };
  }

  // Xóa hoặc giải phóng storage objects.
  private async deleteStorageObjects(
    ownerId: string,
    documents: Array<{ id: string; storagePath: string }>,
  ): Promise<void> {
    await Promise.all(
      documents.map((document) =>
        Promise.resolve(
          // Xóa object tương ứng khỏi kho lưu trữ Cloudflare R2.
          this.storage.deleteObject(ownerId, document.storagePath),
        ).catch((error: unknown) =>
          this.logger.warn(
            `Document ${document.id} was deleted from the database, but its storage object could not be removed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        ),
      ),
    );
  }

  // Chuyển đổi hoặc chuẩn hóa visible where.
  private buildVisibleWhere(ownerId: string): Prisma.SubjectWhereInput {
    return {
      deletedAt: null,
      OR: [
        { ownerId },
        {
          ownerId: null,
          documents: {
            some: {
              ownerId,
              status: { not: DocumentStatus.DELETED },
            },
          },
        },
      ],
    };
  }

  // Xử lý sự kiện prisma write lỗi.
  private handlePrismaWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Subject code already exists');
      }

      if (error.code === 'P2003') {
        throw new BadRequestException('Subject owner does not exist');
      }
    }

    throw error;
  }
}
