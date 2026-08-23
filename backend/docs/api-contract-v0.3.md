# DocuMind API Contract v0.3

Status: Review / Pending Backend Sync
Owner: Le Dang Khoa
Jira: SCRUM-116
Source: `DocuMind Task Allocation and API Spec - Updated.xlsx`, sheet `API Spec`

The workbook remains the planning source of truth. NestJS Swagger at
`/api/docs` is the executable API reference and must stay aligned with it.

## Conventions

- Base path: `/api`
- JSON field names: `camelCase`
- Resource IDs: UUID
- Dates: ISO-8601 UTC strings
- Authentication: `Authorization: Bearer <firebaseIdToken>`
- Pagination: offset pagination, `page >= 1`, `1 <= limit <= 100`
- Content types: JSON unless the endpoint declares `multipart/form-data`
- Protected endpoints verify Firebase ID tokens and load role/status from
  PostgreSQL.
- Internal exception messages, stack traces, R2 keys, and credentials must
  never be exposed in errors.

## Success Envelope

```json
{
  "success": true,
  "data": {
    "id": "d6b42f50-f694-4b65-849c-8d70a27c2ccb"
  },
  "timestamp": "2026-06-15T03:00:00.000Z"
}
```

Paginated endpoints place the item array in `data` and pagination information
in top-level `meta`:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrevious": false
  },
  "timestamp": "2026-06-15T03:00:00.000Z"
}
```

`204 No Content` responses have no envelope or response body.

## Error Envelope

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "title",
        "message": "title must be between 1 and 200 characters"
      }
    ]
  },
  "timestamp": "2026-06-15T03:00:00.000Z",
  "path": "/api/documents",
  "requestId": "5a651c0b-7621-4ee8-99c7-39b85e560c13"
}
```

Clients may send `x-request-id`; otherwise the backend generates one. The same
ID is returned in the response header and error body.

## HTTP Status Rules

| Status | Meaning                                                     |
| ------ | ----------------------------------------------------------- |
| `200`  | Successful read, update, or idempotent existing result      |
| `201`  | Resource created                                            |
| `202`  | Asynchronous job accepted                                   |
| `204`  | Successful delete/unsave with no body                       |
| `400`  | Invalid syntax, query, path, or validation input            |
| `401`  | Missing, invalid, or expired Firebase ID token              |
| `403`  | Authenticated but blocked or lacks resource/role permission |
| `404`  | Resource does not exist or is intentionally hidden          |
| `409`  | Resource state conflict, including extraction not ready     |
| `413`  | Upload exceeds configured size                              |
| `415`  | Unsupported media type                                      |
| `422`  | File is structurally invalid or cannot be processed         |
| `429`  | Rate limit or job capacity exceeded                         |
| `500`  | Unexpected server error                                     |

## Firebase Authentication

1. The frontend signs in with Firebase Client SDK.
2. It retrieves a current Firebase ID token.
3. Every protected request sends the token as a Bearer token.
4. NestJS verifies signature, issuer, audience, and expiration with Firebase
   Admin SDK.
5. NestJS loads the user from PostgreSQL.
6. `BLOCKED` or `INACTIVE` users receive `403`.
7. Application role checks use PostgreSQL, not Firebase custom claims.

The backend does not issue a second application JWT.

## Pagination and Sorting

- Defaults: `page=1`, `limit=20`.
- Maximum limit: `100`.
- Invalid values return `400`; they are not silently accepted.
- Every list endpoint must use deterministic sorting. Append `id` as a
  tie-breaker when the primary sort field is not unique.
- Empty results return `data: []` with valid zero-count metadata.

## Swagger Requirements

Every controller endpoint must declare:

- `@ApiTags`
- `@ApiOperation`
- `@ApiBearerAuth` for protected routes
- request DTO or multipart schema
- success response DTO and status
- relevant `400`, `401`, `403`, `404`, and domain-specific errors
- enum, UUID, date-time, size, and pagination constraints

Swagger examples show the shared envelope. DTOs describe the unwrapped business
payload and must stay synchronized with the workbook fields.

## Document API Contract

All document endpoints are protected and require
`Authorization: Bearer <firebaseIdToken>`. The backend verifies the Firebase ID
token, loads the PostgreSQL user, rejects `BLOCKED` or `INACTIVE` accounts, and
checks document ownership/public/saved/admin access per endpoint.

### Document DTOs

`DocumentDto` is UI-ready and must be used by both list and detail responses:

```json
{
  "id": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "title": "NestJS Guards Notes",
  "description": "JWT and Firebase guard summary",
  "fileName": "nestjs-guards.pdf",
  "fileType": "pdf",
  "fileSize": "1048576",
  "subject": {
    "id": "6e8f7d10-9c6d-42e1-8892-fd2dc5cb3e2b",
    "code": "SWE",
    "name": "Software Engineering"
  },
  "category": {
    "id": "fb4e9980-a19c-42aa-995a-0f342ab51f7c",
    "name": "Backend"
  },
  "tags": [
    {
      "id": "15bb4c2a-9240-4fc2-b033-c6ff2a8ec8da",
      "name": "nestjs"
    }
  ],
  "aiStatus": "COMPLETED",
  "summary": "Concise AI-generated summary of the extracted document.",
  "visibility": "PRIVATE",
  "status": "ACTIVE",
  "saved": false,
  "owned": true,
  "owner": {
    "id": "99f5e2a1-3e19-414b-9965-cdbb82df8f73",
    "fullName": "Le Dang Khoa",
    "email": "khoa@example.com"
  },
  "createdAt": "2026-06-15T03:00:00.000Z",
  "updatedAt": "2026-06-15T03:00:00.000Z"
}
```

Field rules:

- `fileSize` is returned as a string representation of the number of bytes (due to NestJS/Prisma BigInt serialization to prevent precision loss).
- `fileType` is the normalized extension without a leading dot:
  `pdf`, `docx`, `pptx`, or `xlsx`.
- `subject`, `category`, `tags`, `aiStatus`, `summary`, `visibility`, and
  `saved` are mandatory in list responses so My Library and detail screens do
  not need extra metadata calls.
- `aiStatus` mirrors `Document.extractionStatus`.
- `summary` maps from `DocumentContent.contentSummary`; it is `null` while
  extraction has not produced a summary.
- `saved` is computed for the current user from `SavedDocument`.
- `owned` is `true` when `Document.ownerId` matches the current user.
- `storagePath`, R2 object keys, bucket names, and credentials are internal and
  must never be returned.

`DocumentUrlDto` is returned by preview and download endpoints:

```json
{
  "url": "https://signed-r2-url.example",
  "expiresAt": "2026-06-15T03:05:00.000Z"
}
```

### POST /api/documents

Uploads one document through NestJS to a private Cloudflare R2 bucket.

- Auth: required.
- Content type: `multipart/form-data`.
- File field: `file`.
- Supported file types: PDF, DOCX, PPTX, XLSX.
- Maximum file size: 10 MB unless changed by environment/configuration.

Request fields:

| Field         | Type     | Required | Rules                                      |
| ------------- | -------- | -------- | ------------------------------------------ |
| `file`        | binary   | Yes      | PDF, DOCX, PPTX, or XLSX                   |
| `title`       | string   | Yes      | 1..200 characters                          |
| `description` | string   | No       | max 1000 characters                        |
| `subjectId`   | UUID     | Yes      | existing subject                           |
| `categoryId`  | UUID     | Yes      | existing category                          |
| `visibility`  | enum     | No       | `PRIVATE` or `PUBLIC`; default `PRIVATE`   |
| `tags`        | string[] | No       | max 10; repeated fields, JSON, or CSV text |

Success: `201 Created` with `DocumentDto`.

Storage behavior:

1. Backend generates the document UUID before upload.
2. Backend stores the object under
   `users/{ownerId}/documents/{documentId}/{sanitizedFileName}`.
3. Backend uploads to R2 using server-side credentials only.
4. PostgreSQL stores document metadata and the R2 object key in
   `Document.storagePath`.
5. Backend creates `DocumentContent` with `extractionStatus=PENDING`.
6. If database persistence fails after R2 upload succeeds, backend attempts a
   best-effort R2 delete for the uploaded object.

### GET /api/documents

Returns the current user's UI-ready document library.

- Auth: required.
- User scope: owned documents plus documents saved by the current user.
- Admin scope: active documents across users.
- Only `status=ACTIVE` documents are listed.

Query parameters:

| Field        | Type    | Default     | Rules                                                   |
| ------------ | ------- | ----------- | ------------------------------------------------------- |
| `search`     | string  | none        | searches title, description, and fileName metadata only |
| `subjectId`  | UUID    | none        | exact subject filter                                    |
| `categoryId` | UUID    | none        | exact category filter                                   |
| `fileType`   | enum    | none        | `pdf`, `docx`, `pptx`, `xlsx`                           |
| `visibility` | enum    | none        | `PRIVATE`, `PUBLIC`                                     |
| `aiStatus`   | enum    | none        | `PENDING`, `PROCESSING`, `COMPLETED`, etc.              |
| `saved`      | boolean | none        | filters saved or unsaved documents                      |
| `sortBy`     | enum    | `createdAt` | `createdAt`, `title`, `updatedAt`                       |
| `sortOrder`  | enum    | `desc`      | `asc`, `desc`                                           |
| `page`       | integer | `1`         | `>= 1`                                                  |
| `limit`      | integer | `20`        | `1..100`                                                |

Note: Metadata search (`search` parameter) does not search within the extracted content of the documents. To search within the extracted content of your library, use the AI Chatbot endpoint `POST /api/chat/ask-library`.

Note: `fileType` filters documents by extension: `pdf`, `docx`, `pptx`, or `xlsx`. The backend maps these normalized extensions to the corresponding database MIME types.

Success: `200 OK` with `data: DocumentDto[]` and pagination `meta`.
Sorting must append `id` as a deterministic tie-breaker.

### GET /api/documents/:id

Returns one `DocumentDto`.

- Auth: required.
- Access: owner, admin, saved user, or any authenticated user when the document
  is `PUBLIC` and `ACTIVE`.
- Missing or hidden documents return `404`.
- Authenticated users without access to private documents receive `403`.

Success: `200 OK` with `DocumentDto`.

### PUT /api/documents/:id

Updates document metadata. Visibility is intentionally handled by
`PUT /api/documents/:id/visibility`.

- Auth: required.
- Access: owner or admin.

Request fields:

| Field         | Type     | Required | Rules                     |
| ------------- | -------- | -------- | ------------------------- |
| `title`       | string   | No       | 1..200 characters         |
| `description` | string   | No       | max 1000 characters       |
| `subjectId`   | UUID     | No       | existing subject          |
| `categoryId`  | UUID     | No       | existing category         |
| `tags`        | string[] | No       | replaces current tag list |

Success: `200 OK` with updated `DocumentDto`.

### DELETE /api/documents/:id

Deletes a document.

- Auth: required.
- Access: owner or admin.
- Behavior: delete the R2 object, then mark `Document.status=DELETED`.
- Success: `204 No Content` with no envelope or body.

If the R2 delete fails, backend returns a storage availability error and does
not mark the document deleted.

### GET /api/documents/:id/preview

Returns a short-lived R2 presigned URL configured for inline display.

- Auth: required.
- Access: same as `GET /api/documents/:id`.
- R2 bucket remains private.
- URL TTL: `R2_PRESIGNED_URL_TTL_SECONDS`, default `300`.
- Response content disposition: `inline`.

Success: `200 OK` with `DocumentUrlDto`.

### GET /api/documents/:id/download

Returns a short-lived R2 presigned URL configured for attachment download.

- Auth: required.
- Access: same as `GET /api/documents/:id`.
- R2 bucket remains private.
- URL TTL: `R2_PRESIGNED_URL_TTL_SECONDS`, default `300`.
- Response content disposition: `attachment` with sanitized original filename.
- Backend creates `DownloadLog` after authorization and before returning the
  URL.

Success: `200 OK` with `DocumentUrlDto`.

### PUT /api/documents/:id/visibility

Updates visibility without changing other metadata.

- Auth: required.
- Access: owner or admin.

Request body:

```json
{
  "visibility": "PUBLIC"
}
```

Success: `200 OK` with updated `DocumentDto`.

## Dashboard, Logs, Reports, and Mock API Contract

All admin dashboard, log, and report endpoints are protected and require
`Authorization: Bearer <firebaseIdToken>` plus PostgreSQL role `ADMIN`.
Subscription and payment mock endpoints are used only for MVP/demo UI wiring;
they do not create payment obligations and must not call an external payment
provider.

### Dashboard DTOs

`DashboardSummaryDto`:

```json
{
  "totalUsers": 42,
  "totalDocuments": 120,
  "totalPublicDocuments": 72,
  "totalPrivateDocuments": 48,
  "totalChats": 18,
  "totalDownloads": 250,
  "message": "Dashboard summary retrieved successfully"
}
```

`DashboardStatisticsDto` combines user and document breakdowns:

```json
{
  "users": {
    "byRole": [{ "role": "USER", "count": 40 }],
    "byStatus": [{ "status": "ACTIVE", "count": 39 }]
  },
  "documents": {
    "byStatus": [{ "status": "ACTIVE", "count": 118 }],
    "byVisibility": [{ "visibility": "PUBLIC", "count": 72 }],
    "bySubject": [
      {
        "id": "6e8f7d10-9c6d-42e1-8892-fd2dc5cb3e2b",
        "code": "SWE",
        "name": "Software Engineering",
        "count": 25
      }
    ],
    "byCategory": [
      {
        "id": "fb4e9980-a19c-42aa-995a-0f342ab51f7c",
        "name": "Backend",
        "count": 15
      }
    ]
  },
  "message": "Dashboard statistics retrieved successfully"
}
```

### GET /api/admin/dashboard/summary

Returns high-level platform totals for the admin dashboard.

- Auth: required (role `ADMIN`).
- Counts: users, active documents, active public/private documents, chat
  sessions, and download logs.

Success: `200 OK` with `DashboardSummaryDto`.

### GET /api/admin/dashboard/statistics

Returns combined user and document breakdowns for dashboard charts.

- Auth: required (role `ADMIN`).
- User statistics: grouped by `RoleName` and `UserStatus`.
- Document statistics: grouped by `DocumentStatus`, `DocumentVisibility`,
  subject, and category.
- Empty datasets return empty arrays, not `null`.

Success: `200 OK` with `DashboardStatisticsDto`.

### GET /api/admin/dashboard/upload-statistics

Returns active document upload counts for dashboard charting.

- Auth: required (role `ADMIN`).

Query parameters:

| Field     | Type | Default | Rules                     |
| --------- | ---- | ------- | ------------------------- |
| `from`    | date | none    | ISO date string           |
| `to`      | date | none    | ISO date string           |
| `groupBy` | enum | `day`   | `day`, `week`, or `month` |

Success: `200 OK` with:

```json
{
  "filters": { "groupBy": "day" },
  "data": [{ "date": "2026-06-15", "count": 4 }],
  "message": "Upload statistics retrieved successfully"
}
```

### Admin Log DTOs

`AuditLogDto`:

```json
{
  "id": "4b47c0d6-78c7-4d91-9b99-6e3f05812f01",
  "userId": "99f5e2a1-3e19-414b-9965-cdbb82df8f73",
  "action": "DOCUMENT_UPLOAD",
  "targetType": "DOCUMENT",
  "targetId": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "metadata": { "title": "NestJS Guards Notes" },
  "createdAt": "2026-06-15T03:00:00.000Z"
}
```

`DownloadLogDto`:

```json
{
  "id": "a6ca5e5b-0772-4f42-81df-19b69e2e13d3",
  "userId": "99f5e2a1-3e19-414b-9965-cdbb82df8f73",
  "documentId": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "downloadedAt": "2026-06-15T03:00:00.000Z",
  "user": {
    "id": "99f5e2a1-3e19-414b-9965-cdbb82df8f73",
    "email": "khoa@example.com",
    "fullName": "Le Dang Khoa"
  },
  "document": {
    "id": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
    "title": "NestJS Guards Notes",
    "fileName": "nestjs-guards.pdf",
    "fileType": "pdf"
  }
}
```

### GET /api/admin/logs/audit

Lists audit log entries for admin review.

- Auth: required (role `ADMIN`).

Query parameters:

| Field     | Type    | Default | Rules                  |
| --------- | ------- | ------- | ---------------------- |
| `userId`  | UUID    | none    | exact user filter      |
| `action`  | string  | none    | exact action filter    |
| `keyword` | string  | none    | searches action/target |
| `page`    | integer | `1`     | `>= 1`                 |
| `limit`   | integer | `10`    | `>= 1`                 |

Success: `200 OK` with `data: AuditLogDto[]` and pagination metadata.

### GET /api/admin/logs/downloads

Lists document download log entries.

- Auth: required (role `ADMIN`).

Query parameters:

| Field        | Type    | Default | Rules                 |
| ------------ | ------- | ------- | --------------------- |
| `userId`     | UUID    | none    | exact user filter     |
| `documentId` | UUID    | none    | exact document filter |
| `page`       | integer | `1`     | `>= 1`                |
| `limit`      | integer | `10`    | `>= 1`                |

Success: `200 OK` with `data: DownloadLogDto[]` and pagination metadata.

### DownloadLog Behavior

`GET /api/documents/:id/download` is the only user-facing download endpoint
that creates download tracking data.

Required behavior:

1. Verify Firebase ID token and active PostgreSQL user.
2. Check document access with the same rules as `GET /api/documents/:id`.
3. Create an R2 attachment presigned URL.
4. Increment `Document.downloadCount`.
5. Create `DownloadLog` with `userId`, `documentId`, and default
   `downloadedAt`.
6. Return `200 OK` with `DocumentUrlDto`.

If authorization fails, the backend must not create a presigned URL, increment
`downloadCount`, or create `DownloadLog`.

### Report DTOs

`MostDownloadedDocumentDto`:

```json
{
  "documentId": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "title": "NestJS Guards Notes",
  "fileName": "nestjs-guards.pdf",
  "fileType": "pdf",
  "downloadCount": 25
}
```

`MostSavedDocumentDto`:

```json
{
  "documentId": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "title": "NestJS Guards Notes",
  "fileName": "nestjs-guards.pdf",
  "fileType": "pdf",
  "saveCount": 12
}
```

### GET /api/admin/reports/upload-statistics

Returns upload statistics for reports. This endpoint shares the same query
parameters and response shape as `GET /api/admin/dashboard/upload-statistics`.

- Auth: required (role `ADMIN`).
- `groupBy`: `day`, `week`, or `month`; default `day`.

Success: `200 OK` with upload statistics data.

### GET /api/admin/reports/most-downloaded

Returns documents grouped by download log count.

- Auth: required (role `ADMIN`).

Query parameters:

| Field      | Type    | Default | Rules           |
| ---------- | ------- | ------- | --------------- |
| `fromDate` | date    | none    | ISO date string |
| `toDate`   | date    | none    | ISO date string |
| `limit`    | integer | `10`    | `1..100`        |

Success: `200 OK` with:

```json
{
  "filters": { "limit": 10 },
  "data": [
    {
      "documentId": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
      "title": "NestJS Guards Notes",
      "fileName": "nestjs-guards.pdf",
      "fileType": "pdf",
      "downloadCount": 25
    }
  ],
  "message": "Most downloaded documents retrieved successfully"
}
```

### GET /api/admin/reports/most-saved

Returns documents grouped by saved-document count.

- Auth: required (role `ADMIN`).
- Query parameters: same as `GET /api/admin/reports/most-downloaded`.

Success: `200 OK` with `data: MostSavedDocumentDto[]`.

### Mock Subscription and Payment DTOs

`SubscriptionPlanDto`:

```json
{
  "id": "pro",
  "name": "Pro",
  "price": 9.99,
  "currency": "USD",
  "billingCycle": "monthly",
  "features": ["Unlimited document uploads"],
  "isPopular": true
}
```

`CurrentSubscriptionDto`:

```json
{
  "planId": "pro",
  "planName": "Pro",
  "status": "ACTIVE",
  "startedAt": "2026-06-01T00:00:00.000Z",
  "expiresAt": "2026-07-01T00:00:00.000Z",
  "autoRenew": true
}
```

`PaymentHistoryItemDto`:

```json
{
  "id": "pay_mock_001",
  "planName": "Pro",
  "amount": 9.99,
  "currency": "USD",
  "status": "PAID",
  "paidAt": "2026-06-01T00:00:00.000Z",
  "method": "Mock Visa ending 4242"
}
```

### GET /api/subscription/plans

Returns mock subscription plans for the UI.

- Auth: public.
- Behavior: read-only mock data; no database write and no payment provider
  call.

Success: `200 OK` with `data: SubscriptionPlanDto[]`.

### GET /api/subscription/current

Returns the current user's mock subscription.

- Auth: required.
- Behavior: read-only mock data scoped to the authenticated UI session.

Success: `200 OK` with `CurrentSubscriptionDto`.

### GET /api/payments/history

Returns mock payment history for the UI.

- Auth: required.
- Behavior: read-only mock data; no external payment provider call.

Success: `200 OK` with `data: PaymentHistoryItemDto[]`.

## Community and Save to My Library API Contract

Community endpoints expose public, active documents for discovery and allow an
authenticated user to save a public document into their library. Community
reads must never return private or deleted documents.

### Community Document DTOs

Community list and detail responses reuse `DocumentDto` fields that are safe
for public discovery:

```json
{
  "id": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "title": "NestJS Guards Notes",
  "description": "JWT and Firebase guard summary",
  "fileName": "nestjs-guards.pdf",
  "fileType": "pdf",
  "fileSize": "1048576",
  "subject": {
    "id": "6e8f7d10-9c6d-42e1-8892-fd2dc5cb3e2b",
    "code": "SWE",
    "name": "Software Engineering"
  },
  "category": {
    "id": "fb4e9980-a19c-42aa-995a-0f342ab51f7c",
    "name": "Backend"
  },
  "tags": [{ "id": "15bb4c2a-9240-4fc2-b033-c6ff2a8ec8da", "name": "nestjs" }],
  "aiStatus": "COMPLETED",
  "summary": "Concise AI-generated summary of the extracted document.",
  "visibility": "PUBLIC",
  "status": "ACTIVE",
  "saved": false,
  "owned": false,
  "owner": {
    "id": "99f5e2a1-3e19-414b-9965-cdbb82df8f73",
    "fullName": "Le Dang Khoa",
    "email": "khoa@example.com"
  },
  "createdAt": "2026-06-15T03:00:00.000Z",
  "updatedAt": "2026-06-15T03:00:00.000Z"
}
```

Field rules:

- `visibility` is always `PUBLIC`.
- `status` is always `ACTIVE`.
- `saved` is computed for the current authenticated user. For public reads
  without authentication, it is `false`.
- `owned` is `true` only when an authenticated user owns the document.
- `storagePath`, R2 object keys, and credentials are never returned.

### GET /api/community/documents

Lists public active documents for the community discovery page.

- Auth: optional. If a bearer token is sent, `saved` and `owned` are computed
  for that user.
- Access: only documents where `visibility=PUBLIC` and `status=ACTIVE`.

Query parameters:

| Field        | Type    | Default     | Rules                                                                             |
| ------------ | ------- | ----------- | --------------------------------------------------------------------------------- |
| `q`          | string  | none        | searches title, description, fileName, subject name, category name, and tag names |
| `subjectId`  | UUID    | none        | exact subject filter                                                              |
| `categoryId` | UUID    | none        | exact category filter                                                             |
| `fileType`   | enum    | none        | `pdf`, `docx`, `pptx`, `xlsx`                                                     |
| `sortBy`     | enum    | `createdAt` | `createdAt`, `title`, `downloadCount`                                             |
| `sortOrder`  | enum    | `desc`      | `asc`, `desc`                                                                     |
| `page`       | integer | `1`         | `>= 1`                                                                            |
| `limit`      | integer | `20`        | `1..100`                                                                          |

Success: `200 OK` with `data: CommunityDocumentDto[]` and pagination `meta`.
Sorting must append `id` as a deterministic tie-breaker.

### GET /api/community/documents/:id

Returns one public active community document.

- Auth: optional. If a bearer token is sent, `saved` and `owned` are computed
  for that user.
- Access: only `PUBLIC` and `ACTIVE` documents.
- Missing, private, hidden, or deleted documents return `404`.

Success: `200 OK` with `CommunityDocumentDto`.

### GET /api/community/search

> [!NOTE]
> This endpoint is optional/alias. The frontend should use the canonical endpoint `GET /api/community/documents?q=...` for search.

Searches public active documents. This endpoint is an alias for community document discovery with search-first semantics.

- Auth: optional.
- Required query: `q`, 1..120 characters.
- Other query parameters: same as `GET /api/community/documents`.
- Search scope: title, description, tag name, subject name/code, and category
  name.

Success: `200 OK` with `data: CommunityDocumentDto[]` and pagination `meta`.

### POST /api/community/documents/:id/save

Saves a public document into the authenticated user's library without copying
the stored file.

- Auth: required.
- Access: target document must be `PUBLIC` and `ACTIVE`.
- Idempotency: if the document is already saved by the user, return `200 OK`
  with the existing saved state instead of creating a duplicate row.
- Self-save: saving the user's own public document is allowed but should still
  be idempotent.

Success: `200 OK` with:

```json
{
  "documentId": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "saved": true,
  "savedAt": "2026-06-15T03:00:00.000Z"
}
```

SavedDocument behavior:

1. Verify Firebase ID token and active PostgreSQL user.
2. Load the target document with `visibility=PUBLIC` and `status=ACTIVE`.
3. Upsert `SavedDocument` by unique `(userId, documentId)`.
4. Do not duplicate `Document`, `DocumentContent`, R2 object, or tags.
5. Increment `Document.saveCount` only when a new saved row is created.
6. Optionally write an audit log action such as `PUBLIC_DOCUMENT_SAVE`.
7. Saved documents appear in `GET /api/documents` and can be used by
   `POST /api/chat/ask-library`.

### DELETE /api/community/documents/:id/save

Unsaves a public document from the authenticated user's library.

