import JSZip from 'jszip';

const WORKSHEET_PATH = /^xl\/worksheets\/[^/]+\.xml$/;
const TEN_MILLIMETERS_IN_INCHES = '0.3937';

// Thực hiện chức năng apply xlsx print layout.
export async function applyXlsxPrintLayout(buffer: Buffer): Promise<Buffer> {
  const archive = await JSZip.loadAsync(buffer);
  const worksheets = Object.values(archive.files).filter(
    (file) => !file.dir && WORKSHEET_PATH.test(file.name),
  );

  await Promise.all(
    worksheets.map(async (worksheet) => {
      const xml = await worksheet.async('string');
      archive.file(worksheet.name, applyWorksheetPrintLayout(xml));
    }),
  );

  return archive.generateAsync({ type: 'nodebuffer' });
}

// Thực hiện chức năng apply worksheet print layout.
export function applyWorksheetPrintLayout(xml: string): string {
  const prefix = getWorksheetPrefix(xml);
  let updated = enableFitToPage(xml, prefix);
  updated = upsertElement(
    updated,
    'pageMargins',
    {
      left: TEN_MILLIMETERS_IN_INCHES,
      right: TEN_MILLIMETERS_IN_INCHES,
      top: TEN_MILLIMETERS_IN_INCHES,
      bottom: TEN_MILLIMETERS_IN_INCHES,
      header: '0.2',
      footer: '0.2',
    },
    prefix,
    'pageSetup',
  );
  return upsertElement(
    updated,
    'pageSetup',
    {
      paperSize: '9',
      orientation: 'landscape',
      fitToWidth: '1',
      fitToHeight: '0',
    },
    prefix,
  );
}

// Thực hiện chức năng enable fit to page.
function enableFitToPage(xml: string, prefix: string): string {
  if (hasElement(xml, 'pageSetUpPr')) {
    return updateElementAttributes(xml, 'pageSetUpPr', { fitToPage: '1' });
  }

  const selfClosingSheetPr = elementPattern('sheetPr', true);
  if (selfClosingSheetPr.test(xml)) {
    return xml.replace(
      selfClosingSheetPr,
      (tag) =>
        `${tag.slice(0, -2)}><${prefix}pageSetUpPr fitToPage="1"/></${prefix}sheetPr>`,
    );
  }

  const sheetPrStart = elementPattern('sheetPr', false);
  if (sheetPrStart.test(xml)) {
    return xml.replace(
      sheetPrStart,
      (tag) => `${tag}<${prefix}pageSetUpPr fitToPage="1"/>`,
    );
  }

  return xml.replace(
    /<(?:(?:[\w-]+):)?worksheet\b[^>]*>/,
    (tag) =>
      `${tag}<${prefix}sheetPr><${prefix}pageSetUpPr fitToPage="1"/></${prefix}sheetPr>`,
  );
}

// Thực hiện chức năng upsert element.
function upsertElement(
  xml: string,
  name: string,
  attributes: Record<string, string>,
  prefix: string,
  beforeElement?: string,
): string {
  if (hasElement(xml, name)) {
    return updateElementAttributes(xml, name, attributes);
  }

  const tag = `<${prefix}${name}${serializeAttributes(attributes)}/>`;
  if (beforeElement && hasElement(xml, beforeElement)) {
    return xml.replace(elementPattern(beforeElement, true), `${tag}$&`);
  }

  const trailingElement =
    /<(?:(?:[\w-]+):)?(?:headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/;
  if (trailingElement.test(xml)) {
    return xml.replace(trailingElement, `${tag}$&`);
  }

  return xml.replace(/<\/(?:(?:[\w-]+):)?worksheet>/, `${tag}$&`);
}

// Cập nhật element attributes.
function updateElementAttributes(
  xml: string,
  name: string,
  attributes: Record<string, string>,
): string {
  return xml.replace(elementPattern(name), (tag) => {
    const closing = tag.endsWith('/>') ? '/>' : '>';
    const withoutClosing = tag.slice(0, -closing.length);
    const updated = Object.entries(attributes).reduce(
      (current, [attribute, value]) => {
        const pattern = new RegExp(`\\s${attribute}="[^"]*"`, 'i');
        return pattern.test(current)
          ? current.replace(pattern, ` ${attribute}="${value}"`)
          : `${current} ${attribute}="${value}"`;
      },
      withoutClosing,
    );
    return `${updated}${closing}`;
  });
}

// Chuyển đổi hoặc chuẩn hóa attributes.
function serializeAttributes(attributes: Record<string, string>): string {
  return Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('');
}

// Kiểm tra điều kiện element.
function hasElement(xml: string, name: string): boolean {
  return elementPattern(name).test(xml);
}

// Thực hiện chức năng element pattern.
function elementPattern(name: string, selfClosingOnly = false): RegExp {
  const closing = selfClosingOnly ? '\\/>' : '\\/?>';
  return new RegExp(`<(?:(?:[\\w-]+):)?${name}\\b[^<>]*${closing}`, 'i');
}

// Lấy dữ liệu worksheet prefix.
function getWorksheetPrefix(xml: string): string {
  const match = xml.match(/<((?:[\w-]+):)?worksheet\b/);
  return match?.[1] ?? '';
}
