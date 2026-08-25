import JSZip from 'jszip';
import {
  applyWorksheetPrintLayout,
  applyXlsxPrintLayout,
} from './xlsx-print-layout';

describe('XLSX print layout', () => {
  it('adds A4 landscape and fit-to-width settings to a worksheet', () => {
    const xml =
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';

    const result = applyWorksheetPrintLayout(xml);

    expect(result).toContain('<pageSetUpPr fitToPage="1"/>');
    expect(result).toContain(
      '<pageMargins left="0.3937" right="0.3937" top="0.3937" bottom="0.3937" header="0.2" footer="0.2"/>',
    );
    expect(result).toContain(
      '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>',
    );
  });

  it('overrides layout attributes while preserving unrelated settings', () => {
    const xml =
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr autoPageBreaks="0" fitToPage="0"/></sheetPr>' +
      '<sheetData/><pageMargins left="1" right="1" top="1" bottom="1" header="0.3" footer="0.3"/>' +
      '<pageSetup paperSize="1" orientation="portrait" fitToWidth="2" fitToHeight="3" blackAndWhite="1"/>' +
      '</worksheet>';

    const result = applyWorksheetPrintLayout(xml);

    expect(result).toContain('<pageSetUpPr autoPageBreaks="0" fitToPage="1"/>');
    expect(result).toContain('blackAndWhite="1"');
    expect(result).toContain('paperSize="9"');
    expect(result).toContain('orientation="landscape"');
    expect(result).toContain('fitToWidth="1"');
    expect(result).toContain('fitToHeight="0"');
  });

  it('updates every worksheet in the temporary XLSX buffer', async () => {
    const archive = new JSZip();
    archive.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
    );
    archive.file(
      'xl/worksheets/sheet2.xml',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
    );
    archive.file('xl/styles.xml', '<styleSheet/>');
    const input = await archive.generateAsync({ type: 'nodebuffer' });

    const output = await applyXlsxPrintLayout(input);
    const converted = await JSZip.loadAsync(output);

    for (const sheet of ['sheet1.xml', 'sheet2.xml']) {
      const xml = await converted
        .file(`xl/worksheets/${sheet}`)!
        .async('string');
      expect(xml).toContain('orientation="landscape"');
      expect(xml).toContain('fitToWidth="1"');
      expect(xml).toContain('fitToHeight="0"');
    }
    expect(await converted.file('xl/styles.xml')!.async('string')).toBe(
      '<styleSheet/>',
    );
  });
});
