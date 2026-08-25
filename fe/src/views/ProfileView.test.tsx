import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { getProfile } from '../api/profile.api'
import { useAuth } from '../features/auth/useAuth'
import { useLanguage } from '../i18n/LanguageProvider'
import { ProfileView } from './ProfileView'

vi.mock('../api/profile.api', () => ({
  getProfile: vi.fn(),
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../i18n/LanguageProvider', () => ({
  useLanguage: vi.fn(),
}))

vi.mock('../lib/profile-avatar', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/profile-avatar')>()
  return {
    ...original,
    uploadProfileAvatar: vi.fn(),
  }
})

describe('ProfileView', () => {
  beforeEach(() => {
    vi.mocked(useLanguage).mockReturnValue({
      locale: 'en',
      setLocale: vi.fn(),
      t: vi.fn(),
    })
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 'user-1',
        fullName: 'Student Name',
        email: 'student@example.com',
        avatarUrl: null,
        role: 'USER',
        status: 'ACTIVE',
        createdAt: '2026-06-15T00:00:00.000Z',
        lastLogin: null,
      },
      updateProfile: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(getProfile).mockResolvedValue({
      id: 'user-1',
      fullName: 'Student Name',
      email: 'student@example.com',
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:00.000Z',
    })
  })

  it('opens avatar upload and URL controls from the avatar', async () => {
    render(<ProfileView />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit avatar' })).toBeEnabled(),
    )
    expect(screen.queryByText('Access information')).not.toBeInTheDocument()
    expect(screen.queryByText('Use a secure HTTPS image URL for your avatar. Empty the field to remove it.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit avatar' }))

    expect(screen.getByRole('button', { name: 'Upload image' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('https://example.com/avatar.jpg')).toBeInTheDocument()
  })
})
