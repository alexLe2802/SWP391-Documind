import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../auth/auth_controller.dart';

final documentsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final api = ref.watch(apiClientProvider);
      final result = await api.get(
        '/documents',
        query: {'ownerOnly': true, 'page': 1, 'limit': 100},
      );
      return api.listFrom(result);
    });

final aiSourceDocumentsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
      final api = ref.watch(apiClientProvider);
      final results = await Future.wait([
        api.get(
          '/documents',
          query: {'ownerOnly': true, 'page': 1, 'limit': 100},
        ),
        api.get(
          '/documents',
          query: {'savedOnly': true, 'page': 1, 'limit': 100},
        ),
      ]);
      return mergeAiSourceDocuments(
        api.listFrom(results[0]),
        api.listFrom(results[1]),
      );
    });

// Thực hiện chức năng merge ai nguồn tài liệu.
List<Map<String, dynamic>> mergeAiSourceDocuments(
  List<Map<String, dynamic>> owned,
  List<Map<String, dynamic>> saved,
) {
  final merged = <String, Map<String, dynamic>>{};
  for (final document in owned) {
    merged[document['id'].toString()] = document;
  }
  for (final document in saved) {
    merged[document['id'].toString()] = {...document, 'isCommunitySaved': true};
  }
  return merged.values.toList(growable: false);
}

typedef DocumentFilters = ({
  String search,
  String subjectId,
  String categoryId,
  String fileType,
});

final filteredDocumentsProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, DocumentFilters>((ref, filters) async {
      final api = ref.watch(apiClientProvider);
      final result = await api.get(
        '/documents',
        query: {
          'ownerOnly': true,
          'page': 1,
          'limit': 100,
          if (filters.search.isNotEmpty) 'search': filters.search,
          if (filters.subjectId.isNotEmpty) 'subjectId': filters.subjectId,
          if (filters.categoryId.isNotEmpty) 'categoryId': filters.categoryId,
          if (filters.fileType.isNotEmpty) 'fileType': filters.fileType,
        },
      );
      return api.listFrom(result);
    });

final libraryMetadataProvider = FutureProvider.autoDispose((ref) async {
  final api = ref.watch(apiClientProvider);
  final result = await Future.wait([
    api.get('/subjects'),
    api.get('/categories'),
  ]);
  return (
    subjects: api.listFrom(result[0]),
    categories: api.listFrom(result[1]),
  );
});

