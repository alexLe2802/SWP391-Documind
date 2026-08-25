import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_controller.dart';
import 'forgot_password_screen.dart';
import 'register_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool loading = false;
  String? error;

  // Thực hiện chức năng submit.
  Future<void> submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await ref.read(authControllerProvider).signIn(email.text, password.text);
    } catch (e) {
      setState(
        () =>
            error = 'Đăng nhập thất bại. Kiểm tra email, mật khẩu và kết nối.',
      );
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  // Thực hiện chức năng google sign in.
  Future<void> googleSignIn() async {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final pending = await ref.read(authControllerProvider).signInWithGoogle();
      if (pending != null && mounted) {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => RegisterScreen(googleData: pending),
          ),
        );
      }
    } catch (signInError) {
      setState(() => error = _googleSignInErrorMessage(signInError));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Image.network(
                    'https://documind.icu/Logo.png',
                    width: 88,
                    height: 88,
                    errorBuilder: (_, _, _) => const Icon(
                      Icons.auto_stories_rounded,
                      size: 72,
                      color: Color(0xffd97706),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  'DocuMind',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Text(
                  'Không gian học tập và tài liệu thông minh',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 36),
                TextField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Mật khẩu',
                    prefixIcon: Icon(Icons.lock_outline),
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) =>
                            ForgotPasswordScreen(initialEmail: email.text),
                      ),
                    ),
                    child: const Text('Quên mật khẩu?'),
                  ),
                ),
                if (error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(
                      error!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                const SizedBox(height: 18),
                FilledButton(
                  onPressed: loading ? null : submit,
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: loading
                        ? const SizedBox.square(
                            dimension: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Đăng nhập'),
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Row(
                    children: [
                      Expanded(child: Divider()),
                      Padding(
                        padding: EdgeInsets.symmetric(horizontal: 12),
                        child: Text('HOẶC'),
                      ),
                      Expanded(child: Divider()),
                    ],
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: loading ? null : googleSignIn,
                  icon: const GoogleLogo(size: 22),
                  label: const Padding(
                    padding: EdgeInsets.all(13),
                    child: Text('Tiếp tục với Google'),
                  ),
                ),
                const SizedBox(height: 10),
                TextButton(
                  onPressed: loading
                      ? null
                      : () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const RegisterScreen(),
                          ),
                        ),
                  child: const Text('Chưa có tài khoản? Đăng ký'),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

// Thực hiện chức năng google sign in lỗi tin nhắn.
String _googleSignInErrorMessage(Object error) {
  final detail = error.toString().toLowerCase();
  if (detail.contains('configuration') ||
      detail.contains('developer_error') ||
      detail.contains('10:')) {
    return 'Google Sign-In chưa được cấu hình đúng cho ứng dụng này.';
  }
  if (detail.contains('canceled') || detail.contains('cancelled')) {
    return 'Bạn đã hủy đăng nhập bằng Google.';
  }
  return 'Không thể đăng nhập bằng Google. Vui lòng thử lại.';
}

class GoogleLogo extends StatelessWidget {
  const GoogleLogo({this.size = 22, super.key});

  final double size;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: _GoogleLogoPainter());
}

class _GoogleLogoPainter extends CustomPainter {
  // Thực hiện chức năng paint.
  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * .2;
    final rect = Rect.fromLTWH(
      stroke / 2,
      stroke / 2,
      size.width - stroke,
      size.height - stroke,
    );
    // Thực hiện chức năng arc.
    void arc(Color color, double start, double sweep) => canvas.drawArc(
      rect,
      start,
      sweep,
      false,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.butt,
    );

    arc(const Color(0xff4285f4), -.12, 1.45);
    arc(const Color(0xff34a853), 1.33, 1.28);
    arc(const Color(0xfffbbc05), 2.61, .88);
    arc(const Color(0xffea4335), 3.49, 1.76);
    canvas.drawRect(
      Rect.fromLTWH(
        size.width * .51,
        size.height * .45,
        size.width * .45,
        stroke,
      ),
      Paint()..color = const Color(0xff4285f4),
    );
  }

  // Kiểm tra điều kiện repaint.
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
