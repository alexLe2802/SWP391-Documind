# Hướng dẫn tái dựng và chuyển giao DocuMind theo 5 Main Flow

Repo tích hợp mới: <https://github.com/alexLe2802/SWP391-Documind>

## 1. Mục đích và nguyên tắc

Đây là kế hoạch chuyển giao một codebase đã tồn tại thành bài tập nhóm có kiểm
chứng. Codebase gốc do Thống phát triển. Các thành viên mới chịu trách nhiệm đọc,
tái dựng, kiểm thử, giải thích và cải tiến main flow được giao.

Mỗi commit phải phản ánh một thao tác thành viên thực sự thực hiện. Không đổi tác
giả commit cũ, không backdate commit, không dùng tài khoản của người khác và không
ghi rằng một thành viên là tác giả nguyên bản của phần code kế thừa.

Các quy tắc bắt buộc:

- Không sửa hoặc xóa `.github/**`, workflow, branch protection hay GitHub config.
- Không commit `.env`, Firebase private key, service-account, keystore, certificate,
  provisioning profile, `mobile/config.json` hoặc secret production.
- Không xóa source trong repo gốc. Mọi thao tác tái dựng chỉ thực hiện trên fork và
  branch cá nhân của repo mới.
- Không đưa file build như APK, IPA, `node_modules`, `build` hoặc `dist` vào commit.
- Một commit chỉ giải quyết một mục tiêu, chạy được và có test/check tương ứng.
- Không merge trực tiếp vào `main`; mọi thay đổi đi qua Pull Request.
- PR phải ghi rõ phần kế thừa, phần thành viên đã kiểm tra/thay đổi và bằng chứng test.

## 2. Ghi nhận nguồn gốc trong repo mới

Commit nền đầu tiên do Thống thực hiện phải giữ nguyên lịch sử hoặc ghi rõ nguồn:

```text
chore(project): import DocuMind baseline for team reconstruction

Original DocuMind codebase developed by Thống.
This repository is used for supervised reconstruction, testing and knowledge transfer.
```

README của repo mới nên có đoạn:

```text
## Project provenance

DocuMind was originally implemented by Thống. In this repository, the five-member
team reconstructs, validates, documents and extends the system by assigned business
flow. Git history in this repository represents the reconstruction exercise, not
original authorship of the inherited implementation.
```

## 3. Phân công

| Thành viên | Phạm vi chính | Số commit dự kiến |
|---|---|---:|
| Thống | MF-01 Authentication; mobile Android/iOS; subscription/payment; deployment | 25 |
| Đăng Khôi | MF-02 Upload và xử lý tài liệu bằng AI | 22 |
| Huân Minh | MF-03 Hỏi đáp tài liệu bằng AI/RAG | 20 |
| Phú Vinh | MF-04 Community, Saved Library và chia sẻ tài liệu | 23 |
| Đức Nguyên | MF-05 Admin, moderation, audit và reports | 19 |

Tổng cộng: **109 commit dự kiến trong 5 ngày**. Con số là kế hoạch, không phải KPI
để chia nhỏ giả tạo. Nếu hai mục không thể tách thành hai thay đổi chạy độc lập thì
gộp lại và giải thích trong PR.

## 4. Chuẩn bị fork và branch

Mỗi thành viên fork repo mới trên GitHub, sau đó clone fork của chính mình:

```bash
git clone https://github.com/<github-username>/SWP391-Documind.git
cd SWP391-Documind
git remote add upstream https://github.com/alexLe2802/SWP391-Documind.git
git fetch upstream
git switch main
git pull --ff-only upstream main
```

Tạo branch theo main flow:

```bash
git switch -c mf-XX-<short-name>
```

Ví dụ:

```text
mf-01-auth-mobile-payment
mf-02-document-processing
mf-03-ai-chat
mf-04-community
mf-05-admin
```

Không xóa cả repository để tạo commit. Nếu cần học theo kiểu tái dựng, chỉ di chuyển
tạm các file thuộc phạm vi cá nhân sang một thư mục ngoài Git, sau đó tự khôi phục
từng lát cắt sau khi đã đọc và giải thích được nó. Trước mỗi commit phải so sánh với
yêu cầu, chạy formatter/linter/test và xem `git diff`.