- Auth: required.
- Access: target document must be `PUBLIC` and `ACTIVE`.
- Idempotency: if the document is not saved by the user, return `204 No Content` instead of an error.
- Save count: decrement `Document.saveCount` only when an existing saved relation is actually removed.
- Original data: does not delete or modify the original `Document`, `DocumentContent`, R2 file object, tags, or owner data.

Success: `204 No Content` with no response body.

## AI Chatbot API Contract

All chatbot endpoints are protected and require `Authorization: Bearer <firebaseIdToken>`.

### Chatbot DTOs

`AiChatResponseDto`:

```json
{
  "answer": "NestJS guards are executed before the route handler...",
  "sessionId": "33333333-3333-4333-8333-333333333333",
  "messageId": "44444444-4444-4444-4444-444444444444",
  "suggestedPrompts": [
    "Tóm tắt tài liệu này",
    "Giải thích nội dung chính",
    "Tạo câu hỏi ôn tập"
  ],
  "sources": [
    {
      "sourceNumber": 1,
      "documentId": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
      "title": "NestJS Guards Notes",
      "snippet": "Guards have access to the ExecutionContext...",
      "relevanceScore": 0.95
    }
  ]
}
```

`ChatSessionDto`:

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "mode": "ASK_MY_LIBRARY",
  "documentId": null,
  "title": "Guards query",
  "document": null,
  "messageCount": 2,
  "lastMessage": {
    "id": "44444444-4444-4444-4444-444444444444",
    "sender": "AI",
    "content": "NestJS guards are executed...",
    "createdAt": "2026-06-15T03:01:00.000Z"
  },
  "createdAt": "2026-06-15T03:00:00.000Z",
  "updatedAt": "2026-06-15T03:01:00.000Z"
}
```

### POST /api/chat/ask-document

Asks a question about a single specific document.

- Auth: required.
- Request:

```json
{
  "documentId": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "question": "What are guards?",
  "sessionId": "33333333-3333-4333-8333-333333333333"
}
```

Note: `sessionId` is optional. If omitted, a new chat session of mode `ASK_THIS_DOCUMENT` is created.

Success: `200 OK` with `AiChatResponseDto`.

### POST /api/chat/ask-library

Asks a question across the user's library (owned and saved documents).

- Auth: required.
- Request:

```json
{
  "question": "JWT guard hoạt động như thế nào?",
  "limit": 5,
  "filters": {
    "subjectId": "6e8f7d10-9c6d-42e1-8892-fd2dc5cb3e2b",
    "categoryId": "fb4e9980-a19c-42aa-995a-0f342ab51f7c",
    "fileType": "pdf"
  },
  "sessionId": "33333333-3333-4333-8333-333333333333"
}
```

Field rules:

- `limit`: optional, number between 1 and 10 (default 5). Specifies the maximum number of documents to retrieve as context.
- `filters.fileType`: optional, normalized extension: `pdf`, `docx`, `pptx`, `xlsx`. The backend matches this extension to DB MIME types.
- `sessionId`: optional. If omitted, a new chat session of mode `ASK_MY_LIBRARY` is created.

Success: `200 OK` with `AiChatResponseDto`.

### GET /api/chat/sessions

Lists recent chat sessions for the current user.

- Auth: required.
- Query parameters:

| Field        | Type    | Default | Rules                                   |
| ------------ | ------- | ------- | --------------------------------------- |
| `mode`       | enum    | none    | `ASK_THIS_DOCUMENT`, `ASK_MY_LIBRARY`   |
| `documentId` | UUID    | none    | filter sessions for a specific document |
| `page`       | integer | `1`     | `>= 1`                                  |
| `limit`      | integer | `20`    | `1..100`                                |

Success: `200 OK` with `data: ChatSessionDto[]` and pagination `meta`.

### GET /api/chat/sessions/:id

Returns details of a single chat session including unique sources.

- Auth: required.
- Success: `200 OK` with `ChatSessionDetailDto`.

### GET /api/chat/messages/:sessionId

Lists messages in a chat session.

- Auth: required.
- Query parameters:

| Field   | Type    | Default | Rules    |
| ------- | ------- | ------- | -------- |
| `page`  | integer | `1`     | `>= 1`   |
| `limit` | integer | `50`    | `1..100` |

Success: `200 OK` with:

```json
{
  "success": true,
  "data": [
    {
      "id": "55555555-5555-5555-5555-555555555555",
      "sessionId": "33333333-3333-4333-8333-333333333333",
      "sender": "USER",
      "content": "What are guards?",
      "sources": [],
      "createdAt": "2026-06-15T03:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 50,
    "totalItems": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrevious": false
  },
  "timestamp": "2026-06-15T03:00:00.000Z"
}
```

## Admin Document API Contract

All endpoints under `/api/admin/documents` are protected, require `Authorization: Bearer <firebaseIdToken>`, and verify that the user's role in PostgreSQL is `ADMIN`. Users without the `ADMIN` role will be rejected with `403 Forbidden`.

### Admin Document DTOs

`AdminDocumentDto` extends `DocumentDto` to include the document's moderation status and history:

```json
{
  "id": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "title": "NestJS Guards Notes",
  "description": "JWT and Firebase guard summary",
  "fileName": "nestjs-guards.pdf",
  "fileType": "pdf",
  "fileSize": "1048576",
  "subject": {
    "id": "6e8f7d10-9c6d-42e1-8892-fd2dc5cb3e2b",
    "code": "SWE",
    "name": "Software Engineering"
  },
  "category": {
    "id": "fb4e9980-a19c-42aa-995a-0f342ab51f7c",
    "name": "Backend"
  },
  "tags": [
    {
      "id": "15bb4c2a-9240-4fc2-b033-c6ff2a8ec8da",
      "name": "nestjs"
    }
  ],
  "aiStatus": "COMPLETED",
  "visibility": "PUBLIC",
  "status": "HIDDEN",
  "moderationReason": "Contains copyrighted material",
  "owner": {
    "id": "99f5e2a1-3e19-414b-9965-cdbb82df8f73",
    "fullName": "Le Dang Khoa",
    "email": "khoa@example.com"
  },
  "createdAt": "2026-06-15T03:00:00.000Z",
  "updatedAt": "2026-06-15T03:00:00.000Z"
}
```

Field rules:

- `status` is the moderation state: `ACTIVE`, `HIDDEN`, or `DELETED`.
- `moderationReason` is a string (max 500 characters) containing the reason why the document was hidden or suspended. It is `null` if the document is active or has not been moderated.

### GET /api/admin/documents

Lists all documents across the platform for administrative moderation.

- Auth: required (role `ADMIN`).
- Access: Only administrators.
- Statuses: Lists `ACTIVE`, `HIDDEN`, and `DELETED` documents.

Query parameters:

| Field        | Type    | Default | Rules                                  |
| ------------ | ------- | ------- | -------------------------------------- |
| `keyword`    | string  | none    | searches title, description, and owner |
| `visibility` | enum    | none    | `PRIVATE`, `PUBLIC`                    |
| `status`     | enum    | none    | `ACTIVE`, `HIDDEN`, `DELETED`          |
| `ownerId`    | UUID    | none    | filter by specific owner ID            |
| `page`       | integer | `1`     | `>= 1`                                 |
| `limit`      | integer | `20`    | `1..100`                               |

Success: `200 OK` with `data: AdminDocumentDto[]` and pagination `meta`.

### PUT /api/admin/documents/:id/hide

Moderates a document by hiding or unhiding it.

- Auth: required (role `ADMIN`).
- Access: Only administrators.
- Behavior: Updates the document's `status` to `HIDDEN` or `ACTIVE` and logs the reason. This writes an `AuditLog` entry.

Request body:

```json
{
  "hidden": true,
  "reason": "Contains copyrighted material"
}
```

Request fields:

| Field    | Type    | Required | Rules              |
| -------- | ------- | -------- | ------------------ |
| `hidden` | boolean | Yes      | `true` or `false`  |
| `reason` | string  | No       | max 500 characters |

Success: `200 OK` returning:

```json
{
  "id": "d6b42f50-f694-4b65-849c-8d70a27c2ccb",
  "status": "HIDDEN",
  "moderationReason": "Contains copyrighted material",
  "updatedAt": "2026-06-18T06:50:00.000Z"
}
```

### DELETE /api/admin/documents/:id

Administratively deletes a document.

- Auth: required (role `ADMIN`).
- Access: Only administrators.
- Behavior: Marks the document `status=DELETED` and schedules R2 object deletion. Writes an `AuditLog` entry.
- Success: `204 No Content` with no response body.

## Change Process

1. Propose the endpoint or DTO change in the workbook.
2. Review owner, consumer, authorization, statuses, and error behavior.
3. Update DTO/controller Swagger and automated contract tests in the same PR.
4. Update frontend API types if the payload changed.
5. Record a version note when the change is breaking.
