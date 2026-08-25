import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../auth/auth_controller.dart';
import '../chat/chat_screen.dart';
import '../documents/documents_screen.dart';

final communityDocumentsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final api = ref.watch(apiClientProvider);
      return api.listFrom(await api.get('/community/documents', query: {'limit': 100}));
    });

final savedDocumentsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final api = ref.watch(apiClientProvider);
      return api.listFrom(await api.get('/saved-documents', query: {'limit': 100}));
    });

class CommunityHubScreen extends StatelessWidget {
  const CommunityHubScreen({super.key});

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 3,
    child: Column(
      children: const [
        Material(
          color: Colors.transparent,
          child: TabBar(
            tabs: [
              Tab(text: 'Của tôi'),
              Tab(text: 'Cộng đồng'),
              Tab(text: 'Đã lưu'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            children: [DocumentsScreen(), CommunityScreen(), SavedScreen()],
          ),
        ),
      ],
    ),
  );
}

class CommunityScreen extends ConsumerStatefulWidget {
  const CommunityScreen({super.key});
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends ConsumerState<CommunityScreen> {
  final search = TextEditingController();
  String category = '';

  // Giải phóng tài nguyên khi đối tượng bị hủy.
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(communityDocumentsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(communityDocumentsProvider.future),
      child: state.when(
        loading: () => const _LoadingList('Đang tải tài liệu cộng đồng...'),
        error: (error, _) => _MessageList('Không thể tải tài liệu cộng đồng.\n$error'),
        data: (items) {
          final categories = items.map(_categoryName).where((e) => e.isNotEmpty).toSet().toList()..sort();
          final query = search.text.trim().toLowerCase();
          final visible = items.where((item) {
            final matchesCategory = category.isEmpty || _categoryName(item) == category;
            final values = [item['title'], item['description'], _subjectName(item), _categoryName(item), ..._tags(item)];
            return matchesCategory && (query.isEmpty || values.any((value) => value?.toString().toLowerCase().contains(query) == true));
          }).toList();
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 90),
            children: [
              const Text('THƯ VIỆN CỘNG ĐỒNG', style: _eyebrow),
              const SizedBox(height: 6),
              const Text('Kiến thức hữu ích từ cộng đồng.', style: _heading),
              const SizedBox(height: 8),
              const Text('Khám phá tài liệu công khai và lưu nguồn phù hợp vào thư viện của bạn.', style: _muted),
              const SizedBox(height: 16),
              TextField(
                controller: search,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  hintText: 'Tìm tên, môn học, danh mục, thẻ...',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: search.text.isEmpty ? null : IconButton(onPressed: () { search.clear(); setState(() {}); }, icon: const Icon(Icons.clear)),
                ),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
                ChoiceChip(label: const Text('Tất cả'), selected: category.isEmpty, onSelected: (_) => setState(() => category = '')),
                for (final value in categories) Padding(padding: const EdgeInsets.only(left: 7), child: ChoiceChip(label: Text(value), selected: category == value, onSelected: (_) => setState(() => category = value))),
              ])),
              const SizedBox(height: 15),
              Text('${visible.length} tài liệu công khai', style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 9),
              if (visible.isEmpty) const _InlineEmpty('Không có tài liệu công khai phù hợp.') else
                ...visible.map((item) => Padding(padding: const EdgeInsets.only(bottom: 11), child: _CommunityCard(item: item))),
            ],
          );
        },
      ),
    );
  }
}

class _CommunityCard extends ConsumerStatefulWidget {
  const _CommunityCard({required this.item});
  final Map<String, dynamic> item;
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<_CommunityCard> createState() => _CommunityCardState();
}