## 5. Quy trình cho từng commit

```bash
git status --short
git diff
git add <danh-sach-file-dung-pham-vi>
git diff --cached
git commit -m "type(mf-XX): mô tả thay đổi thực tế"
git push -u origin reconstruct/mf-XX-<short-name>
```

Loại commit được dùng:

- `reconstruct`: tái dựng một lát cắt chức năng sau khi đã hiểu.
- `test`: bổ sung hoặc hoàn thiện kiểm thử.
- `fix`: sửa lỗi được tái hiện rõ ràng.
- `refactor`: cải thiện cấu trúc nhưng không đổi hành vi.
- `docs`: tài liệu do thành viên tự viết và có thể bảo vệ.
- `chore`: công việc kỹ thuật phụ trợ không thay đổi nghiệp vụ.

Không dùng các message chung chung như `update code`, `fix`, `day 1` hoặc `done`.

## 6. Kế hoạch 5 ngày

### 6.1 Thống — MF-01, mobile, subscription/payment và deployment — 25 commit

#### Ngày 1 — Authentication backend và Firebase (5)

1. `docs(mf-01): map Firebase and backend authentication sequence`
2. `reconstruct(mf-01): define registration and login DTO contracts`
3. `reconstruct(mf-01): restore Firebase token verification service`
4. `reconstruct(mf-01): enforce active user and accepted terms guards`
5. `test(mf-01): cover missing registration and inactive account cases`

Phạm vi tham khảo: `backend/src/auth/**`, `backend/src/firebase/**` và
`backend/src/users/**`.

#### Ngày 2 — Authentication frontend và email verification (5)

6. `reconstruct(mf-01): connect Firebase web authentication provider`
7. `reconstruct(mf-01): restore email password login and registration views`
8. `reconstruct(mf-01): restore Google registration completion flow`
9. `reconstruct(mf-01): restore verify reset and forgot password screens`
10. `test(mf-01): cover login registration and verification routing`

Phạm vi: `frontend/src/features/auth/**`, `frontend/src/views/LoginView.tsx`,
`RegisterView.tsx`, `VerifyEmailView.tsx`, `ForgotPasswordView.tsx` và
`ResetPasswordView.tsx`.

#### Ngày 3 — Mobile Android/iOS (5)

11. `reconstruct(mobile): restore Firebase platform configuration loader`
12. `reconstruct(mobile): restore native login and Google sign in screens`
13. `reconstruct(mobile): restore native registration and password recovery`
14. `fix(mobile): validate backend session before opening application shell`
15. `test(mobile): cover login and native registration navigation`

Không commit `google-services.json` nếu quy định dự án đang ignore file đó; dùng
`config.example.json` để mô tả biến cần thiết.

#### Ngày 4 — Subscription và SePay (5)

16. `docs(payment): map subscription checkout and webhook lifecycle`
17. `reconstruct(payment): restore subscription plan query endpoints`
18. `reconstruct(payment): restore SePay checkout payload and signature`
19. `reconstruct(payment): restore webhook verification and payment update`
20. `test(payment): cover signature checkout webhook and idempotency`

Phạm vi: `backend/src/subscription/**`, `backend/src/payments/**`,
`frontend/src/views/SubscriptionView.tsx`, `frontend/src/api/payments.api.ts` và
`mobile/lib/features/subscription/**`.

#### Ngày 5 — Build và deployment (5)

21. `reconstruct(deploy): document validated production environment contract`
22. `test(deploy): cover required production environment validation`
23. `chore(mobile): align Android and iOS application versions`
24. `docs(deploy): add Android iOS web and backend release checklist`
25. `docs(mf-01): record authentication payment and deployment demo evidence`

Không thay đổi `.github/**`. Deployment thật chỉ thực hiện khi giảng viên/team leader
phê duyệt và không đưa secret vào PR.

