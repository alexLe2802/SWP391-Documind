import { describe, expect, it } from 'vitest'
import { ROUTES, getAuthenticatedHomeRoute } from './routes'

describe('authenticated entry routes', () => {
  it('sends admins to the admin dashboard', () => {
    expect(getAuthenticatedHomeRoute('ADMIN')).toBe(ROUTES.adminDashboard)
  })

  it('sends students to the student dashboard', () => {
    expect(getAuthenticatedHomeRoute('USER')).toBe(ROUTES.dashboard)
  })
})
