import { beforeEach, vi } from 'vitest'
import { apiRequest } from '../lib/http'
import { forgotPassword } from './auth.api'

vi.mock('../lib/http', () => ({ apiRequest: vi.fn() }))
vi.mock('firebase/auth', () => ({
  applyActionCode: vi.fn(),
  confirmPasswordReset: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
  linkWithCredential: vi.fn(),
  signOut: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  verifyPasswordResetCode: vi.fn(),
}))

describe('auth API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requests a custom password-reset email from the backend', async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined)

    await forgotPassword('student@example.com')

    expect(apiRequest).toHaveBeenCalledWith('/auth/forgot-password', {
      method: 'POST',
      body: { email: 'student@example.com' },
    })
  })
})
