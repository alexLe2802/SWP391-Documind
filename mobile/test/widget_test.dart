import 'package:documind_mobile/features/auth/login_screen.dart';
import 'package:documind_mobile/features/auth/auth_controller.dart';
import 'package:documind_mobile/features/auth/register_screen.dart';
import 'package:documind_mobile/features/documents/documents_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows the DocuMind sign-in form', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: LoginScreen())),
    );
    expect(find.text('DocuMind'), findsOneWidget);
    expect(find.text('Đăng nhập'), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(2));
    expect(find.byType(GoogleLogo), findsOneWidget);
  });

  testWidgets('opens native registration from the sign-in form', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: LoginScreen())),
    );

    final registrationLink = find.text('Chưa có tài khoản? Đăng ký');
    await tester.ensureVisible(registrationLink);
    await tester.pumpAndSettle();
    await tester.tap(registrationLink);
    await tester.pumpAndSettle();

    expect(find.byType(RegisterScreen), findsOneWidget);
    expect(find.text('Bắt đầu cùng DocuMind'), findsOneWidget);
    expect(find.byTooltip('Quay lại đăng nhập'), findsOneWidget);
  });

  test('AI sources combine owned and saved community documents once', () {
    final result = mergeAiSourceDocuments(
      [
        {'id': 'owned', 'title': 'Owned'},
        {'id': 'same', 'title': 'Owned version'},
      ],
      [
        {'id': 'saved', 'title': 'Saved'},
        {'id': 'same', 'title': 'Saved version'},
      ],
    );

    expect(result.map((item) => item['id']), ['owned', 'same', 'saved']);
    expect(result[1]['isCommunitySaved'], isTrue);
    expect(result[2]['isCommunitySaved'], isTrue);
  });

  testWidgets('Google registration stays in app and requires terms', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: RegisterScreen(
            googleData: GoogleRegistrationData(
              fullName: 'Google User',
              email: 'google@example.com',
            ),
          ),
        ),
      ),
    );

    expect(
      find.text('Hoàn tất thông tin để tạo tài khoản DocuMind.'),
      findsOneWidget,
    );
    expect(find.text('google@example.com'), findsOneWidget);
    expect(find.text('Mật khẩu'), findsOneWidget);
    expect(find.text('Xác nhận mật khẩu'), findsOneWidget);
    expect(find.byType(CheckboxListTile), findsOneWidget);
  });

  testWidgets('Google registration validates password before creating user', (
    tester,
  ) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: RegisterScreen(
            googleData: GoogleRegistrationData(
              fullName: 'Google User',
              email: 'google@example.com',
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.byType(CheckboxListTile));
    await tester.tap(find.widgetWithText(FilledButton, 'Đăng ký'));
    await tester.pump();

    expect(find.text('Mật khẩu phải có ít nhất 8 ký tự.'), findsOneWidget);
  });
}
