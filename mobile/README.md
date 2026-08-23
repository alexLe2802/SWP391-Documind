# DocuMind Mobile (Flutter)

Ứng dụng Flutter iOS/Android dùng chung backend NestJS và Firebase Authentication với
phiên bản web. Đây là ứng dụng Flutter native, không phải WebView.

## Kiến trúc

- `lib/core`: Firebase options và REST client có Bearer token.
- `lib/features/auth`: đăng nhập Firebase và đồng bộ tài khoản backend.
- `lib/features/home`: dashboard và điều hướng mobile.
- `lib/features/documents`: danh sách/chọn tài liệu tải lên.
- `lib/features/chat`: hỏi đáp AI trên thư viện.
- `lib/features/profile`: tài khoản và đăng xuất.

## Cấu hình

Sao chép file mẫu (file thật đã được Git ignore):

```bash
cp config.example.json config.json
```

Điền Firebase iOS App ID lấy từ Firebase Console. Các giá trị Firebase client
không phải server secret; tuyệt đối không đưa Firebase Admin private key,
DATABASE_URL, R2 secret hoặc Gemini key vào ứng dụng.

Bundle ID iOS hiện tại là `icu.documind.mobile`. Hãy đăng ký đúng Bundle ID này
trong Firebase Console, tải `GoogleService-Info.plist` nếu cần dùng thêm plugin
native, và thêm iOS app vào cùng Firebase project của phiên bản web.

Trong Firebase Console: Project settings → Your apps → Add app → iOS → nhập
`icu.documind.mobile`. Sao chép giá trị `GOOGLE_APP_ID` trong file tải về vào
`FIREBASE_IOS_APP_ID` của `config.json`; các giá trị còn lại có thể đối chiếu
với `frontend/fe.env`. Không dùng `NEXT_PUBLIC_FIREBASE_APP_ID` của web cho
`FIREBASE_IOS_APP_ID`.

Với Android, thêm app có package `icu.documind.mobile` trong cùng Firebase
project, rồi điền `mobilesdk_app_id` vào `FIREBASE_ANDROID_APP_ID`. Đăng ký SHA-1
và SHA-256 của khóa ký nếu dùng Google Sign-In.
Điền API key trong Android `google-services.json` vào
`FIREBASE_ANDROID_API_KEY`.
Điền OAuth 2.0 Web client ID của cùng Firebase project vào
`GOOGLE_SERVER_CLIENT_ID`. Android không dùng Firebase iOS App ID làm giá trị
dự phòng; build thiếu Android App ID sẽ dừng sớm để tránh phát hành APK có
Google Sign-In bị lỗi cấu hình.

Để chạy trên Chrome, điền thêm `FIREBASE_WEB_APP_ID`,
`FIREBASE_AUTH_DOMAIN` và `GOOGLE_WEB_CLIENT_ID`, rồi vẫn chạy bằng
`--dart-define-from-file=config.json`.

## Chạy trên iPhone

Flutter SDK cục bộ nằm trong `.tools/` và không được commit:

```bash
cd /Users/alexxxx/Desktop/Documind/mobile
../.tools/flutter-sdk/flutter/bin/flutter pub get
../.tools/flutter-sdk/flutter/bin/flutter run \
  --dart-define-from-file=config.json
```

Kết nối iPhone 15 Pro, bật Developer Mode, rồi chọn thiết bị khi Flutter hỏi.

### Giữ minimum iOS 15 sau `flutter pub get`

Flutter 3.44 có thể tái sinh `FlutterGeneratedPluginSwiftPackage` với iOS 13 dù
Runner đã đặt iOS 15. Flutter SDK cục bộ của dự án đã được vá cho iOS 15. Nếu
sau này thay mới hoặc nâng cấp thư mục `.tools/flutter-sdk`, chạy lại:

```bash
./tool/ensure_flutter_ios_15.sh
../.tools/flutter-sdk/flutter/bin/flutter pub get
../.tools/flutter-sdk/flutter/bin/flutter build ios --config-only \
  --dart-define-from-file=config.json
```

Không sửa trực tiếp các `Package.swift` trong `ios/Flutter/ephemeral` vì chúng
được tạo lại tự động.

## Build và xuất IPA

```bash
../.tools/flutter-sdk/flutter/bin/flutter build ipa \
  --release \
  --dart-define-from-file=config.json
```

Nếu cần điều chỉnh signing, mở:

```bash
open ios/Runner.xcworkspace
```

Trong Xcode chọn target Runner → Signing & Capabilities → Team, sau đó Product
→ Archive → Distribute App. Với tài khoản Apple miễn phí, nên cài lại ngay trước
buổi bảo vệ vì provisioning cá nhân hết hạn sau 7 ngày.

## Build Android APK

```bash
../.tools/flutter-sdk/flutter/bin/flutter build apk \
  --release \
  --dart-define-from-file=config.json
```

APK được tạo tại `build/app/outputs/flutter-apk/app-release.apk`. Bản mẫu đang
dùng debug signing để có thể cài trực tiếp; hãy cấu hình release keystore riêng
nếu phát hành qua Google Play.

## Kiểm tra chất lượng

```bash
../.tools/flutter-sdk/flutter/bin/flutter analyze
../.tools/flutter-sdk/flutter/bin/flutter test
```
