# Security Analysis: Dashboard/Logs/Reports/Subscription

**Prepared for: Nguyễn Trần Ngọc Thiện**  
**Date: 2026-06-30**  
**Status: QA Evidence & Protection Strategy**

---

## 1. Dashboard Data Flow & Table Dependencies

### 1.1 Data Sources

Dashboard aggregates metrics from 6 tables via `DashboardService.getSummary()`:

| Table             | Metric                  | Count Query           | Filter                                     |
| ----------------- | ----------------------- | --------------------- | ------------------------------------------ |
| **users**         | `totalUsers`            | `User.count()`        | None (all users)                           |
| **documents**     | `totalDocuments`        | `Document.count()`    | `status = ACTIVE`                          |
| **documents**     | `totalPublicDocuments`  | `Document.count()`    | `status = ACTIVE AND visibility = PUBLIC`  |
| **documents**     | `totalPrivateDocuments` | `Document.count()`    | `status = ACTIVE AND visibility = PRIVATE` |
| **chat_sessions** | `totalChats`            | `ChatSession.count()` | None (all sessions)                        |
| **download_logs** | `totalDownloads`        | `DownloadLog.count()` | None (all downloads ever)                  |

### 1.2 Extended Statistics Endpoints

- **User Stats** (`/admin/dashboard/user-stats`):
  - Groups by `Role.name` → count of users per role
  - Groups by `User.status` → count of users per status (ACTIVE, BLOCKED, INACTIVE)
- **Document Stats** (`/admin/dashboard/document-stats`):
  - Groups by `Document.status` → counts by ACTIVE, HIDDEN, DELETED
  - Groups by `Document.visibility` → counts by PUBLIC, PRIVATE

- **Documents by Subject** (`/admin/dashboard/documents-by-subject`):
  - Groups by `Subject` with related document count
  - Query: `Subject.findMany({ select: { id, code, name, _count: { documents } } })`
  - Filters by subject status

- **Documents by Category** (`/admin/dashboard/documents-by-category`):
  - Groups by `Category` with related document count
  - Query: `Category.findMany({ select: { id, name, _count: { documents } } })`

- **Upload Statistics** (`/admin/dashboard/upload-statistics`):
  - Aggregates by date (daily or hourly)
  - Query: `Document.groupBy({ by: ['DATE(createdAt)'], where: { status: ACTIVE }, _count: true })`
  - Supports date range: `fromDate` → `toDate`

### 1.3 N+1 Query Vulnerabilities

**Current Risk**: Document counts by Subject/Category may trigger N+1 queries if not using `_count` aggregate.  
**Mitigation**: ✅ Already uses Prisma `_count` (aggregated in DB layer)

---

## 2. Audit Logs: Actions & Recording Strategy

### 2.1 Tracked Actions

```typescript
export const AuditLogAction = {
  USER_LOGIN: 'USER_LOGIN', // When user authenticates
  DOCUMENT_UPLOAD: 'DOCUMENT_UPLOAD', // When new doc added
  DOCUMENT_DELETE: 'DOCUMENT_DELETE', // When doc soft-deleted
  DOCUMENT_HIDE: 'DOCUMENT_HIDE', // When visibility changed
  PUBLIC_DOCUMENT_SAVE: 'PUBLIC_DOCUMENT_SAVE', // When user saves public doc
};
```

### 2.2 Recording Points (Where Logs Are Created)

| Action                 | Triggered By                      | Service                | Metadata                              |
| ---------------------- | --------------------------------- | ---------------------- | ------------------------------------- |
| `USER_LOGIN`           | Auth token verification           | `AuthService`          | IP, User-Agent, loginMethod           |
| `DOCUMENT_UPLOAD`      | POST `/documents/upload`          | `DocumentsService`     | fileName, fileSize, subject, category |
| `DOCUMENT_DELETE`      | DELETE `/documents/:id`           | `DocumentsService`     | originalTitle, deletion reason        |
| `DOCUMENT_HIDE`        | PATCH `/documents/:id/visibility` | `DocumentsService`     | oldVisibility, newVisibility          |
| `PUBLIC_DOCUMENT_SAVE` | POST `/saved-documents`           | `SavedDocumentService` | documentId, userId                    |

### 2.3 Schema Structure