class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();

  // Hiển thị hoặc mở tải lên.
  static Future<void> openUpload(BuildContext context, WidgetRef ref) async {
    final api = ref.read(apiClientProvider);
    try {
      final metadata = await Future.wait([
        api.get('/subjects'),
        api.get('/categories'),
      ]);
      final subjects = api.listFrom(metadata[0]);
      final categories = api.listFrom(metadata[1]);
      if (!context.mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (_) => _UploadSheet(
          subjects: subjects,
          categories: categories,
          onUploaded: () {
            ref.invalidate(documentsProvider);
            ref.invalidate(filteredDocumentsProvider);
          },
        ),
      );
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không thể tải môn học và danh mục: $error')),
        );
      }
    }
  }
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  final search = TextEditingController();
  String subjectId = '', categoryId = '', fileType = '';
  final selectedIds = <String>{};

  DocumentFilters get filters => (
    search: search.text.trim(),
    subjectId: subjectId,
    categoryId: categoryId,
    fileType: fileType,
  );

  // Giải phóng tài nguyên khi đối tượng bị hủy.
  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final currentFilters = filters;
    final documents = ref.watch(filteredDocumentsProvider(currentFilters));
    final metadata = ref.watch(libraryMetadataProvider).value;
    final subjects = metadata?.subjects ?? const <Map<String, dynamic>>[];
    final categories = (metadata?.categories ?? const <Map<String, dynamic>>[])
        .where((item) {
          final linked = item['subjectId']?.toString();
          return subjectId.isEmpty || linked == null || linked == subjectId;
        })
        .toList();
    return Scaffold(
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => DocumentsScreen.openUpload(context, ref),
        icon: const Icon(Icons.upload_file_rounded),
        label: const Text('Tải lên'),
      ),
      body: Column(
        children: [
          _LibraryFilters(
            search: search,
            subjects: subjects,
            categories: categories,
            subjectId: subjectId,
            categoryId: categoryId,
            fileType: fileType,
            onSearch: () => setState(() {}),
            onSubject: (value) => setState(() {
              subjectId = value;
              categoryId = '';
            }),
            onCategory: (value) => setState(() => categoryId = value),
            onFileType: (value) => setState(() => fileType = value),
          ),
          if (selectedIds.isNotEmpty)
            _SelectionBar(
              count: selectedIds.length,
              onClear: () => setState(selectedIds.clear),
              onDelete: () => _deleteSelected(currentFilters),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () =>
                  ref.refresh(filteredDocumentsProvider(currentFilters).future),
              child: documents.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => _EmptyState(
                  icon: Icons.cloud_off_rounded,
                  title: 'Không thể tải thư viện',
                  detail: error.toString(),
                  action: () =>
                      ref.invalidate(filteredDocumentsProvider(currentFilters)),
                ),
                data: (items) => items.isEmpty
                    ? _EmptyState(
                        icon: Icons.folder_open_rounded,
                        title: 'Thư viện đang trống',
                        detail:
                            'Tải tài liệu đầu tiên để bắt đầu hỏi đáp cùng AI.',
                        action: () => DocumentsScreen.openUpload(context, ref),
                        actionLabel: 'Tải tài liệu',
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 10, 16, 100),
                        itemCount: items.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (_, index) => _DocumentTile(
                          items[index],
                          selected: selectedIds.contains(items[index]['id']),
                          selectionMode: selectedIds.isNotEmpty,
                          onToggleSelection: () =>
                              _toggleSelection(items[index]['id'].toString()),
                          onChanged: () {
                            setState(
                              () => selectedIds.remove(items[index]['id']),
                            );
                            ref.invalidate(filteredDocumentsProvider);
                            ref.invalidate(documentsProvider);
                          },
                        ),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // Thực hiện chức năng toggle selection.
  void _toggleSelection(String id) => setState(() {
    if (!selectedIds.add(id)) selectedIds.remove(id);
  });

  // Thực hiện chức năng delete selected.
  Future<void> _deleteSelected(DocumentFilters currentFilters) async {
    final ids = selectedIds.toList(growable: false);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Xóa ${ids.length} tài liệu?'),
        content: const Text(
          'Tài liệu đã xóa sẽ không thể khôi phục. Nếu đang công khai, tài liệu cũng biến mất khỏi Cộng đồng và mục Đã lưu của người khác.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      final api = ref.read(apiClientProvider);
      await Future.wait(ids.map((id) => api.delete('/documents/$id')));
      if (!mounted) return;
      setState(selectedIds.clear);
      ref.invalidate(filteredDocumentsProvider(currentFilters));
      ref.invalidate(documentsProvider);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text('Đã xóa ${ids.length} tài liệu.')));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không thể xóa tài liệu: $error')),
        );
      }
    }
  }
}

class _SelectionBar extends StatelessWidget {
  const _SelectionBar({
    required this.count,
    required this.onClear,
    required this.onDelete,
  });
  final int count;
  final VoidCallback onClear;
  final VoidCallback onDelete;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 2, 16, 6),
    child: Container(
      padding: const EdgeInsets.fromLTRB(12, 6, 6, 6),
      decoration: BoxDecoration(
        color: const Color(0xfffff7ed),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xfffed7aa)),
      ),
      child: Row(
        children: [
          const Icon(Icons.check_circle_rounded, color: Color(0xffd97706)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Đã chọn $count tài liệu',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
          IconButton(
            tooltip: 'Bỏ chọn',
            onPressed: onClear,
            icon: const Icon(Icons.close_rounded),
          ),
          FilledButton.icon(
            onPressed: onDelete,
            icon: const Icon(Icons.delete_outline_rounded, size: 18),
            label: const Text('Xóa'),
          ),
        ],
      ),
    ),
  );
}

