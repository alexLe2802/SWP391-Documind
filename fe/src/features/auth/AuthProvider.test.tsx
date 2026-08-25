import { act, fireEvent, render, screen } from '@testing-library/react'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import * as authApi from '../../api/auth.api'
import { ApiError } from '../../lib/http'

vi.mock('firebase/auth', () => ({
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../../lib/firebase', () => ({
  getFirebaseAuth: () => ({ currentUser: null }),
  getGoogleAuthProvider: vi.fn(),
  prepareFirebaseAuth: vi.fn().mockResolvedValue({ currentUser: null }),
}))

vi.mock('../../api/auth.api', () => ({
  getCurrentUser: vi.fn(),
  loginWithFirebaseToken: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('../../api/profile.api', () => ({ updateProfile: vi.fn() }))

function SessionProbe() {
  const { isLoading, refreshUser, user } = useAuth()
  return <div>
    <span>{isLoading ? 'checking' : user?.email ?? 'signed-out'}</span>
    <button type="button" onClick={() => void refreshUser()}>refresh</button>
  </div>
}

describe('AuthProvider session restore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(authApi.getCurrentUser).mockReturnValue(new Promise(() => undefined))
  })

  afterEach(() => vi.useRealTimers())

  it('stops blocking the page when Firebase session restore stalls', () => {
    render(<AuthProvider><SessionProbe /></AuthProvider>)
    expect(screen.getByText('checking')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(3_000))

    expect(screen.getByText('signed-out')).toBeInTheDocument()
  })

  it('restores the user from the secure backend session cookie', async () => {
    vi.mocked(authApi.getCurrentUser).mockResolvedValue({
      id: 'user-id',
      email: 'student@example.com',
      fullName: 'Student',
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      createdAt: '2026-08-03T00:00:00.000Z',
      lastLogin: null,
    })
    render(<AuthProvider><SessionProbe /></AuthProvider>)

    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('student@example.com')).toBeInTheDocument()
  })

  it('keeps the current user during a transient backend outage', async () => {
    vi.mocked(authApi.getCurrentUser).mockResolvedValueOnce({
      id: 'user-id',
      email: 'student@example.com',
      fullName: 'Student',
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      createdAt: '2026-08-03T00:00:00.000Z',
      lastLogin: null,
    })
    render(<AuthProvider><SessionProbe /></AuthProvider>)
    await act(async () => { await Promise.resolve() })

    vi.mocked(authApi.getCurrentUser).mockRejectedValueOnce(
      new ApiError('Backend restarting', 503),
    )
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await act(async () => { await Promise.resolve() })

    expect(screen.getByText('student@example.com')).toBeInTheDocument()
  })
})
