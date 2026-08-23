"use client";

import {
  Check,
  Cloud,
  CreditCard,
  Download,
  FileText,
  Landmark,
  LoaderCircle,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCheckout,
  fetchCurrentSubscription,
  fetchPayment,
  fetchPaymentHistory,
  fetchSubscriptionPlans,
  submitSePayCheckout,
  updatePaymentStatus,
} from "../api/payments.api";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import type {
  CurrentSubscription,
  PaymentMethodCode,
  PaymentOrder,
  SubscriptionPlan,
  SubscriptionPlanCode,
} from "../types/payment";

const PLAN_FEATURES: Record<
  SubscriptionPlanCode,
  {
    bestFor: [string, string];
    storage: string;
    uploads: number;
    chats: string;
    offline: "NO" | "LIMITED" | "YES";
  }
> = {
  FREE: {
    bestFor: [
      "Phù hợp nhất cho người dùng không thường xuyên.",
      "Best for casual users.",
    ],
    storage: "100 MB",
    uploads: 10,
    chats: "20",
    offline: "NO",
  },
  STUDENT: {
    bestFor: [
      "Phù hợp nhất cho học sinh, sinh viên học tập tích cực.",
      "Best for active students.",
    ],
    storage: "1 GB",
    uploads: 100,
    chats: "300",
    offline: "LIMITED",
  },
  PRO: {
    bestFor: [
      "Phù hợp nhất cho người dùng chuyên sâu.",
      "Best for power users.",
    ],
    storage: "5 GB",
    uploads: 500,
    chats: "UNLIMITED",
    offline: "YES",
  },
};

const DEFAULT_PLAN_FEATURES = PLAN_FEATURES.FREE;

