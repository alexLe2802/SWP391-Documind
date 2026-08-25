# Analytics & Logs Design Specification (THIEN-02)

## 1. Introduction & Context

The **Analytics & Logs** module serves two primary functions in the AI Study Hub backend:

1. **Activity & Audit Logging:** Tracks administrative and system-level actions (via `AuditLog`) and document consumption (via `DownloadLog`).
2. **Admin Dashboard Reporting:** Aggregates metrics such as user counts, active documents, AI chat activities, and download patterns to present operational statistics to administrators.

This document drafts the log database schemas, details the dashboard aggregation logic and optimization assumptions, and establishes API contracts aligned with the `KHOA-04` system integration guidelines.

---

## 2. Database Log Schema Draft (Prisma Models)

The following models are drafted and implemented in the system schema:

```prisma
model DownloadLog {
  id           String   @id @default(uuid()) @db.Uuid
  userId       String   @db.Uuid
  documentId   String   @db.Uuid
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  document     Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  downloadedAt DateTime @default(now())

  @@index([userId, downloadedAt])
  @@index([documentId])
}

model AuditLog {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String?  @db.Uuid
  action     String
  targetType String
  targetId   String?
  metadata   Json?
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  createdAt  DateTime @default(now())

  @@index([userId, createdAt])
  @@index([targetType, targetId])
}
```

### Schema Design & Rationale:

- **`DownloadLog` Rationale:**
  - **Strict Relationships:** Tracks which `User` downloaded which `Document`.
  - **Cascade Deletes:** If a `User` or `Document` is permanently deleted, their corresponding download history is cascades to maintain database consistency.
  - **Optimized Indexes:** The compound index `[userId, downloadedAt]` optimizes queries retrieving the download history of a specific user. The index `[documentId]` assists in aggregate grouping to compute the "most downloaded documents".

- **`AuditLog` Rationale:**
  - **Flexible Target Tracking:** `targetType` (e.g., `DOCUMENT`, `USER`, `SUBJECT`) and `targetId` represent the audited resource.
  - **Structured JSON Metadata:** The `metadata` field stores dynamic context (like previous and current values during updates).
  - **Nullability and SetNull:** In contrast to download logs, system audits should persist even if the actor (`User`) is deleted. Therefore, `userId` is nullable, and `onDelete: SetNull` is used.
  - **Optimized Indexes:** `[userId, createdAt]` speeds up actor-based history lookups, and `[targetType, targetId]` allows quick retrieval of the change logs of any single resource.

---

## 3. Dashboard Aggregation Assumptions & Optimizations

Admin dashboard statistics must load efficiently. Below are the aggregation assumptions:

### Summary Counters Aggregation

- **Formulas:**
  - `totalUsers` = $\text{Count of all rows in User table}$
  - `totalDocuments` = $\text{Count of all rows in Document table where status = ACTIVE}$
  - `totalPublicDocuments` = $\text{Count of all rows in Document table where status = ACTIVE and visibility = PUBLIC}$
  - `totalPrivateDocuments` = $\text{Count of all rows in Document table where status = ACTIVE and visibility = PRIVATE}$
  - `totalChats` = $\text{Count of all rows in ChatSession table}$
  - `totalDownloads` = $\text{Count of all rows in DownloadLog table}$
- **Optimization Assumption:** The database indexes on `Document(status, visibility)` and `DownloadLog(downloadedAt)` keep count lookups efficient for the MVP. If these counters become expensive later, the team should first evaluate PostgreSQL query/index improvements within the approved architecture before introducing any new infrastructure.

### Documents by Subject Aggregation

- **Logic:** Computes active document counts grouped by their subject within an optional date range (`from` to `to`).
- **Performance Assumption:** The primary query utilizes a `findMany` over `Subject` incorporating a filtered relation count. This ensures index-only scans on the `Document` subject relationship.

### Upload Statistics Aggregation

- **Logic:** Retrieves upload counts grouped by day, week, or month.
- **Performance Assumption:** For small-to-medium deployments, documents in the range are queried and grouped in memory (Node.js). If the daily document uploads scale above tens of thousands, we will transition to PostgreSQL-native date truncation:
  ```sql
  SELECT date_trunc('day', "createdAt") as date, count(*)
  FROM "Document"
  WHERE "status" = 'ACTIVE'
  GROUP BY date_trunc('day', "createdAt")
  ```

---

## 4. API Contracts (Aligned with KHOA-04)

All endpoints conform to the following standards:

1. **Authorization:** Bearer Token required (`Authorization: Bearer <token>`).
2. **Error Format:** Returns RFC-compliant HTTP status codes and standardized error responses.

### 4.1. Dashboard Summary

- **Endpoint:** `GET /api/admin/dashboard/summary`
- **Response Status:** `200 OK`
- **Response Body:**
  ```json
  {
    "totalUsers": 120,
    "totalDocuments": 450,
    "totalPublicDocuments": 300,
    "totalPrivateDocuments": 150,
    "totalChats": 890,
    "totalDownloads": 1250,
    "message": "Dashboard summary skeleton is ready"
  }
  ```

### 4.2. Documents by Subject

- **Endpoint:** `GET /api/admin/dashboard/documents-by-subject?from=2026-01-01T00:00:00Z&to=2026-06-30T23:59:59Z`
- **Response Status:** `200 OK`
- **Response Body:**
  ```json
  {
    "filters": {
      "from": "2026-01-01T00:00:00Z",
      "to": "2026-06-30T23:59:59Z"
    },
    "data": [],
    "message": "Documents by subject skeleton is ready"
  }
  ```

### 4.3. Upload Statistics

- **Endpoint:** `GET /api/admin/dashboard/upload-statistics?from=2026-06-01T00:00:00Z&to=2026-06-07T23:59:59Z&groupBy=day`
- **Response Status:** `200 OK`
- **Response Body:**
  ```json
  {
    "filters": {
      "from": "2026-06-01T00:00:00Z",
      "to": "2026-06-07T23:59:59Z",
      "groupBy": "day"
    },
    "data": [],
    "message": "Upload statistics skeleton is ready"
  }
  ```

### 4.4. Audit Logs List

- **Endpoint:** `GET /api/admin/logs/audit?page=1&limit=10&action=LOGIN&userId=some-uuid`
- **Response Status:** `200 OK`
- **Response Body:**
  ```json
  {
    "filters": {
      "page": 1,
      "limit": 10,
      "action": "LOGIN",
      "userId": "some-uuid"
    },
    "data": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0
    },
    "message": "Audit log skeleton is ready"
  }
  ```

### 4.5. Download Logs List

- **Endpoint:** `GET /api/admin/logs/downloads?page=1&limit=10&documentId=doc-uuid`
- **Response Status:** `200 OK`
- **Response Body:**
  ```json
  {
    "filters": {
      "page": 1,
      "limit": 10,
      "documentId": "doc-uuid"
    },
    "data": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0
    },
    "message": "Download log skeleton is ready"
  }
  ```
