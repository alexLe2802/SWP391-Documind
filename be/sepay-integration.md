# KẾ HOẠCH TÍCH HỢP SEPAY & QUẢN LÝ GÓI CƯỚC (SEPAY INTEGRATION PLAN)

## Dự án: AI Study Hub (DocuMind)

Tài liệu này phân chia chi tiết các công việc (Task Breakdown) cần thiết để triển khai hệ thống cổng thanh toán tự động SEpay, sinh mã VietQR động, và quản lý vòng đời gói cước (User Subscription) của người dùng.

---

## 1. TỔNG QUAN & MỤC TIÊU (OVERVIEW)

- **Mục tiêu:** Cung cấp tính năng nâng cấp gói tài khoản (Free lên Pro) tự động bằng cách hiển thị mã QR thanh toán ngân hàng (VietQR) và tự động kích hoạt gói cước ngay khi người dùng chuyển khoản thành công qua webhook của SEpay.
- **Loại dự án:** BACKEND (NestJS & Prisma & PostgreSQL)

---

## 2. TIÊU CHÍ THÀNH CÔNG (SUCCESS CRITERIA)

- [ ] Giao dịch `Payment` ở trạng thái `PENDING` được lưu chính xác vào database kèm theo `transactionCode` duy nhất.
- [ ] Mã VietQR động được hiển thị chính xác chứa số tiền và nội dung chuyển khoản là mã giao dịch.
- [ ] Webhook từ SEpay được xác thực bảo mật bằng Token/API Key.
- [ ] Webhook xử lý đúng: đối khớp số tiền nhận được, đổi trạng thái thanh toán thành `SUCCESS`, và tạo/cập nhật gói cước `UserSubscription` hoạt động trong vòng 30 ngày.
- [ ] Tiến trình kiểm tra hàng ngày (Cron Job) tự động chuyển các gói cước quá hạn sang trạng thái `EXPIRED`.
- [ ] Đạt 100% độ bao phủ kiểm thử (Unit Tests) cho các file controller/service mới hoặc chỉnh sửa.
- [ ] Biên dịch TypeScript và Linter chạy không lỗi.

---

## 3. CÔNG NGHỆ ÁP DỤNG (TECH STACK)

- **NestJS Schedule (`@nestjs/schedule`):** Để quản lý các tác vụ định kỳ (Cron Job) cho việc quét hết hạn gói cước.
- **Prisma ORM & PostgreSQL:** Lưu trữ thông tin Gói cước (`UserSubscription`) và Lịch sử Giao dịch (`Payment`).
- **VietQR API:** Công cụ tạo ảnh QR tự động quét chuyển khoản nhanh theo chuẩn Napas.
- **SEpay Webhook API:** Hệ thống nhận thông tin biến động số dư tài khoản ngân hàng thời gian thực.

---

## 4. CẤU TRÚC THƯ MỤC THAY ĐỔI (FILE STRUCTURE)

Các file sẽ được cập nhật hoặc tạo mới:

```bash
F:\SWP\DocuMind-local\docu-mind-local\
├── prisma/
│   └── schema.prisma (Cập nhật - Thêm model UserSubscription, Payment)
└── src/
    ├── payments/
    │   ├── dto/
    │   │   ├── create-payment.dto.ts (Mới - DTO cho yêu cầu thanh toán)
    │   │   └── sepay-webhook.dto.ts (Mới - DTO xác thực payload SEpay gửi sang)
    │   ├── payments.controller.ts (Cập nhật - Thêm endpoint sinh QR và webhook)
    │   ├── payments.service.ts (Cập nhật - Logic tạo QR và xử lý Webhook đối khớp)
    │   ├── payments.service.spec.ts (Cập nhật - Test service thanh toán)
    │   └── payments.controller.spec.ts (Cập nhật - Test controller webhook)
    └── subscription/
        ├── subscription.cron.ts (Mới - Tác vụ quét hết hạn gói cước mỗi ngày)
        └── subscription.module.ts (Cập nhật - Khai báo Cron Task và ScheduleModule)
```

---

## 5. BẢN PHÂN CHIA CÔNG VIỆC (TASK BREAKDOWN)

### PHASE 1: CẤU TRÚC DỮ LIỆU & DATABASE MIGRATION (P0)

#### Task SEPAY-01: Cấu hình Prisma Schema

