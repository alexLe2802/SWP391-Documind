# DocuMind Backend — API Detailed Reference (Implemented Endpoints)

This document summarizes the APIs implemented in the backend codebase (controllers present in `src/*/*controller.ts`). For each implemented endpoint we show: purpose, method & path, auth requirement, key params/body, example request/response, related DTO/service method, common errors, and recommended tests.

Conventions

- All endpoints are prefixed with `/api` at runtime (see `src/main.ts` global prefix). Controllers below show their route segments only.
- Responses follow the project API envelope via `api-response.interceptor` (success/error wrapper).
- Authentication: Firebase ID tokens validated by `FirebaseAuthGuard`. Admin endpoints additionally require `@Roles(RoleName.ADMIN)` and `RolesGuard`.

---

## 1. Auth

### POST /auth/firebase-login

- Purpose: Verify Firebase ID token and synchronize local user record.
- Auth: Client sends `Authorization: Bearer <idToken>` header.
- Body: none (token passed in Authorization header)
- Response (200): `AuthLoginResponseDto` contains user profile and optional session info.
- Controller: `src/auth/auth.controller.ts` -> `firebaseLogin()`
- Service: `AuthService.firebaseLogin(token)`
- Errors: 401 Missing/invalid token, 500 server error
- Tests: invalid token -> 401; valid token -> creates/returns user record.

### POST /auth/register

- Purpose: Register a new user (inactive) using Firebase token and `RegisterUserDto` payload.
- Auth: Authorization header required (Firebase token)
- Body: `RegisterUserDto` (email, displayName, etc.)
- Response: `AuthLoginResponseDto` (registration recorded)
- Notes: Email verification flow controlled by Firebase/front-end.

### GET /auth/me

- Purpose: Return current authenticated user profile
- Auth: `FirebaseAuthGuard` required
- Response: `AuthMeResponseDto`
- Controller: `auth.controller.ts` -> `me()` -> calls `AuthService.getCurrentUser()`

---

## 2. Documents

Controller: `src/documents/documents.controller.ts`

Common: All endpoints under `/documents` require auth via `FirebaseAuthGuard`.

### POST /documents (or /documents/upload)

- Purpose: Upload document file to storage (R2) and create Document record
- Content-Type: `multipart/form-data` with `file` + metadata fields
- Required fields (example): `file`, `title`, `subjectId`, `categoryId`
- DTO: `CreateDocumentDto`
- Service: `DocumentsService.upload(userId, dto, file)`
- Additional action: triggers content extraction via `ContentExtractionService.startExtraction(documentId, user)`
- Response: UI-ready document DTO (see `document-response.dto.ts`)
- Errors: 400 invalid file, 413 too large, 401/403 auth/permission issues, 500 storage errors
- Tests: e2e upload -> 201 and DB records + extraction queued

### GET /documents

- Purpose: List documents visible to the current user (owned + public)
- Query: `DocumentListQueryDto` supports pagination, filters
- Response: paginated list of UI-ready documents
- Service: `DocumentsService.findAll(userId, query)`

### GET /documents/:id

- Purpose: Get UI-ready document by id (metadata + status)
- Params: `id` (UUID)
- Response: `document-response.dto`

### GET /documents/:id/download-url and GET /documents/:id/download

- Purpose: Create a short-lived download URL for the document
- Behavior: both endpoints currently call `DocumentsService.createDownloadUrl(id, userId)`
- Implementation notes: Service validates access, uses `StorageService` to create presigned URL, and returns JSON with `url` and `expiresAt`.
- Side-effects: `createDownloadUrl` may also create `DownloadLog` and increment `downloadCount` (see `download-log` and `documents.service`).
- Tests: owner/public/forbidden cases; concurrent calls increment count atomically.

### GET /documents/:id/preview (or /:id/preview-url)

- Purpose: Create short-lived preview URL
- Response: JSON preview URL

### PUT /documents/:id and PUT /documents/:id/visibility

- Purpose: Update metadata and visibility
- DTOs: `UpdateDocumentDto`, `UpdateDocumentVisibilityDto`
- Auth: owner or admin

### DELETE /documents/:id

- Purpose: Soft-delete document
- Response: 204 No Content

---

## 3. Document Content / Extraction

Controller: `src/document-content/document-content.controller.ts`

All endpoints require authentication.

### POST /documents/:id/extract

- Purpose: Queue document extraction (OCR/text extraction) and return job info
- Response: `ExtractionJobResponseDto` (202 Accepted)
- Service: `ContentExtractionService.startExtraction(id, user)`
- Tests: queued accepted; unauthorized or non-owner behavior

### GET /documents/:id/content

- Purpose: Retrieve extracted content (segments with page/snippet) — `DocumentContentResponseDto`
- Tests: returns content when extraction COMPLETED; 404/403 when not allowed

### GET /documents/:id/extraction-status

- Purpose: Return extraction status (`PENDING|PROCESSING|COMPLETED|FAILED|MOCKED`)

---

## 4. Storage (R2 helper endpoints)

Controller: `src/storage/storage.controller.ts`

All storage endpoints require auth.

### POST /storage/upload-url

- Purpose: Create presigned upload URL for direct client upload to R2
- Body: `CreateUploadUrlDto` (target key, content type, expected size)
- Response: `{ url, key, expiresAt }` (see `storage.service` types)
- Tests: ensure ACL and key format enforced