```typescript
model AuditLog {
  id         String   @id           // UUID
  userId     String?  @map("user_id") // Nullable (system actions)
  action     String   // Action name
  targetType String   @map("target_type") // USER or DOCUMENT
  targetId   String?  @map("target_id")   // User/Document ID
  metadata   Json?    // { ip, userAgent, reason, ... }
  createdAt  DateTime @default(now())

  // Indexes
  @@index([userId, createdAt])    // ✅ For user activity timeline
  @@index([targetType, targetId]) // ✅ For document audit trail
}
```

### 2.4 Log Volume Concerns

**Estimated Growth**:

- 1000 users × 2 logins/day = 2000 USER_LOGIN entries/day
- 100 documents/day = 100+ DOCUMENT\_\* entries/day
- **Total**: ~2500 audit logs/day → **~900K/year**

**Retention Policy Needed**: Archive logs older than 90 days to separate table

---

## 3. Download Logs: Recording & Query Patterns

### 3.1 Recording Strategy

```typescript
// Created in DocumentService when download initiated
await this.downloadLogService.create({
  userId,
  documentId,
  // downloadedAt auto-set to now()
});
```

### 3.2 Schema

```typescript
model DownloadLog {
  id           String   @id
  userId       String   @map("user_id")
  documentId   String   @map("document_id")
  downloadedAt DateTime @default(now())

  // Indexes (critical for reports)
  @@index([userId, downloadedAt])   // ✅ For user download history
  @@index([documentId])              // ✅ For document popularity
}
```

### 3.3 Query Patterns

#### Pattern 1: List Downloads with Pagination

```typescript
// FROM: DownloadLogService.findAll(query: DownloadLogQueryDto)
findMany({
  where: { ...filters },
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { downloadedAt: 'desc' },
  include: { user: {...}, document: {...} }
})
```

**Cost**: O(limit) with included relations → **~300-500ms for 1000 rows**

#### Pattern 2: Most Downloaded Documents

```typescript
// FROM: DownloadLogService.getMostDownloaded(limit=10)
groupBy({
  by: ['documentId'],
  _count: { _all: true },
  orderBy: { _count: { documentId: 'desc' } },
  take: limit,
});
// Then: Document.findMany({ where: { id: { in: documentIds } } })
```

**Cost**: O(1) groupBy + O(limit) find → **~100-200ms**

### 3.4 Potential Performance Issues

| Issue                       | Cause                                                 | Impact               |
| --------------------------- | ----------------------------------------------------- | -------------------- |
| **Full Scan on Date Range** | `WHERE downloadedAt BETWEEN ?` without index hint     | ~5-10s for 1M rows   |
| **Missing Include Filter**  | Fetching all user/document data even when not needed  | 2-3x memory overhead |
| **No Pagination Default**   | `limit` defaults to 10, but admin might request 1000+ | Timeout or OOM       |

**Mitigation**:

- ✅ Indexes exist on `(userId, downloadedAt)` and `documentId`
- ⚠️ Add query optimizer hint for date-range queries
- ⚠️ Cap maximum limit to 500 per request

---

## 4. Reports: Aggregation & Optimization

### 4.1 Report Types

#### Report 1: Upload Statistics

- **Endpoint**: `GET /admin/reports/upload-statistics`
- **Query Logic**:

```typescript
Document.groupBy({
  by: ['DATE(createdAt)'],
  where: {
    status: DocumentStatus.ACTIVE,
    createdAt: { gte: fromDate, lte: toDate },
  },
  _count: { _all: true },
  orderBy: { createdAt: 'asc' },
});
```

- **Index Used**: Document(`status`, `createdAt`)
- **Time Complexity**: O(distinct_dates) → ~100ms for 90-day range

#### Report 2: Most Downloaded Documents

- **Endpoint**: `GET /admin/reports/most-downloaded`
- **Query Logic**:

```typescript
// Step 1: Group downloads
DownloadLog.groupBy({
  by: ['documentId'],
  where: { downloadedAt: { gte: fromDate, lte: toDate } },
  _count: { _all: true },
  orderBy: { _count: { _all: 'desc' } },
  take: limit,
});
// Step 2: Fetch document metadata
Document.findMany({
  where: { id: { in: documentIds } },
  select: { id, title, fileName, fileType },
});
```

- **Index Used**: DownloadLog(`documentId`), Document(`id`)
- **Time Complexity**: O(log n) + O(limit) → ~50-150ms

#### Report 3: Most Saved Documents

- **Endpoint**: `GET /admin/reports/most-saved`
- **Query Logic**:

```typescript
SavedDocument.groupBy({
  by: ['documentId'],
  where: { savedAt: { gte: fromDate, lte: toDate } },
  _count: { _all: true },
  orderBy: { _count: { _all: 'desc' } },
  take: limit,
});
// Then same as Most Downloaded
```