### 6.2 Minh Huân — MF-02 Upload và xử lý tài liệu — 22 commit

#### Ngày 1 — Contract và upload UI (4)

1. `docs(mf-02): map document upload and processing lifecycle`
2. `reconstruct(mf-02): document metadata DTO validation`
3. `reconstruct(mf-02): upload form subject category and tag fields`
4. `test(mf-02): cover upload API client request construction`

#### Ngày 2 — Storage và file validation (4)

5. `reconstruct(mf-02): create R2 storage provider contract`
6. `reconstruct(mf-02): signed upload and object access service`
7. `reconstruct(mf-02): validate document extensions sizes and archive entries`
8. `test(mf-02): cover rejected and accepted document formats`

#### Ngày 3 — Content extraction (5)

9. `reconstruct(mf-02): restore PDF text extraction`
10. `reconstruct(mf-02): restore DOCX and legacy Office extraction`
11. `reconstruct(mf-02): restore PPTX slide extraction`
12. `reconstruct(mf-02): restore XLSX worksheet extraction`
13. `test(mf-02): cover PDF DOCX PPTX and XLSX extractors`

#### Ngày 4 — AI processing và lifecycle (4)

14. `reconstruct(mf-02): restore moderation scan before AI processing`
15. `reconstruct(mf-02): restore summary and metadata generation`
16. `reconstruct(mf-02): persist extraction and processing status transitions`
17. `test(mf-02): cover processing success rejection and retry states`

#### Ngày 5 — Library integration và quality (5)

18. `reconstruct(mf-02): expose processed documents in My Library`
19. `fix(mf-02): prevent cross-user document access`
20. `test(mf-02): cover upload-to-library end-to-end flow`
21. `docs(mf-02): document supported formats and failure recovery`
22. `docs(mf-02): record MF-02 demo evidence and known limits`

Phạm vi chính: `backend/src/storage/**`, `backend/src/content-extraction/**`,
`backend/src/documents/**`, `frontend/src/views/UploadDocumentView.tsx`,
`LibraryView.tsx` và `mobile/lib/features/documents/**`.

### 6.3 Đăng Khôi — MF-03 Hỏi đáp AI/RAG — 20 commit

#### Ngày 1 — Chat contract và UI (4)

1. `docs(mf-03): map ask-document and ask-library RAG sequence`
2. `reconstruct(mf-03): restore chat API request and response contracts`
3. `reconstruct(mf-03): restore chat composer and citation components`
4. `test(mf-03): cover chat API serialization and error handling`

#### Ngày 2 — Document-scoped RAG (4)

5. `reconstruct(mf-03): restore document access checks before chat`
6. `reconstruct(mf-03): retrieve relevant chunks for selected document`
7. `reconstruct(mf-03): compose grounded Gemini context and prompt`
8. `test(mf-03): block chat against another user document`

#### Ngày 3 — Library RAG (4)

9. `reconstruct(mf-03): restore owned library corpus selection`
10. `reconstruct(mf-03): include saved community sources without duplicates`
11. `reconstruct(mf-03): return answer citations and source metadata`
12. `test(mf-03): ignore selected sources outside accessible corpus`

#### Ngày 4 — Conversation lifecycle (4)

13. `reconstruct(mf-03): persist sessions and conversation messages`
14. `reconstruct(mf-03): restore follow-up question context`
15. `reconstruct(mf-03): signal continuation for long answers`
16. `test(mf-03): redact revoked source content from chat history`

#### Ngày 5 — Safety và mobile (4)

17. `reconstruct(mf-03): restore AI chat experience on mobile`
18. `fix(mf-03): reject prompt and credential exfiltration attempts`
19. `test(mf-03): cover five-flow chat security scenarios`
20. `docs(mf-03): document RAG evidence limitations and demo script`

Phạm vi chính: `backend/src/chatbot/**`, `frontend/src/api/chat.api.ts`,
`frontend/src/views/AiChatbotView.tsx`, `AskDocumentView.tsx`,
`AskLibraryView.tsx`, `frontend/src/components/chat/**` và
`mobile/lib/features/chat/**`.