class _CommunityCardState extends ConsumerState<_CommunityCard> {
  bool busy = false;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final owned = item['owned'] == true;
    final saved = item['saved'] == true;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _openPreview(),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              _FileBadge(item),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item['title']?.toString() ?? 'Tài liệu', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 4),
                Text('${_subjectName(item)} · ${_categoryName(item)}', style: _muted),
              ])),
            ]),
            if ((item['description']?.toString() ?? '').isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(item['description'].toString(), maxLines: 2, overflow: TextOverflow.ellipsis, style: _muted),
            ],
            if (_tags(item).isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 5, children: _tags(item).map((tag) => Chip(label: Text('#$tag'), visualDensity: VisualDensity.compact)).toList()),
            ],
            const Divider(height: 22),
            Row(children: [
              const Icon(Icons.person_outline, size: 17, color: Color(0xff64748b)),
              const SizedBox(width: 6),
              Expanded(child: Text(_ownerName(item), overflow: TextOverflow.ellipsis, style: _muted)),
              Text('${item['saveCount'] ?? 0} lượt lưu', style: _muted),
            ]),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _openPreview,
                icon: const Icon(Icons.visibility_outlined),
                label: const Text('Xem'),
              ),
            ),
            if (!owned) ...[
              const SizedBox(height: 10),
              SizedBox(width: double.infinity, child: saved
                ? OutlinedButton.icon(onPressed: busy ? null : () => _toggle(false), icon: const Icon(Icons.bookmark_added_rounded), label: const Text('Đã lưu vào thư viện'))
                : FilledButton.tonalIcon(onPressed: busy ? null : () => _toggle(true), icon: const Icon(Icons.bookmark_add_outlined), label: const Text('Lưu vào thư viện'))),
            ],
          ]),
        ),
      ),
    );
  }

  // Thực hiện chức năng open xem trước.
  void _openPreview() {
    final item = widget.item;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => DocumentPreviewPage(
          document: item,
          previewPath: '/community/documents/${item['id']}/preview',
          restrictCommunityActions: item['saved'] != true && item['owned'] != true,
          onAskAi: item['saved'] == true || item['owned'] == true
              ? () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => Scaffold(
                      appBar: AppBar(title: const Text('Hỏi AI')),
                      body: ChatScreen(initialDocumentId: item['id'].toString()),
                    ),
                  ),
                )
              : null,
        ),
      ),
    );
  }

  // Thực hiện chức năng toggle.
  Future<void> _toggle(bool save) async {
    setState(() => busy = true);
    try {
      final path = '/community/documents/${widget.item['id']}/save';
      if (save) { await ref.read(apiClientProvider).post(path); } else { await ref.read(apiClientProvider).delete(path); }
      widget.item['saved'] = save;
      widget.item['saveCount'] = ((widget.item['saveCount'] as num?)?.toInt() ?? 0) + (save ? 1 : -1);
      ref.invalidate(savedDocumentsProvider);
      if (mounted) setState(() {});
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Không thể cập nhật trạng thái lưu: $error')));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }
}

class SavedScreen extends ConsumerStatefulWidget {
  const SavedScreen({super.key});
  @override ConsumerState<SavedScreen> createState() => _SavedScreenState();
}

class _SavedScreenState extends ConsumerState<SavedScreen> {
  final search = TextEditingController();
  String subject = '', fileType = '', sort = 'newest';
  @override void dispose() { search.dispose(); super.dispose(); }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(savedDocumentsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(savedDocumentsProvider.future),
      child: state.when(
        loading: () => const _LoadingList('Đang tải tài liệu đã lưu...'),
        error: (error, _) => _MessageList('Không thể tải tài liệu đã lưu.\n$error'),
        data: (items) {
          final subjects = items.map(_subjectName).where((e) => e.isNotEmpty).toSet().toList()..sort();
          final types = items.map(_fileType).toSet().toList()..sort();
          final query = search.text.trim().toLowerCase();
          final visible = items.where((item) {
            final values = [item['title'], _subjectName(item), _categoryName(item), ..._tags(item)];
            return (subject.isEmpty || _subjectName(item) == subject) && (fileType.isEmpty || _fileType(item) == fileType) && (query.isEmpty || values.any((v) => v?.toString().toLowerCase().contains(query) == true));
          }).toList();
          visible.sort((a, b) {
            if (sort == 'title') return (a['title'] ?? '').toString().compareTo((b['title'] ?? '').toString());
            final av = DateTime.tryParse((a['savedAt'] ?? a['createdAt'] ?? '').toString()) ?? DateTime(1970);
            final bv = DateTime.tryParse((b['savedAt'] ?? b['createdAt'] ?? '').toString()) ?? DateTime(1970);
            return sort == 'oldest' ? av.compareTo(bv) : bv.compareTo(av);
          });
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 12, 16, 80), children: [
              const Text('ĐÃ LƯU', style: _eyebrow), const SizedBox(height: 6), const Text('Tài liệu đã lưu.', style: _heading), const SizedBox(height: 14),
              TextField(controller: search, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'Tìm theo tên, môn học, thẻ...', prefixIcon: Icon(Icons.search))),
              const SizedBox(height: 8),
              SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
                _PopupFilter(label: 'Môn học', value: subject, values: subjects, onChanged: (v) => setState(() => subject = v)),
                const SizedBox(width: 7), _PopupFilter(label: 'Loại file', value: fileType, values: types, onChanged: (v) => setState(() => fileType = v)),
                const SizedBox(width: 7), _PopupFilter(label: 'Sắp xếp', value: sort, values: const ['newest', 'oldest', 'title'], labels: const {'newest': 'Mới nhất', 'oldest': 'Cũ nhất', 'title': 'Tên A–Z'}, allowAll: false, onChanged: (v) => setState(() => sort = v)),
              ])),
              const SizedBox(height: 13), Text('${visible.length} tài liệu', style: const TextStyle(fontWeight: FontWeight.w800)), const SizedBox(height: 8),
              if (visible.isEmpty) const _InlineEmpty('Bạn chưa lưu tài liệu nào từ cộng đồng.') else ...visible.map((item) => Padding(padding: const EdgeInsets.only(bottom: 9), child: _SavedTile(item: item))),
            ],
          );
        },
      ),
    );
  }
}