class _LibraryFilters extends StatelessWidget {
  const _LibraryFilters({
    required this.search,
    required this.subjects,
    required this.categories,
    required this.subjectId,
    required this.categoryId,
    required this.fileType,
    required this.onSearch,
    required this.onSubject,
    required this.onCategory,
    required this.onFileType,
  });

  final TextEditingController search;
  final List<Map<String, dynamic>> subjects;
  final List<Map<String, dynamic>> categories;
  final String subjectId, categoryId, fileType;
  final VoidCallback onSearch;
  final ValueChanged<String> onSubject, onCategory, onFileType;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
    child: Column(
      children: [
        TextField(
          controller: search,
          onChanged: (_) => onSearch(),
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => FocusManager.instance.primaryFocus?.unfocus(),
          decoration: InputDecoration(
            hintText: 'Tìm theo tên hoặc mô tả tài liệu',
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: search.text.isEmpty
                ? null
                : IconButton(
                    onPressed: () {
                      search.clear();
                      onSearch();
                    },
                    icon: const Icon(Icons.clear_rounded),
                  ),
          ),
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _FilterMenu(
                label: 'Môn học',
                value: subjectId,
                items: subjects
                    .map(
                      (item) => (
                        value: item['id'].toString(),
                        label: item['name']?.toString() ?? 'Môn học',
                      ),
                    )
                    .toList(),
                onChanged: onSubject,
              ),
              const SizedBox(width: 8),
              _FilterMenu(
                label: 'Danh mục',
                value: categoryId,
                items: categories
                    .map(
                      (item) => (
                        value: item['id'].toString(),
                        label: item['name']?.toString() ?? 'Danh mục',
                      ),
                    )
                    .toList(),
                onChanged: onCategory,
              ),
              const SizedBox(width: 8),
              _FilterMenu(
                label: 'Loại file',
                value: fileType,
                items: const [
                  (value: 'PDF', label: 'PDF'),
                  (value: 'DOCX', label: 'DOCX'),
                  (value: 'PPTX', label: 'PPTX'),
                  (value: 'XLSX', label: 'XLSX'),
                ],
                onChanged: onFileType,
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _FilterMenu extends StatelessWidget {
  const _FilterMenu({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });
  final String label, value;
  final List<({String value, String label})> items;
  final ValueChanged<String> onChanged;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
    onSelected: onChanged,
    itemBuilder: (_) => [
      PopupMenuItem(value: '', child: Text('Tất cả $label')),
      for (final item in items)
        PopupMenuItem(value: item.value, child: Text(item.label)),
    ],
    child: Chip(
      avatar: Icon(
        value.isEmpty ? Icons.filter_list_rounded : Icons.check_rounded,
        size: 17,
      ),
      label: Text(
        value.isEmpty
            ? label
            : items
                      .where((item) => item.value == value)
                      .map((item) => item.label)
                      .firstOrNull ??
                  label,
      ),
    ),
  );
}

class _DocumentTile extends ConsumerWidget {
  const _DocumentTile(
    this.document, {
    required this.selected,
    required this.selectionMode,
    required this.onToggleSelection,
    required this.onChanged,
  });
  final Map<String, dynamic> document;
  final bool selected;
  final bool selectionMode;
  final VoidCallback onToggleSelection;
  final VoidCallback onChanged;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fileName = document['fileName']?.toString() ?? '';
    final type = fileName.split('.').lastOrNull?.toUpperCase() ?? 'FILE';
    final status = document['aiStatus']?.toString() ?? 'PENDING';
    return Card(
      clipBehavior: Clip.antiAlias,
      color: selected ? const Color(0xfffffbeb) : null,
      child: InkWell(
        onLongPress: onToggleSelection,
        onTap: selectionMode
            ? onToggleSelection
            : () => _showActions(context, ref),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 54,
                decoration: BoxDecoration(
                  color: const Color(0xfffff7ed),
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Text(
                  type,
                  style: const TextStyle(
                    color: Color(0xffb45309),
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      document['title']?.toString() ?? 'Tài liệu',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      '${document['subject']?['name'] ?? 'Chưa phân môn'} · ${document['category']?['name'] ?? ''}',
                      style: const TextStyle(color: Color(0xff64748b)),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      status == 'COMPLETED' || status == 'MOCKED'
                          ? 'AI sẵn sàng'
                          : 'AI: $status',
                      style: const TextStyle(
                        color: Color(0xff166534),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              if (selectionMode)
                Checkbox(value: selected, onChanged: (_) => onToggleSelection())
              else
                IconButton(
                  tooltip: 'Tùy chọn tài liệu',
                  onPressed: () => _showActions(context, ref),
                  icon: const Icon(Icons.chevron_right_rounded),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // Thực hiện chức năng show actions.
  Future<void> _showActions(BuildContext context, WidgetRef ref) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(sheetContext).height * .82,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                document['title']?.toString() ?? 'Document',
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.visibility_outlined),
                title: const Text('Xem trước'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _showPreview(context, ref);
                },
              ),
              ListTile(
                leading: const Icon(Icons.download_outlined),
                title: const Text('Tải xuống'),
                onTap: () => _openUrl(
                  sheetContext,
                  ref,
                  '/documents/${document['id']}/download',
                ),
              ),
              ListTile(
                leading: const Icon(Icons.auto_awesome_rounded),
                title: const Text('Hỏi AI'),
                subtitle: const Text('Dùng tài liệu này làm nguồn trả lời'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Mở Hỏi AI và chọn tài liệu này.'),
                    ),
                  );
                },
              ),
              ListTile(
                leading: Icon(
                  document['visibility'] == 'PUBLIC'
                      ? Icons.public_off_rounded
                      : Icons.public_rounded,
                ),
                title: Text(
                  document['visibility'] == 'PUBLIC'
                      ? document['moderationStatus'] == 'APPROVED'
                          ? 'Công khai'
                          : 'Chờ kiểm duyệt'
                      : 'Công khai tài liệu',
                ),
                subtitle: document['visibility'] == 'PUBLIC'
                    ? Text(
                        document['moderationStatus'] == 'APPROVED'
                            ? 'Nhấn để gỡ tài liệu khỏi cộng đồng'
                            : 'Nhấn để hủy yêu cầu đăng công khai',
                      )
                    : const Text('Admin phải duyệt trước khi xuất hiện trên Cộng đồng'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _changeVisibility(context, ref);
                },
              ),
              ListTile(
                textColor: const Color(0xffdc2626),
                iconColor: const Color(0xffdc2626),
                leading: const Icon(Icons.delete_outline_rounded),
                title: const Text('Xóa tài liệu'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _deleteDocument(context, ref);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  // Thực hiện chức năng change quyền hiển thị.
  Future<void> _changeVisibility(BuildContext context, WidgetRef ref) async {
    final currentlyPublic = document['visibility'] == 'PUBLIC';
    final pendingReview =
        currentlyPublic && document['moderationStatus'] != 'APPROVED';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          pendingReview
              ? 'Hủy yêu cầu công khai?'
              : currentlyPublic
                  ? 'Gỡ khỏi cộng đồng?'
                  : 'Công khai tài liệu?',
        ),
        content: Text(
          pendingReview
              ? 'Tài liệu sẽ chuyển về riêng tư và không còn chờ admin kiểm duyệt.'
              : currentlyPublic
              ? 'Tài liệu sẽ chuyển về riêng tư và bị xóa khỏi mục Đã lưu của tất cả người dùng khác.'
              : 'Tài liệu sẽ được gửi kiểm duyệt trước khi xuất hiện trên Cộng đồng.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(
              pendingReview
                  ? 'Hủy yêu cầu'
                  : currentlyPublic
                      ? 'Gỡ công khai'
                      : 'Gửi kiểm duyệt',
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref
          .read(apiClientProvider)
          .put(
            '/documents/${document['id']}/visibility',
            data: {'visibility': currentlyPublic ? 'PRIVATE' : 'PUBLIC'},
          );
      ref.invalidate(filteredDocumentsProvider);
      ref.invalidate(documentsProvider);
      onChanged();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              currentlyPublic
                  ? 'Đã gỡ tài liệu khỏi cộng đồng.'
                  : 'Đã gửi tài liệu cho admin kiểm duyệt.',
            ),
          ),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không thể cập nhật tài liệu: $error')),
        );
      }
    }
  }

  // Thực hiện chức năng delete tài liệu.
  Future<void> _deleteDocument(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Xóa tài liệu?'),
        content: const Text('Tài liệu đã xóa sẽ không thể khôi phục.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref.read(apiClientProvider).delete('/documents/${document['id']}');
      onChanged();
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Đã xóa tài liệu.')));
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không thể xóa tài liệu: $error')),
        );
      }
    }
  }

  // Thực hiện chức năng show xem trước.
  Future<void> _showPreview(BuildContext context, WidgetRef ref) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => DocumentPreviewPage(document: document),
      ),
    );
  }

  // Thực hiện chức năng open url.
  Future<void> _openUrl(
    BuildContext context,
    WidgetRef ref,
    String path,
  ) async {
    try {
      final result = await ref.read(apiClientProvider).get(path);
      final url = result['url'] ?? result['downloadUrl'];
      if (url == null ||
          !await launchUrl(
            Uri.parse(url.toString()),
            mode: LaunchMode.externalApplication,
          )) {
        throw StateError('URL unavailable');
      }
      if (context.mounted) Navigator.pop(context);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Không thể tạo đường dẫn. Vui lòng thử lại sau.'),
          ),
        );
      }
    }
  }
}

