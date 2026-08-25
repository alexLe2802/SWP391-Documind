import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../auth/auth_controller.dart';

final subscriptionProvider = FutureProvider.autoDispose<Map<String, dynamic>>((
  ref,
) async {
  final api = ref.watch(apiClientProvider);
  final results = await Future.wait([
    api.get('/subscription/plans'),
    api.get('/subscription/current'),
    api.get('/payments/history'),
  ]);
  return {
    'plans': api.listFrom(results[0]),
    'current': Map<String, dynamic>.from(results[1] as Map),
    'history': api.listFrom(results[2]),
  };
});

class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(subscriptionProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Gói dịch vụ')),
      body: state.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _LoadError(
          message: 'Không thể tải thông tin gói dịch vụ.\n$error',
          retry: () => ref.invalidate(subscriptionProvider),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () => ref.refresh(subscriptionProvider.future),
          child: _SubscriptionContent(data: data),
        ),
      ),
    );
  }
}

class _SubscriptionContent extends ConsumerWidget {
  const _SubscriptionContent({required this.data});
  final Map<String, dynamic> data;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = Map<String, dynamic>.from(data['current'] as Map);
    final plans = (data['plans'] as List).cast<Map<String, dynamic>>();
    final history = (data['history'] as List).cast<Map<String, dynamic>>();
    final currentCode = current['plan']?.toString() ?? 'FREE';
    Map<String, dynamic>? currentPlan;
    for (final plan in plans) {
      if (plan['code'] == currentCode) {
        currentPlan = plan;
        break;
      }
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 32),
      children: [
        const Text(
          'GÓI DỊCH VỤ',
          style: TextStyle(
            color: Color(0xffd97706),
            letterSpacing: 1.2,
            fontWeight: FontWeight.w800,
            fontSize: 12,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Lựa chọn phù hợp với hành trình học tập của bạn.',
          style: TextStyle(
            fontFamily: 'Georgia',
            fontSize: 29,
            height: 1.1,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 9),
        const Text(
          'Thanh toán an toàn bằng thẻ quốc tế hoặc QR chuyển khoản qua SePay.',
          style: TextStyle(color: Color(0xff64748b), height: 1.45),
        ),
        const SizedBox(height: 20),
        _CurrentPlanCard(
          current: current,
          name: currentPlan?['name']?.toString(),
        ),
        const SizedBox(height: 26),
        const _SectionTitle('MUA THÊM TÀI NGUYÊN'),
        const SizedBox(height: 10),
        ...plans.map(
          (plan) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _PlanCard(
              plan: plan,
              currentCode: currentCode,
              onSelect: () => _showCheckout(context, ref, plan),
            ),
          ),
        ),
        if (history.isNotEmpty) ...[
          const SizedBox(height: 16),
          const _SectionTitle('LỊCH SỬ THANH TOÁN'),
          const SizedBox(height: 10),
          Card(
            child: Column(
              children: history.take(5).map((payment) {
                final isLast = payment == history.take(5).last;
                return _PaymentRow(
                  payment: payment,
                  showDivider: !isLast,
                  onResume:
                      payment['status'] == 'PENDING' &&
                          _isNotExpired(payment['expiresAt']) &&
                          payment['plan'] != 'FREE'
                      ? () => _resumePayment(context, ref, payment)
                      : null,
                );
              }).toList(),
            ),
          ),
        ],
      ],
    );
  }

  // Thực hiện chức năng show đơn thanh toán.
  Future<void> _showCheckout(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> plan,
  ) async {
    final result = await showModalBottomSheet<_CheckoutChoice>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _CheckoutSheet(plan: plan, amount: _num(plan['amount'])),
    );
    if (result == null || !context.mounted) return;
    await _startCheckout(context, ref, plan['code'].toString(), result.method);
  }

  // Thực hiện chức năng resume thanh toán.
  Future<void> _resumePayment(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> payment,
  ) => _startCheckout(
    context,
    ref,
    payment['plan'].toString(),
    payment['paymentMethod']?.toString() ?? 'BANK_TRANSFER',
  );

  // Thực hiện chức năng start đơn thanh toán.
  Future<void> _startCheckout(
    BuildContext context,
    WidgetRef ref,
    String plan,
    String method,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final raw = await ref
          .read(apiClientProvider)
          .post(
            '/payments/checkout',
            data: {'plan': plan, 'paymentMethod': method},
          );
      final checkout = Map<String, dynamic>.from(raw as Map);
      if (!context.mounted) return;
      final result = await Navigator.of(context).push<_PaymentResult>(
        MaterialPageRoute(builder: (_) => _CheckoutWebView(checkout: checkout)),
      );
      if (result == null) return;
      if (result.status == 'cancel' || result.status == 'error') {
        await ref
            .read(apiClientProvider)
            .post(
              '/payments/${Uri.encodeComponent(result.invoice)}/status',
              data: {
                'status': result.status == 'cancel' ? 'CANCELLED' : 'FAILED',
              },
            );
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              result.status == 'cancel'
                  ? 'Bạn đã hủy thanh toán.'
                  : 'Thanh toán không thành công.',
            ),
          ),
        );
      } else {
        final paid = await _waitForPayment(ref, result.invoice);
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              paid
                  ? 'Thanh toán thành công. Tài nguyên và thời hạn đã được cộng thêm.'
                  : 'SePay đang xác nhận giao dịch. Vui lòng kiểm tra lại sau.',
            ),
          ),
        );
      }
      ref.invalidate(subscriptionProvider);
    } catch (error) {
      messenger.showSnackBar(
        SnackBar(content: Text('Không thể khởi tạo thanh toán: $error')),
      );
    }
  }

  // Thực hiện chức năng wait for thanh toán.
  Future<bool> _waitForPayment(WidgetRef ref, String invoice) async {
    for (var attempt = 0; attempt < 20; attempt++) {
      final raw = await ref
          .read(apiClientProvider)
          .get('/payments/${Uri.encodeComponent(invoice)}');
      final payment = Map<String, dynamic>.from(raw as Map);
      if (payment['status'] == 'PAID' || payment['status'] == 'SUCCESS') {
        return true;
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    return false;
  }
}

class _CurrentPlanCard extends StatelessWidget {
  const _CurrentPlanCard({required this.current, this.name});
  final Map<String, dynamic> current;
  final String? name;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final used = _num(current['aiChatsUsed']);
    final limit = current['aiChatLimit'] == null
        ? 0
        : _num(current['aiChatLimit']);
    final progress = limit <= 0 ? 0.0 : (used / limit).clamp(0.0, 1.0);
    final expires = DateTime.tryParse(current['expiresAt']?.toString() ?? '');
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xff0f172a),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(
                Icons.auto_awesome_rounded,
                color: Color(0xfff59e0b),
                size: 19,
              ),
              SizedBox(width: 8),
              Text(
                'Ví tài nguyên hiện tại',
                style: TextStyle(color: Color(0xffcbd5e1)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            name ?? current['plan']?.toString() ?? 'FREE',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 27,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            expires == null
                ? 'Gói miễn phí không có ngày hết hạn.'
                : 'Có hiệu lực đến ${_date(expires)}',
            style: const TextStyle(color: Color(0xff94a3b8)),
          ),
          const SizedBox(height: 18),
          LinearProgressIndicator(
            value: progress,
            minHeight: 7,
            borderRadius: BorderRadius.circular(10),
            backgroundColor: const Color(0xff334155),
            color: const Color(0xfff59e0b),
          ),
          const SizedBox(height: 14),
          Text(
            'Còn ${current['aiChatsRemaining'] ?? '∞'} lượt chat AI · '
            '${current['uploadsRemaining'] ?? 0} tài liệu · '
            '${_storage(current['storageRemainingMb'])}',
            style: const TextStyle(color: Colors.white, height: 1.45),
          ),
          const SizedBox(height: 4),
          Text(
            'Đã dùng ${current['aiChatsUsed'] ?? 0} lượt chat · '
            '${current['uploadsUsed'] ?? 0} tài liệu · '
            '${_storage(current['storageUsedMb'])}',
            style: const TextStyle(
              color: Color(0xff94a3b8),
              fontSize: 12,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

const _features = <String, Map<String, String>>{
  'FREE': {
    'best': 'Dành cho nhu cầu không thường xuyên',
    'storage': '100 MB',
    'uploads': '10',
    'chats': '20',
    'offline': 'Không',
  },
  'STUDENT': {
    'best': 'Dành cho học sinh, sinh viên học tập tích cực',
    'storage': '1 GB',
    'uploads': '100',
    'chats': '300',
    'offline': 'Giới hạn',
  },
  'PRO': {
    'best': 'Dành cho người dùng chuyên sâu',
    'storage': '5 GB, có thể mở rộng',
    'uploads': '500',
    'chats': 'Không giới hạn',
    'offline': 'Có',
  },
};

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.currentCode,
    required this.onSelect,
  });
  final Map<String, dynamic> plan;
  final String currentCode;
  final VoidCallback onSelect;

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final code = plan['code']?.toString() ?? 'FREE';
    final values = _features[code] ?? _features['FREE']!;
    final current = currentCode == code;
    final selectable = code != 'FREE';
    final featured = code == 'STUDENT';
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: featured ? const Color(0xfff59e0b) : const Color(0xffe2e8f0),
          width: featured ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                code,
                style: const TextStyle(
                  color: Color(0xffd97706),
                  letterSpacing: 1.1,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
              const Spacer(),
              if (featured)
                const _Badge(text: 'ĐỀ XUẤT', color: Color(0xffd97706)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            _price(plan['amount'], plan['currency']?.toString() ?? 'VND'),
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
          ),
          if (_num(plan['amount']) > 0)
            Text(
              '/ ${plan['durationDays'] ?? 30} ngày cộng thêm',
              style: const TextStyle(color: Color(0xff64748b)),
            ),
          const SizedBox(height: 7),
          Text(
            values['best']!,
            style: const TextStyle(color: Color(0xff64748b)),
          ),
          const Divider(height: 28),
          _Feature(
            icon: Icons.cloud_outlined,
            label: 'Dung lượng',
            value: values['storage']!,
          ),
          _Feature(
            icon: Icons.description_outlined,
            label: 'Tải lên',
            value: '${values['uploads']} tài liệu',
          ),
          _Feature(
            icon: Icons.auto_awesome_outlined,
            label: 'AI Chat',
            value: values['chats']!,
          ),
          _Feature(
            icon: Icons.download_for_offline_outlined,
            label: 'Ngoại tuyến',
            value: values['offline']!,
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: featured
                ? FilledButton(
                    onPressed: selectable ? onSelect : null,
                    child: Text(
                      code == 'FREE'
                          ? 'Quyền lợi mặc định'
                          : current
                          ? 'Mua thêm ${plan['name']}'
                          : 'Mua ${plan['name']}',
                    ),
                  )
                : OutlinedButton(
                    onPressed: selectable ? onSelect : null,
                    child: Text(
                      code == 'FREE'
                          ? 'Quyền lợi mặc định'
                          : current
                          ? 'Mua thêm ${plan['name']}'
                          : 'Mua ${plan['name']}',
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _Feature extends StatelessWidget {
  const _Feature({
    required this.icon,
    required this.label,
    required this.value,
  });
  final IconData icon;
  final String label;
  final String value;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 24,
          child: Icon(icon, size: 19, color: const Color(0xff64748b)),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 82,
          child: Text(label, style: const TextStyle(color: Color(0xff475569))),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: const TextStyle(fontWeight: FontWeight.w700, height: 1.3),
          ),
        ),
      ],
    ),
  );
}

class _CheckoutSheet extends StatefulWidget {
  const _CheckoutSheet({required this.plan, required this.amount});
  final Map<String, dynamic> plan;
  final num amount;
  // Tạo state quản lý vòng đời của widget.
  @override
  State<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<_CheckoutSheet> {
  String method = 'BANK_TRANSFER';
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      20,
      12,
      20,
      20 + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Center(
          child: Container(
            width: 42,
            height: 4,
            decoration: BoxDecoration(
              color: const Color(0xffcbd5e1),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        ),
        const SizedBox(height: 20),
        const Text(
          'THANH TOÁN QUA SEPAY',
          style: TextStyle(
            color: Color(0xffd97706),
            fontSize: 12,
            letterSpacing: 1,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          widget.plan['name']?.toString() ?? '',
          style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: Text(
                'Cộng thêm tài nguyên và ${widget.plan['durationDays'] ?? 30} ngày sử dụng',
              ),
            ),
            Text(
              _price(
                widget.amount,
                widget.plan['currency']?.toString() ?? 'VND',
              ),
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _MethodTile(
          icon: Icons.account_balance_rounded,
          title: 'QR chuyển khoản',
          subtitle: 'Quét VietQR bằng ứng dụng ngân hàng',
          selected: method == 'BANK_TRANSFER',
          onTap: () => setState(() => method = 'BANK_TRANSFER'),
        ),
        const SizedBox(height: 9),
        _MethodTile(
          icon: Icons.credit_card_rounded,
          title: 'Thẻ quốc tế',
          subtitle: 'Visa · Mastercard · JCB · 3D Secure',
          selected: method == 'CARD',
          onTap: () => setState(() => method = 'CARD'),
        ),
        const SizedBox(height: 14),
        const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.verified_user_outlined,
              size: 18,
              color: Color(0xff16a34a),
            ),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'Thanh toán trên cổng bảo mật SePay. DocuMind không lưu thông tin thẻ.',
                style: TextStyle(fontSize: 12, color: Color(0xff64748b)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () => Navigator.pop(context, _CheckoutChoice(method)),
            icon: Icon(
              method == 'CARD' ? Icons.credit_card : Icons.account_balance,
            ),
            label: const Padding(
              padding: EdgeInsets.all(13),
              child: Text('Tiếp tục thanh toán'),
            ),
          ),
        ),
      ],
    ),
  );
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(15),
    child: Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(15),
        border: Border.all(
          color: selected ? const Color(0xffd97706) : const Color(0xffcbd5e1),
          width: selected ? 1.5 : 1,
        ),
      ),
      child: Row(
        children: [
          Icon(
            icon,
            color: selected ? const Color(0xffd97706) : const Color(0xff475569),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xff64748b),
                  ),
                ),
              ],
            ),
          ),
          Icon(
            selected ? Icons.check_circle : Icons.circle_outlined,
            color: selected ? const Color(0xffd97706) : const Color(0xffcbd5e1),
          ),
        ],
      ),
    ),
  );
}

