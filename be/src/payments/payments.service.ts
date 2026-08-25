import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { SePayPgClient } from 'sepay-pg-node';
import {
  DocumentStatus,
  MessageSender,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SubscriptionPlan,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import {
  CheckoutResponseDto,
  CurrentSubscriptionDto,
  PaymentOrderDto,
  SubscriptionPlanDto,
} from './dto/payment-response.dto';
import { SepayIpnDto } from './dto/sepay-ipn.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

const CURRENCY = 'VND';
const ACCESS_DURATION_DAYS = 30;
const PAYMENT_EXPIRY_MINUTES = 2;

const PLAN_QUOTAS = {
  FREE: {
    storageLimitMb: 100,
    uploadLimit: 10,
    aiChatLimit: 20,
    unlimitedAiDays: 0,
  },
  STUDENT: {
    storageLimitMb: 1024,
    uploadLimit: 100,
    aiChatLimit: 300,
    unlimitedAiDays: 0,
  },
  PRO: {
    storageLimitMb: 5120,
    uploadLimit: 500,
    aiChatLimit: 0,
    unlimitedAiDays: ACCESS_DURATION_DAYS,
  },
} satisfies Record<
  SubscriptionPlan,
  {
    storageLimitMb: number;
    uploadLimit: number;
    aiChatLimit: number | null;
    unlimitedAiDays: number;
  }
>;

type CheckoutFields = Record<string, string | number>;

interface SepayBankWebhook {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount: string | null;
  transferType: string;
  transferAmount: number;
  accumulated: number;
  code: string | null;
  content: string;
  referenceCode: string;
  description: string;
}

interface SepayOrderDetail {
  id?: string;
  customer_id?: string | null;
  order_invoice_number?: string;
  order_status?: string;
  order_amount?: string | number;
  order_currency?: string;
  updated_at?: string;
}

@Injectable()
export class PaymentsService {
  private readonly isEnabled: boolean;
  private readonly merchantId: string;
  private readonly secretKey: string;
  private readonly webhookApiKey: string;
  private readonly frontendUrl: string;
  private readonly studentPrice: number;
  private readonly proPrice: number;
  private readonly client: SePayPgClient | null;

  // Khởi tạo đối tượng và nhận các dependency cần thiết.
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.isEnabled = configService.get<boolean>('SEPAY_ENABLED', false);
    this.merchantId = configService.get<string>('SEPAY_MERCHANT_ID', '');
    this.secretKey = configService.get<string>('SEPAY_SECRET_KEY', '');
    this.webhookApiKey = configService.get<string>('SEPAY_WEBHOOK_API_KEY', '');
    this.frontendUrl = configService
      .get<string>('SEPAY_FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    this.studentPrice = configService.get<number>(
      'SEPAY_STUDENT_PRICE_VND',
      149000,
    );
    this.proPrice = configService.get<number>('SEPAY_PRO_PRICE_VND', 349000);

    this.client = this.isEnabled
      ? new SePayPgClient({
          env: configService.get<'sandbox' | 'production'>(
            'SEPAY_ENV',
            'sandbox',
          ),
          merchant_id: this.merchantId,
          secret_key: this.secretKey,
        })
      : null;
  }

  // Lấy dữ liệu gói dịch vụ.
  getPlans(): SubscriptionPlanDto[] {
    return [
      {
        code: SubscriptionPlan.FREE,
        name: 'Free',
        amount: 0,
        currency: CURRENCY,
        billingPeriod: 'NONE',
        durationDays: 0,
        storageMb: 0,
        uploadCredits: 0,
        aiCredits: 0,
        unlimitedAiDays: 0,
      },
      {
        code: SubscriptionPlan.STUDENT,
        name: 'Student',
        amount: this.studentPrice,
        currency: CURRENCY,
        billingPeriod: 'MONTHLY',
        durationDays: ACCESS_DURATION_DAYS,
        storageMb: PLAN_QUOTAS.STUDENT.storageLimitMb,
        uploadCredits: PLAN_QUOTAS.STUDENT.uploadLimit,
        aiCredits: PLAN_QUOTAS.STUDENT.aiChatLimit,
        unlimitedAiDays: 0,
      },
      {
        code: SubscriptionPlan.PRO,
        name: 'Pro',
        amount: this.proPrice,
        currency: CURRENCY,
        billingPeriod: 'MONTHLY',
        durationDays: ACCESS_DURATION_DAYS,
        storageMb: PLAN_QUOTAS.PRO.storageLimitMb,
        uploadCredits: PLAN_QUOTAS.PRO.uploadLimit,
        aiCredits: PLAN_QUOTAS.PRO.aiChatLimit,
        unlimitedAiDays: PLAN_QUOTAS.PRO.unlimitedAiDays,
      },
    ];
  }

  // Lấy dữ liệu hiện tại và quyền lợi.
  async getCurrentSubscription(
    userId: string,
  ): Promise<CurrentSubscriptionDto> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: {
        id: true,
        plan: true,
        startsAt: true,
        expiresAt: true,
        storageLimitMb: true,
        uploadLimit: true,
        aiChatLimit: true,
        aiChatsUsed: true,
        unlimitedAiUntil: true,
      },
    });

    const now = new Date();
    if (subscription?.expiresAt && subscription.expiresAt <= now) {
      await this.activateFreePlan(userId, 'subscription.expired');
      return this.createFreeSubscriptionResponse(userId, now);
    }

    if (!subscription) {
      const usagePeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return this.createFreeSubscriptionResponse(userId, usagePeriodStart);
    }

    const hasUnlimitedAi = Boolean(
      subscription.unlimitedAiUntil && subscription.unlimitedAiUntil > now,
    );
    const usage = await this.getUserUsage(
      userId,
      subscription.startsAt,
      subscription.uploadLimit,
      subscription.storageLimitMb,
      hasUnlimitedAi ? null : subscription.aiChatLimit,
    );

    return {
      plan: subscription.plan,
      startsAt: subscription.startsAt.toISOString(),
      expiresAt: subscription.expiresAt?.toISOString() ?? null,
      storageLimitMb: subscription.storageLimitMb,
      uploadLimit: subscription.uploadLimit,
      aiChatLimit: hasUnlimitedAi ? null : subscription.aiChatLimit,
      ...usage,
    };
  }

  // Tạo hoặc lưu đơn thanh toán.
  async createCheckout(
    user: AuthenticatedUser,
    payload: CreateCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    const client = this.requireClient();
    const now = new Date();

    const amount = this.getPlanAmount(payload.plan);
    const resources = PLAN_QUOTAS[payload.plan];

    const pendingOrder = await this.prisma.paymentOrder.findFirst({
      where: {
        userId: user.id,
        plan: payload.plan,
        status: PaymentStatus.PENDING,
        expiresAt: { gt: now },
      },
      select: {
        invoiceNumber: true,
        plan: true,
        paymentMethod: true,
        amount: true,
        expiresAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (pendingOrder) {
      return this.buildCheckoutResponse(
        client,
        user.id,
        pendingOrder.plan,
        pendingOrder.paymentMethod,
        pendingOrder.invoiceNumber,
        pendingOrder.amount,
        pendingOrder.expiresAt,
      );
    }

    const invoiceNumber = this.createInvoiceNumber();
    const expiresAt = new Date(
      now.getTime() + PAYMENT_EXPIRY_MINUTES * 60 * 1000,
    );

    // Thực hiện các thay đổi liên quan trong cùng một database transaction.
    await this.prisma.$transaction(async (transaction) => {
      // Tạo hóa đơn thanh toán trong database.
      await transaction.paymentOrder.create({
        data: {
          invoiceNumber,
          userId: user.id,
          plan: payload.plan,
          paymentMethod: payload.paymentMethod,
          amount,
          currency: CURRENCY,
          expiresAt,
          durationDays: ACCESS_DURATION_DAYS,
          storageMb: resources.storageLimitMb,
          uploadCredits: resources.uploadLimit,
          aiCredits: resources.aiChatLimit ?? 0,
          unlimitedAiDays: resources.unlimitedAiDays ?? 0,
        },
      });
      await this.createAuditLog(transaction, user.id, 'payment.created', {
        invoiceNumber,
        plan: payload.plan,
        paymentMethod: payload.paymentMethod,
        amount,
        currency: CURRENCY,
        expiresAt: expiresAt.toISOString(),
      });
    });

    return this.buildCheckoutResponse(
      client,
      user.id,
      payload.plan,
      payload.paymentMethod,
      invoiceNumber,
      amount,
      expiresAt,
    );
  }

  // Chuyển đổi hoặc chuẩn hóa đơn thanh toán phản hồi.
  private buildCheckoutResponse(
    client: SePayPgClient,
    userId: string,
    plan: SubscriptionPlan,
    paymentMethod: PaymentMethod,
    invoiceNumber: string,
    amount: number,
    expiresAt: Date,
  ): CheckoutResponseDto {
    const callbackUrl = `${this.frontendUrl}/goi-dich-vu`;
    const description = `DocuMind ${plan} monthly subscription`;
    // SePay verifies both the signature and submitted form fields in this
    // insertion order. sepay-pg-node 1.0.0 instead signs Object.keys(fields)
    // and appends merchant last, producing an invalid signature.
    const unsignedFields: CheckoutFields = {
      order_amount: amount,
      merchant: this.merchantId,
      currency: CURRENCY,
      operation: 'PURCHASE',
      order_description: description,
      order_invoice_number: invoiceNumber,
      customer_id: userId,
      payment_method: paymentMethod,
      success_url: `${callbackUrl}?payment=success&invoice=${invoiceNumber}`,
      error_url: `${callbackUrl}?payment=error&invoice=${invoiceNumber}`,
      cancel_url: `${callbackUrl}?payment=cancel&invoice=${invoiceNumber}`,
    };
    const signaturePayload = Object.entries(unsignedFields)
      .map(([name, value]) => `${name}=${value}`)
      .join(',');
    const fields: CheckoutFields = {
      ...unsignedFields,
      signature: createHmac('sha256', this.secretKey)
        .update(signaturePayload)
        .digest('base64'),
    };

    return {
      invoiceNumber,
      checkoutUrl: client.checkout.initCheckoutUrl(),
      expiresAt: expiresAt.toISOString(),
      fields,
    };
  }

  // Lấy dữ liệu thanh toán.
  async getPayment(
    userId: string,
    invoiceNumber: string,
  ): Promise<PaymentOrderDto> {
    const payment = await this.prisma.paymentOrder.findUnique({
      where: { invoiceNumber },
      select: {
        id: true,
        userId: true,
        invoiceNumber: true,
        plan: true,
        paymentMethod: true,
        amount: true,
        currency: true,
        status: true,
        paidAt: true,
        expiresAt: true,
        durationDays: true,
        storageMb: true,
        uploadCredits: true,
        aiCredits: true,
        unlimitedAiDays: true,
        createdAt: true,
      },
    });

    if (!payment || payment.userId !== userId) {
      throw new NotFoundException('Payment order not found');
    }

    if (payment.status === PaymentStatus.PENDING) {
      await this.reconcilePendingPayment(payment);
      await this.expirePendingPayments(userId, invoiceNumber);
    }

    const refreshedPayment = await this.prisma.paymentOrder.findUnique({
      where: { invoiceNumber },
      select: {
        invoiceNumber: true,
        plan: true,
        paymentMethod: true,
        amount: true,
        currency: true,
        status: true,
        paidAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    if (!refreshedPayment) {
      throw new NotFoundException('Payment order not found');
    }

    return this.toPaymentResponse(refreshedPayment);
  }

  // Lấy dữ liệu lịch sử thanh toán.
  async getPaymentHistory(userId: string): Promise<PaymentOrderDto[]> {
    await this.expirePendingPayments(userId);
    const payments = await this.prisma.paymentOrder.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: {
        invoiceNumber: true,
        plan: true,
        paymentMethod: true,
        amount: true,
        currency: true,
        status: true,
        paidAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return payments.map((payment) => this.toPaymentResponse(payment));
  }

  // Cập nhật trạng thái thanh toán.
  async updatePaymentStatus(
    userId: string,
    invoiceNumber: string,
    payload: UpdatePaymentStatusDto,
  ): Promise<PaymentOrderDto> {
    const status =
      payload.status === 'CANCELLED'
        ? PaymentStatus.CANCELLED
        : PaymentStatus.FAILED;
    const payment = await this.prisma.paymentOrder.findUnique({
      where: { invoiceNumber },
      select: { id: true, userId: true, status: true },
    });

    if (!payment || payment.userId !== userId) {
      throw new NotFoundException('Payment order not found');
    }
    if (payment.status === PaymentStatus.PAID) {
      throw new ConflictException('Paid payments cannot be changed');
    }

    // Thực hiện các thay đổi liên quan trong cùng một database transaction.
    await this.prisma.$transaction(async (transaction) => {
      // Đánh dấu hóa đơn theo trạng thái FAILED hoặc CANCELLED do người dùng yêu cầu.
      await transaction.paymentOrder.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status },
      });
      await this.createAuditLog(
        transaction,
        userId,
        `payment.${status.toLowerCase()}`,
        { invoiceNumber },
      );
    });

    return this.getPayment(userId, invoiceNumber);
  }

  // Xử lý ipn.
  async processIpn(
    authorization: string | undefined,
    payload: SepayIpnDto,
  ): Promise<{ acknowledged: boolean }> {
    this.verifyIpnAuthorization(authorization);

    if (
      payload.notification_type !== 'ORDER_PAID' &&
      payload.notification_type !== 'TRANSACTION_VOID'
    ) {
      return { acknowledged: true };
    }

    const payment = await this.prisma.paymentOrder.findUnique({
      where: { invoiceNumber: payload.order.order_invoice_number },
    });

    if (!payment) {
      throw new NotFoundException('Payment order not found');
    }

    if (payload.notification_type === 'TRANSACTION_VOID') {
      await this.processRefund(payment, payload);
      return { acknowledged: true };
    }

    this.validatePaidNotification(payment, payload);
    const paidAt = new Date();

    // Thực hiện các thay đổi liên quan trong cùng một database transaction.
    await this.prisma.$transaction(async (transaction) => {
      const duplicateTransaction = await transaction.paymentOrder.findUnique({
        where: {
          sepayTransactionId: payload.transaction.transaction_id,
        },
        select: { id: true },
      });

      if (duplicateTransaction && duplicateTransaction.id !== payment.id) {
        throw new ConflictException('SePay transaction already processed');
      }

      // Đánh dấu hóa đơn PAID và lưu mã giao dịch từ webhook SePay.
      const updateResult = await transaction.paymentOrder.updateMany({
        where: {
          id: payment.id,
          status: { not: PaymentStatus.PAID },
        },
        data: {
          status: PaymentStatus.PAID,
          sepayOrderId: payload.order.id,
          sepayTransactionId: payload.transaction.transaction_id,
          paidAt,
          rawNotification: payload as unknown as Prisma.InputJsonValue,
        },
      });

      if (updateResult.count === 0) return;

      // Cộng ngày sử dụng và toàn bộ quota đã chốt trong hóa đơn cho người dùng.
      const expiresAt = await this.applyPurchasedResources(
        transaction,
        payment,
        paidAt,
      );
      await this.createAuditLog(transaction, payment.userId, 'payment.paid', {
        invoiceNumber: payment.invoiceNumber,
        transactionId: payload.transaction.transaction_id,
        plan: payment.plan,
      });
      await this.createAuditLog(
        transaction,
        payment.userId,
        'subscription.activated',
        {
          plan: payment.plan,
          invoiceNumber: payment.invoiceNumber,
          expiresAt: expiresAt.toISOString(),
        },
      );
    });

    return { acknowledged: true };
  }

  // Xử lý webhook.
  async processWebhook(
    authorization: string | undefined,
    payload: unknown,
  ): Promise<{ acknowledged: boolean }> {
    if (this.isBankWebhook(payload)) {
      return this.processBankWebhook(authorization, payload);
    }
    if (this.isPaymentGatewayIpn(payload)) {
      return this.processIpn(authorization, payload);
    }

    this.verifyIpnAuthorization(authorization);
    throw new BadRequestException('Unsupported SePay webhook payload');
  }

  // Thực hiện chức năng require client.
  private requireClient(): SePayPgClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'SePay payment gateway is not configured',
      );
    }
    return this.client;
  }

  // Lấy dữ liệu gói dịch vụ amount.
  private getPlanAmount(plan: SubscriptionPlan): number {
    if (plan === SubscriptionPlan.STUDENT) return this.studentPrice;
    if (plan === SubscriptionPlan.PRO) return this.proPrice;
    throw new BadRequestException('The Free plan does not require payment');
  }

  // Thực hiện chức năng activate gói free.
  private async activateFreePlan(
    userId: string,
    action: string,
  ): Promise<void> {
    const now = new Date();
    // Thực hiện các thay đổi liên quan trong cùng một database transaction.
    await this.prisma.$transaction(async (transaction) => {
      // Tạo mới hoặc cập nhật ví tài nguyên trong database.
      await transaction.subscription.upsert({
        where: { userId },
        update: {
          plan: SubscriptionPlan.FREE,
          paymentOrderId: null,
          startsAt: now,
          expiresAt: null,
          ...PLAN_QUOTAS.FREE,
          aiChatsUsed: 0,
          unlimitedAiUntil: null,
        },
        create: {
          userId,
          plan: SubscriptionPlan.FREE,
          startsAt: now,
          expiresAt: null,
          ...PLAN_QUOTAS.FREE,
          aiChatsUsed: 0,
          unlimitedAiUntil: null,
        },
      });
      await this.createAuditLog(transaction, userId, action, {
        plan: SubscriptionPlan.FREE,
      });
    });
  }

  // Cộng quyền lợi đã mua vào ví tài nguyên và ghi sổ cái đúng một lần cho payment.
  private async applyPurchasedResources(
    transaction: Prisma.TransactionClient,
    payment: {
      id: string;
      userId: string;
      plan: SubscriptionPlan;
      durationDays: number;
      storageMb: number;
      uploadCredits: number;
      aiCredits: number;
      unlimitedAiDays: number;
    },
    paidAt: Date,
  ): Promise<Date> {
    // Khóa giao dịch theo user để hai hóa đơn thanh toán đồng thời không ghi đè quota.
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${payment.userId}))`,
    );
    const existingLedger = await transaction.entitlementTransaction.findUnique({
      where: { paymentOrderId: payment.id },
      select: { accessExpiresAt: true },
    });
    if (existingLedger) return existingLedger.accessExpiresAt;

    const current = await transaction.subscription.findUnique({
      where: { userId: payment.userId },
    });
    const isActive = Boolean(current?.expiresAt && current.expiresAt > paidAt);
    const baseExpiry = isActive && current?.expiresAt ? current.expiresAt : paidAt;
    const expiresAt = this.addDays(baseExpiry, payment.durationDays);
    const unlimitedBase =
      current?.unlimitedAiUntil && current.unlimitedAiUntil > paidAt
        ? current.unlimitedAiUntil
        : paidAt;
    const unlimitedAiUntil = payment.unlimitedAiDays
      ? this.addDays(unlimitedBase, payment.unlimitedAiDays)
      : current?.unlimitedAiUntil;
    const baseStorage = isActive ? current?.storageLimitMb ?? 0 : PLAN_QUOTAS.FREE.storageLimitMb;
    const baseUploads = isActive ? current?.uploadLimit ?? 0 : PLAN_QUOTAS.FREE.uploadLimit;
    const baseAiCredits = isActive ? current?.aiChatLimit ?? 0 : PLAN_QUOTAS.FREE.aiChatLimit ?? 0;

    // Cộng ngày sử dụng, dung lượng và quota vào ví tài nguyên hiện tại.
    await transaction.subscription.upsert({
      where: { userId: payment.userId },
      update: {
        plan: payment.plan,
        paymentOrderId: payment.id,
        startsAt: isActive && current ? current.startsAt : paidAt,
        expiresAt,
        storageLimitMb: baseStorage + payment.storageMb,
        uploadLimit: baseUploads + payment.uploadCredits,
        aiChatLimit: baseAiCredits + payment.aiCredits,
        unlimitedAiUntil,
        aiChatsUsed: isActive && current ? current.aiChatsUsed : 0,
      },
      create: {
        userId: payment.userId,
        plan: payment.plan,
        paymentOrderId: payment.id,
        startsAt: paidAt,
        expiresAt,
        storageLimitMb: PLAN_QUOTAS.FREE.storageLimitMb + payment.storageMb,
        uploadLimit: PLAN_QUOTAS.FREE.uploadLimit + payment.uploadCredits,
        aiChatLimit: (PLAN_QUOTAS.FREE.aiChatLimit ?? 0) + payment.aiCredits,
        unlimitedAiUntil,
        aiChatsUsed: 0,
      },
    });
    // Lưu sổ cái để mỗi hóa đơn chỉ được cộng tài nguyên đúng một lần.
    await transaction.entitlementTransaction.create({
      data: {
        userId: payment.userId,
        paymentOrderId: payment.id,
        packageCode: payment.plan,
        durationDays: payment.durationDays,
        storageDeltaMb: payment.storageMb,
        uploadDelta: payment.uploadCredits,
        aiCreditDelta: payment.aiCredits,
        unlimitedAiDays: payment.unlimitedAiDays,
        accessExpiresAt: expiresAt,
      },
    });
    return expiresAt;
  }

  // Cộng số ngày theo UTC để thời hạn không bị lệch bởi múi giờ hoặc DST.
  private addDays(value: Date, days: number): Date {
    return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
  }

  // Tạo hoặc lưu free quyền lợi phản hồi.
  private async createFreeSubscriptionResponse(
    userId: string,
    startsAt: Date,
  ): Promise<CurrentSubscriptionDto> {
    const usage = await this.getUserUsage(
      userId,
      startsAt,
      PLAN_QUOTAS.FREE.uploadLimit,
      PLAN_QUOTAS.FREE.storageLimitMb,
      PLAN_QUOTAS.FREE.aiChatLimit,
    );
    return {
      plan: SubscriptionPlan.FREE,
      startsAt: startsAt.toISOString(),
      expiresAt: null,
      ...PLAN_QUOTAS.FREE,
      ...usage,
    };
  }

  // Lấy dữ liệu người dùng usage.
  private async getUserUsage(
    userId: string,
    usagePeriodStart: Date,
    uploadLimit: number,
    storageLimitMb: number,
    aiChatLimit: number | null,
  ): Promise<
    Pick<
      CurrentSubscriptionDto,
      | 'aiChatsUsed'
      | 'aiChatsRemaining'
      | 'uploadsUsed'
      | 'uploadsRemaining'
      | 'storageUsedMb'
      | 'storageRemainingMb'
    >
  > {
    const [documents, aiChatsUsed] = await Promise.all([
      this.prisma.document.aggregate({
        where: {
          ownerId: userId,
          status: { not: DocumentStatus.DELETED },
        },
        _count: { _all: true },
        _sum: { fileSize: true },
      }),
      this.prisma.chatMessage.count({
        where: {
          sender: MessageSender.USER,
          createdAt: { gte: usagePeriodStart },
          chatSession: { userId },
        },
      }),
    ]);

    const uploadsUsed = documents._count._all;
    const storageUsedMb =
      Math.round(
        (Number(documents._sum.fileSize ?? BigInt(0)) / (1024 * 1024)) * 100,
      ) / 100;

    return {
      aiChatsUsed,
      aiChatsRemaining:
        aiChatLimit === null ? null : Math.max(0, aiChatLimit - aiChatsUsed),
      uploadsUsed,
      uploadsRemaining: Math.max(0, uploadLimit - uploadsUsed),
      storageUsedMb,
      storageRemainingMb: Math.max(
        0,
        Math.round((storageLimitMb - storageUsedMb) * 100) / 100,
      ),
    };
  }

  // Thực hiện chức năng expire pending thanh toán.
  private async expirePendingPayments(
    userId: string,
    invoiceNumber?: string,
  ): Promise<void> {
    const expiredPayments = await this.prisma.paymentOrder.findMany({
      where: {
        userId,
        invoiceNumber,
        status: PaymentStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      select: { id: true, invoiceNumber: true },
    });
    if (expiredPayments.length === 0) return;

    // Thực hiện các thay đổi liên quan trong cùng một database transaction.
    await this.prisma.$transaction(async (transaction) => {
      for (const payment of expiredPayments) {
        // Đánh dấu các hóa đơn PENDING đã quá hạn thành EXPIRED.
        const result = await transaction.paymentOrder.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.EXPIRED },
        });
        if (result.count === 0) continue;
        await this.createAuditLog(transaction, userId, 'payment.expired', {
          invoiceNumber: payment.invoiceNumber,
        });
      }
    });
  }

  // Xử lý refund.
  private async processRefund(
    payment: {
      id: string;
      userId: string;
      invoiceNumber: string;
      status: PaymentStatus;
    },
    payload: SepayIpnDto,
  ): Promise<void> {
    if (payment.status !== PaymentStatus.PAID) return;

    // Thực hiện các thay đổi liên quan trong cùng một database transaction.
    await this.prisma.$transaction(async (transaction) => {
      // Đánh dấu hóa đơn PAID đã hoàn tiền để không tiếp tục sử dụng quyền lợi.
      const result = await transaction.paymentOrder.updateMany({
        where: { id: payment.id, status: PaymentStatus.PAID },
        data: {
          status: PaymentStatus.REFUNDED,
          rawNotification: payload as unknown as Prisma.InputJsonValue,
        },
      });
      if (result.count === 0) return;

      const activeSubscription = await transaction.subscription.findUnique({
        where: { userId: payment.userId },
      });
      const entitlement = await transaction.entitlementTransaction.findUnique({
        where: { paymentOrderId: payment.id },
      });
      if (activeSubscription && entitlement) {
        const reducedExpiry = activeSubscription.expiresAt
          ? this.addDays(activeSubscription.expiresAt, -entitlement.durationDays)
          : null;
        const accessExpired = Boolean(reducedExpiry && reducedExpiry <= new Date());
        const reducedUnlimited = activeSubscription.unlimitedAiUntil
          ? this.addDays(activeSubscription.unlimitedAiUntil, -entitlement.unlimitedAiDays)
          : null;
        // Trừ đúng phần tài nguyên của hóa đơn được hoàn khỏi ví hiện tại.
        await transaction.subscription.update({
          where: { userId: payment.userId },
          data: accessExpired
            ? {
                plan: SubscriptionPlan.FREE,
                paymentOrderId: null,
                startsAt: new Date(),
                expiresAt: null,
                ...PLAN_QUOTAS.FREE,
                aiChatsUsed: 0,
                unlimitedAiUntil: null,
              }
            : {
                paymentOrderId:
                  activeSubscription.paymentOrderId === payment.id
                    ? null
                    : activeSubscription.paymentOrderId,
                expiresAt: reducedExpiry,
                storageLimitMb: Math.max(
                  PLAN_QUOTAS.FREE.storageLimitMb,
                  activeSubscription.storageLimitMb - entitlement.storageDeltaMb,
                ),
                uploadLimit: Math.max(
                  PLAN_QUOTAS.FREE.uploadLimit,
                  activeSubscription.uploadLimit - entitlement.uploadDelta,
                ),
                aiChatLimit: Math.max(
                  PLAN_QUOTAS.FREE.aiChatLimit ?? 0,
                  (activeSubscription.aiChatLimit ?? 0) - entitlement.aiCreditDelta,
                ),
                unlimitedAiUntil: reducedUnlimited,
              },
        });
      }

      await this.createAuditLog(
        transaction,
        payment.userId,
        'payment.refunded',
        {
          invoiceNumber: payment.invoiceNumber,
          transactionId: payload.transaction.transaction_id,
        },
      );
      await this.createAuditLog(
        transaction,
        payment.userId,
        'subscription.refund_applied',
        { plan: SubscriptionPlan.FREE },
      );
    });
  }

  // Tạo hoặc lưu audit log.
  private createAuditLog(
    transaction: Prisma.TransactionClient,
    userId: string,
    action: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<unknown> {
    // Lưu nhật ký kiểm toán cho thay đổi thanh toán và tài nguyên.
    return transaction.auditLog.create({
      data: {
        userId,
        action,
        targetType: 'Subscription',
        targetId: userId,
        metadata,
      },
    });
  }

  // Tạo hoặc lưu invoice number.
  private createInvoiceNumber(): string {
    return `DM${Date.now()}${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  // Kiểm tra điều kiện ipn authorization.
  private verifyIpnAuthorization(authorization: string | undefined): void {
    const match = authorization?.match(/^Apikey\s+(.+)$/i);
    const receivedApiKey = match?.[1]?.trim();

    if (!this.isEnabled || !receivedApiKey || !this.webhookApiKey) {
      throw new UnauthorizedException('Invalid SePay webhook API key');
    }

    const expected = Buffer.from(this.webhookApiKey);
    const received = Buffer.from(receivedApiKey);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new UnauthorizedException('Invalid SePay webhook API key');
    }
  }

  // Xử lý bank webhook.
  private async processBankWebhook(
    authorization: string | undefined,
    payload: SepayBankWebhook,
  ): Promise<{ acknowledged: boolean }> {
    this.verifyIpnAuthorization(authorization);

    if (payload.transferType.toLowerCase() !== 'in') {
      return { acknowledged: true };
    }

    const invoiceNumber = this.extractInvoiceNumber(payload);
    if (!invoiceNumber) {
      return { acknowledged: true };
    }

    const payment = await this.prisma.paymentOrder.findUnique({
      where: { invoiceNumber },
      select: {
        invoiceNumber: true,
        paymentMethod: true,
      },
    });
    if (!payment) {
      return { acknowledged: true };
    }
    if (payment.paymentMethod !== PaymentMethod.BANK_TRANSFER) {
      throw new BadRequestException(
        'Bank webhook does not match the payment method',
      );
    }

    return this.processIpn(authorization, {
      timestamp: Math.floor(Date.now() / 1000),
      notification_type: 'ORDER_PAID',
      order: {
        id: String(payload.id),
        order_id: payload.referenceCode || String(payload.id),
        order_status: 'CAPTURED',
        order_currency: CURRENCY,
        order_amount: String(payload.transferAmount),
        order_invoice_number: payment.invoiceNumber,
        custom_data: null,
        order_description: payload.description,
      },
      transaction: {
        id: String(payload.id),
        payment_method: PaymentMethod.BANK_TRANSFER,
        transaction_id: `BANK-${payload.id}`,
        transaction_type: 'PAYMENT',
        transaction_date: payload.transactionDate,
        transaction_status: 'APPROVED',
        transaction_amount: String(payload.transferAmount),
        transaction_currency: CURRENCY,
      },
      customer: null,
      agreement: null,
    });
  }

  // Thực hiện chức năng reconcile pending thanh toán.
  private async reconcilePendingPayment(payment: {
    id: string;
    userId: string;
    invoiceNumber: string;
    plan: SubscriptionPlan;
    amount: number;
    currency: string;
    status: PaymentStatus;
    durationDays: number;
    storageMb: number;
    uploadCredits: number;
    aiCredits: number;
    unlimitedAiDays: number;
  }): Promise<void> {
    if (payment.status !== PaymentStatus.PENDING || !this.client) return;

    let response: Awaited<ReturnType<SePayPgClient['order']['retrieve']>>;
    try {
      response = await this.client.order.retrieve(payment.invoiceNumber);
    } catch {
      return;
    }

    const order = this.extractSepayOrderDetail(response.data);
    if (!order || order.order_status !== 'CAPTURED') return;

    this.validateCapturedOrder(payment, order);

    const paidAt = new Date();

    // Thực hiện các thay đổi liên quan trong cùng một database transaction.
    await this.prisma.$transaction(async (transaction) => {
      // Đánh dấu hóa đơn PAID sau khi đối soát SePay trả trạng thái CAPTURED.
      const updateResult = await transaction.paymentOrder.updateMany({
        where: {
          id: payment.id,
          status: { not: PaymentStatus.PAID },
        },
        data: {
          status: PaymentStatus.PAID,
          sepayOrderId: order.id,
          paidAt,
          rawNotification: response.data as Prisma.InputJsonValue,
        },
      });

      if (updateResult.count === 0) return;

      // Cộng ngày sử dụng và quota qua nhánh đối soát dự phòng.
      const expiresAt = await this.applyPurchasedResources(
        transaction,
        payment,
        paidAt,
      );
      await this.createAuditLog(transaction, payment.userId, 'payment.paid', {
        invoiceNumber: payment.invoiceNumber,
        orderId: order.id,
        plan: payment.plan,
        source: 'gateway-reconcile',
      });
      await this.createAuditLog(
        transaction,
        payment.userId,
        'subscription.activated',
        {
          plan: payment.plan,
          invoiceNumber: payment.invoiceNumber,
          expiresAt: expiresAt.toISOString(),
          source: 'gateway-reconcile',
        },
      );
    });
  }

  // Xử lý sepay order detail.
  private extractSepayOrderDetail(payload: unknown): SepayOrderDetail | null {
    if (!this.isRecord(payload)) return null;
    const detail = this.isRecord(payload.data) ? payload.data : payload;
    return this.isRecord(detail) ? detail : null;
  }

  // Kiểm tra điều kiện captured order.
  private validateCapturedOrder(
    payment: {
      userId: string;
      invoiceNumber: string;
      amount: number;
      currency: string;
    },
    order: SepayOrderDetail,
  ): void {
    const orderAmount = Number(order.order_amount);
    if (
      order.order_invoice_number !== payment.invoiceNumber ||
      order.order_currency !== payment.currency ||
      !Number.isFinite(orderAmount) ||
      orderAmount !== payment.amount
    ) {
      throw new BadRequestException('SePay order detail does not match');
    }

    if (order.customer_id && order.customer_id !== payment.userId) {
      throw new BadRequestException('SePay customer does not match');
    }
  }

  // Xử lý invoice number.
  private extractInvoiceNumber(payload: SepayBankWebhook): string | null {
    const code = payload.code?.trim();
    if (code?.toUpperCase().startsWith('DM')) {
      return code.toUpperCase();
    }

    return payload.content.match(/\bDM[0-9A-F]+\b/i)?.[0].toUpperCase() ?? null;
  }

  // Kiểm tra điều kiện bank webhook.
  private isBankWebhook(payload: unknown): payload is SepayBankWebhook {
    if (!this.isRecord(payload)) return false;

    return (
      typeof payload.id === 'number' &&
      typeof payload.gateway === 'string' &&
      typeof payload.transactionDate === 'string' &&
      typeof payload.accountNumber === 'string' &&
      (typeof payload.subAccount === 'string' || payload.subAccount === null) &&
      typeof payload.transferType === 'string' &&
      typeof payload.transferAmount === 'number' &&
      typeof payload.accumulated === 'number' &&
      (typeof payload.code === 'string' || payload.code === null) &&
      typeof payload.content === 'string' &&
      typeof payload.referenceCode === 'string' &&
      typeof payload.description === 'string'
    );
  }

  // Kiểm tra điều kiện thanh toán gateway ipn.
  private isPaymentGatewayIpn(payload: unknown): payload is SepayIpnDto {
    if (!this.isRecord(payload)) return false;

    return (
      typeof payload.timestamp === 'number' &&
      typeof payload.notification_type === 'string' &&
      this.isRecord(payload.order) &&
      this.isRecord(payload.transaction)
    );
  }

  // Kiểm tra điều kiện record.
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  // Kiểm tra điều kiện paid thông báo.
  private validatePaidNotification(
    payment: {
      amount: number;
      currency: string;
      paymentMethod: PaymentMethod;
    },
    payload: SepayIpnDto,
  ): void {
    const orderAmount = Number(payload.order.order_amount);
    const transactionAmount = Number(payload.transaction.transaction_amount);

    if (
      !Number.isFinite(orderAmount) ||
      !Number.isFinite(transactionAmount) ||
      orderAmount !== payment.amount ||
      transactionAmount !== payment.amount
    ) {
      throw new BadRequestException('Payment amount does not match');
    }

    if (
      payload.order.order_currency !== payment.currency ||
      payload.transaction.transaction_currency !== payment.currency
    ) {
      throw new BadRequestException('Payment currency does not match');
    }

    if (payload.transaction.payment_method !== payment.paymentMethod) {
      throw new BadRequestException('Payment method does not match');
    }

    if (
      payload.order.order_status !== 'CAPTURED' ||
      payload.transaction.transaction_status !== 'APPROVED'
    ) {
      throw new ForbiddenException('Payment is not approved');
    }
  }

  // Chuyển đổi hoặc chuẩn hóa thanh toán phản hồi.
  private toPaymentResponse(payment: {
    invoiceNumber: string;
    plan: SubscriptionPlan;
    paymentMethod: PaymentMethod;
    amount: number;
    currency: string;
    status: PaymentStatus;
    paidAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
  }): PaymentOrderDto {
    return {
      invoiceNumber: payment.invoiceNumber,
      plan: payment.plan,
      paymentMethod: payment.paymentMethod,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paidAt: payment.paidAt?.toISOString() ?? null,
      expiresAt: payment.expiresAt.toISOString(),
      createdAt: payment.createdAt.toISOString(),
    };
  }
}
