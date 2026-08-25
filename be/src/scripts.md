🤖 **Applying knowledge of `@backend-specialist`...**

Let me first explore the codebase to understand what's already implemented.

Listed directory src
Listed directory docu-mind-local
Listed directory src
Listed directory prisma
Viewed schema.prisma:1-354

Now let me read all the relevant service/controller files:

Viewed dashboard.controller.ts:1-79
Viewed dashboard.service.ts:1-378
Viewed audit-log.controller.ts:1-24
Viewed audit-log.service.ts:1-171
Viewed download-log.controller.ts:1-27
Viewed download-log.service.ts:1-193
Viewed reports.controller.ts:1-47
Viewed reports.service.ts:1-148
Listed directory subscription
Viewed subscription.controller.ts:1-62
Viewed subscription.service.ts:1-54
Listed directory payments
Viewed payments.service.ts:1-220
Viewed payments.controller.ts:1-134

Tôi đã đọc xong toàn bộ code. Bây giờ tôi sẽ tạo script bảo vệ phần vấn đáp (defense script) chuyên sâu.

Created ThienNTN_Dashboard_Defense_Script.md

Đây là phân tích đầy đủ dựa trên code thực tế của dự án:

---

## 🔍 Kết quả phân tích 5 câu hỏi đề bài

### 1. Dashboard lấy số liệu từ những bảng nào

| Endpoint | Tables |
|----------|--------|
| `/summary` | `users`, `documents` (x3 filter), `chat_sessions`, `download_logs` |
| `/user-stats` | `roles` (join users), `users.groupBy(status)` |
| `/document-stats` | `documents.groupBy(status)`, `documents.groupBy(visibility)` |
| `/documents-by-subject` | `subjects._count.documents` |
| `/upload-statistics` | `documents` – raw SQL `date_trunc` |

### 2. AuditLog ghi gì, DownloadLog ghi lúc nào

- **AuditLog** ghi 5 actions: `USER_LOGIN`, `DOCUMENT_UPLOAD`, `DOCUMENT_DELETE`, `DOCUMENT_HIDE`, `PUBLIC_DOCUMENT_SAVE` – mỗi record kèm `userId`, `targetType`, `targetId`, và `metadata: Json?`
- **DownloadLog** ghi **mỗi lần user nhấn download** – chỉ 2 fields: `userId` + `documentId`, timestamp là `downloaded_at`

### 3. Reports dùng count/groupBy/sort thế nào

- **Upload stats:** Raw SQL → `GROUP BY date_trunc('day'/'week'/'month', created_at) ORDER BY 1 ASC`
- **Most Downloaded:** `downloadLog.groupBy(['documentId']) → orderBy _count.documentId desc → IN batch`
- **Most Saved:** `savedDocument.groupBy(['documentId']) → same pattern`

### 4. Tối ưu nếu log nhiều

- Index đã có: `(user_id, downloaded_at)` composite, `(target_type, target_id)` cho audit
- `keyword` ILIKE cần nâng lên PostgreSQL FTS nếu volume lớn
- Cursor-based pagination thay offset cho millions records

### 5. Mock vs Real SePay

| | Subscription Mock | Real Payment (SePay) |
|--|--|--|
| Data source | Hardcode trong service | `payments` + `user_subscriptions` tables |
| `GET /plans` | Static array | Hardcode (catalog ít đổi) |
| `GET /current` | Static object | Cần query DB theo `userId` |
| Payment flow | Không có | QR → Webhook → `$transaction` atomic |
| Security | N/A | Header `x-sepay-api-key` + idempotency |

---

📄 Script đầy đủ với 10 câu vấn đáp khó + quick reference table đã được tạo tại artifact trên. Bấm vào để xem toàn bộ với **đường link trực tiếp đến từng dòng code quan trọng**.
# 🛡️ Script Bảo Vệ – Phần 6.5: Admin Dashboard / Logs / Reports / Subscription
**Thành viên:** Nguyễn Trần Ngọc Thiện  
**Thời gian trình bày:** ~2 phút  
**Phần phụ trách:** Dashboard summary/statistics · Audit Logs · Download Logs · Reports · Subscription/Payment mock

---

## ⏱️ SCRIPT THUYẾT TRÌNH 2 PHÚT

> 📌 *Đọc tự nhiên, tempo 130–140 từ/phút. Không cần học thuộc lòng, hiểu ý để ứng biến.*

