import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { getUsers } from '../api/users.api'
import { useAuth } from '../features/auth/useAuth'
import { useLanguage } from '../i18n/LanguageProvider'
import type { CurrentUser, UserListResponse } from '../types/auth'
import { AdminUsersView } from './AdminUsersView'

vi.mock('../api/users.api', () => ({
  getUsers: vi.fn(),
  updateUserStatus: vi.fn(),
}))

vi.mock('../features/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../i18n/LanguageProvider', () => ({
  useLanguage: vi.fn(),
}))

const admin: CurrentUser = {
  id: 'admin-id',
  fullName: 'Admin User',
  email: 'admin@example.com',
  avatarUrl: null,
  role: 'ADMIN',
  status: 'ACTIVE',
  createdAt: '2026-06-18T00:00:00.000Z',
  lastLogin: null,
}

const pageOne: UserListResponse = {
  items: [admin],
  meta: {
    page: 1,
    limit: 10,
    totalItems: 25,
    totalPages: 3,
    hasNext: true,
    hasPrevious: false,
  },
}

describe('AdminUsersView pagination', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: admin,
    } as ReturnType<typeof useAuth>)
    vi.mocked(useLanguage).mockReturnValue({
      locale: 'en',
      setLocale: vi.fn(),
      t: (key) => key,
    })
    vi.mocked(getUsers).mockResolvedValue(pageOne)
  })

  it('renders all available page buttons and requests the selected page', async () => {
    render(<AdminUsersView />)

    await screen.findByText(admin.email)

    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    await waitFor(() => {
      expect(getUsers).toHaveBeenLastCalledWith({
        page: 2,
        limit: 10,
      })
    })
  })

  it('renders admin status as text and normal user status as dropdown', async () => {
    const normalUser: CurrentUser = {
      id: 'user-id-2',
      fullName: 'Normal User',
      email: 'user2@example.com',
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      createdAt: '2026-06-18T00:00:00.000Z',
      lastLogin: null,
    }
    vi.mocked(getUsers).mockResolvedValue({
      items: [admin, normalUser],
      meta: {
        page: 1,
        limit: 10,
        totalItems: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    })

    render(<AdminUsersView />)

    await screen.findByText(admin.email)
    await screen.findByText(normalUser.email)

    // Verify table row elements
    const rows = screen.getAllByRole('row')
    // rows[0] is header row
    const adminRow = rows[1]
    const normalUserRow = rows[2]

    // Admin row should show status text as span
    const adminStatusPill = within(adminRow).getByText('ACTIVE')
    expect(adminStatusPill.tagName.toLowerCase()).toBe('span')
    expect(within(adminRow).queryByRole('combobox')).toBeNull()

    // Normal user row should contain a select dropdown
    const userSelect = within(normalUserRow).getByRole('combobox')
    expect(userSelect).toBeInTheDocument()
    expect(userSelect).toHaveValue('ACTIVE')
  })

  it('renders the total number of admins from the role-filtered query', async () => {
    vi.mocked(getUsers).mockImplementation(async (query = {}) => {
      if (query.role === 'ADMIN') {
        return {
          items: [admin],
          meta: {
            page: 1,
            limit: 1,
            totalItems: 7,
            totalPages: 7,
            hasNext: true,
            hasPrevious: false,
          },
        }
      }

      return pageOne
    })

    render(<AdminUsersView />)

    const adminCard = screen.getByText('admin.admins').closest('article')
    expect(adminCard).not.toBeNull()
    await waitFor(() => {
      expect(within(adminCard as HTMLElement).getByText('7')).toBeInTheDocument()
    })
    expect(getUsers).toHaveBeenCalledWith({ page: 1, limit: 1, role: 'ADMIN' })
  })
})
