# Hướng dẫn test API cho team

Tài liệu này dùng cho backend AI Study Hub. Mục tiêu là giúp backend, frontend
và QA test API theo cùng một cách, đặc biệt là phần Bearer token, response
envelope và các case lỗi thường gặp.

## Tổng quan nhanh

- API base URL local: `http://localhost:3001/api`
- Swagger local: `http://localhost:3001/api/docs`
- Health check: `GET http://localhost:3001/api/health`
- Auth header cho endpoint protected:

```http
Authorization: Bearer <firebaseIdToken>
```

`<firebaseIdToken>` là Firebase ID token lấy từ Firebase Authentication sau khi
user đăng nhập. Backend không cấp JWT riêng và không có backend logout endpoint.
Khi frontend logout thì gọi Firebase `signOut()`.

## Swagger hay Postman dùng lúc nào?

| Công cụ | Nên dùng để làm gì                                                                    | Không nên dùng để làm gì                                 |
| ------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Swagger | Xem DTO, đọc contract, thử nhanh endpoint, kiểm tra endpoint có cần token không       | Quản lý flow test dài, regression test, chia environment |
| Postman | Test theo checklist, lưu biến token, chạy nhiều bước liên tiếp, regression collection | Làm source of truth thay Swagger/OpenAPI                 |

Kết luận: Swagger là tài liệu API chính. Postman là bộ request để team test
thao tác nhanh và regression.

## Chuẩn bị môi trường local

Chạy backend local:

```bash
cd backend
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
npm run start:dev
```

Sau khi chạy, kiểm tra:

```http
GET http://localhost:3001/api/health
```

Nếu `.env` đổi `PORT`, cập nhật lại `baseUrl` trong Postman.

## Bearer token là gì?

Với project này, Bearer token là Firebase ID token. Flow đúng là:

1. User đăng nhập bằng Firebase Client SDK ở frontend.
2. Frontend lấy Firebase ID token hiện tại.
3. Mỗi request protected gửi header `Authorization: Bearer <firebaseIdToken>`.
4. Backend dùng Firebase Admin SDK để verify token.
5. Backend load user trong PostgreSQL theo Firebase UID.
6. User `BLOCKED` hoặc `INACTIVE` nhận `403`.
7. Role và permission lấy từ PostgreSQL, không phụ thuộc Firebase custom claims.

Lưu ý quan trọng:

- Token thường hết hạn sau khoảng 1 giờ. Khi bị `401`, lấy token mới rồi thử lại.
- Không paste token thật vào Jira, GitHub, chat public hoặc screenshot public.
- Header phải có đúng chữ `Bearer`, có một dấu cách, rồi mới tới token.
- `POST /auth/firebase-login` không trả token mới. Endpoint này chỉ verify
  Firebase token và tạo hoặc đồng bộ user local.

## Cách lấy Firebase ID token

### Cách 1: Lấy từ frontend app đang đăng nhập

Đây là cách nên dùng nhất khi frontend đã chạy được login.

Trong frontend, sau khi user đăng nhập thành công, dùng Firebase Client SDK:

```ts
import { getAuth } from 'firebase/auth';

const auth = getAuth();
const user = auth.currentUser;

if (!user) {
  throw new Error('Chưa đăng nhập Firebase');
}

const token = await user.getIdToken(true);
console.log(token);
```

Giải thích:

- `auth.currentUser` là user đang đăng nhập trên browser hiện tại.
- `getIdToken(true)` ép Firebase refresh token mới.
- Copy chuỗi token được in ra console để dùng trong Swagger/Postman.

Nếu frontend đã có service auth riêng, team frontend có thể thêm tạm một nút
hoặc log debug chỉ ở môi trường local để in token. Không commit log token lên
production.

### Cách 2: Lấy từ Chrome DevTools Console

Cách này chỉ dùng được nếu frontend expose Firebase auth ra `window` để debug,
ví dụ `window.firebaseAuth` hoặc `window.auth`.

Mở frontend app, đăng nhập, sau đó mở DevTools Console và thử:

```js
await window.firebaseAuth.currentUser.getIdToken(true);
```

Hoặc nếu app đặt tên là `window.auth`:

```js
await window.auth.currentUser.getIdToken(true);
```

Nếu console báo `Cannot read properties of undefined`, nghĩa là app chưa expose
auth ra `window`. Khi đó dùng Cách 1 hoặc nhờ frontend thêm debug helper local.