---

**[0:00 – 0:20] Giới thiệu module**

> "Phần tôi phụ trách là **Admin Dashboard, Audit Logs, Download Logs, Reports và Subscription mock**. Tất cả đều nằm dưới bảo vệ kép: `FirebaseAuthGuard` xác thực token và `RolesGuard` kiểm tra role ADMIN từ PostgreSQL – không phải hard-code trong token."

---

**[0:20 – 0:50] Dashboard**

> "Dashboard lấy số liệu từ **5 bảng chính**: `users`, `documents`, `chat_sessions`, `download_logs`, và các bảng `subjects`/`categories`. Tôi dùng `Promise.all()` để query song song – tránh waterfall. Ví dụ endpoint `/admin/dashboard/summary` trả về trong một lần gọi: tổng user, tổng tài liệu public/private, tổng chat, tổng download. Ngoài ra có `getDocumentsBySubject` và `getDocumentsByCategory` dùng `_count` nested trong `findMany` – hiệu quả hơn join thủ công."

---

**[0:50 – 1:15] Audit Logs & Download Logs**

> "**AuditLog** ghi các hành động quan trọng: `USER_LOGIN`, `DOCUMENT_UPLOAD`, `DOCUMENT_DELETE`, `DOCUMENT_HIDE`, `PUBLIC_DOCUMENT_SAVE` – mỗi hành động kèm `targetType`, `targetId`, và JSON `metadata`. Tìm kiếm log hỗ trợ filter theo `userId`, `action`, keyword với `insensitive mode`.  
> **DownloadLog** ghi mỗi lần user tải file – cột `downloaded_at` được đánh index cùng `user_id`. Cả hai đều có pagination đầy đủ: `page`, `limit`, `totalPages`, `hasNext`, `hasPrevious`."

---

**[1:15 – 1:40] Reports & Upload Statistics**

> "Reports service tái sử dụng logic từ Dashboard và DownloadLog service – đúng nguyên tắc DRY. `getMostDownloaded` dùng `groupBy(['documentId'])` rồi `orderBy _count desc` – lấy top N tài liệu được tải nhiều nhất. `getMostSaved` làm tương tự với `saved_documents`. `getUploadStatistics` dùng raw SQL với `date_trunc` để group theo day/week/month – hỗ trợ filter date range."

---

**[1:40 – 2:00] Subscription & Payment (SePay)**

> "**Subscription mock** trả data tĩnh – không query DB – chỉ demo UI. **Real payment** qua SePay: user gọi `POST /payments/checkout` → hệ thống tạo `transactionCode` dạng `DM123456`, lưu vào DB với status `PENDING`, trả về QR URL. Khi SePay nhận tiền, họ POST webhook vào `/payments/sepay-webhook` – chúng tôi verify bằng `x-sepay-api-key` header, parse `DM\d{6}` từ nội dung chuyển khoản, kiểm tra idempotency, check amount, rồi chạy `$transaction` để update Payment + tạo/extend UserSubscription trong một atomic operation."

---

## ❓ 10 CÂU VẤN ĐÁP KHÓ

---

### Q1: Dashboard dùng `Promise.all()` – nếu một query trong đó fail thì sao?

**Trả lời:**  
`Promise.all()` sẽ reject ngay khi **bất kỳ** promise nào fail. Hệ thống sẽ throw exception và trả về lỗi 500. Điều này chấp nhận được trong context Admin Dashboard vì:  
1. Tất cả queries đơn giản, low failure rate  
2. Nếu cần resilience cao hơn, có thể dùng `Promise.allSettled()` + partial result  

Hiện tại chưa dùng `allSettled` vì ưu tiên consistency – một số liệu sai còn tệ hơn không có.

---

### Q2: `groupBy` trong Prisma có thể dùng `orderBy` trực tiếp không? Code `orderBy: { _count: { documentId: 'desc' } }` có đúng không?

**Trả lời:**  
Đúng. Prisma hỗ trợ `orderBy` trên aggregate count trong `groupBy`. Tuy nhiên, cần để ý: khi `groupBy(['documentId'])`, Prisma sort theo số lần `documentId` xuất hiện trong group – đây chính xác là số lần download. Đây là cú pháp đúng của Prisma v5+.

---

### Q3: `getUploadStatistics` dùng `$queryRaw` – tại sao không dùng Prisma ORM thông thường?