### 6.4 Phú Vinh — MF-04 Community và Saved Library — 23 commit

#### Ngày 1 — Visibility và community listing (5)

1. `docs(mf-04): map publish discover preview and save sequence`
2. `reconstruct(mf-04): restore document visibility update contract`
3. `reconstruct(mf-04): restore public community document query`
4. `reconstruct(mf-04): restore search sort and filter parameters`
5. `test(mf-04): hide private rejected and unauthorized documents`

#### Ngày 2 — Community UI (4)

6. `reconstruct(mf-04): restore community discovery page`
7. `reconstruct(mf-04): restore community document detail and metadata`
8. `reconstruct(mf-04): restore preview and AI summary display`
9. `test(mf-04): cover community API mapping and empty states`

#### Ngày 3 — Save to My Library (5)

10. `reconstruct(mf-04): restore save document endpoint`
11. `reconstruct(mf-04): restore unsave document endpoint`
12. `reconstruct(mf-04): restore saved document pagination and filters`
13. `reconstruct(mf-04): connect saved documents to My Library UI`
14. `test(mf-04): make save idempotent and prevent duplicate records`

#### Ngày 4 — Authorization và mobile (4)

15. `fix(mf-04): enforce owner-only visibility changes`
16. `fix(mf-04): prevent access after source visibility is revoked`
17. `reconstruct(mf-04): restore mobile community and saved tabs`
18. `test(mf-04): cover mobile owned and saved source merge`

#### Ngày 5 — Integration và documentation (5)

19. `reconstruct(mf-04): expose saved sources to library AI selection`
20. `test(mf-04): cover publish-save-unsave end-to-end flow`
21. `refactor(mf-04): centralize saved document mapping`
22. `docs(mf-04): document ownership visibility and revoke rules`
23. `docs(mf-04): record MF-04 demo evidence and known limits`

Phạm vi chính: `backend/src/community/**`, `backend/src/saved-documents/**`,
`frontend/src/views/CommunityView.tsx`, `SavedView.tsx`,
`frontend/src/api/community.api.ts`, `frontend/src/lib/saved-documents.ts` và
`mobile/lib/features/community/**`.

### 6.5 Đức Nguyên — MF-05 Admin và moderation — 19 commit

#### Ngày 1 — Authorization và dashboard (4)

1. `docs(mf-05): map admin authorization and moderation sequence`
2. `reconstruct(mf-05): restore role decorator and admin role guard`
3. `reconstruct(mf-05): restore admin dashboard metrics endpoint`
4. `test(mf-05): reject non-admin access to management routes`

#### Ngày 2 — User management (4)

5. `reconstruct(mf-05): restore admin user listing and filters`
6. `reconstruct(mf-05): restore block and activate user actions`
7. `reconstruct(mf-05): restore admin user management UI`
8. `test(mf-05): cover valid and invalid user status transitions`

#### Ngày 3 — Document moderation (4)

9. `reconstruct(mf-05): restore admin document moderation listing`
10. `reconstruct(mf-05): restore hide approve and reject actions`
11. `reconstruct(mf-05): require and preserve rejection reason`
12. `test(mf-05): cover moderation authorization and state changes`

#### Ngày 4 — Audit và reports (4)

13. `reconstruct(mf-05): restore audit log recording and query`
14. `reconstruct(mf-05): restore popular document and activity reports`
15. `reconstruct(mf-05): restore admin report and statistics views`
16. `test(mf-05): cover audit filtering and report aggregation`

#### Ngày 5 — Mobile và demo (3)

17. `reconstruct(mf-05): restore mobile admin management screen`
18. `test(mf-05): cover five-flow admin end-to-end scenario`
19. `docs(mf-05): document moderation decisions and demo evidence`

Phạm vi chính: `backend/src/admin/**`, `backend/src/audit-log/**`,
`backend/src/reports/**`, `frontend/src/views/Admin*`,
`frontend/src/quan-tri/**` và `mobile/lib/features/admin/**`.

## 7. Checklist chất lượng trước khi push