### POST /storage/download-url and POST /storage/preview-url

- Purpose: Create presigned download/preview URLs for an existing object key
- Body: `StorageObjectDto { key }`
- Service: `StorageService.createDownloadUrl(userId, key)` or `createPreviewUrl`

### DELETE /storage/object

- Purpose: Delete object from storage (owner/admin)
- Body: `StorageObjectDto { key }`

---

## 5. Download Logs (Admin)

Controller: `src/download-log/download-log.controller.ts` (route `/admin/logs/downloads`)

- Purpose: Admin-only listing of download logs
- Auth: Admin (RolesGuard + `RoleName.ADMIN`)
- Query: `DownloadLogQueryDto` for filters/time range/pagination
- Response: `DownloadLogResponse` (paginated)
- Tests: admin-only; filter by date/user/document

---

## 6. Audit Logs (Admin)

Controller: `src/audit-log/audit-log.controller.ts` (route `/admin/logs/audit`)

- Purpose: Admin listing of audit events
- Auth: Admin
- Query: `AuditLogQueryDto` (actor, action, date range, pagination)
- Service: `AuditLogService.findAll(query)`
- Tests: verify actions are recorded (e.g., login, document delete, admin actions)

---

## 7. Dashboard (Admin)

Controller: `src/dashboard/dashboard.controller.ts` (route `/admin/dashboard`)

Endpoints:

- GET `/summary` => `getSummary()` — totals (users, documents, storage, ai chats)
- GET `/user-stats` => `getUserStats()` — counts by role/status
- GET `/document-stats` => `getDocumentStats()`
- GET `/statistics` => `getStatistics()` — combined
- GET `/documents-by-subject` => `getDocumentsBySubject(query)`
- GET `/documents-by-category` => `getDocumentsByCategory(query)`
- GET `/upload-statistics` => `getUploadStatistics(query)`

Auth: Admin only.

Implementation notes:

- `DashboardService` performs aggregation queries via Prisma.
- Add indexes on `createdAt` and relevant foreign keys for performance.
- Tests: verify totals with seeded data; permission enforcement.

---

## 8. Reports (Admin)

Controller: `src/reports/reports.controller.ts` (route `/admin/reports`)

Endpoints:

- GET `/upload-statistics` — time-series of uploads
- GET `/most-downloaded` — popular documents report (params in `PopularDocumentsQueryDto`)
- GET `/most-saved` — popular saved documents

Auth: Admin only

Tests: correctness of top-k, handling of date range filters, pagination

---

## 9. AI Chatbot

Controller: `src/ai-chatbot/ai-chatbot.controller.ts` (route `/chat`)

Endpoints (auth required):

- POST `/chat/ask-document` — ask a question about one document (`AskDocumentDto`)
- POST `/chat/ask-library` — ask across owned/saved documents (`AskLibraryDto`)
- GET `/chat/sessions` — list chat sessions
- GET `/chat/sessions/:id` — session detail
- GET `/chat/messages/:sessionId` — messages in a session

Behavior:

- `AiChatbotService` builds prompt via `prompt-builder.service`, retrieves relevant document segments, and calls `GeminiService` (or mock) to get an answer; persists `ChatSession` and `ChatMessage` records and `ChatSource` references.
- Responses include `answer`, `sessionId`, `messageId`, `sources` (citation snippets).
- Tests: mock Gemini responses to assert persisted messages and citations.

---

## 10. Document Management Helpers: Subjects, Categories, Tags, Community, Saved Documents

- Controllers implemented: `subjects.controller.ts`, `categories.controller.ts`, `tags.controller.ts`, `community.controller.ts`, `saved-documents.controller.ts`.
- Purpose: Provide metadata lists, community browse, and save/unsave flows.
- Auth: most endpoints use guards; some list endpoints may be public or optional-auth via `optional-firebase-auth.guard`.
- DTOs: see `src/<module>/dto/*.ts`
- Tests: list endpoints, create/update by admin/owner, save/unsave flows.

---

## 11. Payments & Subscriptions (Mock)

Controllers: `src/payments/payments.controller.ts`, `src/subscription/subscription.controller.ts`

- Public: `GET /subscription/plans`
- Auth: `GET /subscription/current`, `GET /payments/history` for authenticated users
- Payments controller handles webhook DTOs and mock create-payment endpoints (see `sepay-webhook.dto.ts`)
- Tests: public plans endpoint, protected current subscription

---

## 12. Admin (Users & Documents management)

Controllers: `src/admin/admin-users.controller.ts`, `src/admin/admin-documents.controller.ts`

- Admin-only endpoints to list users, update user status, moderate documents (hide/delete)
- Use DTOs under `src/admin/dto` for queries and payloads
- Tests: admin authorization, status changes reflected in DB and audit logs

---

## Recommended next steps (repo tasks)

1. Ensure every controller method is covered by at least one unit test and one e2e test for the happy path and important edge cases.
2. Add API examples (request/response JSON) to Swagger decorators where missing to help frontend integration.
3. Implement request/response examples in `api-detailed.md` for the most-used endpoints (`/documents`, `/chat/ask-document`, `/admin/dashboard/summary`, `/documents/:id/download`).
4. If you want, I can commit this file to the repo and also generate detailed example payloads for the 6 highest-priority endpoints.

---

_File created by assistant — update as needed._