class DocumentPreviewPage extends ConsumerStatefulWidget {
  const DocumentPreviewPage({
    required this.document,
    this.previewPath,
    this.restrictCommunityActions = false,
    this.onAskAi,
    super.key,
  });
  final Map<String, dynamic> document;
  final String? previewPath;
  final bool restrictCommunityActions;
  final VoidCallback? onAskAi;

  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<DocumentPreviewPage> createState() =>
      _DocumentPreviewPageState();
}

class _DocumentPreviewPageState extends ConsumerState<DocumentPreviewPage> {
  WebViewController? controller;
  String? error;
  int progress = 0;

  // Khởi tạo state và tài nguyên ban đầu.
  @override
  void initState() {
    super.initState();
    _loadPreview();
  }

  // Thực hiện chức năng load xem trước.
  Future<void> _loadPreview() async {
    if (mounted) {
      setState(() {
        controller = null;
        error = null;
        progress = 0;
      });
    }
    try {
      final result = Map<String, dynamic>.from(
        await ref
            .read(apiClientProvider)
            .get(
              widget.previewPath ??
                  '/documents/${widget.document['id']}/preview',
              receiveTimeout: const Duration(seconds: 15),
            ),
      );
      final rawUrl = (result['url'] ?? result['downloadUrl'])?.toString();
      if (rawUrl == null) throw StateError('Preview URL unavailable');
      final previewUrl = _previewUrl(result, rawUrl);
      final webController = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(const Color(0xfff8fafc))
        ..setNavigationDelegate(
          NavigationDelegate(
            onProgress: (value) {
              if (mounted) setState(() => progress = value);
            },
            onPageFinished: (_) {
              if (mounted) setState(() => progress = 100);
            },
            onWebResourceError: (webError) {
              if (webError.isForMainFrame == true && mounted) {
                setState(
                  () => error = 'Không thể hiển thị tài liệu trong app.',
                );
              }
            },
          ),
        )
        ..loadRequest(Uri.parse(previewUrl));
      if (!mounted) return;
      setState(() {
        controller = webController;
      });
    } catch (_) {
      if (mounted) setState(() => error = 'Không thể tải bản xem trước.');
    }
  }

