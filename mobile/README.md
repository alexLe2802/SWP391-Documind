# DocuMind — AI Study Hub & Document Intelligence Platform

> **DocuMind** là nền tảng học tập thông minh hỗ trợ xử lý tài liệu, tóm tắt, trích xuất OCR, hỏi đáp kiến thức bằng RAG (Retrieval-Augmented Generation) và kết nối cộng đồng học tập đa nền tảng (Web & Mobile).

---

## 📑 Mục lục

1. [Tổng quan dự án](#-tổng-quan-dự-án)
2. [Cấu trúc thư mục (Monorepo)](#-cấu-trúc-thư-mục-monorepo)
3. [Công nghệ sử dụng (Tech Stack)](#-công-nghệ-sử-dụng-tech-stack)
4. [5 Luồng nghiệp vụ chính (Main Flows)](#-5-luồng-nghiệp-vụ-chính-main-flows)
5. [Hướng dẫn cài đặt & Khởi chạy](#-hướng-dẫn-cài-đặt--khởi-chạy)
   - [Backend (NestJS)](#1-backend-nestjs)
   - [Frontend (Next.js / Web)](#2-frontend-nextjs--web)
   - [Mobile (Flutter iOS / Android)](#3-mobile-flutter-ios--android)
6. [Biến môi trường (Environment Variables)](#-biến-môi-trường-environment-variables)
7. [Tài liệu kỹ thuật liên quan](#-tài-liệu-kỹ-thuật-liên-quan)
8. [Quy chuẩn đóng góp & Nguồn gốc dự án](#-quy-chuẩn-đóng-góp--nguồn-gốc-dự-án)

---

## 🌟 Tổng quan dự án

DocuMind giải quyết bài toán quản lý, số hóa và khai thác kiến thức từ tài liệu học tập (PDF, DOCX, XLSX, hình ảnh):
- **Trích xuất & Xử lý thông minh**: Tự động bóc tách nội dung, OCR tài liệu quét mờ qua LlamaParse / Local PDF Parser.
- **Tóm tắt & Hỏi đáp RAG**: Ứng dụng mô hình Google Gemini AI để giải đáp thắc mắc, phân tích ngữ cảnh trực tiếp từ tài liệu người dùng tải lên.
- **Lưu trữ bảo mật**: Sử dụng Cloudflare R2 với Presigned URL, đảm bảo tài liệu người dùng luôn an toàn và riêng tư.
- **Hệ sinh thái đồng bộ**: Hỗ trợ đầy đủ giao diện Web và ứng dụng di động Native (Flutter) trên iOS và Android.

---

## 📁 Cấu trúc thư mục (Monorepo)

```text
Documind/
├── backend/                              # NestJS REST API Server
│   ├── src/                              # Source code NestJS (Modules, Controllers, Services)
│   ├── prisma/                           # Prisma ORM schema & migrations
│   ├── docs/                             # Tài liệu API contracts, test guides, upload flow
│   └── README.md                         # Hướng dẫn chi tiết backend
├── frontend/                             # Next.js Web Application
│   ├── src/ / pages/ / components/       # Giao diện Web, Auth flow, Admin panel
│   └── README.md                         # Hướng dẫn chi tiết frontend
├── mobile/                               # Flutter App (iOS & Android)
│   ├── lib/                              # Source code Flutter (features: auth, chat, docs, home)
│   ├── ios/ & android/                   # Native project configurations
│   └── README.md                         # Hướng dẫn chi tiết mobile app
├── scripts/                              # Scripts tự động hoá, kiểm tra nghiệp vụ
├── DocuMind_Team_Reconstruction_Guide.md # Hướng dẫn tái dựng 5 Main Flow và phân công nhóm
├── Documind_5_main_flows_mapping.xlsx    # Bảng phân công chi tiết công việc
└── README.md                             # Tài liệu tổng quan dự án (file này)
```

---

## 🛠 Công nghệ sử dụng (Tech Stack)

### Backend
- **Framework**: [NestJS](https://nestjs.com/) (TypeScript)
- **Database & ORM**: PostgreSQL ([Supabase](https://supabase.com/)), [Prisma ORM 7](https://www.prisma.io/)
- **Authentication**: [Firebase Admin SDK](https://firebase.google.com/)
- **Storage**: [Cloudflare R2](https://www.cloudflare.com/products/r2/) (Private S3-compatible bucket)
- **AI & OCR**: [Google Gemini API](https://ai.google.dev/), [LlamaParse](https://cloud.llamaindex.ai/) (OCR fallback)
- **API Documentation & Testing**: Swagger / OpenAPI, Jest, Supertest

### Frontend (Web)
- **Framework**: [Next.js](https://nextjs.org/) + TypeScript
- **Auth**: Firebase Client SDK & Session-based backend integration
- **Styling**: TailwindCSS & Component Library
- **Roles & Permissions**: Role-based route guard (`ADMIN`, `USER`)

### Mobile
- **Framework**: [Flutter](https://flutter.dev/) (Native iOS & Android)
- **State Management & Architecture**: Feature-first architecture (`core`, `auth`, `documents`, `chat`, `profile`)
- **Integration**: REST API Client (Bearer Token), Firebase iOS/Android Client SDK

---

## 🔄 5 Luồng nghiệp vụ chính (Main Flows)

| Mã Flow | Tên luồng nghiệp vụ | Phạm vi & Chức năng chính |
|:---:|---|---|
| **MF-01** | **Authentication, Mobile & Subscription** | Đăng ký/đăng nhập Firebase, quản lý phiên làm việc, ứng dụng Flutter iOS/Android, gói đăng ký & thanh toán. |
| **MF-02** | **Upload & AI Document Processing** | Tải lên tài liệu, kiểm tra mã độc/dung lượng, lưu trữ Cloudflare R2, trích xuất text/OCR, tạo tóm tắt tài liệu bằng AI. |
| **MF-03** | **AI Document Chat / RAG** | Hỏi đáp tương tác trên nội dung tài liệu, nhúng vector (embedding), truy xuất ngữ cảnh và phản hồi bằng Gemini AI. |
| **MF-04** | **Community & Document Sharing** | Thư viện cá nhân (Saved Library), chia sẻ tài liệu công khai/nội bộ, tương tác cộng đồng. |
| **MF-05** | **Admin, Moderation & Audit** | Trang quản trị hệ thống, duyệt nội dung vi phạm, nhật ký kiểm toán (audit logs), thống kê và báo cáo. |

---

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### Yêu cầu hệ thống (Prerequisites)
- **Node.js**: Phiên bản `24.18.0` (Quản lý qua `.nvmrc` hoặc `.node-version`)
- **npm**: `11.16.x`
- **Flutter SDK**: Phiên bản 3.44+ (hỗ trợ iOS 15+)
- **PostgreSQL Database** (hoặc Supabase URL)
- **Firebase Project** (Kích hoạt Authentication)
- **Cloudflare R2 Bucket** & **Google Gemini API Key**

---

### 1. Backend (NestJS)

1. Di chuyển vào thư mục backend và chọn Node version:
   ```bash
   cd backend
   nvm use
   ```

2. Cài đặt dependencies:
   ```bash
   npm install
   ```

3. Cấu hình biến môi trường:
   ```bash
   cp .env.example .env
   # Chỉnh sửa file .env với thông tin DB, Firebase, R2, Gemini API
   ```

4. Sinh Prisma Client và chạy migration:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate:dev -- --name init
   ```

5. Khởi chạy server ở chế độ dev:
   ```bash
   npm run start:dev
   ```
   - **API Endpoint**: `http://localhost:3001/api`
   - **Swagger Docs**: `http://localhost:3001/api/docs`
   - **Health Check**: `GET http://localhost:3001/api/health`

---

### 2. Frontend (Next.js / Web)

1. Di chuyển vào thư mục frontend:
   ```bash
   cd frontend
   ```

2. Cài đặt dependencies:
   ```bash
   npm ci
   ```

3. Cấu hình file môi trường:
   ```bash
   cp .env.example .env
   ```

4. Khởi chạy Web Server:
   ```bash
   npm run dev
   ```
   - Giao diện web chạy tại: `http://localhost:3000` (kết nối API tại `http://localhost:3001/api` hoặc `http://localhost:8080/api`).

---

### 3. Mobile (Flutter iOS / Android)

1. Di chuyển vào thư mục mobile:
   ```bash
   cd mobile
   ```

2. Cấu hình `config.json`:
   ```bash
   cp config.example.json config.json
   # Điền FIREBASE_IOS_APP_ID, FIREBASE_ANDROID_APP_ID, GOOGLE_SERVER_CLIENT_ID tương ứng
   ```

3. Lấy dependencies:
   ```bash
   flutter pub get
   ```

4. Chạy trên thiết bị hoặc Simulator:
   ```bash
   flutter run --dart-define-from-file=config.json
   ```

5. Build ứng dụng:
   - **iOS (IPA)**: `flutter build ipa --release --dart-define-from-file=config.json`
   - **Android (APK)**: `flutter build apk --release --dart-define-from-file=config.json`

---

## 🔑 Biến môi trường (Environment Variables)

| Module | File cấu hình mẫu | Biến quan trọng cần lưu ý |
|---|---|---|
| **Backend** | `backend/.env.example` | `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `GEMINI_API_KEY` |
| **Frontend** | `frontend/.env.example` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| **Mobile** | `mobile/config.example.json` | `FIREBASE_IOS_APP_ID`, `FIREBASE_ANDROID_APP_ID`, `FIREBASE_API_KEY`, `BASE_URL` |

---

## 📚 Tài liệu kỹ thuật liên quan

- 📖 [Hướng dẫn tái dựng & chuyển giao theo 5 Main Flow](DocuMind_Team_Reconstruction_Guide.md)
- 🔌 [Backend API Contract v0.3](backend/docs/api-contract-v0.3.md)
- 🧪 [Backend API Testing Guide](backend/docs/api-testing-guide.md)
- 📤 [Document Upload Workflow Integration](backend/docs/upload-workflow-integration-notes.md)
- 📱 [Mobile Feature & Setup Guide](mobile/README.md)
- 💻 [Frontend Setup Guide](frontend/README.md)
