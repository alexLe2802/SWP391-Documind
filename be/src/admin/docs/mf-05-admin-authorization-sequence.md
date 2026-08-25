# MF-05: Admin Authorization and Moderation Sequence

## Overview

This document maps the authorization flow and moderation lifecycle for the Admin
main flow (MF-05). All admin routes are protected by two guards applied in order:
`FirebaseAuthGuard` → `RolesGuard`.

## Authorization Sequence

```
Client Request
  │
  ▼
FirebaseAuthGuard
  ├── Reads a Bearer token or the `documind_session` HttpOnly cookie
  ├── Verifies the Firebase ID token/session cookie with Firebase Admin SDK
  ├── Looks up User record in database by firebaseUid
  ├── Checks user.status === ACTIVE (rejects BLOCKED / INACTIVE)
  └── Attaches AuthenticatedUser to request context
  │
  ▼
RolesGuard
  ├── Reads @Roles(RoleName.ADMIN) decorator from controller/handler
  ├── Compares request user role against required roles
  └── Rejects with 403 Forbidden if role is not ADMIN
  │
  ▼
Controller Handler (admin action)
```

## Admin Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/users | List users with pagination and filters |
| PATCH | /admin/users/:id/status | Block or activate a user account |
| GET | /admin/documents | List public documents for moderation |
| GET | /admin/documents/:id/preview | Generate preview URL for a document |
| PUT | /admin/documents/:id/approve | Approve a pending document |
| PUT | /admin/documents/:id/reject | Reject a document with required reason |
| PUT | /admin/documents/:id/hide | Hide or unhide a document |
| GET | /admin/logs/audit | Query admin audit logs |
| GET | /admin/reports/upload-statistics | Upload activity report |
| GET | /admin/reports/most-downloaded | Most downloaded documents report |
| GET | /admin/reports/most-saved | Most saved documents report |

## Moderation State Machine

```
Document submitted as PUBLIC
  │
  ▼
ModerationStatus: PENDING
  │
  ├── Admin approves → ModerationStatus: APPROVED
  │                    DocumentStatus: ACTIVE (visible in community)
  │
  ├── Admin rejects → ModerationStatus: REJECTED
  │                   DocumentStatus: HIDDEN
  │                   rejectionReason: required, non-empty string
  │
  └── Admin hides   → DocumentStatus: HIDDEN  (moderationStatus unchanged)
      Admin unhides → DocumentStatus: ACTIVE  (moderationStatus unchanged)
```

## Audit Trail

Every admin action that mutates state writes an `AuditLog` record:
- `admin.user_status_updated` — when a user's status changes
- `DOCUMENT_HIDE` — when a document is approved, rejected, or hidden

The `AuditLog` records: `userId` (admin), `action`, `targetType`, `targetId`,
`metadata` (JSON with contextual detail), `createdAt` (automatic).

## Authorization Rules Summary

- Only users with `role.name === ADMIN` can access any `/admin/**` route.
- Production web requests normally use the secure HttpOnly session cookie; Bearer
  tokens remain supported for mobile and compatible API clients.
- An admin cannot block their own account.
- An admin cannot block another admin account.
- Users with `status === INACTIVE` (pending email verification) cannot have their
  status changed via the admin panel; they must verify email first.
- Rejection requires a non-empty `reason` string.
- The moderation console only shows `visibility === PUBLIC` documents; private
  documents are never surfaced to admin moderation.
