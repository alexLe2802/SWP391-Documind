import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_controller.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({this.googleData, super.key});
  final GoogleRegistrationData? googleData;
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  late final name = TextEditingController(
        text: widget.googleData?.fullName ?? '',
      ),
      email = TextEditingController(text: widget.googleData?.email ?? ''),
      password = TextEditingController(),
      confirm = TextEditingController();
  bool accepted = false, loading = false;
  String? error;

  // Thực hiện chức năng back to đăng nhập.
  Future<void> backToLogin() async {
    FocusManager.instance.primaryFocus?.unfocus();
    if (widget.googleData != null) {
      await ref.read(authControllerProvider).signOut();
    }
    if (mounted && Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  // Thực hiện chức năng submit.
  Future<void> submit() async {
    if (!accepted) {
      setState(
        () => error =
            'Bạn cần đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.',
      );
      return;
    }
    if (password.text.length < 8) {
      setState(() => error = 'Mật khẩu phải có ít nhất 8 ký tự.');
      return;
    }
    if (password.text != confirm.text) {
      setState(() => error = 'Mật khẩu xác nhận không khớp.');
      return;
    }
    setState(() {
      loading = true;
      error = null;
    });
    try {
      if (widget.googleData != null) {
        await ref
            .read(authControllerProvider)
            .registerGoogle(name.text, email.text, password.text);
      } else {
        await ref
            .read(authControllerProvider)
            .register(name.text, email.text, password.text);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              widget.googleData == null
                  ? 'Đăng ký thành công. Hãy kiểm tra email xác thực.'
                  : 'Đăng ký thành công. Hãy kiểm tra email để kích hoạt tài khoản.',
            ),
          ),
        );
        if (widget.googleData == null) Navigator.pop(context);
      }
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: IconButton(
        onPressed: loading ? null : backToLogin,
        icon: const Icon(Icons.arrow_back),
        tooltip: 'Quay lại đăng nhập',
      ),
      title: const Text('Đăng ký'),
    ),
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'TẠO TÀI KHOẢN',
              style: TextStyle(
                color: Color(0xffd97706),
                fontWeight: FontWeight.w800,
                letterSpacing: 1.1,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Bắt đầu cùng DocuMind',
              style: TextStyle(
                fontFamily: 'Georgia',
                fontSize: 30,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (widget.googleData != null) ...[
              const SizedBox(height: 8),
              const Text(
                'Hoàn tất thông tin để tạo tài khoản DocuMind.',
                style: TextStyle(color: Color(0xff64748b)),
              ),
            ],
            const SizedBox(height: 24),
            TextField(
              controller: name,
              decoration: const InputDecoration(labelText: 'Họ và tên'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: email,
              readOnly: widget.googleData != null,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: password,
              obscureText: true,
              enableSuggestions: false,
              autocorrect: false,
              autofillHints: const [AutofillHints.newPassword],
              decoration: const InputDecoration(
                labelText: 'Mật khẩu',
                helperText: 'Ít nhất 8 ký tự',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: confirm,
              obscureText: true,
              enableSuggestions: false,
              autocorrect: false,
              autofillHints: const [AutofillHints.newPassword],
              decoration: const InputDecoration(labelText: 'Xác nhận mật khẩu'),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: accepted,
              onChanged: (v) => setState(() => accepted = v ?? false),
              title: const Text(
                'Tôi đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.',
              ),
            ),
            if (error != null)
              Text(error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: loading ? null : submit,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(loading ? 'Đang đăng ký...' : 'Đăng ký'),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
