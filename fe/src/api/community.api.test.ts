import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchCommunityDocuments,
  mapApiCommunityDocument,
  saveCommunityDocument,
  unsaveCommunityDocument,
} from './community.api'
import { apiRequest } from '../lib/http'

vi.mock('../lib/http', () => ({
  apiRequest: vi.fn(),
}))

const apiDocument = {
  id: '79c555d8-b4ce-4d98-9f93-15f2fe1c9813',
  title: 'Uploaded public notes',
  description: null,
  fileName: 'notes.pdf',
  fileType: 'application/pdf',
  fileSize: '2048',
  subject: { id: 'subject-id', name: 'Computer Science' },
  category: { id: 'category-id', name: 'Lecture Notes' },
  owner: { id: 'owner-id', fullName: 'Minh Anh', email: 'minh@example.com' },
  tags: [],
  summary: 'AI summary',
  saveCount: 3,
  saved: true,
  owned: false,
  createdAt: '2026-06-26T00:00:00.000Z',
  updatedAt: '2026-06-26T00:00:00.000Z',
}

describe('community api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps backend community documents to the card model', () => {
    expect(mapApiCommunityDocument(apiDocument)).toEqual(
      expect.objectContaining({
        id: apiDocument.id,
        title: 'Uploaded public notes',
        description: 'AI summary',
        subject: 'Computer Science',
        category: 'Lecture Notes',
        fileType: 'PDF',
        fileSize: '2 KB',
        owner: 'Minh Anh',
        savedCount: 3,
        saved: true,
      }),
    )
  })

  it('fetches public community documents from the backend', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      items: [apiDocument],
      meta: {
        page: 1,
        limit: 100,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    })

    const result = await fetchCommunityDocuments({ limit: 100 })

    expect(apiRequest).toHaveBeenCalledWith('/community/documents?limit=100')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].title).toBe('Uploaded public notes')
  })

  it('saves and unsaves community documents through the API', async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined)

    await saveCommunityDocument(apiDocument.id)
    await unsaveCommunityDocument(apiDocument.id)

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      `/community/documents/${apiDocument.id}/save`,
      { method: 'POST' },
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      `/community/documents/${apiDocument.id}/save`,
      { method: 'DELETE' },
    )
  })
})
