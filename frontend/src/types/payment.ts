export type SubscriptionPlanCode = "FREE" | "STUDENT" | "PRO";
export type PaymentMethodCode = "BANK_TRANSFER" | "CARD";
export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "EXPIRED";

export type SubscriptionPlan = {
  code: SubscriptionPlanCode;
  name: string;
  amount: number;
  currency: string;
  billingPeriod: "NONE" | "MONTHLY";
  durationDays: number;
  storageMb: number;
  uploadCredits: number;
  aiCredits: number;
  unlimitedAiDays: number;
};

export type CurrentSubscription = {
  plan: SubscriptionPlanCode;
  startsAt: string;
  expiresAt: string | null;
  storageLimitMb: number;
  uploadLimit: number;
  aiChatLimit: number | null;
  aiChatsUsed: number;
  aiChatsRemaining: number | null;
  uploadsUsed: number;
  uploadsRemaining: number;
  storageUsedMb: number;
  storageRemainingMb: number;
};

export type CheckoutResponse = {
  invoiceNumber: string;
  checkoutUrl: string;
  expiresAt: string;
  fields: Record<string, string | number>;
};

export type PaymentOrder = {
  invoiceNumber: string;
  plan: SubscriptionPlanCode;
  paymentMethod: PaymentMethodCode;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
};