- **Người thực hiện:** `database-architect` (hoặc AI tương đương)
- **Phụ thuộc:** Không có
- **Mô tả:** Cập nhật file `prisma/schema.prisma` để định nghĩa hai model mới: `UserSubscription` (lưu trạng thái gói cước người dùng) và `Payment` (lưu thông tin giao dịch).
- **INPUT:** File [prisma/schema.prisma](file:///F:/SWP/DocuMind-local/docu-mind-local/prisma/schema.prisma) hiện tại.
- **OUTPUT:** File `schema.prisma` chứa cấu trúc model `UserSubscription` và `Payment` có thiết lập quan hệ 1-N với `User`, các trường chỉ mục `@@index([transactionCode])` và `@@map` rõ ràng.
- **VERIFY:** Chạy lệnh `npm run prisma:validate` để xác nhận file schema hợp lệ.

#### Task SEPAY-02: Chạy Database Migration

- **Người thực hiện:** `database-architect` (hoặc AI tương đương)
- **Phụ thuộc:** `SEPAY-01`
- **Mô tả:** Thực hiện tạo file migration và áp dụng thay đổi vào PostgreSQL.
- **INPUT:** Schema Prisma đã cập nhật.
- **OUTPUT:** Thư mục migration mới và cơ sở dữ liệu Postgres được cập nhật bảng `user_subscriptions` và `payments`.
- **VERIFY:** Chạy lệnh `npm run prisma:generate` để tạo lại Prisma Client mới chứa các model vừa khai báo.

---

### PHASE 2: PHÁT TRIỂN CORE BACKEND & WEBHOOK (P1)

#### Task SEPAY-03: Cài đặt DTOs cho Payments

- **Người thực hiện:** `backend-specialist`
- **Phụ thuộc:** `SEPAY-02`
- **Mô tả:** Tạo mới các file DTO để chuẩn hóa dữ liệu đầu vào cho API tạo thanh toán và API nhận Webhook từ SEpay.
- **INPUT:** Tài liệu đặc tả Webhook của SEpay.
- **OUTPUT:**
  - `src/payments/dto/create-payment.dto.ts` (chứa `planId` hợp lệ bằng `@IsString()`, `@IsNotEmpty()`).
  - `src/payments/dto/sepay-webhook.dto.ts` (chứa các trường SEpay trả về như `gateway`, `amount`, `content`, `code`, `transferType`).
- **VERIFY:** Biên dịch dự án không có lỗi type-checking.

#### Task SEPAY-04: Logic sinh yêu cầu thanh toán & ảnh VietQR

- **Người thực hiện:** `backend-specialist`
- **Phụ thuộc:** `SEPAY-03`
- **Mô tả:** Cập nhật `PaymentsService` và `PaymentsController` để cho phép người dùng đăng ký yêu cầu nâng cấp gói. Tạo mã thanh toán dạng `DMXXXXXX` và trả về link mã QR VietQR.
- **INPUT:** DTO tạo thanh toán và thông tin cấu hình tài khoản ngân hàng trong file `.env`.
- **OUTPUT:**
  - Hàm `createPaymentRequest` trong `PaymentsService` lưu bản ghi thanh toán PENDING và trả về URL ảnh QR VietQR động.
  - Endpoint `POST /api/payments/checkout` trong `PaymentsController` yêu cầu quyền đăng nhập.
- **VERIFY:** Gọi thử API và nhận về mã QR hợp lệ chứa nội dung chuyển khoản khớp mã giao dịch.

#### Task SEPAY-05: Logic xử lý Webhook đối khớp giao dịch

- **Người thực hiện:** `backend-specialist`
- **Phụ thuộc:** `SEPAY-04`
- **Mô tả:** Viết hàm nhận thông tin thanh toán tự động của SEpay gửi sang, trích xuất mã giao dịch bằng regex, kiểm tra trùng lặp giao dịch (Idempotency), đối khớp số tiền, cập nhật trạng thái thanh toán thành `SUCCESS` và nâng cấp gói cước tương ứng.
- **INPUT:** Dữ liệu webhook SEpay gửi đến.
- **OUTPUT:** Hàm `processWebhook` trong `PaymentsService` thực hiện thay đổi dữ liệu an toàn trong một khối `Prisma.$transaction`.
- **VERIFY:** Viết mockup payload truyền vào hàm xử lý kiểm tra cơ sở dữ liệu cập nhật chính xác trạng thái Payment và UserSubscription.

#### Task SEPAY-06: Endpoint nhận Webhook của SEpay

- **Người thực hiện:** `backend-specialist`
- **Phụ thuộc:** `SEPAY-05`
- **Mô tả:** Mở endpoint công khai `POST /api/payments/sepay-webhook` để SEpay gọi đến. Cấu hình kiểm tra header `x-sepay-api-key` để đảm bảo request gửi đến thực sự từ SEpay.
- **INPUT:** API Key cấu hình trong biến môi trường `.env`.
- **OUTPUT:** Endpoint controller thực hiện xác thực API Key trước khi chuyển tiếp dữ liệu xử lý. Trả về `{ success: true }`.
- **VERIFY:** Gửi request test kèm header giả lập từ Postman/Curl để xác thực cơ chế chặn API Key hoạt động đúng.

---

### PHASE 3: SUBSCRIPTION LIFECYCLE & CRON JOB (P2)

#### Task SEPAY-07: Cài đặt và cấu hình NestJS Schedule

- **Người thực hiện:** `backend-specialist` / `devops-engineer`
- **Phụ thuộc:** Không có
- **Mô tả:** Cài đặt thư viện `@nestjs/schedule` và import `ScheduleModule.forRoot()` vào `AppModule` để hỗ trợ thiết lập tác vụ tự động quét ngày hết hạn gói cước.
- **INPUT:** Dự án backend hiện tại.
- **OUTPUT:** Thư viện được thêm vào file `package.json` và `AppModule` khởi tạo module cron thành công.
- **VERIFY:** Chạy ứng dụng không xảy ra lỗi khởi động.

#### Task SEPAY-08: Tác vụ tự động quét hết hạn gói cước (Cron Job)

- **Người thực hiện:** `backend-specialist`
- **Phụ thuộc:** `SEPAY-07`, `SEPAY-02`
- **Mô tả:** Tạo file `subscription.cron.ts` trong module subscription. Viết hàm chạy mỗi ngày vào lúc 00:00 sử dụng `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)` để tìm tất cả `UserSubscription` có `expiresAt < now()` và cập nhật trạng thái của chúng từ `ACTIVE` sang `EXPIRED`.
- **INPUT:** Cơ sở dữ liệu chứa trạng thái gói của người dùng.
- **OUTPUT:** File `subscription.cron.ts` thực thi logic cập nhật hàng loạt trạng thái hết hạn của gói cước.
- **VERIFY:** Viết test giả lập thời gian trôi qua hạn để kiểm tra cron hoạt động chính xác.

---

### PHASE 4: UNIT TESTING & INTEGRATION (P3)

#### Task SEPAY-09: Viết kiểm thử cho Payments Module

- **Người thực hiện:** `test-engineer`
- **Phụ thuộc:** `SEPAY-06`
- **Mô tả:** Viết unit test phủ toàn bộ các case thành công, thất bại, sai tiền, sai API key ngân hàng trong `payments.service.spec.ts` và `payments.controller.spec.ts`.
- **INPUT:** Code payments service và controller.
- **OUTPUT:** File test specs đầy đủ các case.
- **VERIFY:** Chạy lệnh `npx jest src/payments` trả về kết quả 100% test case pass.

#### Task SEPAY-10: Viết kiểm thử cho Cron Job Expiration

- **Người thực hiện:** `test-engineer`
- **Phụ thuộc:** `SEPAY-08`
- **Mô tả:** Viết unit test đảm bảo tác vụ cron gọi đúng Prisma để cập nhật gói cước sang `EXPIRED` when hết hạn.
- **INPUT:** File `subscription.cron.ts`.
- **OUTPUT:** Unit test phủ logic hết hạn.
- **VERIFY:** Chạy lệnh `npx jest src/subscription` trả về kết quả pass.

---

## 6. QUY TRÌNH KIỂM TRA CHẤT LƯỢNG CUỐI CÙNG (PHASE X)

- [ ] Chạy `npm run lint` để kiểm tra lỗi định dạng linter.
- [ ] Chạy `npx tsc --noEmit` để đảm bảo biên dịch không lỗi TypeScript.
- [ ] Chạy `npx jest` chạy thành công toàn bộ suite test cũ và mới.
- [ ] Build dự án thành công bằng `npm run build`.
