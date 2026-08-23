import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { PdfExtractorService } from './pdf-extractor.service';

// Chuyển định dạng Office cũ sang PDF trước khi chạy pipeline OCR thông thường.
@Injectable()
export class LegacyOfficeExtractorService {
  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly pdfExtractor: PdfExtractorService) {}

  // Xử lý extract.
  async extract(buffer: Buffer, fileName: string): Promise<string> {
    const workspace = await mkdtemp(join(tmpdir(), 'legacy-office-extract-'));
    const inputPath = join(workspace, this.safeFileName(fileName));

    try {
      await writeFile(inputPath, buffer);
      await this.convertToPdf(workspace, inputPath);
      const pdfName = (await readdir(workspace)).find((name) =>
        name.toLowerCase().endsWith('.pdf'),
      );
      if (!pdfName) {
        throw new Error('LibreOffice did not create a PDF for this document');
      }

      return this.pdfExtractor.extract(
        await readFile(join(workspace, pdfName)),
        pdfName,
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  // Chuyển đổi hoặc chuẩn hóa to pdf.
  private convertToPdf(outDir: string, inputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('soffice', [
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        outDir,
        inputPath,
      ]);
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
      child.on('error', () =>
        reject(
          new Error('LibreOffice is required to extract legacy Office files'),
        ),
      );
      child.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(stderr.trim() || 'Office conversion failed')),
      );
    });
  }

  // Thực hiện chức năng safe tệp name.
  private safeFileName(fileName: string): string {
    const extension = extname(fileName).toLowerCase();
    const stem = basename(fileName, extension).replace(
      /[^a-zA-Z0-9._-]+/g,
      '-',
    );
    return `${stem || 'document'}${extension}`;
  }
}
