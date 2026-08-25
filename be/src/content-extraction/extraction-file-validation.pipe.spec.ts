import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
  EXTRACTION_UPLOAD_MAX_SIZE,
  ExtractionFileValidationPipe,
} from './extraction-file-validation.pipe';

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

describe('ExtractionFileValidationPipe', () => {
  const pipe = new ExtractionFileValidationPipe();

  it('rejects a missing file', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });

  it('rejects files larger than the upload limit', () => {
    expect(() =>
      pipe.transform({
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7'),
        size: EXTRACTION_UPLOAD_MAX_SIZE + 1,
      }),
    ).toThrow(PayloadTooLargeException);
  });

  it('accepts a valid PDF with a %PDF signature', () => {
    const file = {
      originalname: 'sample.pdf',
      mimetype: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\nbody'),
      size: Buffer.byteLength('%PDF-1.7\nbody'),
    };

    expect(pipe.transform(file)).toBe(file);
  });

  it('accepts application/octet-stream when the PDF signature is valid', () => {
    const file = {
      originalname: 'sample.pdf',
      mimetype: 'application/octet-stream',
      buffer: Buffer.from('%PDF-1.7\nbody'),
      size: Buffer.byteLength('%PDF-1.7\nbody'),
    };

    expect(pipe.transform(file)).toBe(file);
  });

  it('rejects a .pdf file with an invalid signature', () => {
    expect(() =>
      pipe.transform({
        originalname: 'sample.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('not-a-pdf'),
        size: 9,
      }),
    ).toThrow(BadRequestException);
  });

  it.each(['docx', 'pptx', 'xlsx'] as const)(
    'rejects a .%s file with an invalid ZIP signature',
    (extension) => {
      expect(() =>
        pipe.transform({
          originalname: `sample.${extension}`,
          mimetype: 'application/octet-stream',
          buffer: Buffer.from('not-a-zip'),
          size: 9,
        }),
      ).toThrow(BadRequestException);
    },
  );

  it('accepts a .docx file with the required ZIP entry', () => {
    const buffer = createMinimalZipBuffer(['word/document.xml']);
    const file = {
      originalname: 'sample.docx',
      mimetype:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
      size: buffer.length,
    };

    expect(pipe.transform(file)).toBe(file);
  });

  it('rejects unsupported file types', () => {
    expect(() =>
      pipe.transform({
        originalname: 'notes.txt',
        mimetype: 'text/plain',
        buffer: Buffer.from('notes'),
        size: 5,
      }),
    ).toThrow(BadRequestException);
  });
});

function createMinimalZipBuffer(entries: readonly string[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const entryName = Buffer.from(entry, 'utf8');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(ZIP_LOCAL_FILE_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(0, 18);
    localHeader.writeUInt32LE(0, 22);
    localHeader.writeUInt16LE(entryName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_FILE_HEADER_SIGNATURE, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(0, 20);
    centralHeader.writeUInt32LE(0, 24);
    centralHeader.writeUInt16LE(entryName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    localParts.push(localHeader, entryName);
    centralParts.push(centralHeader, entryName);
    localOffset += localHeader.length + entryName.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(
    ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE,
    0,
  );
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(localOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([
    ...localParts,
    centralDirectory,
    endOfCentralDirectory,
  ]);
}