class _SavedTile extends ConsumerWidget {
  const _SavedTile({required this.item}); final Map<String, dynamic> item;
  @override Widget build(BuildContext context, WidgetRef ref) => Card(clipBehavior: Clip.antiAlias, child: InkWell(onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DocumentPreviewPage(document: item))), child: Padding(padding: const EdgeInsets.all(14), child: Row(children: [
    _FileBadge(item), const SizedBox(width: 12), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(item['title']?.toString() ?? 'Tài liệu', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)), Text('${_subjectName(item)} · Đã lưu từ cộng đồng', style: _muted)])),
    PopupMenuButton<String>(onSelected: (value) async {
      if (value == 'view') { if (context.mounted) Navigator.push(context, MaterialPageRoute(builder: (_) => DocumentPreviewPage(document: item))); }
      if (value == 'download') { final result = await ref.read(apiClientProvider).get('/documents/${item['id']}/download'); final url = result['url'] ?? result['downloadUrl']; if (url != null) await launchUrl(Uri.parse(url.toString()), mode: LaunchMode.externalApplication); }
      if (value == 'ask') { if (context.mounted) Navigator.push(context, MaterialPageRoute(builder: (_) => Scaffold(appBar: AppBar(title: const Text('Hỏi AI')), body: ChatScreen(initialDocumentId: item['id'].toString())))); }
      if (value == 'unsave') { await ref.read(apiClientProvider).delete('/community/documents/${item['id']}/save'); ref.invalidate(savedDocumentsProvider); ref.invalidate(communityDocumentsProvider); }
    }, itemBuilder: (_) => const [PopupMenuItem(value: 'view', child: Text('Xem trước')), PopupMenuItem(value: 'download', child: Text('Tải xuống')), PopupMenuItem(value: 'ask', child: Text('Hỏi AI')), PopupMenuItem(value: 'unsave', child: Text('Hủy lưu'))]),
  ]))));
}