Tùy phạm vi, chạy các lệnh phù hợp với project hiện tại. Không sửa workflow để làm
test dễ pass.

### Backend

```bash
cd backend
npm ci
npm run lint
npm test
npm run test:e2e
```

### Frontend

```bash
cd frontend
npm ci
npm run lint
npm test
npm run build
```

### Mobile

```bash
cd mobile
flutter pub get
flutter analyze
flutter test
```

Build APK/iOS chỉ do Thống hoặc người được phân quyền thực hiện. Mỗi lần build APK
phải tăng version tiếp theo, tăng build number và để màn hình intro đọc đúng metadata
ứng dụng.

## 8. Quy trình Pull Request

Trước khi tạo PR:

```bash
git fetch upstream
git rebase upstream/main
git push --force-with-lease origin reconstruct/mf-XX-<short-name>
```

Chỉ dùng `--force-with-lease` trên branch cá nhân, không bao giờ dùng trên `main`.

Tiêu đề PR:

```text
[MF-XX] Reconstruct and validate <tên main flow>
```

Mẫu nội dung PR:

```markdown
## Provenance
- Inherited baseline: original DocuMind implementation by Thống
- Contributor: <họ tên>
- Assigned flow: MF-XX

## Work actually performed
- ...
- ...

## Knowledge demonstrated
- Giải thích request đi qua UI, API, service và database như thế nào
- Nêu authorization, error states và recovery path

## Verification
- [ ] Formatter/linter passed
- [ ] Unit tests passed
- [ ] Relevant E2E tests passed
- [ ] Manual demo recorded
- [ ] No secrets or generated build artifacts committed
- [ ] `.github/**` unchanged

## Evidence
- Test output:
- Screenshots/video:
- Known limitations:
```

## 9. Review chéo và bảo vệ

Mỗi PR cần ít nhất một người khác review. Reviewer không chỉ chọn Approve mà phải:

1. Checkout branch của tác giả.
2. Chạy test liên quan.
3. Đặt ít nhất hai câu hỏi về luồng dữ liệu hoặc bảo mật.
4. Yêu cầu sửa nếu commit không chạy độc lập hoặc vượt phạm vi.
5. Xác nhận `.github/**` và config không bị thay đổi.

Mỗi thành viên cần tự trình bày được:

- Entry point của main flow.
- Dữ liệu đi qua frontend/mobile, backend và database.
- Cách xác thực và phân quyền.
- Happy path, lỗi chính và cách khôi phục.
- Test nào chứng minh flow hoạt động.
- Phần nào kế thừa và phần nào chính họ đã sửa/tái dựng.

## 10. Checklist của team leader trước khi merge

- Commit đúng tác giả thực tế và không backdate.
- Tất cả commit có phạm vi rõ, không phải thao tác xóa/thêm lại vô nghĩa.
- PR liên kết đúng MF và có bằng chứng test.
- Không có secret, file build hoặc dependency cache.
- Không có thay đổi `.github/**` ngoài một PR riêng được cả nhóm phê duyệt.
- CI hiện hữu chạy nguyên trạng.
- Squash/rebase policy được áp dụng nhất quán; không làm mất bằng chứng đóng góp mà
  nhà trường yêu cầu.
- Sau khi merge, cập nhật bảng traceability giữa MF, PR, test và người bảo vệ.

## 11. Bảng theo dõi

| MF | Thành viên | Branch | PR | Commit hoàn tất | Test | Review | Trạng thái |
|---|---|---|---|---:|---|---|---|
| MF-01 | Thống | `mf-01-auth-mobile-payment` | | 0/25 | | | Chưa bắt đầu |
| MF-02 | Đăng Khôi | `mf-02-document-processing` | | 0/22 | | | Chưa bắt đầu |
| MF-03 | Huân Minh | `mf-03-ai-chat` | | 0/20 | | | Chưa bắt đầu |
| MF-04 | Phú Vinh | `mf-04-community` | | 0/23 | | | Chưa bắt đầu |
| MF-05 | Đức Nguyên | `mf-05-admin` | | 0/19 | | | Chưa bắt đầu |

