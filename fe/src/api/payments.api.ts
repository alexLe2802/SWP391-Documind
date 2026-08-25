import { apiRequest } from "../lib/http";
import type {
  CheckoutResponse,
  CurrentSubscription,
  PaymentMethodCode,
  PaymentOrder,
  SubscriptionPlan,
  SubscriptionPlanCode,
} from "../types/payment";

// Lấy dữ liệu quyền lợi gói dịch vụ.
export function fetchSubscriptionPlans() {
  return apiRequest<SubscriptionPlan[]>("/subscription/plans");
}

// Lấy dữ liệu hiện tại quyền lợi.
export function fetchCurrentSubscription() {
  return apiRequest<CurrentSubscription>("/subscription/current");
}

// Tạo hoặc lưu đơn thanh toán.
export function createCheckout(
  plan: Exclude<SubscriptionPlanCode, "FREE">,
  paymentMethod: PaymentMethodCode,
) {
  return apiRequest<CheckoutResponse>("/payments/checkout", {
    method: "POST",
    body: { plan, paymentMethod },
  });
}

// Lấy dữ liệu thanh toán.
export function fetchPayment(invoiceNumber: string) {
  return apiRequest<PaymentOrder>(
    `/payments/${encodeURIComponent(invoiceNumber)}`,
  );
}

// Lấy dữ liệu thanh toán lịch sử.
export function fetchPaymentHistory() {
  return apiRequest<PaymentOrder[]>("/payments/history");
}

// Cập nhật thanh toán trạng thái.
export function updatePaymentStatus(
  invoiceNumber: string,
  status: "FAILED" | "CANCELLED",
) {
  return apiRequest<PaymentOrder>(
    `/payments/${encodeURIComponent(invoiceNumber)}/status`,
    {
      method: "POST",
      body: { status },
    },
  );
}

// Thực hiện chức năng submit se pay đơn thanh toán.
export function submitSePayCheckout(checkout: CheckoutResponse) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.checkoutUrl;

  Object.entries(checkout.fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
}
