import JSZip from 'jszip';
import { DocxExtractorService } from './docx-extractor.service';

describe('DocxExtractorService', () => {
  let service: DocxExtractorService;

  beforeEach(() => {
    service = new DocxExtractorService();
  });

  it('extracts paragraphs, headings, header rows, data rows, and headerless tables', async () => {
    const buffer = await createDocxBuffer(`
      <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Project Work Plan</w:t></w:r></w:p>
      <w:p><w:r><w:t>This document describes the quarterly work plan.</w:t></w:r></w:p>
      <w:tbl>
        ${row(['Task', 'Owner', 'Due date', 'Status'])}
        ${row(['Collect requirements', 'An', '2026-07-01', 'Done'])}
        ${row(['Build prototype', 'Binh', '2026-07-15', 'In progress'])}
        ${row(['Review release', 'Chi', '2026-07-30', 'Pending'])}
      </w:tbl>
      <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Score Notes</w:t></w:r></w:p>
      <w:tbl>
        ${row(['Alice', '8.5'])}
        ${row(['Bob', '7.0'])}
      </w:tbl>
    `);

    const extracted = await service.extract(buffer);

    expect(extracted).toContain(
      'This document describes the quarterly work plan.',
    );
    expect(extracted).toContain('[SECTION: Project Work Plan]');
    expect(extracted).toContain('[TABLE: Table 1]');
    expect(extracted).toContain('Task | Owner | Due date | Status');
    expect(extracted).toContain(
      'Collect requirements | An | 2026-07-01 | Done',
    );
    expect(extracted).toContain(
      'Build prototype | Binh | 2026-07-15 | In progress',
    );
    expect(extracted).toContain('Review release | Chi | 2026-07-30 | Pending');
    expect(extracted).toContain('[SECTION: Score Notes]');
    expect(extracted).toContain('[TABLE: Table 2]');
    expect(extracted).toContain('Alice | 8.5');
    expect(extracted).toContain('Bob | 7.0');

    expect(extracted.indexOf('[SECTION: Project Work Plan]')).toBeLessThan(
      extracted.indexOf('[TABLE: Table 1]'),
    );
    expect(extracted.indexOf('Collect requirements')).toBeLessThan(
      extracted.indexOf('Build prototype'),
    );
    expect(extracted.indexOf('[SECTION: Score Notes]')).toBeLessThan(
      extracted.indexOf('[TABLE: Table 2]'),
    );
  });

  it('extracts paragraph-only DOCX files without table markers', async () => {
    const buffer = await createDocxBuffer(`
      <w:p><w:r><w:t>First paragraph only.</w:t></w:r></w:p>
      <w:p><w:r><w:t>Second paragraph continues the document.</w:t></w:r></w:p>
    `);

    const extracted = await service.extract(buffer);

    expect(extracted).toContain('First paragraph only.');
    expect(extracted).toContain('Second paragraph continues the document.');
    expect(extracted).not.toContain('[TABLE:');
  });

  it('preserves repeated cells, blank cells, and duplicate table rows', async () => {
    const buffer = await createDocxBuffer(`
      <w:tbl>
        ${row(['Task', 'Status', 'Reviewer'])}
        ${row(['Write summary', 'Pending', 'Pending'])}
        ${row(['', 'Approved', 'Lan'])}
        ${row(['Write summary', 'Pending', 'Pending'])}
      </w:tbl>
    `);

    const extracted = await service.extract(buffer);
    const rows = extracted.split('\n');

    expect(rows).toContain('Write summary | Pending | Pending');
    expect(
      rows.filter((rowText) => rowText === 'Write summary | Pending | Pending'),
    ).toHaveLength(2);
    expect(rows).toContain(' | Approved | Lan');
  });

  async function createDocxBuffer(bodyXml: string): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    );
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>${bodyXml}</w:body>
      </w:document>`,
    );

    return zip.generateAsync({ type: 'nodebuffer' });
  }

  function row(cells: string[]): string {
    return `<w:tr>${cells
      .map((cell) => `<w:tc><w:p><w:r><w:t>${cell}</w:t></w:r></w:p></w:tc>`)
      .join('')}</w:tr>`;
  }
});