class _CheckoutWebView extends StatefulWidget {
  const _CheckoutWebView({required this.checkout});
  final Map<String, dynamic> checkout;
  // Tạo state quản lý vòng đời của widget.
  @override
  State<_CheckoutWebView> createState() => _CheckoutWebViewState();
}

class _CheckoutWebViewState extends State<_CheckoutWebView> {
  late final WebViewController controller;
  Timer? timer;
  int progress = 0;
  int secondsRemaining = 0;
  // Khởi tạo state và tài nguyên ban đầu.
  @override
  void initState() {
    super.initState();
    secondsRemaining = _remainingSeconds(widget.checkout['expiresAt']);
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {
          secondsRemaining = _remainingSeconds(widget.checkout['expiresAt']);
        });
      }
    });
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (value) =>
              mounted ? setState(() => progress = value) : null,
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            final result = uri?.queryParameters['payment'];
            if (result != null &&
                ['success', 'cancel', 'error'].contains(result)) {
              final invoice =
                  uri?.queryParameters['invoice'] ??
                  widget.checkout['invoiceNumber'].toString();
              Navigator.pop(context, _PaymentResult(result, invoice));
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadHtmlString(_checkoutHtml(widget.checkout));
  }

  // Giải phóng tài nguyên khi đối tượng bị hủy.
  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Thanh toán SePay'),
          Text(
            'Phiên ${widget.checkout['invoiceNumber']} · ${_countdown(secondsRemaining)}',
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w400),
          ),
        ],
      ),
      bottom: progress < 100
          ? PreferredSize(
              preferredSize: const Size.fromHeight(3),
              child: LinearProgressIndicator(value: progress / 100),
            )
          : null,
    ),
    body: WebViewWidget(controller: controller),
  );
}

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({
    required this.payment,
    required this.showDivider,
    this.onResume,
  });
  final Map<String, dynamic> payment;
  final bool showDivider;
  final VoidCallback? onResume;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) {
    final status = payment['status']?.toString() ?? 'PENDING';
    final color = status == 'PAID' || status == 'SUCCESS'
        ? const Color(0xff15803d)
        : status == 'PENDING'
        ? const Color(0xffd97706)
        : const Color(0xffdc2626);
    return Column(
      children: [
        InkWell(
          onTap: onResume,
          child: Padding(
            padding: const EdgeInsets.all(15),
            child: Row(
              children: [
                Icon(
                  payment['paymentMethod'] == 'CARD'
                      ? Icons.credit_card
                      : Icons.account_balance,
                  color: const Color(0xff64748b),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${payment['plan']} · ${_price(payment['amount'], payment['currency']?.toString() ?? 'VND')}',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        payment['invoiceNumber']?.toString() ?? '',
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xff64748b),
                        ),
                      ),
                    ],
                  ),
                ),
                _Badge(
                  text: onResume != null ? 'TIẾP TỤC' : status,
                  color: color,
                ),
              ],
            ),
          ),
        ),
        if (showDivider) const Divider(height: 1, indent: 52),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.color});
  final String text;
  final Color color;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .1),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      text,
      style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 10),
    ),
  );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;
  // Xây dựng giao diện hoặc dữ liệu trả về.
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      color: Color(0xff475569),
      letterSpacing: 1,
      fontWeight: FontWeight.w800,
      fontSize: 12,
    ),
  );
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.message, required this.retry});
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
          const Icon(Icons.cloud_off_rounded, size: 42),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: retry,
            icon: const Icon(Icons.refresh),
            label: const Text('Thử lại'),
          ),
        ],
      ),
    ),
  );
}