class _PopupFilter extends StatelessWidget {
  const _PopupFilter({required this.label, required this.value, required this.values, required this.onChanged, this.labels = const {}, this.allowAll = true});
  final String label, value; final List<String> values; final Map<String, String> labels; final bool allowAll; final ValueChanged<String> onChanged;
  @override Widget build(BuildContext context) => PopupMenuButton<String>(onSelected: onChanged, itemBuilder: (_) => [if (allowAll) PopupMenuItem(value: '', child: Text('Tất cả $label')), ...values.map((v) => PopupMenuItem(value: v, child: Text(labels[v] ?? v)))], child: Chip(label: Text(value.isEmpty ? label : labels[value] ?? value), avatar: const Icon(Icons.filter_list, size: 16)));
}

class _FileBadge extends StatelessWidget { const _FileBadge(this.item); final Map<String, dynamic> item; @override Widget build(BuildContext context) => Container(width: 48, height: 52, alignment: Alignment.center, decoration: BoxDecoration(color: const Color(0xfffff7ed), borderRadius: BorderRadius.circular(12)), child: Text(_fileType(item), style: const TextStyle(color: Color(0xffb45309), fontSize: 10, fontWeight: FontWeight.w800))); }
class _LoadingList extends StatelessWidget { const _LoadingList(this.text); final String text; @override Widget build(BuildContext context) => ListView(physics: const AlwaysScrollableScrollPhysics(), children: [const SizedBox(height: 150), const Center(child: CircularProgressIndicator()), const SizedBox(height: 12), Center(child: Text(text))]); }
class _MessageList extends StatelessWidget { const _MessageList(this.text); final String text; @override Widget build(BuildContext context) => ListView(physics: const AlwaysScrollableScrollPhysics(), children: [const SizedBox(height: 140), const Icon(Icons.cloud_off, size: 44), const SizedBox(height: 10), Text(text, textAlign: TextAlign.center)]); }
class _InlineEmpty extends StatelessWidget { const _InlineEmpty(this.text); final String text; @override Widget build(BuildContext context) => Padding(padding: const EdgeInsets.symmetric(vertical: 70, horizontal: 20), child: Column(children: [const Icon(Icons.bookmark_border, size: 48, color: Color(0xffd97706)), const SizedBox(height: 10), Text(text, textAlign: TextAlign.center)])); }

// Thực hiện chức năng môn học name.
String _subjectName(Map<String, dynamic> item) => item['subject'] is Map ? (item['subject']['name']?.toString() ?? '') : (item['subject']?.toString() ?? '');
// Thực hiện chức năng danh mục name.
String _categoryName(Map<String, dynamic> item) => item['category'] is Map ? (item['category']['name']?.toString() ?? '') : (item['category']?.toString() ?? '');
// Thực hiện chức năng owner name.
String _ownerName(Map<String, dynamic> item) { final owner = item['owner']; if (owner is Map) return owner['fullName']?.toString() ?? owner['email']?.toString() ?? 'Cộng đồng'; return owner?.toString() ?? 'Cộng đồng'; }
// Thực hiện chức năng tệp type.
String _fileType(Map<String, dynamic> item) { final name = item['fileName']?.toString() ?? ''; final ext = name.split('.').last.toUpperCase(); if (['PDF', 'DOCX', 'PPTX', 'XLSX'].contains(ext)) return ext; final mime = item['fileType']?.toString().toLowerCase() ?? ''; if (mime.contains('pdf')) return 'PDF'; if (mime.contains('word')) return 'DOCX'; if (mime.contains('presentation')) return 'PPTX'; if (mime.contains('sheet')) return 'XLSX'; return 'FILE'; }
// Thực hiện chức năng thẻ.
List<String> _tags(Map<String, dynamic> item) { final raw = item['tags']; if (raw is! List) return const []; return raw.map((entry) { if (entry is Map && entry['tag'] is Map) return entry['tag']['name']?.toString() ?? ''; if (entry is Map) return entry['name']?.toString() ?? ''; return entry.toString(); }).where((e) => e.isNotEmpty).toList(); }

const _eyebrow = TextStyle(color: Color(0xffd97706), letterSpacing: 1.1, fontWeight: FontWeight.w800, fontSize: 12);
const _heading = TextStyle(fontFamily: 'Georgia', fontSize: 27, fontWeight: FontWeight.w700);
const _muted = TextStyle(color: Color(0xff64748b), fontSize: 12, height: 1.4);
