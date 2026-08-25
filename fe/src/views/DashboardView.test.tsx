import { render, screen, waitFor, within } from '@testing-library/react'
import { fetchChatSessions } from '../api/chat.api'
import { fetchLibraryDocuments } from '../api/documents.api'
import { fetchCurrentSubscription } from '../api/payments.api'
import { useLanguage } from '../i18n/LanguageProvider'
import { DashboardView } from './DashboardView'

vi.mock('../api/chat.api', () => ({
  fetchChatSessions: vi.fn(),
}))

vi.mock('../api/documents.api', () => ({
  fetchLibraryDocuments: vi.fn(),
}))

vi.mock('../api/payments.api', () => ({
  fetchCurrentSubscription: vi.fn(),
}))

vi.mock('../i18n/LanguageProvider', () => ({
  useLanguage: vi.fn(),
}))

describe('DashboardView usage', () => {
  beforeEach(() => {
    vi.mocked(useLanguage).mockReturnValue({
      locale: 'en',
      setLocale: vi.fn(),
      t: vi.fn(),
    })
    vi.mocked(fetchLibraryDocuments).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    })
    vi.mocked(fetchChatSessions).mockResolvedValue({
      items: [],
      meta: {
        page: 1,
        limit: 2,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      },
    })
  })

  it('renders real finite AI usage returned by the subscription API', async () => {
    vi.mocked(fetchCurrentSubscription).mockResolvedValue({
      plan: 'STUDENT',
      startsAt: '2026-07-01T00:00:00.000Z',
      expiresAt: '2026-08-01T00:00:00.000Z',
      storageLimitMb: 1024,
      uploadLimit: 100,
      aiChatLimit: 300,
      aiChatsUsed: 142,
      aiChatsRemaining: 158,
      uploadsUsed: 3,
      uploadsRemaining: 97,
      storageUsedMb: 17.9,
      storageRemainingMb: 1006.1,
    })

    render(<DashboardView />)

    const heading = await screen.findByText('AI usage')
    const panel = heading.closest('section')
    expect(panel).not.toBeNull()
    expect(within(panel!).getByText('47%')).toBeInTheDocument()
    expect(
      within(panel!).getByText('142 of 300 AI chats used in the current period.'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(panel!.querySelector('.usage-meter > span')).toHaveStyle({ width: '47%' }),
    )

    const uploadedDocuments = screen.getByText('Uploaded documents').closest('article')
    const storageUsed = screen.getByText('Storage used').closest('article')
    expect(uploadedDocuments).not.toBeNull()
    expect(storageUsed).not.toBeNull()
    expect(within(uploadedDocuments!).getByText('3 / 100')).toBeInTheDocument()
    expect(within(storageUsed!).getByText('17.9 MB / 1 GB')).toBeInTheDocument()
  })

  it('renders unlimited usage without a misleading percentage', async () => {
    vi.mocked(fetchCurrentSubscription).mockResolvedValue({
      plan: 'PRO',
      startsAt: '2026-07-01T00:00:00.000Z',
      expiresAt: '2026-08-01T00:00:00.000Z',
      storageLimitMb: 5120,
      uploadLimit: 500,
      aiChatLimit: null,
      aiChatsUsed: 43,
      aiChatsRemaining: null,
      uploadsUsed: 3,
      uploadsRemaining: 497,
      storageUsedMb: 17.9,
      storageRemainingMb: 5102.1,
    })

    render(<DashboardView />)

    const heading = await screen.findByText('AI usage')
    const panel = heading.closest('section')
    expect(panel).not.toBeNull()
    expect(within(panel!).getByText('Unlimited')).toBeInTheDocument()
    expect(
      within(panel!).getByText('43 AI chats used in the current period · Unlimited.'),
    ).toBeInTheDocument()
  })

  it('falls back to loaded document usage when the subscription API fails', async () => {
    vi.mocked(fetchLibraryDocuments).mockResolvedValue({
      items: [
        {
          id: 'document-1',
          title: 'Document one',
          description: '',
          subjectId: 'subject-1',
          subject: 'Subject',
          categoryId: 'category-1',
          category: 'Category',
          tags: [],
          visibility: 'PRIVATE',
          fileName: 'one.pdf',
          fileType: 'PDF',
          fileSize: 1024 * 1024,
          pages: 1,
          uploadedAt: '2026-07-01T00:00:00.000Z',
          indexStatus: 'READY',
        },
        {
          id: 'document-2',
          title: 'Document two',
          description: '',
          subjectId: 'subject-1',
          subject: 'Subject',
          categoryId: 'category-1',
          category: 'Category',
          tags: [],
          visibility: 'PRIVATE',
          fileName: 'two.pdf',
          fileType: 'PDF',
          fileSize: 512 * 1024,
          pages: 1,
          uploadedAt: '2026-07-02T00:00:00.000Z',
          indexStatus: 'PROCESSING',
        },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    })
    vi.mocked(fetchCurrentSubscription).mockRejectedValue(new Error('Unavailable'))

    render(<DashboardView />)

    expect(await screen.findByText('2 / —')).toBeInTheDocument()
    expect(await screen.findByText('1.5 MB / —')).toBeInTheDocument()
  })
})
