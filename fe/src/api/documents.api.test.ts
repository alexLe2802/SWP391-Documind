import { beforeEach, vi } from 'vitest'
import {
  MAX_FILE_SIZE,
  fetchLibraryDocuments,
  fetchExtractionStatus,
  getMissingUploadFields,
  mapApiDocument,
  retryExtraction,
  updateDocumentVisibility,
  validateDocumentFile,
} from './documents.api'
import { apiRequest } from '../lib/http'

vi.mock('../lib/http', () => ({
  apiRequest: vi.fn(),
}))

describe('documents API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates the four supported formats and 80 MB maximum', () => {
    expect(validateDocumentFile(new File(['content'], 'notes.pdf'))).toBeNull()
    expect(validateDocumentFile(new File(['content'], 'slides.pptx'))).toBeNull()
    expect(validateDocumentFile(new File(['content'], 'notes.exe'))).toContain('PDF')
    expect(
      validateDocumentFile(new File([new Uint8Array(MAX_FILE_SIZE + 1)], 'large.pdf')),
    ).toContain('80 MB')
  })

  it('requires file, title, subject, and category before upload', () => {
    expect(
      getMissingUploadFields({
        file: undefined,
        title: '',
        subjectId: '',
        categoryId: '',
      }),
    ).toEqual(['file', 'title', 'subject', 'category'])
    expect(
      getMissingUploadFields({
        file: new File(['content'], 'notes.pdf'),
        title: 'Notes',
        subjectId: 'subject-id',
        categoryId: 'category-id',
      }),
    ).toEqual([])
  })

  it('maps the backend document contract into the library model', () => {
    expect(
      mapApiDocument({
        id: 'doc-id',
        title: 'Lecture',
        description: null,
        fileName: 'lecture.pdf',
        fileType: 'application/pdf',
        fileSize: '2048',
        subject: { id: 'subject-id', name: 'Algorithms', code: 'ALG' },
        category: { id: 'category-id', name: 'Lecture notes' },
        tags: [{ id: 'tag-id', name: 'graphs' }],
        aiStatus: 'COMPLETED',
        visibility: 'PRIVATE',
        status: 'ACTIVE',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'doc-id',
        fileType: 'PDF',
        fileSize: 2048,
        subjectId: 'subject-id',
        subject: 'Algorithms',
        categoryId: 'category-id',
        category: 'Lecture notes',
        tags: ['graphs'],
        indexStatus: 'READY',
      }),
    )
  })

  it('does not combine savedOnly with the default ownerOnly filter', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    })

    await fetchLibraryDocuments({ savedOnly: true, limit: 100 })

    expect(apiRequest).toHaveBeenCalledWith('/documents?savedOnly=true&limit=100')
  })

  it('keeps ownerOnly as the default for normal library listings', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    })

    await fetchLibraryDocuments({ limit: 100 })

    expect(apiRequest).toHaveBeenCalledWith('/documents?ownerOnly=true&limit=100')
  })

  it('starts extraction again and reads progress from the status endpoint', async () => {
    vi.mocked(apiRequest).mockResolvedValue({})

    await retryExtraction('doc-id')
    await fetchExtractionStatus('doc-id')

    expect(apiRequest).toHaveBeenNthCalledWith(1, '/documents/doc-id/extract', {
      method: 'POST',
    })
    expect(apiRequest).toHaveBeenNthCalledWith(2, '/documents/doc-id/extraction-status')
  })

  it('publishes an owned private document through the visibility endpoint', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      id: 'doc-id',
      title: 'Private notes',
      description: null,
      fileName: 'notes.pdf',
      fileType: 'application/pdf',
      fileSize: '1024',
      subject: { id: 'subject-id', name: 'Algorithms' },
      category: { id: 'category-id', name: 'Notes' },
      tags: [],
      aiStatus: 'COMPLETED',
      visibility: 'PUBLIC',
      moderationStatus: 'APPROVED',
      status: 'ACTIVE',
      createdAt: '2026-08-06T00:00:00.000Z',
      updatedAt: '2026-08-06T00:01:00.000Z',
    })

    const document = await updateDocumentVisibility('doc-id', 'PUBLIC')

    expect(apiRequest).toHaveBeenCalledWith('/documents/doc-id/visibility', {
      method: 'PUT',
      body: { visibility: 'PUBLIC' },
    })
    expect(document.visibility).toBe('PUBLIC')
    expect(document.moderationStatus).toBe('APPROVED')
  })
})
