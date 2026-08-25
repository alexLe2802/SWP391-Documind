import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';

final adminSummaryProvider = FutureProvider<Map<String, dynamic>>(
  (ref) async => Map<String, dynamic>.from(
    await ref.watch(apiClientProvider).get('/admin/dashboard/summary'),
  ),
);

class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => const DefaultTabController(
    length: 3,
    child: Column(
      children: [
        TabBar(
          tabs: [
            Tab(text: 'Overview'),
            Tab(text: 'Users'),
            Tab(text: 'Documents'),
          ],
        ),
        Expanded(
          child: TabBarView(children: [_Summary(), _Users(), _Documents()]),
        ),
      ],
    ),
  );
}

class _Summary extends ConsumerWidget {
  const _Summary();
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context, WidgetRef ref) => RefreshIndicator(
    onRefresh: () async {
      ref.invalidate(adminSummaryProvider);
      await ref.read(adminSummaryProvider.future);
    },
    child: ref
        .watch(adminSummaryProvider)
        .when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [Center(child: Text('$e'))]),
          data: (d) => GridView.count(
            padding: const EdgeInsets.all(16),
            crossAxisCount: 2,
            children: [
              for (final x in [
                ('USERS', d['totalUsers']),
                ('DOCUMENTS', d['totalDocuments']),
                ('PUBLIC', d['totalPublicDocuments']),
                ('CHATS', d['totalChats']),
              ])
                Card(
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${x.$2 ?? 0}',
                          style: const TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(x.$1),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
  );
}

class _Users extends ConsumerStatefulWidget {
  const _Users();
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<_Users> createState() => _UsersState();
}

class _UsersState extends ConsumerState<_Users> {
  final search = TextEditingController();
  String keyword = '';

  // Giải phóng tài nguyên khi đối tượng bị hủy.
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  // Lấy dữ liệu load.
  Future<List<Map<String, dynamic>>> load() async {
    final api = ref.read(apiClientProvider);
    return api.listFrom(
      await api.get(
        '/admin/users',
        query: {
          'page': 1,
          'limit': 50,
          if (keyword.isNotEmpty) 'keyword': keyword,
        },
      ),
    );
  }

  // Hiển thị hoặc mở người dùng actions.
  Future<void> showUserActions(Map<String, dynamic> user) async {
    if (user['role'] == 'ADMIN') return;
    final current = user['status']?.toString();
    final next = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      builder: (sheetContext) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            title: Text(
              user['fullName']?.toString() ?? user['email'].toString(),
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: Text(user['email']?.toString() ?? ''),
          ),
          if (current != 'ACTIVE')
            ListTile(
              leading: const Icon(Icons.check_circle_outline),
              title: const Text('ACTIVE'),
              onTap: () => Navigator.pop(sheetContext, 'ACTIVE'),
            ),
          if (current != 'BLOCKED')
            ListTile(
              leading: const Icon(Icons.block_rounded, color: Colors.red),
              title: const Text('BLOCKED'),
              onTap: () => Navigator.pop(sheetContext, 'BLOCKED'),
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
    if (next == null || !mounted) return;
    try {
      await ref
          .read(apiClientProvider)
          .patch('/admin/users/${user['id']}/status', data: {'status': next});
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Không thể cập nhật tài khoản.')),
        );
      }
    }
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: TextField(
          controller: search,
          textInputAction: TextInputAction.done,
          onChanged: (v) => setState(() => keyword = v.trim()),
          onSubmitted: (_) => FocusManager.instance.primaryFocus?.unfocus(),
          decoration: InputDecoration(
            hintText: 'Search by name or email',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: IconButton(
              onPressed: () {
                search.clear();
                setState(() => keyword = '');
              },
              icon: const Icon(Icons.clear),
            ),
          ),
        ),
      ),
      Expanded(
        child: FutureBuilder(
          future: load(),
          builder: (context, s) {
            if (!s.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final items = s.data!;
            return RefreshIndicator(
              onRefresh: () async => setState(() {}),
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final u = items[i];
                  return Card(
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => showUserActions(u),
                      child: ListTile(
                        title: Text(
                          u['fullName']?.toString() ?? u['email'].toString(),
                        ),
                        subtitle: Text('${u['email']} · ${u['role']}'),
                        trailing: _StatusChip(status: u['status'].toString()),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
      ),
    ],
  );
}

class _Documents extends ConsumerStatefulWidget {
  const _Documents();
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<_Documents> createState() => _DocumentsState();
}

class _DocumentsState extends ConsumerState<_Documents> {
  final search = TextEditingController();
  String keyword = '', status = '';

  // Giải phóng tài nguyên khi đối tượng bị hủy.
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  // Lấy dữ liệu load.
  Future<List<Map<String, dynamic>>> load() async {
    final api = ref.read(apiClientProvider);
    return api.listFrom(
      await api.get(
        '/admin/documents',
        query: {
          'page': 1,
          'limit': 50,
          if (keyword.isNotEmpty) 'keyword': keyword,
          if (status.isNotEmpty) 'moderationStatus': status,
        },
      ),
    );
  }

  // Thực hiện nghiệp vụ moderate.
  Future<void> moderate(Map<String, dynamic> document, String action) async {
    try {
      final api = ref.read(apiClientProvider).dio;
      if (action == 'APPROVE') {
        await api.put('/admin/documents/${document['id']}/approve');
      } else if (action == 'REJECT') {
        final reason = await _askRejectionReason();
        if (reason == null) return;
        await api.put(
          '/admin/documents/${document['id']}/reject',
          data: {'reason': reason},
        );
      }
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Không thể cập nhật trạng thái tài liệu.'),
          ),
        );
      }
    }
  }

  // Hiển thị hoặc mở tài liệu actions.
  Future<void> showDocumentActions(Map<String, dynamic> document) async {
    final moderation = document['moderationStatus']?.toString();
    final action = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      builder: (sheetContext) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            title: Text(
              document['title']?.toString() ?? 'Document',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            subtitle: Text('${document['owner']?['email'] ?? ''}'),
          ),
          if (moderation != 'APPROVED')
            ListTile(
              leading: const Icon(
                Icons.check_circle_outline,
                color: Color(0xff15803d),
              ),
              title: const Text('APPROVE'),
              onTap: () => Navigator.pop(sheetContext, 'APPROVE'),
            ),
          if (moderation != 'REJECTED')
            ListTile(
              leading: const Icon(Icons.cancel_outlined, color: Colors.red),
              title: const Text('REJECT'),
              onTap: () => Navigator.pop(sheetContext, 'REJECT'),
            ),
          const SizedBox(height: 8),
        ],
      ),
    );
    if (action != null && mounted) await moderate(document, action);
  }

  // Thực hiện chức năng ask rejection reason.
  Future<String?> _askRejectionReason() async {
    return showDialog<String>(
      context: context,
      builder: (_) => const _RejectDocumentDialog(),
    );
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
        child: TextField(
          controller: search,
          textInputAction: TextInputAction.done,
          onChanged: (v) => setState(() => keyword = v.trim()),
          onSubmitted: (_) => FocusManager.instance.primaryFocus?.unfocus(),
          decoration: InputDecoration(
            hintText: 'Search documents',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: IconButton(
              onPressed: () {
                search.clear();
                setState(() => keyword = '');
              },
              icon: const Icon(Icons.clear),
            ),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: DropdownButtonFormField(
          initialValue: status,
          decoration: const InputDecoration(labelText: 'Moderation status'),
          items: const [
            DropdownMenuItem(value: '', child: Text('ALL')),
            DropdownMenuItem(value: 'PENDING', child: Text('PENDING')),
            DropdownMenuItem(value: 'APPROVED', child: Text('APPROVED')),
            DropdownMenuItem(value: 'REJECTED', child: Text('REJECTED')),
          ],
          onChanged: (v) => setState(() => status = v!),
        ),
      ),
      Expanded(
        child: FutureBuilder(
          future: load(),
          builder: (context, s) {
            if (!s.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final items = s.data!;
            return RefreshIndicator(
              onRefresh: () async => setState(() {}),
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final d = items[i];
                  return Card(
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => showDocumentActions(d),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    d['title']?.toString() ?? '',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 5),
                                  Text(
                                    '${d['owner']?['email'] ?? ''}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Color(0xff64748b),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 6),
                            Align(
                              alignment: Alignment.centerRight,
                              child: _StatusChip(
                                status: d['moderationStatus']?.toString() ?? '',
                              ),
                            ),
                            const SizedBox(width: 2),
                            const Icon(
                              Icons.chevron_right_rounded,
                              size: 20,
                              color: Color(0xff94a3b8),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
      ),
    ],
  );
}

class _RejectDocumentDialog extends StatefulWidget {
  const _RejectDocumentDialog();

  // Tạo state quản lý vòng đời của widget.
  @override
  State<_RejectDocumentDialog> createState() => _RejectDocumentDialogState();
}

class _RejectDocumentDialogState extends State<_RejectDocumentDialog> {
  final controller = TextEditingController();

  // Giải phóng tài nguyên khi đối tượng bị hủy.
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  // Thực hiện chức năng submit.
  void submit() {
    final reason = controller.text.trim();
    if (reason.isEmpty) return;
    FocusManager.instance.primaryFocus?.unfocus();
    Navigator.of(context).pop(reason);
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Reject document'),
    content: TextField(
      controller: controller,
      autofocus: true,
      maxLines: 3,
      textInputAction: TextInputAction.done,
      onSubmitted: (_) => submit(),
      decoration: const InputDecoration(
        labelText: 'Rejection reason',
        hintText: 'Enter a reason for the document owner',
      ),
    ),
    actions: [
      TextButton(
        onPressed: () {
          FocusManager.instance.primaryFocus?.unfocus();
          Navigator.of(context).pop();
        },
        child: const Text('CANCEL'),
      ),
      FilledButton(onPressed: submit, child: const Text('REJECT')),
    ],
  );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final normalized = status.toUpperCase();
    final isGreen = normalized == 'ACTIVE' || normalized == 'APPROVED';
    final isRed = normalized == 'BLOCKED' || normalized == 'REJECTED';
    final color = isGreen
        ? const Color(0xff15803d)
        : isRed
        ? const Color(0xffdc2626)
        : const Color(0xff64748b);
    return Chip(
      visualDensity: VisualDensity.compact,
      side: BorderSide(color: color.withValues(alpha: .35)),
      backgroundColor: color.withValues(alpha: .1),
      label: Text(
        normalized,
        style: TextStyle(color: color, fontWeight: FontWeight.w800),
      ),
    );
  }
}
