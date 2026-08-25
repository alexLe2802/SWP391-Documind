import { DocumentsController } from './documents.controller';

describe('DocumentsController', () => {
  const documents = {
    upload: jest.fn(),
  };
  const extraction = {
    validateUpload: jest.fn(),
    startExtraction: jest.fn(),
  };
  const controller = new DocumentsController(
    documents as never,
    extraction as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('queues extraction only after the document upload succeeds', async () => {
    const user = { id: 'owner-id' };
    const dto = {
      subjectId: 'subject-id',
      categoryId: 'category-id',
      title: 'Document',
    };
    const file = { originalname: 'file.pdf' };
    const uploaded = { id: 'document-id', title: 'Document' };
    documents.upload.mockResolvedValue(uploaded);
    extraction.startExtraction.mockResolvedValue({
      documentId: 'document-id',
      extractionStatus: 'PENDING',
    });
    extraction.validateUpload.mockResolvedValue(undefined);

    await expect(
      controller.upload(user as never, dto as never, file as never),
    ).resolves.toBe(uploaded);
    expect(extraction.validateUpload).toHaveBeenCalledWith(file);
    expect(extraction.validateUpload.mock.invocationCallOrder[0]).toBeLessThan(
      documents.upload.mock.invocationCallOrder[0],
    );
    expect(extraction.startExtraction).toHaveBeenCalledWith(
      'document-id',
      user,
    );
    expect(documents.upload.mock.invocationCallOrder[0]).toBeLessThan(
      extraction.startExtraction.mock.invocationCallOrder[0],
    );
  });

  it('does not queue extraction when upload fails', async () => {
    extraction.validateUpload.mockResolvedValue(undefined);
    documents.upload.mockRejectedValue(new Error('R2 unavailable'));

    await expect(
      controller.upload(
        { id: 'owner-id' } as never,
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Document',
        },
        { originalname: 'file.pdf' } as never,
      ),
    ).rejects.toThrow('R2 unavailable');
    expect(extraction.startExtraction).not.toHaveBeenCalled();
  });

  it('rejects an oversized OCR document before uploading it', async () => {
    extraction.validateUpload.mockRejectedValue(
      new Error('PDF has 21 image-only pages; the OCR limit is 20 pages.'),
    );

    await expect(
      controller.upload(
        { id: 'owner-id' } as never,
        {
          subjectId: 'subject-id',
          categoryId: 'category-id',
          title: 'Scanned document',
        },
        { originalname: 'scan.pdf' } as never,
      ),
    ).rejects.toThrow('OCR limit is 20 pages');
    expect(documents.upload).not.toHaveBeenCalled();
    expect(extraction.startExtraction).not.toHaveBeenCalled();
  });
});
