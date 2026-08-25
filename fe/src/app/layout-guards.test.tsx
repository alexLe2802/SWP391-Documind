import { render, screen } from '@testing-library/react'
import AdminLayout from './(admin)/layout'
import ProtectedAppLayout from './(app)/layout'

vi.mock('../features/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({
    allowedRoles,
    children,
  }: {
    allowedRoles?: string[]
    children: React.ReactNode
  }) => (
    <div
      data-testid="protected-route"
      data-roles={allowedRoles?.join(',') ?? ''}
    >
      {children}
    </div>
  ),
}))

vi.mock('../layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}))

describe('protected route layouts', () => {
  it('requires authentication for application routes', () => {
    render(
      <ProtectedAppLayout>
        <div>Profile page</div>
      </ProtectedAppLayout>,
    )

    expect(screen.getByTestId('protected-route')).toHaveAttribute(
      'data-roles',
      '',
    )
    expect(screen.getByText('Profile page')).toBeInTheDocument()
  })

  it('requires the ADMIN role for admin routes', () => {
    render(
      <AdminLayout>
        <div>Admin page</div>
      </AdminLayout>,
    )

    expect(screen.getByTestId('protected-route')).toHaveAttribute(
      'data-roles',
      'ADMIN',
    )
    expect(screen.getByText('Admin page')).toBeInTheDocument()
  })
})