**Trả lời:**  
Vì Prisma ORM không có native hỗ trợ `date_trunc` hay `to_char` của PostgreSQL. Để group theo ngày/tuần/tháng linh hoạt, phải dùng raw SQL. Tuy nhiên, code vẫn dùng `Prisma.sql` tagged template (không phải string thô) – tránh SQL injection vì tất cả dynamic values đều được parameterized.

---

### Q4: AuditLog có field `metadata: Json?` – khi nào bạn dùng nó và khi nào để null?

**Trả lời:**  
- `USER_LOGIN`: metadata có thể chứa `{ ip, userAgent, provider }` để audit bảo mật  
- `DOCUMENT_UPLOAD`: metadata có `{ fileName, fileSize, fileType }` để trace lịch sử upload  
- `DOCUMENT_DELETE` / `DOCUMENT_HIDE`: metadata có `{ reason, title }` để traceability  
- `PUBLIC_DOCUMENT_SAVE`: có thể null nếu không cần thêm context  

Metadata là optional `Json?` để linh hoạt – mỗi action type có schema khác nhau.

---

### Q5: Nếu `audit_logs` có hàng triệu records thì search theo `keyword` sẽ chậm thế nào? Tối ưu gì?

**Trả lời:**  
Hiện tại `keyword` dùng `contains + mode: 'insensitive'` → dịch ra `ILIKE '%keyword%'` → full table scan! Với triệu records, đây là bottleneck.

**Tối ưu:**
1. **Index:** Thêm `@@index([action])` – đã có; thêm `@@index([createdAt])` cho sort
2. **Partial index:** `WHERE action = 'USER_LOGIN'` trên PostgreSQL
3. **PostgreSQL Full-Text Search:** Dùng `tsvector` column cho `action` + `targetType`
4. **Pagination giới hạn:** Đặt max `limit = 100` để tránh dump quá nhiều
5. **Cursor-based pagination** thay offset cho high-volume scenarios

---

### Q6: DownloadLog index có `(user_id, downloaded_at)` – tại sao composite index thay vì 2 index riêng?

**Trả lời:**  
Composite index `(user_id, downloaded_at)` tối ưu cho query phổ biến nhất: **"lấy download history của user X, sort theo thời gian"** – index có thể satisfy cả WHERE và ORDER BY trong một scan.

Nếu tách 2 index riêng:
- Query `WHERE user_id = ? ORDER BY downloaded_at DESC` vẫn cần 2 lookups
- PostgreSQL có thể phải dùng bitmap scan, kém hiệu quả hơn

---

### Q7: `getMostDownloaded` có N+1 problem không? (groupBy rồi query document riêng)

**Trả lời:**  
Không phải N+1 thực sự. Flow là:
1. **Query 1:** `groupBy documentId` → lấy N documentIds
2. **Query 2:** `findMany WHERE id IN (documentIds)` → batch query, **không** loop query

Đây là pattern "batch loading" – tương tự DataLoader. Chỉ có **2 queries** bất kể N lớn cỡ nào. Điểm yếu duy nhất: nếu document đã bị xóa, `documentsById.get()` trả `undefined` → filtered out bằng type guard.

---

### Q8: Subscription mock dùng data hardcode – khi nào cần migrate sang real DB?

**Trả lời:**  
**Subscription mock** (`subscription.service.ts`) trả data tĩnh – không query DB – chỉ để demo UI flow.

**Real SePay payment** (`payments.service.ts`) đã dùng DB thực: `Payment` table và `UserSubscription` table.

Khi MVP cần real subscription management:
1. `GET /subscription/current` phải query `user_subscriptions` WHERE `userId = req.user.id AND status = ACTIVE`
2. `GET /subscription/plans` có thể vẫn hardcode (plan catalog ít thay đổi) hoặc đưa vào config/DB
3. Thêm cron job `subscription.cron.ts` – đã có sẵn – để expire subscriptions hết hạn

---

### Q9: SePay webhook verify bằng `x-sepay-api-key` header – đây có đủ bảo mật không?

**Trả lời:**  
**Chấp nhận được nhưng chưa optimal.** Hiện tại:
- ✅ Verify API key từ env config
- ✅ Idempotency check (payment đã SUCCESS thì skip)
- ✅ Amount validation (`dto.amount < payment.amount`)
- ✅ Atomic transaction (`$transaction`)

