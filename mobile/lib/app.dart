import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
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
        data: (user) => user == null ? const LoginScreen() : const HomeShell(),
        loading: () =>
            const Scaffold(body: Center(child: CircularProgressIndicator())),
        error: (error, _) =>
            Scaffold(body: Center(child: Text('Lỗi khởi tạo: $error'))),
      ),
    );
  }
}
