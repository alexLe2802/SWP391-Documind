import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  PipeTransform,
} from '@nestjs/common';
import { UploadedContentFile } from './interfaces/uploaded-file.interface';

export const EXTRACTION_UPLOAD_MAX_SIZE = 10 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
]);

const REQUIRED_ZIP_ENTRIES = new Map<string, ReadonlySet<string>>([
  ['docx', new Set(['word/document.xml'])],
  ['pptx', new Set(['ppt/presentation.xml'])],
  ['xlsx', new Set(['xl/workbook.xml'])],
]);

const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

@Injectable()
export class ExtractionFileValidationPipe implements PipeTransform<
  UploadedContentFile | undefined,
  UploadedContentFile
> {
  // Chuyển đổi hoặc chuẩn hóa transform.
  transform(file: UploadedContentFile | undefined): UploadedContentFile {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const fileSize = file.size ?? file.buffer.length;
    if (fileSize > EXTRACTION_UPLOAD_MAX_SIZE) {
      throw new PayloadTooLargeException('File size must not exceed 10 MB');
    }

    const extension = this.getExtension(file.originalname);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        'Only PDF, DOC/DOCX, PPT/PPTX, and XLS/XLSX files are supported',
      );
    }

    if (extension === 'pdf') {
      if (!this.hasPdfSignature(file.buffer)) {
        throw new BadRequestException(
          'File signature does not match the .pdf extension',
        );
      }
      return file;
    }

    if (['doc', 'xls', 'ppt'].includes(extension)) {
      if (!this.hasOleSignature(file.buffer)) {
        throw new BadRequestException(
          `File signature does not match the .${extension} extension`,
        );
      }
      return file;
    }

    if (!this.hasZipSignature(file.buffer)) {
      throw new BadRequestException(
        `File signature does not match the .${extension} extension`,
      );
    }

    const requiredEntries = REQUIRED_ZIP_ENTRIES.get(extension);
    if (
      requiredEntries &&
      !this.hasRequiredZipEntries(file.buffer, requiredEntries)
    ) {
      throw new BadRequestException(
        `File signature does not match the .${extension} extension`,
      );
    }

    return file;
  }

  // Lấy dữ liệu extension.
  private getExtension(fileName: string): string {
    const trimmedName = fileName.trim();
    const extension = trimmedName.split('.').pop()?.toLowerCase() ?? '';
    return trimmedName.includes('.') ? extension : '';
  }

  // Kiểm tra điều kiện pdf signature.
  private hasPdfSignature(buffer: Buffer): boolean {
    return buffer.subarray(0, 4).toString('ascii') === '%PDF';
  }

  // Kiểm tra điều kiện zip signature.
  private hasZipSignature(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  }

  // Kiểm tra điều kiện ole signature.
  private hasOleSignature(buffer: Buffer): boolean {
    return (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    );
  }

  // Kiểm tra điều kiện required zip entries.
  private hasRequiredZipEntries(
    buffer: Buffer,
    requiredEntries: ReadonlySet<string>,
  ): boolean {
    const entries = this.listZipEntries(buffer);
    if (!entries) {
      return false;
    }

    return [...requiredEntries].every((entry) => entries.has(entry));
  }

  // Lấy dữ liệu zip entries.
  private listZipEntries(buffer: Buffer): Set<string> | null {
    const endOfCentralDirectoryOffset = this.findEndOfCentralDirectory(buffer);
    if (endOfCentralDirectoryOffset === null) {
      return null;
    }

    const centralDirectorySize = buffer.readUInt32LE(
      endOfCentralDirectoryOffset + 12,
    );
    const centralDirectoryOffset = buffer.readUInt32LE(
      endOfCentralDirectoryOffset + 16,
    );
    if (centralDirectoryOffset + centralDirectorySize > buffer.length) {
      return null;
    }

    const entries = new Set<string>();
    let offset = centralDirectoryOffset;
    const endOffset = centralDirectoryOffset + centralDirectorySize;

    while (offset + 46 <= buffer.length && offset < endOffset) {
      const signature = buffer.readUInt32LE(offset);
      if (signature !== ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE) {
        return null;
      }

      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraFieldLength = buffer.readUInt16LE(offset + 30);
      const fileCommentLength = buffer.readUInt16LE(offset + 32);
      const fileNameStart = offset + 46;
      const fileNameEnd = fileNameStart + fileNameLength;

      if (fileNameEnd > buffer.length) {
        return null;
      }

      entries.add(
        buffer
          .subarray(fileNameStart, fileNameEnd)
          .toString('utf8')
          .replace(/\\/g, '/'),
      );

      offset = fileNameEnd + extraFieldLength + fileCommentLength;
    }

    return entries;
  }

  // Lấy dữ liệu end of central directory.
  private findEndOfCentralDirectory(buffer: Buffer): number | null {
    if (buffer.length < 22) {
      return null;
    }

    const minOffset = Math.max(0, buffer.length - 0xffff - 22);

    for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
      if (
        buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE
      ) {
        return offset;
      }
    }

    return null;
  }
}