// Hiển thị giao diện quyền lợi view.
export function SubscriptionView() {
  const { locale } = useLanguage();
  const text = useCallback(
    (vi: string, en: string) => localize(locale, vi, en),
    [locale],
  );
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] =
    useState<CurrentSubscription>();
  const [history, setHistory] = useState<PaymentOrder[]>([]);
  const [selectedPlan, setSelectedPlan] =
    useState<Exclude<SubscriptionPlanCode, "FREE">>();
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodCode>("BANK_TRANSFER");
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [checkoutSession, setCheckoutSession] = useState<{
    invoiceNumber: string;
    expiresAt: string;
  }>();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadSubscriptionData = useCallback(async () => {
    const [planItems, subscription, paymentItems] = await Promise.all([
      fetchSubscriptionPlans(),
      fetchCurrentSubscription(),
      fetchPaymentHistory(),
    ]);
    setPlans(planItems);
    setCurrentSubscription(subscription);
    setHistory(paymentItems);
  }, []);

  useEffect(() => {
    let active = true;
    loadSubscriptionData()
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : text(
                "Không thể tải thông tin thanh toán.",
                "Could not load payment information.",
              ),
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadSubscriptionData, text]);

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    const paymentResult = searchParams?.get("payment");
    const invoiceNumber = searchParams?.get("invoice");
    if (!paymentResult) return;

    if (paymentResult === "cancel") {
      setNotice(text("Bạn đã hủy thanh toán.", "Payment was cancelled."));
      if (invoiceNumber) {
        void updatePaymentStatus(invoiceNumber, "CANCELLED")
          .then(loadSubscriptionData)
          .catch(() => undefined);
      }
      return;
    }
    if (paymentResult === "error") {
      setError(
        text(
          "Thanh toán không thành công. Vui lòng thử lại.",
          "Payment was not successful. Please try again.",
        ),
      );
      if (invoiceNumber) {
        void updatePaymentStatus(invoiceNumber, "FAILED")
          .then(loadSubscriptionData)
          .catch(() => undefined);
      }
      return;
    }
    if (paymentResult !== "success" || !invoiceNumber) return;

    let active = true;
    let attempts = 0;
    // Kiểm tra điều kiện trạng thái.
    const checkStatus = async () => {
      attempts += 1;
      try {
        const payment = await fetchPayment(invoiceNumber);
        if (!active) return;
        if (payment.status === "PAID") {
          setNotice(
            text(
              "Thanh toán thành công. Gói của bạn đã được kích hoạt.",
              "Payment completed. Your plan is now active.",
            ),
          );
          await loadSubscriptionData();
          return;
        }
        if (attempts < 20) {
          window.setTimeout(() => void checkStatus(), 2000);
        } else {
          setNotice(
            text(
              "SePay đang xác nhận giao dịch. Bạn có thể kiểm tra lại sau ít phút.",
              "SePay is confirming the transaction. Please check again shortly.",
            ),
          );
        }
      } catch (statusError) {
        if (active) {
          setError(
            statusError instanceof Error
              ? statusError.message
              : text(
                "Không thể kiểm tra giao dịch.",
                "Could not check the payment.",
              ),
          );
        }
      }
    };
    void checkStatus();
    return () => {
      active = false;
    };
  }, [loadSubscriptionData, searchParams, text]);

  const currentPlan = currentSubscription?.plan ?? "FREE";
  const currentPlanDetails =
    plans.find((plan) => plan.code === currentPlan) ?? plans[0];
  const selectedPlanDetails = useMemo(
    () => plans.find((plan) => plan.code === selectedPlan),
    [plans, selectedPlan],
  );
  const selectedCheckoutAmount = useMemo(
    () => selectedPlanDetails?.amount ?? 0,
    [selectedPlanDetails],
  );
  const checkoutSecondsRemaining = getRemainingSeconds(
    checkoutSession?.expiresAt,
    nowMs,
  );

  // Xử lý sự kiện đơn thanh toán.
  async function handleCheckout() {
    if (!selectedPlan) return;
    setError("");
    setNotice("");
    setIsCheckingOut(true);
    try {
      const checkout = await createCheckout(selectedPlan, paymentMethod);
      setCheckoutSession({
        invoiceNumber: checkout.invoiceNumber,
        expiresAt: checkout.expiresAt,
      });
      window.setTimeout(() => submitSePayCheckout(checkout), 250);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : text(
            "Không thể khởi tạo thanh toán.",
            "Could not initialize payment.",
          ),
      );
      setIsCheckingOut(false);
    }
  }

  // Xử lý sự kiện resume thanh toán.
  async function handleResumePayment(payment: PaymentOrder) {
    if (payment.plan === "FREE") return;
    setError("");
    setNotice("");
    setIsCheckingOut(true);
    try {
      const checkout = await createCheckout(
        payment.plan,
        payment.paymentMethod,
      );
      setCheckoutSession({
        invoiceNumber: checkout.invoiceNumber,
        expiresAt: checkout.expiresAt,
      });
      window.setTimeout(() => submitSePayCheckout(checkout), 250);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : text(
            "Khong the mo lai phien thanh toan.",
            "Could not reopen the payment session.",
          ),
      );
      setIsCheckingOut(false);
    }
  }

  return (
    <main id="main-content" className="simple-workspace-page">
      <header>
        <p className="eyebrow">{text("GÓI DỊCH VỤ", "SUBSCRIPTION")}</p>
        <h1>
          {text(
            "Gói dịch vụ phù hợp với quá trình nghiên cứu.",
            "A plan that grows with your research.",
          )}
        </h1>
        <p>
          {text(
            "Thanh toán an toàn bằng thẻ quốc tế hoặc QR chuyển khoản qua SePay.",
            "Pay securely by international card or domestic bank-transfer QR through SePay.",
          )}
        </p>
      </header>

      {notice ? (
        <div className="payment-notice payment-notice--success">
          <Check size={17} />
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="payment-notice payment-notice--error">
          <X size={17} />
          {error}
        </div>
      ) : null}

      <section className="subscription-layout">
        <article className="current-plan-panel">
          <div>
            <span>
              <Sparkles size={18} />
              {text("Quyền lợi hiện tại", "Current entitlements")}
            </span>
            <strong>{currentPlanDetails?.name ?? currentPlan}</strong>
          </div>
          {currentSubscription?.expiresAt ? (
            <p>
              {text(
                `Có hiệu lực đến ${new Date(currentSubscription.expiresAt).toLocaleDateString("vi-VN")}`,
                `Active until ${new Date(currentSubscription.expiresAt).toLocaleDateString("en-US")}`,
              )}
            </p>
          ) : (
            <p>
              {text(
                "Gói miễn phí không có ngày hết hạn.",
                "The Free plan does not expire.",
              )}
            </p>
          )}
          <div className="usage-meter">
            <span
              style={{ width: `${getQuotaUsagePercent(currentSubscription)}%` }}
            />
          </div>
          <small>
            {currentSubscription
              ? text(
                `Còn ${currentSubscription.aiChatsRemaining ?? "∞"} lượt chat AI · ${currentSubscription.uploadsRemaining} tài liệu · ${formatStorage(currentSubscription.storageRemainingMb)} dung lượng`,
                `${currentSubscription.aiChatsRemaining ?? "∞"} AI chats · ${currentSubscription.uploadsRemaining} documents · ${formatStorage(currentSubscription.storageRemainingMb)} storage remaining`,
              )
              : text("Đang tải hạn mức...", "Loading limits...")}
          </small>
          {currentSubscription ? (
            <small>
              {text(
                `Đã dùng ${currentSubscription.aiChatsUsed} lượt chat · ${currentSubscription.uploadsUsed} tài liệu · ${formatStorage(currentSubscription.storageUsedMb)}`,
                `Used ${currentSubscription.aiChatsUsed} chats · ${currentSubscription.uploadsUsed} documents · ${formatStorage(currentSubscription.storageUsedMb)}`,
              )}
            </small>
          ) : null}
        </article>

        <div className="plan-grid">
          {plans.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              isCurrent={currentPlan === plan.code}
              onSelect={() => {
                if (plan.code !== "FREE") {
                  setSelectedPlan(plan.code);
                }
              }}
              locale={locale}
              text={text}
            />
          ))}
        </div>

        {history.length > 0 ? (
          <section className="payment-history-panel">
            <header>
              <div>
                <p className="eyebrow">
                  {text("LỊCH SỬ THANH TOÁN", "PAYMENT HISTORY")}
                </p>
                <h2>{text("Giao dịch gần đây", "Recent transactions")}</h2>
              </div>
              <ShieldCheck size={20} />
            </header>
            <div>
              {history.slice(0, 5).map((payment) => {
                const remainingSeconds = getRemainingSeconds(
                  payment.expiresAt,
                  nowMs,
                );
                const canResume =
                  payment.status === "PENDING" &&
                  remainingSeconds > 0 &&
                  payment.plan !== "FREE";

                return (
                  <article key={payment.invoiceNumber}>
                    <span>
                      {payment.paymentMethod === "CARD" ? (
                        <CreditCard size={17} />
                      ) : (
                        <Landmark size={17} />
                      )}
                      <span>
                        <strong>{payment.plan}</strong>
                        <small>{payment.invoiceNumber}</small>
                      </span>
                    </span>
                    <span>
                      <strong>
                        {formatPrice(payment.amount, payment.currency, locale)}
                      </strong>
                      <small
                        className={`payment-status payment-status--${payment.status.toLowerCase()}`}
                      >
                        {payment.status}
                      </small>
                      {canResume ? (
                        <button
                          type="button"
                          onClick={() => void handleResumePayment(payment)}
                          disabled={isCheckingOut}
                        >
                          <Timer size={14} />
                          {text("Tiep tuc", "Resume")} -{" "}
                          {formatCountdown(remainingSeconds)}
                        </button>
                      ) : null}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </section>

      {selectedPlan && selectedPlanDetails ? (
        <div
          className="payment-overlay"
          role="presentation"
          onMouseDown={() => !isCheckingOut && setSelectedPlan(undefined)}
        >
          <article
            className="payment-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={text(
              "Chọn phương thức thanh toán",
              "Choose payment method",
            )}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">
                  {text("THANH TOÁN QUA SEPAY", "SEPAY CHECKOUT")}
                </p>
                <h2>{selectedPlanDetails.name}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlan(undefined)}
                disabled={isCheckingOut}
                aria-label={text("Đóng", "Close")}
              >
                <X size={18} />
              </button>
            </header>
            <div className="payment-order-summary">
              <span>
                {text(
                  `Cộng thêm tài nguyên và ${selectedPlanDetails.durationDays} ngày sử dụng`,
                  `Add resources and ${selectedPlanDetails.durationDays} access days`,
                )}
              </span>
              <strong>
                {formatPrice(
                  selectedCheckoutAmount,
                  selectedPlanDetails.currency,
                  locale,
                )}
              </strong>
            </div>
            <div className="payment-methods">
              <button
                type="button"
                className={paymentMethod === "BANK_TRANSFER" ? "active" : ""}
                onClick={() => setPaymentMethod("BANK_TRANSFER")}
              >
                <Landmark size={23} />
                <span>
                  <strong>{text("QR chuyển khoản", "Bank-transfer QR")}</strong>
                  <small>
                    {text(
                      "Quét VietQR bằng ứng dụng ngân hàng trong nước",
                      "Scan VietQR with a Vietnamese banking app",
                    )}
                  </small>
                </span>
                {paymentMethod === "BANK_TRANSFER" ? <Check size={17} /> : null}
              </button>
              <button
                type="button"
                className={paymentMethod === "CARD" ? "active" : ""}
                onClick={() => setPaymentMethod("CARD")}
              >
                <CreditCard size={23} />
                <span>
                  <strong>{text("Thẻ quốc tế", "International card")}</strong>
                  <small>Visa · Mastercard · JCB · 3D Secure</small>
                </span>
                {paymentMethod === "CARD" ? <Check size={17} /> : null}
              </button>
            </div>
            <div className="payment-security-note">
              <ShieldCheck size={17} />
              <span>
                {text(
                  "Bạn sẽ được chuyển đến trang thanh toán bảo mật của SePay. DocuMind không lưu thông tin thẻ.",
                  "You will continue on SePay's secure checkout. DocuMind never stores card details.",
                )}
              </span>
            </div>
            {checkoutSession ? (
              <div className="payment-countdown" role="status">
                <Timer size={17} />
                <span>
                  {text("Phien thanh toan", "Payment session")}{" "}
                  {checkoutSession.invoiceNumber} -{" "}
                  {formatCountdown(checkoutSecondsRemaining)}
                </span>
              </div>
            ) : null}
            {error ? (
              <div
                className="payment-notice payment-notice--error"
                role="alert"
              >
                {error}
              </div>
            ) : null}
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedPlan(undefined)}
                disabled={isCheckingOut}
              >
                {text("Để sau", "Not now")}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleCheckout()}
                disabled={isCheckingOut}
              >
                {isCheckingOut ? (
                  <LoaderCircle className="spin" size={18} />
                ) : paymentMethod === "CARD" ? (
                  <CreditCard size={18} />
                ) : (
                  <Landmark size={18} />
                )}
                {isCheckingOut
                  ? text("Đang kết nối SePay...", "Connecting to SePay...")
                  : text("Tiếp tục thanh toán", "Continue to payment")}
              </button>
            </footer>
          </article>
        </div>
      ) : null}

      {isLoading ? (
        <span
          className="subscription-loading"
          aria-label={text("Đang tải", "Loading")}
        >
          <LoaderCircle className="spin" size={18} />
        </span>
      ) : null}
    </main>
  );
}

