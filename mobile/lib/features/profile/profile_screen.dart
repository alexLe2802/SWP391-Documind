import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../auth/auth_controller.dart';
import '../home/home_shell.dart';
import '../subscription/subscription_screen.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final name = TextEditingController();
  bool initialized = false;
  bool saving = false;

  // Thực hiện chức năng pick avatar.
  Future<void> pickAvatar() async {
    final image = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1200,
    );
    if (image == null) return;
    setState(() => saving = true);
    try {
      final bytes = await image.readAsBytes();
      final formData = FormData.fromMap({
        'file': MultipartFile.fromBytes(
          bytes,
          filename: image.name.isNotEmpty ? image.name : 'avatar.jpg',
        ),
      });

      await ref.read(apiClientProvider).post(
        '/users/avatar',
        data: formData,
      );
      ref.invalidate(currentProfileProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã cập nhật ảnh đại diện')),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Không thể đổi ảnh: $error')));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  // Tạo hoặc lưu save.
  Future<void> save() async {
    if (name.text.trim().isEmpty) return;
    setState(() => saving = true);
    try {
      await ref
          .read(apiClientProvider)
          .patch('/users/profile', data: {'fullName': name.text.trim()});
      ref.invalidate(currentProfileProvider);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Đã lưu hồ sơ')));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(currentProfileProvider);
    final subscription = ref.watch(subscriptionProvider);
    return profile.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Không thể tải hồ sơ: $e')),
      data: (data) {
        if (!initialized) {
          name.text = data['fullName']?.toString() ?? '';
          initialized = true;
        }
        final avatar = data['avatarUrl']?.toString();
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'HỒ SƠ CÁ NHÂN',
              style: TextStyle(
                color: Color(0xffd97706),
                letterSpacing: 1.1,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Thông tin của bạn',
              style: TextStyle(
                fontFamily: 'Georgia',
                fontSize: 30,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 24),
            Center(
              child: Stack(
                children: [
                  CircleAvatar(
                    radius: 54,
                    backgroundImage: avatar != null && avatar.isNotEmpty
                        ? NetworkImage(avatar)
                        : null,
                    child: avatar == null || avatar.isEmpty
                        ? Text(
                            name.text.isEmpty
                                ? 'D'
                                : name.text[0].toUpperCase(),
                            style: const TextStyle(fontSize: 34),
                          )
                        : null,
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: IconButton.filled(
                      onPressed: saving ? null : pickAvatar,
                      icon: const Icon(Icons.photo_camera_outlined),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            TextField(
              controller: name,
              decoration: const InputDecoration(
                labelText: 'Họ và tên',
                prefixIcon: Icon(Icons.person_outline_rounded),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: TextEditingController(
                text: data['email']?.toString() ?? '',
              ),
              readOnly: true,
              enableInteractiveSelection: false,
              decoration: const InputDecoration(
                labelText: 'Email',
                prefixIcon: Icon(Icons.mail_outline_rounded),
                suffixIcon: Icon(Icons.lock_outline_rounded),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _Info(
                    label: 'Vai trò',
                    value: data['role']?.toString() ?? 'USER',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Info(
                    label: 'Trạng thái',
                    value: data['status']?.toString() ?? 'ACTIVE',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 22),
            const Text(
              'GÓI DỊCH VỤ',
              style: TextStyle(
                color: Color(0xffd97706),
                letterSpacing: 1.1,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
            const SizedBox(height: 10),
            Card(
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const SubscriptionScreen(),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      const CircleAvatar(
                        backgroundColor: Color(0xfffff7ed),
                        foregroundColor: Color(0xffd97706),
                        child: Icon(Icons.workspace_premium_outlined),
                      ),
                      const SizedBox(width: 13),
                      Expanded(
                        child: subscription.when(
                          loading: () => const Text('Đang tải gói hiện tại...'),
                          error: (_, _) => const Text('Quản lý gói dịch vụ'),
                          data: (value) {
                            final current = Map<String, dynamic>.from(
                              value['current'] as Map,
                            );
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Gói ${current['plan'] ?? 'FREE'}',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 16,
                                  ),
                                ),
                                Text(
                                  'Còn ${current['uploadsRemaining'] ?? 0} tài liệu · ${current['aiChatsRemaining'] ?? '∞'} lượt AI',
                                  style: const TextStyle(
                                    color: Color(0xff64748b),
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: saving ? null : save,
              icon: const Icon(Icons.save_outlined),
              label: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(saving ? 'Đang lưu...' : 'Lưu thay đổi'),
              ),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => ref.read(authControllerProvider).signOut(),
              icon: const Icon(Icons.logout_rounded),
              label: const Padding(
                padding: EdgeInsets.all(14),
                child: Text('Đăng xuất'),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Info extends StatelessWidget {
  const _Info({required this.label, required this.value});
  final String label;
  final String value;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Color(0xff64748b), fontSize: 12),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      ),
    ),
  );
}
