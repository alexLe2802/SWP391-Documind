import JSZip from 'jszip';
import { XlsxExtractorService } from './xlsx-extractor.service';

describe('XlsxExtractorService', () => {
  const service = new XlsxExtractorService();

  it('extracts text from shared strings and worksheet inline strings', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      '<workbook><sheets><sheet name="Plan"/></sheets></workbook>',
    );
    zip.file(
      'xl/sharedStrings.xml',
      '<sst><si><t>Cell A</t></si><si><t>Cell &amp; B</t></si></sst>',
    );
    zip.file(
      'xl/worksheets/sheet1.xml',
      [
        '<worksheet><sheetData>',
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
        '<row r="2"><c r="A2" t="inlineStr"><is><t>Inline cell</t></is></c><c r="B2"><v>1433</v></c></row>',
        '</sheetData></worksheet>',
      ].join(''),
    );

    await expect(
      service.extract(await zip.generateAsync({ type: 'nodebuffer' })),
    ).resolves.toBe(
      '[SHEET: Plan]\n[ROW: 1] Cell A | Cell & B\n[ROW: 2] Inline cell | 1433',
    );
  });

  it('preserves multiple sheet names and row values', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      '<workbook><sheets><sheet name="Setup"/><sheet name="Ports"/></sheets></workbook>',
    );
    zip.file(
      'xl/sharedStrings.xml',
      '<sst><si><t>Task</t></si><si><t>Enable TCP/IP</t></si><si><t>Port</t></si></sst>',
    );
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row r="1"><c t="s"><v>0</v></c></row><row r="2"><c t="s"><v>1</v></c></row></sheetData></worksheet>',
    );
    zip.file(
      'xl/worksheets/sheet2.xml',
      '<worksheet><sheetData><row r="1"><c t="s"><v>2</v></c></row><row r="2"><c><v>1433</v></c></row></sheetData></worksheet>',
    );

    const result = await service.extract(
      await zip.generateAsync({ type: 'nodebuffer' }),
    );

    expect(result).toContain('[SHEET: Setup]');
    expect(result).toContain('[ROW: 2] Enable TCP/IP');
    expect(result).toContain('[SHEET: Ports]');
    expect(result).toContain('[ROW: 2] 1433');
  });

  it('extracts rich shared strings and worksheet rows without row numbers', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      '<workbook><sheets><sheet name="Project Management"/></sheets></workbook>',
    );
    zip.file(
      'xl/sharedStrings.xml',
      [
        '<sst>',
        '<si><r><t>Task</t></r><r><t> Name</t></r></si>',
        '<si><r><t>Setup backend API</t></r></si>',
        '</sst>',
      ].join(''),
    );
    zip.file(
      'xl/worksheets/sheet1.xml',
      [
        '<worksheet><sheetData>',
        '<row><c t="s"><v>0</v></c><c t="inlineStr"><is><t>Status</t></is></c></row>',
        '<row><c t="s"><v>1</v></c><c><v>80</v></c></row>',
        '</sheetData></worksheet>',
      ].join(''),
    );

    const result = await service.extract(
      await zip.generateAsync({ type: 'nodebuffer' }),
    );

    expect(result).toContain('[SHEET: Project Management]');
    expect(result).toContain('[ROW: 1] Task Name | Status');
    expect(result).toContain('[ROW: 2] Setup backend API | 80');
  });

  it('extracts namespaced worksheets and single-quoted attributes', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      "<x:workbook><x:sheets><x:sheet name='Template'/></x:sheets></x:workbook>",
    );
    zip.file(
      'xl/sharedStrings.xml',
      [
        '<x:sst>',
        '<x:si><x:r><x:t>Milestone</x:t></x:r></x:si>',
        '<x:si><x:r><x:t>Final demo</x:t></x:r></x:si>',
        '</x:sst>',
      ].join(''),
    );
    zip.file(
      'xl/worksheets/custom-sheet.xml',
      [
        '<x:worksheet><x:sheetData>',
        "<x:row r='1'><x:c t='s'><x:v>0</x:v></x:c><x:c t='inlineStr'><x:is><x:t>Owner</x:t></x:is></x:c></x:row>",
        "<x:row r='2'><x:c t='s'><x:v>1</x:v></x:c><x:c><x:v>Backend</x:v></x:c></x:row>",
        '</x:sheetData></x:worksheet>',
      ].join(''),
    );

    const result = await service.extract(
      await zip.generateAsync({ type: 'nodebuffer' }),
    );

    expect(result).toContain('[SHEET: Template]');
    expect(result).toContain('[ROW: 1] Milestone | Owner');
    expect(result).toContain('[ROW: 2] Final demo | Backend');
  });

  it('falls back to readable worksheet values when row parsing misses a workbook variant', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/worksheets/sheet1.xml',
      [
        '<worksheet>',
        '<customRow><c t="inlineStr"><is><t>Fallback task</t></is></c></customRow>',
        '<v>42</v>',
        '</worksheet>',
      ].join(''),
    );

    const result = await service.extract(
      await zip.generateAsync({ type: 'nodebuffer' }),
    );

    expect(result).toContain('[SHEET: Sheet 1]');
    expect(result).toContain('Fallback task');
    expect(result).toContain('42');
  });

  it('falls back to drawing text when a template stores labels outside worksheet cells', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/drawings/drawing1.xml',
      [
        '<xdr:wsDr>',
        '<xdr:sp><xdr:txBody><a:p><a:r><a:t>AI Study Hub Project Management Template</a:t></a:r></a:p></xdr:txBody></xdr:sp>',
        '<xdr:sp><xdr:txBody><a:p><a:r><a:t>Milestones and owners</a:t></a:r></a:p></xdr:txBody></xdr:sp>',
        '</xdr:wsDr>',
      ].join(''),
    );

    const result = await service.extract(
      await zip.generateAsync({ type: 'nodebuffer' }),
    );

    expect(result).toContain('[FILE: xl/drawings/drawing1.xml]');
    expect(result).toContain('AI Study Hub Project Management Template');
    expect(result).toContain('Milestones and owners');
  });
});
