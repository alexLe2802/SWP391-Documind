import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchLibraryDocuments } from '../api/documents.api'
import { askLibraryStream, fetchChatMessages, fetchChatSessions } from '../api/chat.api'
import { useLanguage } from '../i18n/LanguageProvider'
import type { LibraryDocument } from '../types/document'
import { AiChatbotView } from './AiChatbotView'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}))

vi.mock('../api/documents.api', () => ({
  fetchLibraryDocuments: vi.fn(),
  createDownloadUrl: vi.fn(),
}))

vi.mock('../api/chat.api', () => ({
  askDocument: vi.fn(),
  askLibrary: vi.fn(),
  askLibraryStream: vi.fn(),
  fetchChatSessions: vi.fn(),
  fetchChatMessages: vi.fn(),
}))

vi.mock('../i18n/LanguageProvider', () => ({
  useLanguage: vi.fn(),
}))

const documents: LibraryDocument[] = [
  {
    id: 'doc-ai',
    title: 'AI Foundations',
    description: '',
    subjectId: 'subject-ai',
    subject: 'Artificial Intelligence',
    categoryId: 'category-1',
    category: 'Lecture Notes',
    tags: [],
    visibility: 'PRIVATE',
    fileName: 'ai.pdf',
    fileType: 'PDF',
    fileSize: 1000,
    pages: 0,
    uploadedAt: '2026-06-20T00:00:00.000Z',
    indexStatus: 'READY',
  },
  {
    id: 'doc-db',
    title: 'Database Design',
    description: '',
    subjectId: 'subject-db',
    subject: 'Database Systems',
    categoryId: 'category-2',
    category: 'Reference',
    tags: [],
    visibility: 'PRIVATE',
    fileName: 'db.pdf',
    fileType: 'PDF',
    fileSize: 1000,
    pages: 0,
    uploadedAt: '2026-06-20T00:00:00.000Z',
    indexStatus: 'READY',
  },
]

describe('AiChatbotView subject filter', () => {
  beforeEach(() => {
    sessionStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
    } as unknown as ReturnType<typeof useRouter>)
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>)
    vi.mocked(useLanguage).mockReturnValue({
      locale: 'en',
      setLocale: vi.fn(),
      t: vi.fn(),
    })
    vi.mocked(fetchLibraryDocuments).mockResolvedValue({
      items: documents,
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    })
    vi.mocked(fetchChatSessions).mockResolvedValue({
      items: [],
      meta: {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      },
    })
  })

  it('supports selecting multiple subjects and filters the source list', async () => {
    render(<AiChatbotView />)

    await screen.findByText('AI Foundations')
    fireEvent.click(screen.getByRole('button', { name: /Filter by subject/i }))
    fireEvent.click(screen.getByRole('button', { name: /Artificial Intelligence/i }))

    expect(screen.getByText('AI Foundations')).toBeInTheDocument()
    expect(screen.queryByText('Database Design')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Database Systems/i }))

    await waitFor(() => {
      expect(screen.getByText('AI Foundations')).toBeInTheDocument()
      expect(screen.getByText('Database Design')).toBeInTheDocument()
    })
    expect(screen.getByText('2 subjects')).toBeInTheDocument()
  })

  it('shows an explicit failure instead of a demo answer when the chat API fails', async () => {
    vi.mocked(askLibraryStream).mockRejectedValueOnce(new Error('Gemini unavailable'))
    render(<AiChatbotView />)

    await screen.findByText('AI Foundations')
    fireEvent.change(screen.getByPlaceholderText('Ask across your entire library...'), {
      target: { value: 'Explain embeddings' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))

    await waitFor(() => {
      expect(
        screen.getByText(/AI response is unavailable right now/i),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText(/Across your library, the strongest answer/i)).not.toBeInTheDocument()
  })

  it('loads a past conversation from the history dropdown', async () => {
    vi.mocked(fetchChatSessions).mockResolvedValue({
      items: [
        {
          id: 'session-1',
          mode: 'ASK_MY_LIBRARY',
          documentId: null,
          title: 'What is an embedding?',
          document: null,
          messageCount: 2,
          lastMessage: null,
          createdAt: '2026-07-12T00:00:00.000Z',
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    })
    vi.mocked(fetchChatMessages).mockResolvedValue({
      items: [
        {
          id: 'm1',
          sessionId: 'session-1',
          sender: 'USER',
          content: 'What is an embedding?',
          sources: [],
          createdAt: '2026-07-12T00:00:00.000Z',
        },
        {
          id: 'm2',
          sessionId: 'session-1',
          sender: 'AI',
          content: 'An embedding is a vector representation.',
          sources: [],
          createdAt: '2026-07-12T00:00:01.000Z',
        },
      ],
      meta: {
        page: 1,
        limit: 100,
        totalItems: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    })
    render(<AiChatbotView />)

    await screen.findByText('AI Foundations')
    fireEvent.click(screen.getByRole('button', { name: /Chat history/i }))

    const sessionEntry = await screen.findByText('What is an embedding?')
    fireEvent.click(sessionEntry)

    await waitFor(() => {
      expect(
        screen.getByText('An embedding is a vector representation.'),
      ).toBeInTheDocument()
    })
    expect(fetchChatMessages).toHaveBeenCalledWith('session-1')
  })
})
