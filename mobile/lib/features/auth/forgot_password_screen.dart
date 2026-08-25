import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_controller.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({this.initialEmail = '', super.key});
  final String initialEmail;
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<ForgotPasswordScreen> createState() => _State();
}

class _State extends ConsumerState<ForgotPasswordScreen> {
  late final email = TextEditingController(text: widget.initialEmail);
  bool loading = false;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: IconButton(
        onPressed: loading ? null : () => Navigator.of(context).pop(),
        icon: const Icon(Icons.arrow_back),
        tooltip: 'Quay lại đăng nhập',
      ),
      title: const Text('Quên mật khẩu'),
    ),
    body: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'KHÔI PHỤC TÀI KHOẢN',
            style: TextStyle(
              color: Color(0xffd97706),
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 12),
          const Text(
            'Nhận liên kết đặt lại mật khẩu qua email.',
            style: TextStyle(fontSize: 18),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: loading
                ? null
                : () async {
                    setState(() => loading = true);
                    await ref
                        .read(authControllerProvider)
                        .forgotPassword(email.text);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Đã gửi email đặt lại mật khẩu.'),
                        ),
                      );
                      Navigator.pop(context);
                    }
                  },
            child: const Padding(
              padding: EdgeInsets.all(14),
              child: Text('Gửi liên kết'),
            ),
          ),
        ],
      ),
    ),
  );
}
