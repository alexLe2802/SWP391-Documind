import { AdminUsersView } from '../../views/AdminUsersView';

/**
 * Compatibility copy of the MF-05 route entry. The active production route is
 * `app/(admin)/quan-tri/nguoi-dung/page.tsx`; keeping this file outside `app/`
 * avoids two Next.js pages resolving to the same public URL.
 */
export default function AdminUsersPage() {
  return <AdminUsersView />;
}