// Hiển thị giao diện gói dịch vụ card.
function PlanCard({
  plan,
  isCurrent,
  onSelect,
  locale,
  text,
}: {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  onSelect: () => void;
  locale: string;
  text: (vi: string, en: string) => string;
}) {
  const features = PLAN_FEATURES[plan.code] ?? DEFAULT_PLAN_FEATURES;
  const isFeatured = plan.code === "STUDENT";
  const isFreeUnavailable = plan.code === "FREE" && !isCurrent;
  return (
    <article
      className={[
        isFeatured ? "featured" : "",
        isFreeUnavailable ? "plan-card--disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isFeatured ? (
        <span className="recommended-badge">
          {text("Đề xuất", "Recommended")}
        </span>
      ) : null}
      <p className="eyebrow">{plan.code}</p>
      <h2>
        {plan.amount === 0
          ? "0đ"
          : formatPrice(plan.amount, plan.currency, locale)}{" "}
        {plan.amount > 0 ? <small>/ {text("tháng", "month")}</small> : null}
      </h2>
      <span>{text(...features.bestFor)}</span>
      <ul className="plan-features">
        <li>
          <span>
            <Cloud size={17} />
            {text("Dung lượng", "Storage")}
          </span>
          <strong>
            {features.storage}
            {plan.code === "PRO"
              ? ` (${text("có thể mở rộng", "expandable")})`
              : ""}
          </strong>
        </li>
        <li>
          <span>
            <FileText size={17} />
            {text("Giới hạn tải lên", "Upload limit")}
          </span>
          <strong>
            {features.uploads} {text("tài liệu", "documents")}
          </strong>
        </li>
        <li>
          <span>
            <MessageSquare size={17} />
            AI Chat
          </span>
          <strong>
            {features.chats === "UNLIMITED"
              ? text("Không giới hạn", "Unlimited")
              : `${features.chats} ${text("lượt chat / tháng", "chats / month")}`}
          </strong>
        </li>
        <li>
          <span>
            <Download size={17} />
            {text("Truy cập ngoại tuyến", "Offline access")}
          </span>
          <FeatureValue value={features.offline} text={text} />
        </li>
      </ul>
      <button type="button" disabled={isFreeUnavailable || plan.code === "FREE"} onClick={onSelect}>
        {plan.code === "FREE"
          ? text("Quyền lợi mặc định", "Default entitlements")
          : text(`Mua thêm ${plan.name}`, `Buy ${plan.name} resources`)}
      </button>
    </article>
  );
}

