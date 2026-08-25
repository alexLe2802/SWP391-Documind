import JSZip from 'jszip';
import { PptxExtractorService } from './pptx-extractor.service';

describe('PptxExtractorService', () => {
  const service = new PptxExtractorService();

  it('extracts text from slide XML files', async () => {
    const zip = new JSZip();
    zip.file('ppt/presentation.xml', '<presentation />');
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld><a:t>First slide</a:t><a:t>Second line</a:t></p:sld>',
    );
    zip.file(
      'ppt/slides/slide2.xml',
      '<p:sld><a:t>Next &amp; final</a:t></p:sld>',
    );

    await expect(
      service.extract(await zip.generateAsync({ type: 'nodebuffer' })),
    ).resolves.toBe(
      '[SLIDE: 1]\n[TITLE: First slide]\nFirst slide\nSecond line\n\n[SLIDE: 2]\n[TITLE: Next & final]\nNext & final',
    );
  });

  it('preserves slide table rows with slide context', async () => {
    const zip = new JSZip();
    zip.file('ppt/presentation.xml', '<presentation />');
    zip.file(
      'ppt/slides/slide1.xml',
      [
        '<p:sld>',
        '<a:t>Implementation Plan</a:t>',
        '<a:tbl>',
        '<a:tr><a:tc><a:t>Step</a:t></a:tc><a:tc><a:t>Action</a:t></a:tc></a:tr>',
        '<a:tr><a:tc><a:t>1</a:t></a:tc><a:tc><a:t>Restart service</a:t></a:tc></a:tr>',
        '</a:tbl>',
        '</p:sld>',
      ].join(''),
    );

    const result = await service.extract(
      await zip.generateAsync({ type: 'nodebuffer' }),
    );

    expect(result).toContain('[SLIDE: 1]');
    expect(result).toContain('[TABLE: Slide 1 Table 1]');
    expect(result).toContain('Step | Action');
    expect(result).toContain('1 | Restart service');
  });

  it('extracts namespaced text and strips escaped XML markup from slide text', async () => {
    const zip = new JSZip();
    zip.file('ppt/presentation.xml', '<presentation />');
    zip.file(
      'ppt/slides/slide1.xml',
      [
        '<p:sld>',
        '<p:sp><p:txBody><a:p><a:r><a:t>Quan hệ lợi ích kinh tế</a:t></a:r></a:p></p:txBody></p:sp>',
        '<p:sp><p:txBody><a:p><a:r><a:t>&lt;p:sp&gt;Không để tag XML lộ ra&lt;/p:sp&gt;</a:t></a:r></a:p></p:txBody></p:sp>',
        '</p:sld>',
      ].join(''),
    );

    const result = await service.extract(
      await zip.generateAsync({ type: 'nodebuffer' }),
    );

    expect(result).toContain('Quan hệ lợi ích kinh tế');
    expect(result).toContain('Không để tag XML lộ ra');
    expect(result).not.toContain('<p:sp>');
  });
});
