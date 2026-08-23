import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'app.dart';
import 'core/firebase_options.dart';

// Thực hiện chức năng main.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Object? startupError;
  String versionLabel = '';
  try {
    final packageInfo = await PackageInfo.fromPlatform();
    versionLabel = packageInfo.version.isNotEmpty
        ? 'v${packageInfo.version}'
        : 'v1.0.4';
  } catch (_) {
    versionLabel = 'v1.0.4';
  }
  try {
    await Firebase.initializeApp(
      options: DocuMindFirebaseOptions.currentPlatform,
    );
  } catch (error) {
    startupError = error;
  }

  runApp(
    ProviderScope(
      child: startupError == null
          ? _SplashBootstrap(versionLabel: versionLabel)
          : FirebaseSetupRequiredApp(error: startupError),
    ),
  );
}

class _SplashBootstrap extends StatefulWidget {
  const _SplashBootstrap({required this.versionLabel});

  final String versionLabel;
  // Tạo state quản lý vòng đời của widget.
  @override
  State<_SplashBootstrap> createState() => _SplashBootstrapState();
}

class _SplashBootstrapState extends State<_SplashBootstrap> {
  double progress = 0;
  bool done = false;
  // Khởi tạo state và tài nguyên ban đầu.
  @override
  void initState() {
    super.initState();
    Future.doWhile(() async {
      await Future<void>.delayed(const Duration(milliseconds: 90));
      if (!mounted) return false;
      setState(() => progress = (progress + .08).clamp(0, 1));
      if (progress >= 1) {
        await Future<void>.delayed(const Duration(milliseconds: 180));
        if (mounted) setState(() => done = true);
        return false;
      }
      return true;
    });
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => done
      ? const DocuMindApp()
      : MaterialApp(
          debugShowCheckedModeBanner: false,
          home: Scaffold(
            backgroundColor: const Color(0xfffaf9f6),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.network(
                      'https://documind.icu/Logo.png',
                      width: 112,
                      height: 112,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.auto_stories_rounded,
                        size: 92,
                        color: Color(0xffd97706),
                      ),
                    ),
                    const SizedBox(height: 22),
                    const Text(
                      'DocuMind',
                      style: TextStyle(
                        fontFamily: 'Georgia',
                        fontSize: 30,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    if (widget.versionLabel.isNotEmpty)
                      Text(
                        widget.versionLabel,
                        style: const TextStyle(color: Color(0xff64748b)),
                      ),
                    const SizedBox(height: 24),
                    LinearProgressIndicator(
                      value: progress,
                      color: const Color(0xffd97706),
                      backgroundColor: const Color(0xffe2e8f0),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${(progress * 100).round()}%',
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xff64748b),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
}

class FirebaseSetupRequiredApp extends StatelessWidget {
  const FirebaseSetupRequiredApp({required this.error, super.key});

  final Object error;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff3156d3)),
      useMaterial3: true,
    ),
    home: Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.settings_suggest_outlined,
                    size: 72,
                    color: Color(0xff3156d3),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'DocuMind cần cấu hình Firebase',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Bản build này chưa đọc được cấu hình Firebase cho thiết bị hiện tại. Hãy build lại với file config.json.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 18),
                  SelectableText(
                    error.toString(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
