# MF-05 Admin — Moderation Decisions & Demo Evidence

## Flow overview

Admin flow covers: role-based authorization, dashboard metrics, user management,
document moderation, audit log query, and popular document reports.

## Endpoints verified

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/dashboard/summary | Dashboard totals |
| GET | /admin/users | User listing with filters |
| PATCH | /admin/users/:id/status | Block or activate user |
| GET | /admin/documents | Document moderation listing |
| PUT | /admin/documents/:id/approve | Approve document |
| PUT | /admin/documents/:id/reject | Reject with required reason |
| PUT | /admin/documents/:id/hide | Hide or unhide document |
| GET | /admin/logs/audit | Audit log with filters |
| GET | /admin/reports/most-downloaded | Most downloaded report |
| GET | /admin/reports/most-saved | Most saved report |

## Moderation rules

- Only PUBLIC documents go through moderation review
- Rejection reason is required and persisted for the document owner
- Admins cannot block their own account or other admin accounts
- INACTIVE users (pending email verification) cannot be status-updated by admin
- All moderation actions are recorded in the audit log

## Authorization

- All admin endpoints require ADMIN role via RolesGuard
- Non-admin and unauthenticated requests return 403/401 respectively
- Verified by admin-security.e2e-spec.ts

## Test coverage

- AdminUsersService: 6 unit tests covering valid and invalid status transitions
- AdminDocumentsController: 8 unit tests covering listing, approve, reject, hide
- AuditLogService: 2 unit tests covering filtering and pagination
- ReportsService: 5 unit tests covering aggregation and date validation
- admin-security.e2e-spec.ts: all admin routes protected against 401/403

## Known limits

- Audit log does not yet support date range filtering
- Mobile admin screen shows overview, users and documents tabs
