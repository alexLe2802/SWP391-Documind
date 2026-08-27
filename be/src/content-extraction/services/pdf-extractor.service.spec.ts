import { ConfigService } from '@nestjs/config';
import { PDFParse } from 'pdf-parse';
import { PdfExtractorService } from './pdf-extractor.service';

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn(),
}));

describe('PdfExtractorService', () => {
  const configService = {
    get: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockReturnValue('');
  });

  it('preserves page numbers and detected table rows with local pdf parsing', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    const getText = jest.fn().mockResolvedValue({
      pages: [
        { num: 1, text: 'Opening overview' },
        { num: 2, text: 'Enable TCP/IP and restart SQL Server service' },
      ],
      text: 'Opening overview\nEnable TCP/IP and restart SQL Server service',
    });
    const getTable = jest.fn().mockResolvedValue({
      pages: [
        { num: 1, tables: [] },
        {
          num: 2,
          tables: [
            [
              ['Step', 'Action'],
              ['1', 'Set port 1433'],
            ],
          ],
        },
      ],
    });
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText,
      getTable,
      destroy,
    }));

    const service = new PdfExtractorService(configService as never);
    const result = await service.extract(Buffer.from('pdf'), 'guide.pdf');

    expect(result).toContain('[PAGE: 1]');
    expect(result).toContain('Opening overview');
    expect(result).toContain('[PAGE: 2]');
    expect(result).toContain('Enable TCP/IP');
    expect(result).toContain('[TABLE: Page 2 Table 1]');
    expect(result).toContain('Step | Action');
    expect(result).toContain('1 | Set port 1433');
    expect(destroy).toHaveBeenCalled();
  });

  it('marks image-only pages when no selectable text is extracted', async () => {
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({
        pages: [{ num: 1, text: '' }],
        text: '',
      }),
      getTable: jest.fn().mockResolvedValue({ pages: [] }),
      destroy: jest.fn().mockResolvedValue(undefined),
    }));

    const service = new PdfExtractorService(configService as never);

    await expect(service.extract(Buffer.from('pdf'))).resolves.toContain(
      'OCR may be required',
    );
  });

  it('preserves empty PDF table cells and falls back when cloud parsing returns only page markers', async () => {
    configService.get.mockReturnValue('llama-key');
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({
        pages: [{ num: 1, text: 'Local page text' }],
        text: 'Local page text',
      }),
      getTable: jest.fn().mockResolvedValue({
        pages: [
          {
            num: 1,
            tables: [
              [
                ['Field', '', 'Value'],
                ['Owner', '', 'Lan'],
              ],
            ],
          },
        ],
      }),
      destroy: jest.fn().mockResolvedValue(undefined),
    }));

    const service = new PdfExtractorService(configService as never);
    const serviceWithLlamaParse = service as unknown as {
      extractWithLlamaParse: () => Promise<string>;
    };
    jest
      .spyOn(serviceWithLlamaParse, 'extractWithLlamaParse')
      .mockResolvedValue('-- 1 of 1 --');

    const result = await service.extract(Buffer.from('pdf'), 'marker-only.pdf');

    expect(result).toContain('Local page text');
    expect(result).toContain('Field |  | Value');
    expect(result).toContain('Owner |  | Lan');
    expect(serviceWithLlamaParse.extractWithLlamaParse).not.toHaveBeenCalled();
  });

  it('calls cloud OCR only when local parsing finds an image-only page', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'LLAMA_CLOUD_API_KEY' ? 'llama-key' : '',
    );
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({
        pages: [{ num: 1, text: '' }],
        text: '',
      }),
      getTable: jest.fn().mockResolvedValue({ pages: [] }),
      destroy: jest.fn().mockResolvedValue(undefined),
    }));
    const service = new PdfExtractorService(configService as never);
    const serviceWithLlamaParse = service as unknown as {
      extractWithLlamaParse: () => Promise<string>;
    };
    const cloud = jest
      .spyOn(serviceWithLlamaParse, 'extractWithLlamaParse')
      .mockResolvedValue('[PAGE: 1]\nNội dung OCR');

    await expect(service.extract(Buffer.from('scan'))).resolves.toContain(
      'Nội dung OCR',
    );
    expect(cloud).toHaveBeenCalledTimes(1);
  });

  it('accepts the validated boolean premium-mode configuration', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'LLAMA_PARSE_PREMIUM_MODE') return true;
      return '';
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('unavailable'),
    } as unknown as Response);
    const service = new PdfExtractorService(configService as never);
    const serviceWithLlamaParse = service as unknown as {
      extractWithLlamaParse: (
        buffer: Buffer,
        filename: string,
        apiKey: string,
      ) => Promise<string>;
    };

    await expect(
      serviceWithLlamaParse.extractWithLlamaParse(
        Buffer.from('scan'),
        'scan.pdf',
        'llama-key',
      ),
    ).rejects.toThrow('LlamaParse upload failed: HTTP 503');

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(FormData);
    expect((request?.body as FormData).get('premium_mode')).toBe('true');
    fetchMock.mockRestore();
  });

  it('skips cloud OCR when unreadable pages exceed the configured budget', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'LLAMA_CLOUD_API_KEY') return 'llama-key';
      if (key === 'OCR_MAX_PAGES') return '1';
      return '';
    });
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({
        pages: [
          { num: 1, text: '' },
          { num: 2, text: '' },
        ],
        text: '',
      }),
      getTable: jest.fn().mockResolvedValue({ pages: [] }),
      destroy: jest.fn().mockResolvedValue(undefined),
    }));
    const service = new PdfExtractorService(configService as never);
    const serviceWithLlamaParse = service as unknown as {
      extractWithLlamaParse: () => Promise<string>;
    };
    const cloud = jest.spyOn(serviceWithLlamaParse, 'extractWithLlamaParse');

    await expect(service.extract(Buffer.from('large-scan'))).resolves.toContain(
      'OCR may be required',
    );
    expect(cloud).not.toHaveBeenCalled();
  });

  it('rejects upload validation when image-only pages exceed the OCR limit', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'OCR_MAX_PAGES' ? '2' : '',
    );
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({
        pages: [
          { num: 1, text: '' },
          { num: 2, text: 'Readable text' },
          { num: 3, text: '' },
          { num: 4, text: '' },
        ],
        text: 'Readable text',
      }),
      destroy: jest.fn().mockResolvedValue(undefined),
    }));
    const service = new PdfExtractorService(configService as never);

    await expect(
      service.validateOcrPageLimit(Buffer.from('scan')),
    ).rejects.toThrow('3 image-only pages; the OCR limit is 2 pages');
  });

  it('allows upload validation when image-only pages are within the OCR limit', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'OCR_MAX_PAGES' ? '2' : '',
    );
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({
        pages: [
          { num: 1, text: '' },
          { num: 2, text: 'Readable text' },
        ],
        text: 'Readable text',
      }),
      destroy: jest.fn().mockResolvedValue(undefined),
    }));
    const service = new PdfExtractorService(configService as never);

    await expect(
      service.validateOcrPageLimit(Buffer.from('scan')),
    ).resolves.toBeUndefined();
  });
});
