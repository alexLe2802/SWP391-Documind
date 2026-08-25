import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminDocuments } from './admin.api'
import { apiRequest } from '../lib/http'

vi.mock('../lib/http', () => ({
  apiRequest: vi.fn(),
}))

const apiDocument = {
  id: 'doc-id',
  title: 'Public lecture notes',
  description: null,
  fileName: 'lecture.pdf',
  fileType: 'application/pdf',
  fileSize: '4096',
  subject: { id: 'subject-id', name: 'Mathematics' },
  category: { id: 'category-id', name: 'Lecture Notes' },
  tags: [{ id: 'tag-id', name: 'calculus' }],
  aiStatus: 'COMPLETED' as const,
  visibility: 'PUBLIC' as const,
  status: 'ACTIVE' as const,
  moderationReason: null,
  owner: { fullName: 'Student One', email: 'student@example.com' },
  createdAt: '2026-06-26T00:00:00.000Z',
  updatedAt: '2026-06-26T00:00:00.000Z',
}

describe('admin documents api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps backend data/meta document lists to admin table items', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      data: [apiDocument],
      meta: {
        page: 1,
        limit: 8,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    })

    const result = await getAdminDocuments({ page: 1, limit: 8, visibility: 'PUBLIC' })

    expect(apiRequest).toHaveBeenCalledWith('/admin/documents?page=1&limit=8&visibility=PUBLIC')
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'doc-id',
        title: 'Public lecture notes',
        fileType: 'PDF',
        fileSize: 4096,
        subject: 'Mathematics',
        category: 'Lecture Notes',
        visibility: 'PUBLIC',
        status: 'ACTIVE',
        owner: { fullName: 'Student One', email: 'student@example.com' },
      }),
    ])
    expect(result.meta.totalItems).toBe(1)
  })
})
