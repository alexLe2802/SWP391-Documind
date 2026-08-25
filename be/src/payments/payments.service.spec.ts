import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import {
  PaymentMethod,
  PaymentStatus,
  SubscriptionPlan,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const activeSubscriptionExpiry = new Date('2099-07-22T00:00:00.000Z');
  const paymentOrder = {
    id: 'payment-id',
    invoiceNumber: 'DM123',
    userId: 'user-id',
    plan: SubscriptionPlan.STUDENT,
    paymentMethod: PaymentMethod.BANK_TRANSFER,
    amount: 149000,
    currency: 'VND',
    status: PaymentStatus.PENDING,
    sepayOrderId: null,
    sepayTransactionId: null,
    paidAt: null,
    rawNotification: null,
    expiresAt: new Date('2026-06-22T00:30:00.000Z'),
    durationDays: 30,
    storageMb: 1024,
    uploadCredits: 100,
    aiCredits: 300,
    unlimitedAiDays: 0,
    createdAt: new Date('2026-06-22T00:00:00.000Z'),
    updatedAt: new Date('2026-06-22T00:00:00.000Z'),
  };
  const transaction = {
    $executeRaw: jest.fn(),
    paymentOrder: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    entitlementTransaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };
  const prisma = {
    paymentOrder: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
    },
    document: {
      aggregate: jest.fn(),
    },
    chatMessage: {
      count: jest.fn(),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof transaction) => Promise<void>) =>
        callback(transaction),
    ),
  };
  const config = new ConfigService({
    SEPAY_ENABLED: true,
    SEPAY_ENV: 'sandbox',
    SEPAY_MERCHANT_ID: 'merchant-id',
    SEPAY_SECRET_KEY: 'secret-key',
    SEPAY_WEBHOOK_API_KEY: 'webhook-api-key',
    SEPAY_FRONTEND_URL: 'http://localhost:3000',
    SEPAY_STUDENT_PRICE_VND: 149000,
    SEPAY_PRO_PRICE_VND: 349000,
  });
  const service = new PaymentsService(
    config,
    prisma as unknown as PrismaService,
  );
  const sepayOrderRetrieve = jest.spyOn(
    (
      service as unknown as {
        client: {
          order: {
            retrieve: (invoiceNumber: string) => Promise<unknown>;
          };
        };
      }
    ).client.order,
    'retrieve',
  );
  const user = {
    id: 'user-id',
    firebaseUid: 'firebase-id',
    email: 'student@example.com',
    fullName: 'Student',
    status: UserStatus.ACTIVE,
    role: { name: 'USER' as const },
  };
  const ipn = {
    timestamp: 1757058220,
    notification_type: 'ORDER_PAID',
    order: {
      id: 'sepay-order-id',
      order_id: 'sepay-order-code',
      order_status: 'CAPTURED',
      order_currency: 'VND',
      order_amount: '149000.00',
      order_invoice_number: 'DM123',
      custom_data: [],
    },
    transaction: {
      id: 'sepay-transaction-row-id',
      payment_method: 'BANK_TRANSFER',
      transaction_id: 'sepay-transaction-id',
      transaction_type: 'PAYMENT',
      transaction_date: '2026-06-22 12:00:00',
      transaction_status: 'APPROVED',
      transaction_amount: '149000',
      transaction_currency: 'VND',
      authentication_status: 'AUTHENTICATION_SUCCESSFUL',
    },
    customer: null,
    agreement: null,
  };
  const bankWebhook = {
    id: 92704,
    gateway: 'MBBank',
    transactionDate: '2026-06-23 16:12:22',
    accountNumber: '0000000000',
    subAccount: null,
    transferType: 'in',
    transferAmount: 149000,
    accumulated: 149000,
    code: paymentOrder.invoiceNumber,
    content: `${paymentOrder.invoiceNumber} payment`,
    referenceCode: 'FTTEST92704',
    description: 'Test bank transfer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.paymentOrder.create.mockResolvedValue(paymentOrder);
    prisma.paymentOrder.findFirst.mockResolvedValue(null);
    prisma.paymentOrder.findUnique.mockResolvedValue(paymentOrder);
    prisma.paymentOrder.findMany.mockResolvedValue([]);
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.document.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { fileSize: null },
    });
    prisma.chatMessage.count.mockResolvedValue(0);
    sepayOrderRetrieve.mockResolvedValue({
      data: { data: { order_status: 'PENDING' } },
    });
    transaction.paymentOrder.create.mockResolvedValue(paymentOrder);
    transaction.$executeRaw.mockResolvedValue(1);
    transaction.paymentOrder.findUnique.mockResolvedValue(null);
    transaction.paymentOrder.findMany.mockResolvedValue([]);
    transaction.paymentOrder.updateMany.mockResolvedValue({ count: 1 });
    transaction.subscription.findUnique.mockResolvedValue(null);
    transaction.subscription.update.mockResolvedValue({});
    transaction.subscription.upsert.mockResolvedValue({});
    transaction.entitlementTransaction.findUnique.mockResolvedValue(null);
    transaction.entitlementTransaction.create.mockResolvedValue({});
    transaction.auditLog.create.mockResolvedValue({});
  });

  it('creates a signed card checkout without exposing the merchant secret', async () => {
    const checkout = await service.createCheckout(user, {
      plan: SubscriptionPlan.PRO,
      paymentMethod: PaymentMethod.CARD,
    });

    expect(transaction.paymentOrder.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
    expect(checkout.checkoutUrl).toContain('pay-sandbox.sepay.vn');
    expect(checkout.fields).toMatchObject({
      merchant: 'merchant-id',
      payment_method: PaymentMethod.CARD,
      order_amount: 349000,
      currency: 'VND',
    });
    expect(checkout.fields.signature).toEqual(expect.any(String));
    expect(JSON.stringify(checkout)).not.toContain('secret-key');
  });

  it('signs and submits checkout fields in SePay required order', async () => {
    const checkout = await service.createCheckout(user, {
      plan: SubscriptionPlan.STUDENT,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
    });

    const fieldNames = Object.keys(checkout.fields);
    expect(fieldNames).toEqual([
      'order_amount',
      'merchant',
      'currency',
      'operation',
      'order_description',
      'order_invoice_number',
      'customer_id',
      'payment_method',
      'success_url',
      'error_url',
      'cancel_url',
      'signature',
    ]);

    const signaturePayload = fieldNames
      .filter((name) => name !== 'signature')
      .map((name) => `${name}=${checkout.fields[name]}`)
      .join(',');
    expect(checkout.fields.signature).toBe(
      createHmac('sha256', 'secret-key')
        .update(signaturePayload)
        .digest('base64'),
    );
    expect(checkout.fields).not.toHaveProperty('custom_data');
  });

  it('keeps production plan prices in the public plan list', () => {
    expect(service.getPlans()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: SubscriptionPlan.STUDENT,
          amount: 149000,
        }),
        expect.objectContaining({
          code: SubscriptionPlan.PRO,
          amount: 349000,
        }),
      ]),
    );
  });

  it('returns real user usage and remaining plan quotas', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'subscription-id',
      plan: SubscriptionPlan.STUDENT,
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
      expiresAt: new Date('2099-07-01T00:00:00.000Z'),
      storageLimitMb: 1024,
      uploadLimit: 100,
      aiChatLimit: 300,
      aiChatsUsed: 999,
    });
    prisma.document.aggregate.mockResolvedValue({
      _count: { _all: 12 },
      _sum: { fileSize: BigInt(25 * 1024 * 1024 + 512 * 1024) },
    });
    prisma.chatMessage.count.mockResolvedValue(47);

    await expect(service.getCurrentSubscription(user.id)).resolves.toMatchObject({
      aiChatsUsed: 47,
      aiChatsRemaining: 253,
      uploadsUsed: 12,
      uploadsRemaining: 88,
      storageUsedMb: 25.5,
      storageRemainingMb: 998.5,
    });
    expect(prisma.chatMessage.count).toHaveBeenCalledWith({
      where: {
        sender: 'USER',
        createdAt: { gte: new Date('2026-06-01T00:00:00.000Z') },
        chatSession: { userId: user.id },
      },
    });
  });

  it('reuses an unexpired pending checkout instead of creating a duplicate order', async () => {
    prisma.paymentOrder.findFirst.mockResolvedValue({
      invoiceNumber: paymentOrder.invoiceNumber,
      plan: paymentOrder.plan,
      paymentMethod: paymentOrder.paymentMethod,
      amount: paymentOrder.amount,
      expiresAt: paymentOrder.expiresAt,
    });

    const checkout = await service.createCheckout(user, {
      plan: SubscriptionPlan.STUDENT,
      paymentMethod: PaymentMethod.CARD,
    });

    expect(transaction.paymentOrder.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
    expect(checkout).toMatchObject({
      invoiceNumber: paymentOrder.invoiceNumber,
      expiresAt: paymentOrder.expiresAt.toISOString(),
    });
    expect(checkout.fields).toMatchObject({
      payment_method: paymentOrder.paymentMethod,
      order_invoice_number: paymentOrder.invoiceNumber,
      order_amount: paymentOrder.amount,
    });
  });

  it('charges the full bundle price when buying Pro after Student', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.STUDENT,
      expiresAt: activeSubscriptionExpiry,
    });

    const checkout = await service.createCheckout(user, {
      plan: SubscriptionPlan.PRO,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
    });

    expect(transaction.paymentOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are typed as any.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          plan: SubscriptionPlan.PRO,
          amount: 349000,
        }),
      }),
    );
    expect(checkout.fields).toMatchObject({
      payment_method: PaymentMethod.BANK_TRANSFER,
      order_amount: 349000,
    });
  });

  it('allows buying Student resources while Pro access is active', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      plan: SubscriptionPlan.PRO,
      expiresAt: activeSubscriptionExpiry,
    });

    await expect(
      service.createCheckout(user, {
        plan: SubscriptionPlan.STUDENT,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
      }),
    ).resolves.toMatchObject({ fields: { order_amount: 149000 } });
    expect(transaction.paymentOrder.create).toHaveBeenCalledTimes(1);
  });

  it('rejects IPN requests with an invalid API key', async () => {
    await expect(
      service.processIpn('Apikey wrong-key', ipn),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects IPN requests without the Apikey authorization scheme', async () => {
    await expect(
      service.processIpn('webhook-api-key', ipn),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('acknowledges the generic SePay test webhook payload', async () => {
    await expect(
      service.processWebhook('Apikey webhook-api-key', {
        ...bankWebhook,
        id: 0,
        code: 'SEPAYTEST',
        content: 'SEPAY TEST WEBHOOK',
      }),
    ).resolves.toEqual({ acknowledged: true });

    expect(prisma.paymentOrder.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('activates a matching bank-transfer order from a bank webhook', async () => {
    await expect(
      service.processWebhook('Apikey webhook-api-key', bankWebhook),
    ).resolves.toEqual({ acknowledged: true });

    expect(transaction.paymentOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are typed as any.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          status: PaymentStatus.PAID,
          sepayTransactionId: `BANK-${bankWebhook.id}`,
        }),
      }),
    );
    expect(transaction.subscription.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects a paid notification when the amount does not match', async () => {
    await expect(
      service.processIpn('Apikey webhook-api-key', {
        ...ipn,
        transaction: {
          ...ipn.transaction,
          transaction_amount: '148000',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('activates the purchased plan exactly once after a valid IPN', async () => {
    await expect(
      service.processIpn('Apikey webhook-api-key', ipn),
    ).resolves.toEqual({ acknowledged: true });

    expect(transaction.paymentOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: paymentOrder.id,
          status: { not: PaymentStatus.PAID },
        },
      }),
    );
    expect(transaction.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(2);

    transaction.paymentOrder.updateMany.mockResolvedValue({ count: 0 });
    await service.processIpn('Apikey webhook-api-key', ipn);
    expect(transaction.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('extends access and accumulates resources for every paid bundle', async () => {
    prisma.paymentOrder.findUnique.mockResolvedValue({
      ...paymentOrder,
      plan: SubscriptionPlan.PRO,
      amount: 349000,
      storageMb: 5120,
      uploadCredits: 500,
      aiCredits: 0,
      unlimitedAiDays: 30,
    });
    transaction.subscription.findUnique.mockResolvedValue({
      id: 'subscription-id',
      userId: user.id,
      plan: SubscriptionPlan.STUDENT,
      paymentOrderId: 'previous-payment',
      startsAt: new Date('2099-06-22T00:00:00.000Z'),
      expiresAt: activeSubscriptionExpiry,
      storageLimitMb: 1124,
      uploadLimit: 110,
      aiChatLimit: 320,
      aiChatsUsed: 10,
      unlimitedAiUntil: null,
    });

    await service.processIpn('Apikey webhook-api-key', {
      ...ipn,
      order: {
        ...ipn.order,
        order_amount: '349000',
      },
      transaction: {
        ...ipn.transaction,
        transaction_amount: '349000',
      },
    });

    expect(transaction.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        // Jest asymmetric matchers are typed as any.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        update: expect.objectContaining({
          plan: SubscriptionPlan.PRO,
          expiresAt: new Date('2099-08-21T00:00:00.000Z'),
          storageLimitMb: 6244,
          uploadLimit: 610,
          aiChatLimit: 320,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          unlimitedAiUntil: expect.any(Date),
        }),
        // Jest asymmetric matchers are typed as any.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        create: expect.objectContaining({
          plan: SubscriptionPlan.PRO,
          expiresAt: new Date('2099-08-21T00:00:00.000Z'),
        }),
      }),
    );
  });

  it('adds Student resources without replacing an active Pro entitlement', async () => {
    const unlimitedUntil = new Date('2099-07-22T00:00:00.000Z');
    transaction.subscription.findUnique.mockResolvedValue({
      id: 'subscription-id',
      userId: user.id,
      plan: SubscriptionPlan.PRO,
      paymentOrderId: 'pro-payment',
      startsAt: new Date('2099-06-22T00:00:00.000Z'),
      expiresAt: activeSubscriptionExpiry,
      storageLimitMb: 5120,
      uploadLimit: 500,
      aiChatLimit: 20,
      aiChatsUsed: 5,
      unlimitedAiUntil: unlimitedUntil,
    });

    await service.processIpn('Apikey webhook-api-key', ipn);

    expect(transaction.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        update: expect.objectContaining({
          expiresAt: new Date('2099-08-21T00:00:00.000Z'),
          storageLimitMb: 6144,
          uploadLimit: 600,
          aiChatLimit: 320,
          unlimitedAiUntil: unlimitedUntil,
          aiChatsUsed: 5,
        }),
      }),
    );
    expect(transaction.entitlementTransaction.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        paymentOrderId: paymentOrder.id,
        packageCode: SubscriptionPlan.STUDENT,
        durationDays: 30,
        storageDeltaMb: 1024,
        uploadDelta: 100,
        aiCreditDelta: 300,
      }),
    });
  });

  it('expires an elapsed subscription and restores Free quotas', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'subscription-id',
      plan: SubscriptionPlan.STUDENT,
      startsAt: new Date('2026-05-01T00:00:00.000Z'),
      expiresAt: new Date('2026-05-31T00:00:00.000Z'),
      storageLimitMb: 1024,
      uploadLimit: 100,
      aiChatLimit: 300,
      aiChatsUsed: 68,
    });

    const result = await service.getCurrentSubscription(user.id);

    expect(result.plan).toBe(SubscriptionPlan.FREE);
    expect(result.aiChatLimit).toBe(20);
    expect(transaction.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('records a cancelled redirect without activating a subscription', async () => {
    prisma.paymentOrder.findUnique.mockResolvedValue(paymentOrder);

    const result = await service.updatePaymentStatus(
      user.id,
      paymentOrder.invoiceNumber,
      { status: 'CANCELLED' },
    );

    expect(transaction.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: {
        id: paymentOrder.id,
        status: PaymentStatus.PENDING,
      },
      data: { status: PaymentStatus.CANCELLED },
    });
    expect(transaction.subscription.upsert).not.toHaveBeenCalled();
    expect(result.invoiceNumber).toBe(paymentOrder.invoiceNumber);
  });

  it('marks pending payment orders as expired after their deadline', async () => {
    prisma.paymentOrder.findMany.mockResolvedValue([
      {
        id: paymentOrder.id,
        invoiceNumber: paymentOrder.invoiceNumber,
      },
    ]);

    await service.getPayment(user.id, paymentOrder.invoiceNumber);

    expect(transaction.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: {
        id: paymentOrder.id,
        status: PaymentStatus.PENDING,
      },
      data: { status: PaymentStatus.EXPIRED },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('reconciles a captured SePay order when a success redirect is polled', async () => {
    const paidAt = new Date('2026-06-22T00:10:00.000Z');
    prisma.paymentOrder.findUnique
      .mockResolvedValueOnce(paymentOrder)
      .mockResolvedValueOnce({
        ...paymentOrder,
        status: PaymentStatus.PAID,
        paidAt,
      });
    sepayOrderRetrieve.mockResolvedValue({
      data: {
        data: {
          id: 'sepay-order-id',
          customer_id: user.id,
          order_invoice_number: paymentOrder.invoiceNumber,
          order_status: 'CAPTURED',
          order_amount: '149000.00',
          order_currency: 'VND',
        },
      },
    });

    const result = await service.getPayment(
      user.id,
      paymentOrder.invoiceNumber,
    );

    expect(sepayOrderRetrieve).toHaveBeenCalledWith(paymentOrder.invoiceNumber);
    expect(transaction.paymentOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: paymentOrder.id,
          status: { not: PaymentStatus.PAID },
        },
        // Jest asymmetric matchers are typed as any.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          status: PaymentStatus.PAID,
          sepayOrderId: 'sepay-order-id',
        }),
      }),
    );
    expect(transaction.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(PaymentStatus.PAID);
  });

  it('marks a voided transaction as refunded and restores Free when it funded the active plan', async () => {
    prisma.paymentOrder.findUnique.mockResolvedValue({
      ...paymentOrder,
      status: PaymentStatus.PAID,
    });
    transaction.subscription.findUnique.mockResolvedValue({
      id: 'subscription-id',
      userId: user.id,
      plan: SubscriptionPlan.STUDENT,
      paymentOrderId: paymentOrder.id,
      startsAt: new Date('2026-06-22T00:00:00.000Z'),
      expiresAt: new Date('2026-07-22T00:00:00.000Z'),
      storageLimitMb: 1124,
      uploadLimit: 110,
      aiChatLimit: 320,
      aiChatsUsed: 0,
      unlimitedAiUntil: null,
    });
    transaction.entitlementTransaction.findUnique.mockResolvedValue({
      durationDays: 30,
      storageDeltaMb: 1024,
      uploadDelta: 100,
      aiCreditDelta: 300,
      unlimitedAiDays: 0,
    });

    const voidIpn = {
      ...ipn,
      notification_type: 'TRANSACTION_VOID',
    };
    await service.processIpn('Apikey webhook-api-key', voidIpn);

    expect(transaction.paymentOrder.updateMany).toHaveBeenCalledWith({
      where: {
        id: paymentOrder.id,
        status: PaymentStatus.PAID,
      },
      data: {
        status: PaymentStatus.REFUNDED,
        rawNotification: voidIpn,
      },
    });
    expect(transaction.subscription.update).toHaveBeenCalledTimes(1);
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(2);
  });
});
