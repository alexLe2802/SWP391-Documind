# API-02 Auth and User Contract

Source: `DocuMind Task Allocation and API Spec - Updated`, API Spec v0.3.

Base URL: `/api`

All protected requests use:

```http
Authorization: Bearer <firebaseIdToken>
```

Successful JSON responses use:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-06-15T00:00:00.000Z"
}
```

Errors use the shared `success: false` envelope with `error.code`,
`error.message`, optional `error.details`, `timestamp`, `path`, and
`requestId`.

## AUTH-01 Firebase Login

`POST /api/auth/firebase-login`

- Auth: Firebase ID token in the Authorization header.
- Body: none.
- Returns: `user`, `role`, `permissions`, and `isNewUser`.
- Errors: `401` invalid or expired token; `403` blocked or inactive user.
- Behavior: verifies Firebase identity and creates or synchronizes the local
  PostgreSQL user. It does not issue a custom access token.

## AUTH-02 Current User

`GET /api/auth/me`

- Auth: Firebase ID token.
- Returns: `user`, `role`, and `permissions`.
- Blocked or inactive users receive `403`.
- Frontend logout uses Firebase `signOut()`. There is no backend logout
  endpoint because the backend does not keep a Firebase session.

## USER-01 Profile

`GET /api/users/profile`

- Auth: Firebase ID token.
- Returns: `id`, `email`, `fullName`, `avatarUrl`, `role`, `status`,
  `createdAt`, and `updatedAt`.
- The profile is resolved from the authenticated local PostgreSQL user.

## USER-02 Update Profile

`PATCH /api/users/profile`

Request:

```json
{
  "fullName": "Student Name",
  "avatarUrl": "https://example.com/avatar.png"
}
```

- Both fields are optional, but the request body must contain at least one.
- `fullName` length is 1 to 100 and cannot be whitespace only.
- `avatarUrl` must be a valid URL.
- `firebaseUid`, email, role, and status cannot be changed here.

## ADMIN-01 List Users

`GET /api/admin/users`

- Auth: Firebase ID token and `ADMIN` role.
- Query: `keyword?`, `role?`, `status?`, `page=1`, `limit=20`.
- `status`: `ACTIVE`, `BLOCKED`, or `INACTIVE`.
- `limit`: 1 to 100.
- Returns `items` and pagination `meta`.
- Sorting is stable: newest `createdAt` first, then `id`.

## ADMIN-02 Change User Status

`PATCH /api/admin/users/:id/status`

Request:

```json
{
  "status": "BLOCKED",
  "reason": "Policy violation"
}
```

- Auth: Firebase ID token and `ADMIN` role.
- `status` is required: `ACTIVE`, `BLOCKED`, or `INACTIVE`.
- `reason` is optional, maximum 500 characters.
- Returns the updated `AdminUserDto`.
- The operation writes an audit log attributed to the acting admin.