// Hiển thị giao diện feature value.
function FeatureValue({
  value,
  text,
}: {
  value: string;
  text: (vi: string, en: string) => string;
}) {
  if (value === "NO")
    return (
      <strong className="feature-negative">
        <X size={16} />
        {text("Không", "No")}
      </strong>
    );
  if (value === "YES")
    return (
      <strong className="feature-positive">
        <Check size={16} />
        {text("Có", "Yes")}
      </strong>
    );
  if (value === "LIMITED")
    return (
      <strong className="feature-limited">{text("Giới hạn", "Limited")}</strong>
    );
  return <strong>{value}</strong>;
}

// Chuyển đổi hoặc chuẩn hóa price.
function formatPrice(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Lấy dữ liệu remaining seconds.
function getRemainingSeconds(expiresAt: string | undefined, nowMs: number) {
  if (!expiresAt) return 0;
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return 0;
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
}

// Chuyển đổi hoặc chuẩn hóa countdown.
function formatCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Lấy dữ liệu quota usage percent.
function getQuotaUsagePercent(subscription?: CurrentSubscription) {
  if (!subscription || subscription.aiChatLimit === null) return 0;
  if (subscription.aiChatLimit === 0) return 0;
  return Math.min(
    100,
    (subscription.aiChatsUsed / subscription.aiChatLimit) * 100,
  );
}

// Chuyển đổi hoặc chuẩn hóa storage.
function formatStorage(megabytes: number) {
  if (megabytes >= 1024) {
    return `${(megabytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 2 })} GB`;
  }
  return `${megabytes.toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`;
}