- **Index Used**: SavedDocument(`documentId`), Document(`id`)
- **Time Complexity**: O(log n) + O(limit) → ~50-150ms

### 4.2 Optimization Strategies

| Strategy               | Current                    | Recommended                              |
| ---------------------- | -------------------------- | ---------------------------------------- |
| **Caching**            | No                         | Redis cache for 1 hour                   |
| **Pagination**         | Implicit via `take: limit` | Explicit cursor-based                    |
| **Date Bucketing**     | Daily granularity          | Configurable (daily/weekly/monthly)      |
| **Materialized Views** | No                         | Daily aggregation table for fast reports |

**Materialized View Example**:

```sql
CREATE TABLE daily_document_stats (
  date DATE,
  documentId UUID,
  uploadCount INT,
  downloadCount INT,
  saveCount INT,
  PRIMARY KEY (date, documentId)
);
-- Refresh nightly via cron job
```

---

## 5. Subscription & Payment: Mock vs. Real Implementation

### 5.1 Mock Implementation (Current)

#### Subscription Service

```typescript
private readonly plans: SubscriptionPlanResponseDto[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    billingCycle: 'monthly',
    features: ['Basic library', 'Community access', 'Limited AI usage'],
    isPopular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9.99,
    currency: 'USD',
    billingCycle: 'monthly',
    features: ['Unlimited library', 'Document chat', 'Priority extraction', 'Advanced dashboard'],
    isPopular: true,
  },
];

private readonly currentSubscription: CurrentSubscriptionResponseDto = {
  planId: 'pro',
  planName: 'Pro',
  status: 'ACTIVE',
  startedAt: '2026-06-01T00:00:00.000Z',
  expiresAt: '2026-07-01T00:00:00.000Z',
  autoRenew: true,
};
```

- **Data Source**: Hard-coded in memory
- **Auth**: Ignored (`getPlans()` has no guard)
- **Personalization**: Fixed for all users

#### Payment Service (Mock)

```typescript
private readonly paymentHistory: PaymentHistoryItemResponseDto[] = [
  { id: 'pay_mock_001', planName: 'Pro', amount: 9.99, status: 'PAID', paidAt: '2026-06-01T00:05:00.000Z' },
  { id: 'pay_mock_000', planName: 'Pro', amount: 9.99, status: 'PAID', paidAt: '2026-05-01T00:04:00.000Z' },
];
```

- **Data Source**: Hard-coded array
- **Auth**: Requires `FirebaseAuthGuard` but data is same for all users
- **History**: Static 2 entries

### 5.2 Real Implementation (SePay Integration)

#### Payment Service - Real

```typescript
async createPaymentRequest(userId: string, dto: CreatePaymentDto) {
  // 1. Lookup plan price from config (VND, not USD)
  const amount = config.get('SEPAY_PRO_PRICE_VND') || 349000; // ~$15 USD

  // 2. Generate unique transaction code (DM + 6 random digits)
  const transactionCode = `DM${randomNum}`;

  // 3. Create Payment record in DATABASE
  const payment = await this.prisma.payment.create({
    data: { userId, planId, amount, status: 'PENDING', transactionCode }
  });

  // 4. Generate SePay QR (bank transfer)
  const qrUrl = `https://qr.sepay.vn/img?acc=${bankAccount}&bank=${bankCode}&amount=${amount}&des=${transactionCode}`;

  return { id: payment.id, transactionCode, qrUrl, status: 'PENDING' };
}

