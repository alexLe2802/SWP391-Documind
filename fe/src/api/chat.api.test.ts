import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../lib/http'
import { fetchChatMessages, fetchChatSessions } from './chat.api'

vi.mock('../lib/http', () => ({ apiRequest: vi.fn() }))

describe('chat history API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requests the latest user chat sessions', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], meta: {} })

    await fetchChatSessions(2)

    expect(apiRequest).toHaveBeenCalledWith('/chat/sessions?page=1&limit=2')
  })

  it('requests messages for the selected session', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ items: [], meta: {} })

    await fetchChatMessages('session-1')

    expect(apiRequest).toHaveBeenCalledWith('/chat/messages/session-1?page=1&limit=100')
  })
})