**Cải thiện thêm được:**
1. **IP Whitelist:** Chỉ accept requests từ SePay IP range
2. **HMAC Signature:** SePay có thể sign payload – verify signature thay vì plain key
3. **Replay attack prevention:** Check `transactionCode` dùng `unique` constraint (đã có)

---

### Q10: Tại sao `Reports.getUploadStatistics()` chỉ delegate sang `DashboardService` thay vì implement riêng?

**Trả lời:**  
Đây là quyết định thiết kế có chủ ý theo nguyên tắc **DRY (Don't Repeat Yourself)**:

- Business logic upload statistics chỉ cần implement 1 nơi (`DashboardService`)
- `ReportsService` expose endpoint khác (`/admin/reports/upload-statistics`) nhưng same data
- Nếu logic thay đổi (ví dụ thêm filter mới), chỉ update 1 chỗ

Khi Reports cần logic khác biệt hơn Dashboard (ví dụ export CSV, thêm trường tổng doanh thu), lúc đó mới tách implementation. Hiện tại delegation là đủ.

---

## 📊 QUICK REFERENCE BẢNG

| Module | Tables Query | Pattern | Guards |
|--------|-------------|---------|--------|
| Dashboard Summary | `users`, `documents`, `chat_sessions`, `download_logs` | `Promise.all + count` | Firebase + RolesGuard(ADMIN) |
| Dashboard Stats | `roles`, `users`, `subjects`, `categories` | `groupBy + _count` | Firebase + RolesGuard(ADMIN) |
| Upload Statistics | `documents` | `$queryRaw + date_trunc` | Firebase + RolesGuard(ADMIN) |
| Audit Log | `audit_logs` | `findMany + pagination` | Firebase + RolesGuard(ADMIN) |
| Download Log | `download_logs` | `findMany + include + pagination` | Firebase + RolesGuard(ADMIN) |
| Most Downloaded | `download_logs` → `documents` | `groupBy → IN batch` | Firebase + RolesGuard(ADMIN) |
| Most Saved | `saved_documents` → `documents` | `groupBy → IN batch` | Firebase + RolesGuard(ADMIN) |
| Subscription Mock | None (hardcode) | Static data | Firebase (current only) |
| Real Payment | `payments`, `user_subscriptions` | `$transaction (atomic)` | Firebase + API Key header |

---

## 🗂️ INDEX CÁC FILE LIÊN QUAN

| File | Dòng quan trọng |
|------|----------------|
| [dashboard.service.ts](file:///f:/SWP/DocuMind-local/docu-mind-local/src/dashboard/dashboard.service.ts#L106-L144) | `getSummary()` – Promise.all 6 queries |
| [dashboard.service.ts](file:///f:/SWP/DocuMind-local/docu-mind-local/src/dashboard/dashboard.service.ts#L298-L315) | `getUploadStatistics()` – raw SQL date_trunc |
| [audit-log.service.ts](file:///f:/SWP/DocuMind-local/docu-mind-local/src/audit-log/audit-log.service.ts#L6-L17) | `AuditLogAction` constants |
| [download-log.service.ts](file:///f:/SWP/DocuMind-local/docu-mind-local/src/download-log/download-log.service.ts#L107-L155) | `getMostDownloaded()` – groupBy pattern |
| [reports.service.ts](file:///f:/SWP/DocuMind-local/docu-mind-local/src/reports/reports.service.ts#L68-L124) | `getMostSaved()` – same groupBy pattern |
| [payments.service.ts](file:///f:/SWP/DocuMind-local/docu-mind-local/src/payments/payments.service.ts#L123-L218) | `processWebhook()` – idempotency + $transaction |
| [subscription.service.ts](file:///f:/SWP/DocuMind-local/docu-mind-local/src/subscription/subscription.service.ts) | Mock hardcode – so sánh với payments |
| [schema.prisma](file:///f:/SWP/DocuMind-local/docu-mind-local/prisma/schema.prisma#L235-L248) | `AuditLog` model + indexes |
| [schema.prisma](file:///f:/SWP/DocuMind-local/docu-mind-local/prisma/schema.prisma#L222-L233) | `DownloadLog` model + composite index |
| [schema.prisma](file:///f:/SWP/DocuMind-local/docu-mind-local/prisma/schema.prisma#L309-L341) | `UserSubscription` + `Payment` models |