// Webhook handler
async processWebhook(dto: SepayWebhookDto) {
  // 1. Extract transaction code from payment description
  const transactionCode = content.match(/DM\d{6}/)[0];

  // 2. Lookup payment in DB
  const payment = await this.prisma.payment.findUnique({ where: { transactionCode } });
  if (!payment) throw new BadRequestException('Payment not found');

  // 3. Idempotency check
  if (payment.status === 'SUCCESS') return { success: true };

  // 4. Amount verification
  if (dto.amount < payment.amount) throw new BadRequestException('Insufficient amount');

  // 5. Handle subscription extension
  const existingSub = await this.prisma.userSubscription.findFirst({
    where: { userId: payment.userId, status: 'ACTIVE' }
  });

  const startsAt = existingSub?.startsAt || now;
  const expiresAt = new Date(existingSub?.expiresAt?.getTime() + 30*24*60*60*1000 || now.getTime() + 30*24*60*60*1000);

  // 6. Transaction: update payment & subscription in atomic operation
  await this.prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCESS' } });
    if (existingSub) {
      await tx.userSubscription.update({ where: { id: existingSub.id }, data: { expiresAt } });
    } else {
      await tx.userSubscription.create({
        data: { userId: payment.userId, planId: payment.planId, status: 'ACTIVE', startsAt, expiresAt }
      });
    }
  });
}
```

### 5.3 Key Differences: Mock vs. Real

| Aspect                     | Mock               | Real (SePay)                          | Security Impact             |
| -------------------------- | ------------------ | ------------------------------------- | --------------------------- |
| **Data Source**            | In-memory array    | PostgreSQL Payment table              | Real state machine          |
| **User Personalization**   | Same for all users | Per-user Payment/Subscription records | ✅ Isolation                |
| **Price Currency**         | USD (9.99)         | VND (349000)                          | Must convert on frontend    |
| **QR Generation**          | None               | `qr.sepay.vn` API                     | ✅ External service         |
| **Transaction Code**       | None               | `DM` + 6 digits (unique in DB)        | ✅ Idempotency key          |
| **Webhook Validation**     | None               | `x-sepay-api-key` header check        | ✅ Gateway authentication   |
| **Subscription Extension** | N/A                | Extends from existing expiry          | ✅ Prevents payment gaps    |
| **Atomic Operations**      | N/A                | Prisma `$transaction`                 | ✅ Prevents partial updates |
| **Audit Trail**            | No                 | Payment & Subscription records in DB  | ✅ Full history             |

### 5.4 Migration Path: Mock → Real

1. ✅ Database schema ready (Payment + UserSubscription tables)
2. ✅ Real integration code written (SePay webhook handler)
3. ⚠️ Mock service should check if user has real subscription in DB
4. ⚠️ Feature gate: if `userSubscription.status = 'ACTIVE'`, use real; else default to mock/free

---

## 6. Security Checklist

### 6.1 Authentication & Authorization

- [ ] **Dashboard Endpoints**
  - [ ] All endpoints protected by `@UseGuards(FirebaseAuthGuard, RolesGuard)`
  - [ ] `@Roles(RoleName.ADMIN)` enforcer on all dashboard routes
  - [ ] Token validation happens in `FirebaseAuthGuard` before reaching controller
  - [ ] Role check in `RolesGuard` - admin only

- [ ] **Logs & Reports Endpoints**
  - [ ] Audit logs require `ADMIN` role
  - [ ] Download logs require `ADMIN` role
  - [ ] Reports require `ADMIN` role
  - [ ] Verify no data leakage for non-admin users (test 403 response)

- [ ] **Subscription/Payment Endpoints**
  - [ ] `GET /subscription/plans` → No auth required (public info) ✅
  - [ ] `GET /subscription/current` → Requires `FirebaseAuthGuard` (returns user's current plan)
  - [ ] `POST /payments/checkout` → Requires auth + returns only user's transactions
  - [ ] `POST /payments/sepay-webhook` → No auth (external webhook), but validates `x-sepay-api-key` header

### 6.2 Data Access Control

- [ ] **User Isolation**
  - [ ] Payment history should filter by `userId` from JWT token
  - [ ] Subscription should return only authenticated user's subscription
  - [ ] Download logs only show downloads by current user (if non-admin) or all (if admin)

- [ ] **Admin-Only Metrics**
  - [ ] Dashboard summary returns aggregate stats (no PII)
  - [ ] User stats counts by role/status (no email/name)
  - [ ] Document stats counts by status/visibility (no content preview)

- [ ] **Input Validation**
  - [ ] Date range validation (`fromDate ≤ toDate`, within reasonable bounds like 1 year)
  - [ ] Pagination limits enforced (`limit` max 500, min 1)
  - [ ] Query parameters sanitized to prevent injection

### 6.3 Data Integrity & Idempotency

- [ ] **Payment Webhook Idempotency**
  - [ ] If payment already marked SUCCESS, webhook returns success (doesn't re-process)
  - [ ] Transaction code must be unique and extracted reliably from description
  - [ ] Amount verification prevents under-payment acceptance

- [ ] **Atomic Operations**
  - [ ] Payment update + Subscription create/update in single transaction
  - [ ] No orphaned Payment records without Subscription
  - [ ] No Subscription created without Payment proof

### 6.4 Rate Limiting & DOS Prevention

- [ ] **Dashboard Endpoints**
  - [ ] Implement rate limit: max 100 requests/minute per admin user
  - [ ] Large date ranges should have response caching (1 hour)
- [ ] **Audit/Download Logs**
  - [ ] Pagination enforced to prevent bulk exports
  - [ ] Log queries should timeout at 30 seconds max
- [ ] **Payment Webhook**
  - [ ] Webhook idempotency key (transaction code) prevents duplicate processing
  - [ ] Rate limit: prevent same transaction code spam

### 6.5 Logging & Monitoring

- [ ] **Audit Log Creation**
  - [ ] Timestamp is server-side, not client-provided
  - [ ] `createdAt` indexed for fast timeline queries
  - [ ] Metadata includes IP address when available
- [ ] **Payment Webhook Logging**
  - [ ] Every webhook attempt logged (success/failure/validation error)
  - [ ] Failed webhooks retried by SePay or stored for manual review
  - [ ] Webhook signature validation logged for forensics

- [ ] **Error Handling**
  - [ ] Dashboard errors don't expose internal query details
  - [ ] Payment errors don't leak amount/account info
  - [ ] Logs sanitized before returning to client

---

## 7. Performance Optimization Recommendations

### 7.1 Dashboard Queries

**Current Status**: ✅ Good (parallel Promise.all)

```typescript
// Current: Fast parallel queries
await Promise.all([
  this.prisma.user.count(),
  this.prisma.document.count({ where: {...} }),
  this.prisma.downloadLog.count(),
  // ... etc
])
```

**Recommendation**: Add caching layer

```typescript
@Cacheable({ ttl: 300 }) // 5 minutes
async getSummary(): Promise<DashboardSummaryResponse> {
  // ... existing code
}
```

### 7.2 Audit & Download Logs

**Current Status**: ⚠️ Can be slow for large tables

**Issue**: `AuditLog.findMany()` with no filters can scan 900K rows

**Solution**: Add pagination requirement at API level

```typescript
if (!query.page) throw new BadRequestException('page required');
if (query.limit > 500) query.limit = 500;
```

**Advanced**: Archive logs older than 90 days to `audit_logs_archive` table

### 7.3 Reports Aggregation

**Current Status**: ✅ Good (uses groupBy)

**Optimization Opportunity**: Pre-compute daily stats

```typescript
// Nightly cron job
async precomputeDailyStats() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const uploads = await this.prisma.document.groupBy({
    by: ['DATE(createdAt)'],
    where: { createdAt: { gte: yesterday } },
    _count: { _all: true }
  });

  // Insert into daily_stats table for fast retrieval
}
```

---

## 8. Testing Requirements

### 8.1 Unit Tests

- [ ] Dashboard service isolation (mock Prisma)
- [ ] Report calculations correctness
- [ ] Payment idempotency logic
- [ ] Subscription extension math

### 8.2 Integration Tests

- [ ] Dashboard summary returns correct aggregate
- [ ] Audit logs filter by userId/action
- [ ] Download logs pagination works
- [ ] Most popular documents computed correctly
- [ ] Payment webhook creates subscription

### 8.3 E2E Tests (Existing)

- ✅ `test/subscription-payments.e2e-spec.ts` - Payment flow
- ✅ `test/audit-log.e2e-spec.ts` - Audit logging
- ✅ `test/download-log.e2e-spec.ts` - Download tracking
- ✅ `test/dashboard.e2e-spec.ts` - Dashboard endpoints

---

## 9. Known Issues & TODOs

| Issue                                             | Severity | Fix                                 |
| ------------------------------------------------- | -------- | ----------------------------------- |
| Mock subscription returns same data for all users | Medium   | Query DB instead of hard-coded data |
| No log retention policy                           | Medium   | Archive logs > 90 days              |
| Payment webhook doesn't validate bank name        | Low      | Add bank code verification          |
| Dashboard caching not implemented                 | Low      | Add Redis layer                     |
| Reports don't support cursor-based pagination     | Low      | Implement for large datasets        |

---

## 10. References

- **Schema**: [prisma/schema.prisma](../prisma/schema.prisma)
- **Dashboard**: [src/dashboard/](../src/dashboard/)
- **Audit Logs**: [src/audit-log/](../src/audit-log/)
- **Download Logs**: [src/download-log/](../src/download-log/)
- **Reports**: [src/reports/](../src/reports/)
- **Payments**: [src/payments/](../src/payments/)
- **Subscription**: [src/subscription/](../src/subscription/)

---

**Last Updated**: 2026-06-30  
**Reviewer**: GitHub Copilot  
**Status**: Ready for QA & Team Review
