import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../admin/admin_screen.dart';
import '../auth/auth_controller.dart';
import '../chat/chat_screen.dart';
import '../community/community_hub_screen.dart';
import '../documents/documents_screen.dart';
import '../profile/profile_screen.dart';

final currentProfileProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) async {
    final result = await ref.watch(apiClientProvider).get('/auth/me');
    return Map<String, dynamic>.from(result['user'] ?? result);
  },
);

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int index = 0;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final isAdmin = ref.watch(currentProfileProvider).value?['role'] == 'ADMIN';
    final pages = <Widget>[
      DashboardScreen(onOpen: (value) => setState(() => index = value)),
      const CommunityHubScreen(),
      const ChatScreen(),
      const ProfileScreen(),
      if (isAdmin) const AdminScreen(),
    ];
    final titles = [
      'Tổng quan',
      'Tài liệu',
      'Hỏi AI',
      'Hồ sơ',
      if (isAdmin) 'Quản trị',
    ];
    if (index >= pages.length) index = 0;
    return GestureDetector(
      onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
      child: Scaffold(
        appBar: AppBar(
          title: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.network(
                  'https://documind.icu/Logo.png',
                  width: 34,
                  height: 34,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const Icon(
                    Icons.auto_stories_rounded,
                    color: Color(0xffd97706),
                    size: 30,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                index == 0 ? 'DocuMind' : titles[index],
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ],
          ),
        ),
        body: IndexedStack(index: index, children: pages),
        bottomNavigationBar: NavigationBar(
          selectedIndex: index,
          onDestinationSelected: (value) {
            FocusManager.instance.primaryFocus?.unfocus();
            setState(() => index = value);
          },
          destinations: [
            const NavigationDestination(
              icon: Icon(Icons.space_dashboard_outlined),
              selectedIcon: Icon(Icons.space_dashboard_rounded),
              label: 'Tổng quan',
            ),
            const NavigationDestination(
              icon: Icon(Icons.library_books_outlined),
              selectedIcon: Icon(Icons.library_books_rounded),
              label: 'Tài liệu',
            ),
            const NavigationDestination(
              icon: Icon(Icons.auto_awesome_outlined),
              selectedIcon: Icon(Icons.auto_awesome_rounded),
              label: 'Hỏi AI',
            ),
            const NavigationDestination(
              icon: Icon(Icons.person_outline_rounded),
              selectedIcon: Icon(Icons.person_rounded),
              label: 'Hồ sơ',
            ),
            if (isAdmin)
              const NavigationDestination(
                icon: Icon(Icons.admin_panel_settings_outlined),
                selectedIcon: Icon(Icons.admin_panel_settings_rounded),
                label: 'Quản trị',
              ),
          ],
        ),
      ),
    );
  }
}

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({required this.onOpen, super.key});
  final ValueChanged<int> onOpen;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final docs = ref.watch(documentsProvider).value ?? const [];
    final ready = docs
        .where((item) => ['COMPLETED', 'MOCKED'].contains(item['aiStatus']))
        .length;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          'KHÔNG GIAN HỌC TẬP AI',
          style: TextStyle(
            color: Color(0xffd97706),
            letterSpacing: 1.2,
            fontWeight: FontWeight.w800,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 10),
        const Text(
          'Hôm nay bạn muốn tìm hiểu điều gì?',
          style: TextStyle(
            fontFamily: 'Georgia',
            fontSize: 32,
            height: 1.08,
            fontWeight: FontWeight.w700,
            color: Color(0xff0f172a),
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'Tìm kiếm nguồn tài liệu hoặc đặt câu hỏi trên toàn bộ thư viện của bạn.',
          style: TextStyle(color: Color(0xff475569), fontSize: 16),
        ),
        const SizedBox(height: 24),
        InkWell(
          onTap: () => onOpen(2),
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xffcbd5e1)),
            ),
            child: const Row(
              children: [
                Icon(Icons.auto_awesome_rounded, color: Color(0xffd97706)),
                SizedBox(width: 12),
                Expanded(
                  child: Text('Hỏi bất kỳ điều gì từ tài liệu học tập...'),
                ),
                CircleAvatar(
                  backgroundColor: Color(0xff0f172a),
                  child: Icon(Icons.arrow_forward_rounded, color: Colors.white),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 26),
        Row(
          children: [
            Expanded(
              child: _Metric(value: '${docs.length}', label: 'Tài liệu'),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _Metric(value: '$ready', label: 'AI sẵn sàng'),
            ),
          ],
        ),
        const SizedBox(height: 26),
        const Text(
          'TÍNH NĂNG NỔI BẬT',
          style: TextStyle(
            color: Color(0xffd97706),
            letterSpacing: 1.1,
            fontWeight: FontWeight.w800,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 12),
        _ActionCard(
          icon: Icons.upload_file_rounded,
          title: 'Tải tài liệu',
          subtitle: 'Thêm PDF, DOCX, PPTX hoặc XLSX',
          onTap: () => DocumentsScreen.openUpload(context, ref),
        ),
        const SizedBox(height: 10),
        _ActionCard(
          icon: Icons.auto_awesome_rounded,
          title: 'Hỏi AI có nguồn',
          subtitle: 'Chọn tài liệu hoặc hỏi toàn thư viện',
          onTap: () => onOpen(2),
        ),
        const SizedBox(height: 10),
        _ActionCard(
          icon: Icons.library_books_rounded,
          title: 'Mở thư viện',
          subtitle: 'Quản lý tài liệu và trạng thái xử lý',
          onTap: () => onOpen(1),
        ),
      ],
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.value, required this.label});
  final String value;
  final String label;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
          ),
          Text(label, style: const TextStyle(color: Color(0xff64748b))),
        ],
      ),
    ),
  );
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      onTap: onTap,
      contentPadding: const EdgeInsets.all(14),
      leading: CircleAvatar(
        backgroundColor: const Color(0xfffff7ed),
        child: Icon(icon, color: const Color(0xffd97706)),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.arrow_forward_rounded),
    ),
  );
}
