import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:dio/dio.dart';

import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/home/home_shell.dart';

class DocuMindApp extends ConsumerWidget {
  const DocuMindApp({super.key});

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'DocuMind',
      theme: ThemeData(
        colorScheme:
            ColorScheme.fromSeed(
              seedColor: const Color(0xffd97706),
              brightness: Brightness.light,
            ).copyWith(
              primary: const Color(0xff0f172a),
              secondary: const Color(0xffd97706),
              surface: Colors.white,
            ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xfffaf9f6),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xfffaf9f6),
          surfaceTintColor: Colors.transparent,
          foregroundColor: Color(0xff0f172a),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          margin: EdgeInsets.zero,
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xffe2e8f0)),
          ),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: Colors.white,
          indicatorColor: Color(0xfffff7ed),
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: Color(0xff0f172a),
          foregroundColor: Colors.white,
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
          ),
          filled: true,
          fillColor: Colors.white,
        ),
      ),
      builder: (context, child) => GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: child ?? const SizedBox.shrink(),
      ),
      home: auth.when(
        data: (user) => user == null
            ? const LoginScreen()
            : _BackendSessionGate(key: ValueKey(user.uid), firebaseUser: user),
        loading: () =>
            const Scaffold(body: Center(child: CircularProgressIndicator())),
        error: (error, _) =>
            Scaffold(body: Center(child: Text('Lỗi khởi tạo: $error'))),
      ),
    );
  }
}

class _BackendSessionGate extends ConsumerStatefulWidget {
  const _BackendSessionGate({required this.firebaseUser, super.key});
  final User firebaseUser;
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<_BackendSessionGate> createState() =>
      _BackendSessionGateState();
}

class _BackendSessionGateState extends ConsumerState<_BackendSessionGate> {
  late final Future<_BackendSessionState> check = _validateSession();

  // Thực hiện chức năng validate phiên.
  Future<_BackendSessionState> _validateSession() async {
    try {
      await widget.firebaseUser.reload();
      await widget.firebaseUser.getIdToken(true);
      final result = await ref
          .read(apiClientProvider)
          .post('/auth/firebase-login');
      final profile = Map<String, dynamic>.from(result['user'] ?? result);
      final backendUid = profile['firebaseUid']?.toString();
      final backendEmail = profile['email']?.toString().toLowerCase();
      final firebaseEmail = widget.firebaseUser.email?.toLowerCase();
      if ((backendUid != null && backendUid != widget.firebaseUser.uid) ||
          (backendEmail != null &&
              firebaseEmail != null &&
              backendEmail != firebaseEmail)) {
        throw StateError('Phiên đăng nhập không khớp với tài khoản đã chọn.');
      }
      return _BackendSessionState.authenticated;
    } on DioException catch (error) {
      final isGoogleUser = widget.firebaseUser.providerData.any(
        (provider) => provider.providerId == 'google.com',
      );
      final body = error.response?.data;
      final message = body is Map
          ? ((body['error'] is Map ? body['error']['message'] : body['message'])
                    ?.toString() ??
                '')
          : '';
      if (error.response?.statusCode == 403 &&
          isGoogleUser &&
          message.contains('Account registration is required')) {
        return _BackendSessionState.registrationRequired;
      }
      rethrow;
    }
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => FutureBuilder(
    future: check,
    builder: (context, s) {
      if (s.connectionState != ConnectionState.done) {
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      }
      if (s.hasError) {
        Future.microtask(() => ref.read(authControllerProvider).signOut());
        return const LoginScreen();
      }
      if (s.data == _BackendSessionState.registrationRequired) {
        return RegisterScreen(
          googleData: GoogleRegistrationData(
            fullName: widget.firebaseUser.displayName ?? '',
            email: widget.firebaseUser.email ?? '',
          ),
        );
      }
      return const HomeShell();
    },
  );
}

enum _BackendSessionState { authenticated, registrationRequired }
