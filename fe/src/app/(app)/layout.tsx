import type { ReactNode } from 'react'
import { AppLayout } from '../../layouts/AppLayout'
import { ProtectedRoute } from '../../features/auth/ProtectedRoute'

export default function ProtectedAppLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  )
}
