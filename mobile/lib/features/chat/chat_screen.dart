import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_controller.dart';
import '../documents/documents_screen.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({this.initialDocumentId, super.key});
  final String? initialDocumentId;
  // Tạo state quản lý vòng đời của widget.
  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final input = TextEditingController(), focus = FocusNode();
  final messages = <({bool user, String text})>[];
  final selected = <String>{};
  bool loading = false;
  // Khởi tạo state và tài nguyên ban đầu.
  @override
  void initState() {
    super.initState();
    if (widget.initialDocumentId != null) {
      selected.add(widget.initialDocumentId!);
    }
  }

  // Thực hiện chức năng choose.
  Future<void> choose(List<Map<String, dynamic>> docs) async {
    final draft = {...selected};
    final result = await showModalBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheet) => SizedBox(
          height: MediaQuery.sizeOf(context).height * .78,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Chọn nguồn tài liệu',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => setSheet(draft.clear),
                      child: const Text('TOÀN BỘ THƯ VIỆN'),
                    ),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'Chọn một hoặc nhiều tài liệu đã sẵn sàng cho AI. Không chọn nghĩa là hỏi toàn bộ thư viện.',
                  style: TextStyle(color: Color(0xff64748b)),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: docs.length,
                  itemBuilder: (_, i) {
                    final d = docs[i], id = d['id'].toString();
                    return CheckboxListTile(
                      value: draft.contains(id),
                      onChanged: (v) => setSheet(
                        () => v == true ? draft.add(id) : draft.remove(id),
                      ),
                      title: Text(d['title'].toString()),
                      subtitle: Text(
                        '${d['subject']?['name'] ?? ''} · ${d['category']?['name'] ?? ''}',
                      ),
                    );
                  },
                ),
              ),
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => Navigator.pop(context, draft),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Text(
                          draft.isEmpty
                              ? 'DÙNG TOÀN BỘ THƯ VIỆN'
                              : 'DÙNG ${draft.length} TÀI LIỆU',
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (result != null) {
      setState(() {
        selected
          ..clear()
          ..addAll(result);
      });
    }
  }

  // Thực hiện nghiệp vụ send.
  Future<void> send() async {
    final q = input.text.trim();
    if (q.isEmpty || loading) return;
    focus.unfocus();
    setState(() {
      messages.add((user: true, text: q));
      input.clear();
      loading = true;
    });
    try {
      final payload = <String, dynamic>{
        'question': q,
        'limit': selected.isEmpty ? 5 : selected.length,
      };
      if (selected.isNotEmpty) {
        payload['filters'] = {'documentIds': selected.toList()};
      }
      final data = await ref
          .read(apiClientProvider)
          .post('/chat/ask-library', data: payload);
      setState(
        () => messages.add((
          user: false,
          text: data['answer']?.toString() ?? 'Không có câu trả lời.',
        )),
      );
    } catch (e) {
      setState(
        () => messages.add((user: false, text: 'Không thể trả lời: $e')),
      );
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final docs =
        (ref.watch(aiSourceDocumentsProvider).value ??
                const <Map<String, dynamic>>[])
            .where((d) => ['COMPLETED', 'MOCKED'].contains(d['aiStatus']))
            .toList();
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(aiSourceDocumentsProvider);
        await ref.read(aiSourceDocumentsProvider.future);
      },
      child: LayoutBuilder(
        builder: (context, box) => SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: SizedBox(
            height: box.maxHeight,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
                  child: InkWell(
                    onTap: () => choose(docs),
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Nguồn trả lời',
                        prefixIcon: Icon(Icons.library_books_outlined),
                        suffixIcon: Icon(Icons.tune),
                      ),
                      child: Text(
                        selected.isEmpty
                            ? 'Toàn bộ thư viện'
                            : 'Đã chọn ${selected.length} tài liệu',
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: messages.isEmpty
                      ? const Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.auto_awesome,
                                size: 52,
                                color: Color(0xffd97706),
                              ),
                              SizedBox(height: 12),
                              Text(
                                'Hỏi đáp từ tài liệu',
                                style: TextStyle(
                                  fontFamily: 'Georgia',
                                  fontSize: 25,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(
                                'Chọn nhiều tài liệu hoặc hỏi trên toàn bộ thư viện.',
                              ),
                            ],
                          ),
                        )
                      : ListView.builder(
                          keyboardDismissBehavior:
                              ScrollViewKeyboardDismissBehavior.onDrag,
                          padding: const EdgeInsets.all(16),
                          itemCount: messages.length,
                          itemBuilder: (_, i) {
                            final m = messages[i];
                            return Align(
                              alignment: m.user
                                  ? Alignment.centerRight
                                  : Alignment.centerLeft,
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 10),
                                padding: const EdgeInsets.all(14),
                                constraints: BoxConstraints(
                                  maxWidth:
                                      MediaQuery.sizeOf(context).width * .82,
                                ),
                                decoration: BoxDecoration(
                                  color: m.user
                                      ? const Color(0xff0f172a)
                                      : Colors.white,
                                  borderRadius: BorderRadius.circular(18),
                                ),
                                child: Text(
                                  m.text,
                                  style: TextStyle(
                                    color: m.user
                                        ? Colors.white
                                        : Colors.black87,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: TextField(
                            controller: input,
                            focusNode: focus,
                            minLines: 1,
                            maxLines: 3,
                            decoration: InputDecoration(
                              hintText: 'Nhập câu hỏi...',
                              suffixIcon: IconButton(
                                onPressed: focus.unfocus,
                                icon: const Icon(Icons.keyboard_hide),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          onPressed: loading ? null : send,
                          icon: loading
                              ? const SizedBox.square(
                                  dimension: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(Icons.arrow_upward),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