  // Thực hiện chức năng xem trước url.
  String _previewUrl(Map<String, dynamic> result, String rawUrl) {
    final contentType = result['contentType']?.toString().toLowerCase() ?? '';
    final useOfficeViewer =
        result['fallbackToOfficeViewer'] == true ||
        contentType.contains('officedocument');
    if (!useOfficeViewer) return rawUrl;
    return 'https://view.officeapps.live.com/op/embed.aspx?src='
        '${Uri.encodeComponent(rawUrl)}';
  }

  // Thực hiện chức năng tải xuống.
  Future<void> _download() async {
    try {
      final result = await ref
          .read(apiClientProvider)
          .get('/documents/${widget.document['id']}/download');
      final url = (result['url'] ?? result['downloadUrl'])?.toString();
      if (url == null ||
          !await launchUrl(
            Uri.parse(url),
            mode: LaunchMode.externalApplication,
          )) {
        throw StateError('Download URL unavailable');
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Không thể tải xuống tài liệu.')),
        );
      }
    }
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final title = widget.document['title']?.toString() ?? 'Tài liệu';
    final fileName = widget.document['fileName']?.toString() ?? '';
    return Scaffold(
      backgroundColor: const Color(0xfff1f5f9),
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Row(
          children: [
            const Icon(Icons.description_outlined, color: Color(0xffd97706)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
                  Text(
                    fileName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w400,
                      color: Color(0xff64748b),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Đóng',
            onPressed: () => Navigator.pop(context),
            icon: const Icon(Icons.close_rounded),
          ),
        ],
        bottom: progress > 0 && progress < 100
            ? PreferredSize(
                preferredSize: const Size.fromHeight(3),
                child: LinearProgressIndicator(value: progress / 100),
              )
            : null,
      ),
      body: Padding(
        padding: const EdgeInsets.all(10),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: ColoredBox(
            color: Colors.white,
            child: error != null
                ? _PreviewError(message: error!, retry: _loadPreview)
                : controller == null
                ? const Center(child: CircularProgressIndicator())
                : WebViewWidget(controller: controller!),
          ),
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.restrictCommunityActions) ...[
                const Text(
                  'Hãy lưu tài liệu này để có thể tải xuống/hỏi AI',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Color(0xffb45309),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 9),
              ],
              if (!widget.restrictCommunityActions)
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _download,
                    icon: const Icon(Icons.download_outlined),
                    label: const Text('Tải xuống'),
                  ),
                ),
              if (!widget.restrictCommunityActions &&
                  widget.onAskAi != null) ...[
                const SizedBox(height: 9),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: widget.onAskAi,
                    icon: const Icon(Icons.auto_awesome_rounded),
                    label: const Text('Hỏi AI với tài liệu này'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PreviewError extends StatelessWidget {
  const _PreviewError({required this.message, required this.retry});
  final String message;
  final VoidCallback retry;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded, size: 52, color: Colors.red),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: retry,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Thử lại'),
          ),
        ],
      ),
    ),
  );
}

