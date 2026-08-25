import { describe, expect, it } from 'vitest'
import type { LibraryDocument } from '../types/document'
import { filterAndSortSavedDocuments } from './saved-documents'

function document(overrides: Partial<LibraryDocument>): LibraryDocument {
  return {
    id: 'doc', title: 'Document', description: '', subjectId: 'subject', subject: 'Math',
    categoryId: 'category', category: 'Notes', tags: [], visibility: 'PUBLIC', fileName: 'doc.pdf',
    fileType: 'PDF', fileSize: 1, pages: 0, uploadedAt: '2026-01-01T00:00:00Z', indexStatus: 'READY',
    ...overrides,
  }
}

describe('filterAndSortSavedDocuments', () => {
  const documents = [
    document({ id: '1', title: 'Algebra', tags: ['matrix'], uploadedAt: '2026-01-01T00:00:00Z' }),
    document({ id: '2', title: 'Biology', subject: 'Science', fileType: 'PPTX', fileName: 'biology.pptx', fileSize: 20, uploadedAt: '2026-02-01T00:00:00Z' }),
  ]

  it('searches document metadata and tags', () => {
    const result = filterAndSortSavedDocuments(documents, { query: 'matrix', subject: '', fileType: '', sort: 'newest' })
    expect(result.map((item) => item.id)).toEqual(['1'])
  })

  it('combines subject and file type filters', () => {
    const result = filterAndSortSavedDocuments(documents, { query: '', subject: 'Science', fileType: 'PPTX', sort: 'newest' })
    expect(result.map((item) => item.id)).toEqual(['2'])
  })

  it('sorts without mutating the source array', () => {
    const result = filterAndSortSavedDocuments(documents, { query: '', subject: '', fileType: '', sort: 'size-desc' })
    expect(result.map((item) => item.id)).toEqual(['2', '1'])
    expect(documents.map((item) => item.id)).toEqual(['1', '2'])
  })
})