class _CheckoutChoice {
  const _CheckoutChoice(this.method);
  final String method;
}

class _PaymentResult {
  const _PaymentResult(this.status, this.invoice);
  final String status;
  final String invoice;
}

// Thực hiện chức năng đơn thanh toán html.
String _checkoutHtml(Map<String, dynamic> checkout) {
  const escape = HtmlEscape(HtmlEscapeMode.attribute);
  final fields = Map<String, dynamic>.from(
    checkout['fields'] as Map? ?? const {},
  );
  final inputs = fields.entries
      .map(
        (entry) =>
            '<input type="hidden" name="${escape.convert(entry.key)}" value="${escape.convert(entry.value.toString())}">',
      )
      .join();
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system;padding:40px;text-align:center;color:#0f172a}.spin{width:32px;height:32px;border:4px solid #ddd;border-top-color:#d97706;border-radius:50%;margin:20px auto;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div class="spin"></div><b>Đang kết nối SePay...</b><form id="checkout" method="POST" action="${escape.convert(checkout['checkoutUrl'].toString())}">$inputs</form><script>document.getElementById("checkout").submit();</script></body></html>';
}

// Thực hiện chức năng num.
num _num(dynamic value) =>
    value is num ? value : num.tryParse(value?.toString() ?? '') ?? 0;
// Thực hiện chức năng price.
String _price(dynamic amount, String currency) {
  final digits = _num(amount).round().toString().replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => '.',
  );
  return currency == 'VND' ? '$digitsđ' : '$digits $currency';
}

// Thực hiện chức năng storage.
String _storage(dynamic value) {
  final mb = _num(value);
  return mb >= 1024
      ? '${(mb / 1024).toStringAsFixed(2)} GB'
      : '${mb.toStringAsFixed(mb % 1 == 0 ? 0 : 2)} MB';
}

// Thực hiện chức năng date.
String _date(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}';
// Thực hiện chức năng is not expired.
bool _isNotExpired(dynamic value) {
  final expiresAt = DateTime.tryParse(value?.toString() ?? '');
  return expiresAt != null && expiresAt.isAfter(DateTime.now());
}

// Thực hiện chức năng remaining seconds.
int _remainingSeconds(dynamic value) {
  final expiresAt = DateTime.tryParse(value?.toString() ?? '');
  if (expiresAt == null) return 0;
  return expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 86400).toInt();
}

// Thực hiện chức năng countdown.
String _countdown(int seconds) =>
    '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
