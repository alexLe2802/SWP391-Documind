import { Injectable, Logger } from '@nestjs/common';
import JSZip from 'jszip';
import * as mammoth from 'mammoth';

@Injectable()
export class DocxExtractorService {
  private readonly logger = new Logger(DocxExtractorService.name);

  // Xử lý extract.
  async extract(buffer: Buffer): Promise<string> {
    const structuredText = await this.extractStructuredText(buffer);
    if (structuredText.trim()) {
      return structuredText;
    }

    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  }

  // Xử lý structured text.
  private async extractStructuredText(buffer: Buffer): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) {
      return '';
    }

    const parts: string[] = [];
    const stats = {
      paragraphs: 0,
      tables: 0,
      rows: 0,
    };
    let tableIndex = 0;
    let currentHeading = '';

    for (const block of this.extractBodyBlocks(documentXml)) {
      if (block.tagName === 'w:p') {
        const paragraph = this.normalizeWhitespace(
          this.extractTextFromXml(block.xml),
        );
        if (!paragraph) {
          continue;
        }

        stats.paragraphs += 1;
        parts.push(paragraph);
        if (this.isHeading(block.xml, paragraph)) {
          currentHeading = paragraph;
        }
        continue;
      }

      tableIndex += 1;
      const table = this.formatTable(
        block.xml,
        currentHeading,
        tableIndex,
        stats,
      );
      if (table) {
        parts.push(table);
      }
    }

    const headerFooterText = await this.extractHeaderFooterText(zip);
    if (headerFooterText.length > 0) {
      parts.push(...headerFooterText);
    }

    const extracted = parts.join('\n\n').trim();
    this.logger.debug(
      `DOCX extraction stats: length=${extracted.length}, paragraphs=${stats.paragraphs}, tables=${stats.tables}, rows=${stats.rows}`,
    );

    return extracted;
  }

  // Xử lý header footer text.
  private async extractHeaderFooterText(zip: JSZip): Promise<string[]> {
    const fileNames = Object.keys(zip.files).filter((name) =>
      /^word\/(?:header|footer)\d+\.xml$/.test(name),
    );
    const texts: string[] = [];

    for (const fileName of fileNames) {
      const xml = await zip.file(fileName)?.async('string');
      if (!xml) {
        continue;
      }

      const text = this.normalizeWhitespace(this.extractTextFromXml(xml));
      if (text) {
        texts.push(text);
      }
    }

    return texts;
  }

  // Xử lý body blocks.
  private extractBodyBlocks(
    xml: string,
  ): Array<{ tagName: string; xml: string }> {
    const body = /<w:body\b[\s\S]*?>([\s\S]*?)<\/w:body>/.exec(xml)?.[1] ?? xml;
    return this.extractBlocks(body, ['w:p', 'w:tbl']);
  }

  // Xử lý blocks.
  private extractBlocks(
    xml: string,
    tagNames: string[],
  ): Array<{ tagName: string; xml: string }> {
    const blocks: Array<{ tagName: string; xml: string }> = [];
    let index = 0;

    while (index < xml.length) {
      const next = tagNames
        .map((tagName) => ({
          tagName,
          start: xml.indexOf(`<${tagName}`, index),
        }))
        .filter((candidate) => candidate.start >= 0)
        .sort((left, right) => left.start - right.start)[0];

      if (!next) {
        break;
      }

      const openEnd = xml.indexOf('>', next.start);
      if (openEnd < 0) {
        break;
      }

      const closeTag = `</${next.tagName}>`;
      const end = this.findMatchingClose(xml, next.tagName, next.start);
      if (end < 0) {
        break;
      }

      blocks.push({
        tagName: next.tagName,
        xml: xml.slice(next.start, end + closeTag.length),
      });
      index = end + closeTag.length;
    }

    return blocks;
  }

  // Lấy dữ liệu matching close.
  private findMatchingClose(
    xml: string,
    tagName: string,
    start: number,
  ): number {
    const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'g');
    tagPattern.lastIndex = start;
    let depth = 0;
    let match: RegExpExecArray | null;

    while ((match = tagPattern.exec(xml)) !== null) {
      if (match[0].startsWith(`</${tagName}`)) {
        depth -= 1;
        if (depth === 0) {
          return match.index;
        }
      } else if (!match[0].endsWith('/>')) {
        depth += 1;
      }
    }

    return -1;
  }

  // Chuyển đổi hoặc chuẩn hóa table.
  private formatTable(
    tableXml: string,
    currentHeading: string,
    tableIndex: number,
    stats: { tables: number; rows: number },
  ): string {
    stats.tables += 1;
    const rows: string[] = [];

    for (const rowXml of this.extractBlocks(tableXml, ['w:tr'])) {
      // Keep every cell, including repeated values and blanks.  Repeated cells
      // and duplicate rows are valid Word table content (for example, a status
      // column with multiple "Pending" values), so de-duplicating here loses
      // searchable text and shifts column positions.
      const cells = this.extractBlocks(rowXml.xml, ['w:tc']).map((cell) =>
        this.extractDirectCellText(cell.xml),
      );

      if (cells.length === 0 || cells.every((cellText) => !cellText)) {
        continue;
      }

      const line = cells.join(' | ');
      rows.push(line);
      stats.rows += 1;

      for (const cell of this.extractBlocks(rowXml.xml, ['w:tc'])) {
        for (const nestedTable of this.extractBlocks(cell.xml, ['w:tbl'])) {
          const nested = this.formatTable(
            nestedTable.xml,
            currentHeading,
            tableIndex,
            stats,
          );
          if (nested) {
            rows.push(nested);
          }
        }
      }
    }

    if (rows.length === 0) {
      return '';
    }

    const section = currentHeading ? [`[SECTION: ${currentHeading}]`] : [];
    return [...section, `[TABLE: Table ${tableIndex}]`, ...rows].join('\n');
  }

  // Xử lý direct cell text.
  private extractDirectCellText(cellXml: string): string {
    const withoutNestedTables = cellXml.replace(
      /<w:tbl\b[\s\S]*?<\/w:tbl>/g,
      ' ',
    );
    return this.normalizeWhitespace(
      this.extractTextFromXml(withoutNestedTables),
    );
  }

  // Xử lý text from xml.
  private extractTextFromXml(xml: string): string {
    return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => this.decodeXml(match[1]))
      .join(' ');
  }

  // Kiểm tra điều kiện heading.
  private isHeading(paragraphXml: string, paragraph: string): boolean {
    return (
      /<w:pStyle\b[^>]*w:val="Heading\d+"/.test(paragraphXml) ||
      /^\d+(?:\.\d+)*\.?\s+\S/.test(paragraph)
    );
  }

  // Chuyển đổi hoặc chuẩn hóa whitespace.
  private normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  // Thực hiện chức năng decode xml.
  private decodeXml(value: string): string {
    return value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}