### Cách 3: Lấy bằng Firebase REST API cho tài khoản email/password

Cách này phù hợp khi team QA có tài khoản test dạng email/password và không
muốn mở frontend. Firebase project phải bật provider Email/Password.

Chuẩn bị:

- Firebase Web API Key, thường nằm trong frontend config `firebaseConfig.apiKey`.
- Email và password của tài khoản test.

Gửi request:

```http
POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<FIREBASE_WEB_API_KEY>
Content-Type: application/json

{
  "email": "student@example.com",
  "password": "password-test",
  "returnSecureToken": true
}
```

Response thành công có field `idToken`:

```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "email": "student@example.com",
  "refreshToken": "...",
  "expiresIn": "3600",
  "localId": "firebase-uid"
}
```

Copy `idToken`, không copy `refreshToken`, để dùng làm Bearer token.

Ví dụ dùng `curl`:

```bash
curl -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<FIREBASE_WEB_API_KEY>" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"student@example.com\",\"password\":\"password-test\",\"returnSecureToken\":true}"
```

Nếu tài khoản dùng Google login, Facebook login hoặc SSO, cách REST
email/password không áp dụng. Khi đó lấy token từ frontend sau khi đăng nhập.

## Cách nhập token trong Swagger

1. Mở `http://localhost:3001/api/docs`.
2. Bấm nút `Authorize`.
3. Nhập đầy đủ:

```text
Bearer <firebaseIdToken>
```

Ví dụ:

```text
Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...
```

4. Bấm `Authorize`.
5. Bấm `Close`.
6. Mở endpoint protected, bấm `Try it out`.
7. Nhập body, query, path param hoặc file nếu có.
8. Bấm `Execute`.

Nếu response trả `401`, kiểm tra lại:

- Có nhập đủ prefix `Bearer ` chưa.
- Token có bị copy thiếu ký tự không.
- Token có hết hạn không.
- Token có đúng Firebase project với backend `.env` không.

## Cách nhập token trong Postman

Import các file:

- Collection: `backend/docs/postman/ai-study-hub-api.postman_collection.json`
- Environment: `backend/docs/postman/ai-study-hub-local.postman_environment.json`

Sau khi import:

1. Chọn environment `AI Study Hub Local`.
2. Kiểm tra biến `baseUrl = http://localhost:3001/api`.
3. Lấy Firebase ID token theo một trong các cách ở trên.
4. Mở Environment, dán token vào biến `firebaseIdToken`.
5. Lưu environment.
6. Chạy `Health / GET health` để kiểm tra backend còn sống.
7. Chạy `Auth / POST firebase-login` để đồng bộ user local.
8. Chạy `Auth / GET auth me` hoặc request protected khác.

Collection đã cấu hình Authorization kiểu Bearer token dùng biến:

```text
{{firebaseIdToken}}
```

Vì vậy không cần tự thêm header thủ công ở từng request nếu request đang
inherit auth từ collection/folder.

Nếu muốn kiểm tra thủ công, header đúng là:

```http
Authorization: Bearer {{firebaseIdToken}}
```

## Flow test auth cơ bản

Chạy theo thứ tự này khi bắt đầu test:

1. `GET /health` không token, kỳ vọng `200`.
2. `GET /subjects` không token, kỳ vọng `200` nếu endpoint public.
3. `GET /categories` không token, kỳ vọng `200` nếu endpoint public.
4. `GET /tags` không token, kỳ vọng `200` nếu endpoint public.
5. `GET /auth/me` không token, kỳ vọng `401`.
6. Lấy Firebase ID token hợp lệ.
7. `POST /auth/firebase-login` có token, kỳ vọng `200`.
8. `GET /auth/me` có token, kỳ vọng `200`.
9. `GET /users/profile` có token, kỳ vọng `200`.

Nếu bước 7 trả `403`, token hợp lệ nhưng user local có thể đang `BLOCKED` hoặc
`INACTIVE`.

## Checklist cho mỗi endpoint

Mỗi endpoint cần được test ít nhất các nhóm case sau:

| Nhóm case   | Cần test                                                          |
| ----------- | ----------------------------------------------------------------- |
| Success     | Status đúng, data đúng field, response có `success: true`         |
| Validation  | Thiếu required field, sai type, sai UUID, vượt length             |
| Auth        | Thiếu token trả `401`, token sai hoặc hết hạn trả `401`           |
| Permission  | User không có quyền trả `403`                                     |
| Not found   | ID không tồn tại hoặc bị ẩn đúng rule trả `404`                   |
| Conflict    | Trạng thái không hợp lệ trả `409` nếu endpoint có domain conflict |
| Pagination  | `page`, `limit`, empty result, sort/filter nếu là endpoint list   |
| File upload | Sai file type, file quá lớn, thiếu file, upload thành công        |

Response lỗi phải theo envelope:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed"
  },
  "timestamp": "2026-06-15T03:00:00.000Z",
  "path": "/api/documents",
  "requestId": "request-123"
}
```

Response thành công phải theo envelope:

```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-06-15T03:00:00.000Z"
}
```

Riêng `204 No Content` không có body.

## Flow test documents

1. `GET /documents` không token, kỳ vọng `401`.
2. `GET /documents` có token, kỳ vọng `200`.
3. `POST /documents` thiếu file, kỳ vọng `400`.
4. `POST /documents` với file sai type, kỳ vọng `400` hoặc `415` tùy rule hiện tại.
5. `POST /documents` với file hợp lệ và metadata hợp lệ, kỳ vọng `201`.
6. Lưu `documentId` từ response vào biến Postman `documentId`.
7. `GET /documents/:id`, kỳ vọng `200`.
8. `PUT /documents/:id`, kỳ vọng `200`.
9. `GET /documents/:id/preview`, kỳ vọng `200` và có `url`.
10. `GET /documents/:id/download`, kỳ vọng `200` và có `url`.
11. `DELETE /documents/:id`, kỳ vọng `204` và body rỗng.

Với upload multipart trong Postman:

1. Chọn tab `Body`.
2. Chọn `form-data`.
3. Thêm key `file`, đổi type từ `Text` sang `File`, chọn file PDF/DOCX/PPTX/XLSX.
4. Thêm các key text như `title`, `description`, `subjectId`, `categoryId`,
   `visibility`, `tags`.
5. Không tự set `Content-Type`; để Postman tự tạo boundary multipart.

## Bảng lỗi auth thường gặp

| Hiện tượng                         | Nguyên nhân hay gặp                                                   | Cách xử lý                                   |
| ---------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `401` thiếu token                  | Request không có header `Authorization`                               | Nhập token trong Swagger/Postman environment |
| `401` invalid token                | Copy thiếu token, dùng nhầm refresh token, token sai Firebase project | Lấy lại `idToken`, kiểm tra Firebase config  |
| `401` expired token                | Token cũ quá lâu                                                      | Gọi `getIdToken(true)` để lấy token mới      |
| `403` sau khi token hợp lệ         | User local bị `BLOCKED`, `INACTIVE` hoặc thiếu role                   | Kiểm tra user trong database và role yêu cầu |
| Swagger vẫn `401` dù đã nhập token | Nhập thiếu chữ `Bearer` hoặc quên bấm `Authorize`                     | Nhập lại `Bearer <token>` và authorize       |
| Postman vẫn `401`                  | Chưa chọn đúng environment hoặc chưa save biến                        | Chọn `AI Study Hub Local`, save environment  |

## Quy ước khi báo bug API

Khi QA/dev báo bug API, bắt buộc kèm:

- Endpoint và method.
- Environment: local, dev, staging hoặc production.
- Request body/query/path param đã dùng.
- Header auth có dùng Bearer token hay không. Không paste token thật vào ticket.
- Expected status/response.
- Actual status/response.
- `x-request-id` trong response header hoặc `requestId` trong error body nếu có.
- Ảnh chụp Swagger/Postman hoặc Postman console log.

Mẫu report ngắn:

```text
Endpoint: POST /api/documents
Env: local
Expected: 201, success=true
Actual: 400, VALIDATION_ERROR
Request ID: request-123
Note: Gửi file PDF hợp lệ nhưng subjectId bị báo invalid
```

## Khi nào cần cập nhật guide/collection?

Cập nhật tài liệu và Postman collection trong cùng PR khi:

- Thêm endpoint mới.
- Đổi request DTO hoặc response DTO.
- Đổi auth/permission.
- Đổi status code.
- Đổi response envelope.
- Thêm flow quan trọng cần QA regression.

Swagger, contract docs và Postman collection phải khớp nhau trước khi merge.