class _UploadSheet extends ConsumerStatefulWidget {
  const _UploadSheet({
    required this.subjects,
    required this.categories,
    required this.onUploaded,
  });
  final List<Map<String, dynamic>> subjects;
  final List<Map<String, dynamic>> categories;
  final VoidCallback onUploaded;
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<_UploadSheet> createState() => _UploadSheetState();
}

class _UploadSheetState extends ConsumerState<_UploadSheet> {
  final title = TextEditingController();
  final description = TextEditingController();
  final tagInput = TextEditingController();
  PlatformFile? file;
  late final List<Map<String, dynamic>> subjects = [...widget.subjects];
  late final List<Map<String, dynamic>> allCategories = [...widget.categories];
  late String subjectId = subjects.firstOrNull?['id']?.toString() ?? '';
  late String categoryId = categories.firstOrNull?['id']?.toString() ?? '';
  final List<String> tags = [];
  bool isPublic = false;
  bool loading = false;

  // Giải phóng tài nguyên khi đối tượng bị hủy.
  @override
  void dispose() {
    title.dispose();
    description.dispose();
    tagInput.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get categories => allCategories.where((item) {
    final linked = item['subjectId']?.toString();
    return linked == null || linked.isEmpty || linked == subjectId;
  }).toList();

  // Thực hiện chức năng pick tệp.
  Future<void> pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      withData: true,
      type: FileType.custom,
      allowedExtensions: const ['pdf', 'docx', 'pptx', 'xlsx'],
    );
    if (result == null) return;
    setState(() {
      file = result.files.single;
      title.text = file!.name.replaceFirst(RegExp(r'\.[^.]+$'), '');
    });
  }

  // Tạo hoặc lưu thẻ.
  void addTag() {
    final value = tagInput.text.trim().toLowerCase();
    if (value.isEmpty || tags.contains(value) || tags.length >= 10) return;
    setState(() {
      tags.add(value);
      tagInput.clear();
    });
  }

  // Tạo hoặc lưu môn học.
  Future<void> createSubject() async {
    final nameController = TextEditingController();
    final codeController = TextEditingController();
    final values = await showDialog<List<String>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Thêm môn học'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Tên môn học *'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: codeController,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'Mã môn học',
                hintText: 'VD: PRM',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () {
              final name = nameController.text.trim();
              if (name.length < 2) return;
              final code =
                  (codeController.text.trim().isEmpty
                          ? name.substring(0, name.length.clamp(0, 3).toInt())
                          : codeController.text.trim())
                      .toUpperCase();
              Navigator.pop(dialogContext, [name, code]);
            },
            child: const Text('Tạo'),
          ),
        ],
      ),
    );
    nameController.dispose();
    codeController.dispose();
    if (values == null) return;
    try {
      final raw = await ref
          .read(apiClientProvider)
          .post(
            '/subjects',
            data: {'name': values[0], 'code': values[1], 'description': ''},
          );
      final item = Map<String, dynamic>.from(raw as Map);
      setState(() {
        subjects.add(item);
        subjectId = item['id'].toString();
        categoryId = '';
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không thể tạo môn học: $error')),
        );
      }
    }
  }

  // Tạo hoặc lưu danh mục.
  Future<void> createCategory() async {
    if (subjectId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Hãy chọn hoặc tạo môn học trước.')),
      );
      return;
    }
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Thêm danh mục'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Tên danh mục *'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () {
              if (controller.text.trim().length >= 2) {
                Navigator.pop(dialogContext, controller.text.trim());
              }
            },
            child: const Text('Tạo'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null) return;
    try {
      final raw = await ref
          .read(apiClientProvider)
          .post(
            '/categories',
            data: {'name': name, 'subjectId': subjectId, 'description': ''},
          );
      final item = Map<String, dynamic>.from(raw as Map);
      setState(() {
        allCategories.add(item);
        categoryId = item['id'].toString();
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Không thể tạo danh mục: $error')),
        );
      }
    }
  }

  // Thực hiện chức năng submit.
  Future<void> submit() async {
    if (file == null ||
        title.text.trim().isEmpty ||
        subjectId.isEmpty ||
        categoryId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng chọn tệp, môn học và danh mục.'),
        ),
      );
      return;
    }
    setState(() => loading = true);
    try {
      final part = file!.path != null
          ? await MultipartFile.fromFile(file!.path!, filename: file!.name)
          : MultipartFile.fromBytes(file!.bytes!, filename: file!.name);
      await ref
          .read(apiClientProvider)
          .dio
          .post<dynamic>(
            '/documents/upload',
            data: FormData.fromMap({
              'file': part,
              'title': title.text.trim(),
              'description': description.text.trim(),
              'subjectId': subjectId,
              'categoryId': categoryId,
              'visibility': isPublic ? 'PUBLIC' : 'PRIVATE',
              if (tags.isNotEmpty) 'tags': jsonEncode(tags),
            }),
          );
      widget.onUploaded();
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Tải lên thất bại: $error')));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      16,
      20,
      MediaQuery.viewInsetsOf(context).bottom + 20,
    ),
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Tải tài liệu mới',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          const Text('PDF, DOCX, PPTX hoặc XLSX · tối đa 80 MB'),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            onPressed: pickFile,
            icon: const Icon(Icons.attach_file_rounded),
            label: Padding(
              padding: const EdgeInsets.all(14),
              child: Text(file?.name ?? 'Chọn tệp'),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: title,
            decoration: const InputDecoration(labelText: 'Tên tài liệu *'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: description,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Mô tả'),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: subjectId.isEmpty ? null : subjectId,
                  decoration: const InputDecoration(labelText: 'Môn học *'),
                  items: subjects
                      .map(
                        (e) => DropdownMenuItem(
                          value: e['id'].toString(),
                          child: Text(e['name'].toString()),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => setState(() {
                    subjectId = value!;
                    final filtered = categories;
                    if (filtered.isNotEmpty) {
                      categoryId = filtered.first['id'].toString();
                    }
                  }),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: 'Thêm môn học',
                onPressed: loading ? null : createSubject,
                icon: const Icon(Icons.add_rounded),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  key: ValueKey('$subjectId-$categoryId'),
                  initialValue:
                      categories.any((e) => e['id'].toString() == categoryId)
                      ? categoryId
                      : categories.firstOrNull?['id']?.toString(),
                  decoration: const InputDecoration(labelText: 'Danh mục *'),
                  items: categories
                      .map(
                        (e) => DropdownMenuItem(
                          value: e['id'].toString(),
                          child: Text(e['name'].toString()),
                        ),
                      )
                      .toList(),
                  onChanged: (value) => categoryId = value ?? '',
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                tooltip: 'Thêm danh mục',
                onPressed: loading ? null : createCategory,
                icon: const Icon(Icons.add_rounded),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: tagInput,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => addTag(),
            decoration: InputDecoration(
              labelText: 'Thẻ (không bắt buộc)',
              hintText: 'Nhập thẻ rồi nhấn Thêm',
              suffixIcon: IconButton(
                onPressed: addTag,
                icon: const Icon(Icons.add_rounded),
              ),
            ),
          ),
          if (tags.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                spacing: 7,
                runSpacing: 7,
                children: tags
                    .map(
                      (tag) => InputChip(
                        label: Text(tag),
                        onDeleted: () => setState(() => tags.remove(tag)),
                      ),
                    )
                    .toList(),
              ),
            ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: isPublic,
            onChanged: (value) => setState(() => isPublic = value),
            title: const Text('Chia sẻ lên cộng đồng'),
            subtitle: const Text(
              'Tài liệu chỉ xuất hiện sau khi được admin kiểm duyệt',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: loading ? null : submit,
            icon: const Icon(Icons.cloud_upload_outlined),
            label: Padding(
              padding: const EdgeInsets.all(15),
              child: Text(loading ? 'Đang tải...' : 'Tải lên và xử lý AI'),
            ),
          ),
        ],
      ),
    ),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.detail,
    required this.action,
    this.actionLabel = 'Thử lại',
  });
  final IconData icon;
  final String title;
  final String detail;
  final VoidCallback action;
  final String actionLabel;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => ListView(
    children: [
      const SizedBox(height: 120),
      Icon(icon, size: 62, color: const Color(0xffd97706)),
      const SizedBox(height: 14),
      Text(
        title,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
      ),
      Padding(
        padding: const EdgeInsets.all(12),
        child: Text(
          detail,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Color(0xff64748b)),
        ),
      ),
      Center(
        child: FilledButton(onPressed: action, child: Text(actionLabel)),
      ),
    ],
  );
}
