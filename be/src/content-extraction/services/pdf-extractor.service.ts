import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class PdfExtractorService {
  private readonly logger = new Logger(PdfExtractorService.name);
  private readonly ocrCache = new Map<string, Promise<string>>();

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(private readonly configService: ConfigService) {}

  // Kiểm tra điều kiện ocr page limit.
  async validateOcrPageLimit(buffer: Buffer): Promise<void> {
    const parser = new PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      const imageOnlyPageCount = textResult.pages.filter(
        (page) => !this.normalize(page.text ?? ''),
      ).length;
      const maxOcrPages = this.getMaxOcrPages();

      if (imageOnlyPageCount > maxOcrPages) {
        throw new BadRequestException(
          `PDF has ${imageOnlyPageCount} image-only pages; the OCR limit is ${maxOcrPages} pages. Please split the PDF into smaller files before uploading.`,
        );
      }
    } finally {
      await parser.destroy();
    }
  }

  // Xử lý extract.
  async extract(buffer: Buffer, originalName?: string): Promise<string> {
    const localResult = await this.extractLocally(buffer);
    if (!localResult.includes('[NOTE: No selectable')) {
      return localResult;
    }

    const llamaKey = this.configService
      .get<string>('LLAMA_CLOUD_API_KEY')
      ?.trim();
    if (!llamaKey) {
      return localResult;
    }

    const missingPageCount = (localResult.match(/\[NOTE: No selectable/g) ?? [])
      .length;
    const maxOcrPages = this.getMaxOcrPages();
    if (missingPageCount > maxOcrPages) {
      this.logger.warn(
        `Skipping cloud OCR: ${missingPageCount} pages exceed OCR_MAX_PAGES=${maxOcrPages}.`,
      );
      return localResult;
    }

    const cacheKey = createHash('sha256').update(buffer).digest('hex');
    const request =
      this.ocrCache.get(cacheKey) ??
      this.extractWithLlamaParse(
        buffer,
        originalName || 'document.pdf',
        llamaKey,
      );
    this.ocrCache.set(cacheKey, request);

    try {
      this.logger.log(
        `Using cloud OCR for ${missingPageCount} unreadable page(s) in ${originalName || 'document.pdf'}...`,
      );
      const extracted = await request;
      return this.hasMeaningfulText(extracted) ? extracted : localResult;
    } catch (error) {
      this.ocrCache.delete(cacheKey);
      this.logger.error(
        `Cloud OCR failed; keeping partial local extraction: ${error instanceof Error ? error.message : String(error)}`,
      );
      return localResult;
    }
  }

  // Xử lý locally.
  private async extractLocally(buffer: Buffer): Promise<string> {
    this.logger.log('Using local pdf-parse first...');
    const parser = new PDFParse({ data: buffer });
    try {
      const [textResult, tableResult] = await Promise.all([
        parser.getText(),
        parser.getTable().catch(() => null),
      ]);
      const parts: string[] = [];

      for (const page of textResult.pages) {
        const pageText = this.normalize(page.text ?? '');
        if (pageText) {
          parts.push(`[PAGE: ${page.num}]\n${pageText}`);
        } else {
          parts.push(
            `[PAGE: ${page.num}]\n[NOTE: No selectable text extracted from this page. OCR may be required.]`,
          );
        }

        const pageTables =
          tableResult?.pages.find((tablePage) => tablePage.num === page.num)
            ?.tables ?? [];
        pageTables.forEach((table, index) => {
          const rows = table
            .map((row) => row.map((cell) => this.normalize(cell)).join(' | '))
            .filter((row) => row.replace(/\|/g, '').trim());
          if (rows.length > 0) {
            parts.push(
              `[PAGE: ${page.num}]\n[TABLE: Page ${page.num} Table ${index + 1}]\n${rows.join('\n')}`,
            );
          }
        });
      }

      if (parts.length === 0) {
        const text = this.normalize(textResult.text ?? '');
        return text
          ? `[PAGE: 1]\n${text}`
          : '[NOTE: No selectable PDF text was extracted. OCR may be required.]';
      }

      return parts.join('\n\n');
    } finally {
      await parser.destroy();
    }
  }

  // Lấy dữ liệu max ocr pages.
  private getMaxOcrPages(): number {
    const configured = Number(this.configService.get<string>('OCR_MAX_PAGES'));
    return Number.isInteger(configured) && configured > 0 ? configured : 20;
  }

  // Chuyển đổi hoặc chuẩn hóa normalize.
  private normalize(text: string): string {
    return text
      .replace(/[ \t]+/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Kiểm tra điều kiện meaningful text.
  private hasMeaningfulText(text: string): boolean {
    const withoutPageMarkers = text.replace(/--\s*\d+ of \d+\s*--/g, '');
    return /[\p{L}\p{N}]/u.test(withoutPageMarkers);
  }

  // Xử lý with llama parse.
  private async extractWithLlamaParse(
    buffer: Buffer,
    filename: string,
    apiKey: string,
  ): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], {
      type: 'application/pdf',
    });
    formData.append('file', blob, filename);
    // Premium OCR is opt-in because it consumes more provider credits.
    formData.append('auto_mode', 'true');
    const premiumMode = this.configService.get<boolean | string>(
      'LLAMA_PARSE_PREMIUM_MODE',
    );
    if (
      premiumMode === true ||
      (typeof premiumMode === 'string' &&
        premiumMode.trim().toLowerCase() === 'true')
    ) {
      formData.append('premium_mode', 'true');
    }
    formData.append('language', 'vi');

    // 1. Upload job
    const uploadRes = await fetch(
      'https://api.llamacloud.com/v1/parser/upload',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      },
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(
        `LlamaParse upload failed: HTTP ${uploadRes.status} - ${errText}`,
      );
    }

    const { id: jobId } = (await uploadRes.json()) as { id: string };
    this.logger.log(`LlamaParse upload success. Job ID: ${jobId}. Polling...`);

    // 2. Poll for job completion
    const maxRetries = 90; // 3 minutes total
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const jobStatusRes = await fetch(
        `https://api.llamacloud.com/v1/parser/job/${jobId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );

      if (!jobStatusRes.ok) {
        throw new Error(
          `LlamaParse status check failed: HTTP ${jobStatusRes.status}`,
        );
      }

      const jobStatus = (await jobStatusRes.json()) as { status: string };
      if (jobStatus.status === 'SUCCESS') {
        this.logger.log(`LlamaParse job SUCCESS. Fetching markdown...`);
        // 3. Retrieve markdown result
        const resultRes = await fetch(
          `https://api.llamacloud.com/v1/parser/job/${jobId}/result/markdown`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          },
        );

        if (!resultRes.ok) {
          throw new Error(
            `LlamaParse result retrieval failed: HTTP ${resultRes.status}`,
          );
        }

        const resultData = (await resultRes.json()) as { markdown?: string };
        const markdown = resultData.markdown ?? '';

        // Detect scanned-only PDF: LlamaParse returns page-number markers
        // such as "-- 1 of N --" with no actual text when OCR is disabled or
        // the document has zero embedded text.  Log a warning so it is visible.
        const markerOnly = /^(\s*--\s*\d+ of \d+\s*--\s*)+$/.test(markdown);
        if (markerOnly) {
          this.logger.warn(
            `LlamaParse returned only page markers for "${filename}". ` +
              `The PDF appears to be fully image-based. OCR may not have been applied.`,
          );
        }

        return markdown;
      }

      if (jobStatus.status === 'FAILED') {
        throw new Error('LlamaParse job processing failed on server');
      }
    }

    throw new Error('LlamaParse job timed out');
  }
}
