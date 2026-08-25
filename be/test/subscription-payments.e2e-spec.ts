/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  cert: jest.fn(),
  getApps: jest.fn(() => []),
}));
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({})),
}));
jest.mock('firebase-admin/storage', () => ({
  getStorage: jest.fn(() => ({})),
}));

process.env.DATABASE_URL = 'postgresql://localhost:5432/mock';
process.env.NODE_ENV = 'test';
process.env.MOCK_AUTH = 'false';
process.env.FIREBASE_PROJECT_ID = 'mock-project-id';
process.env.FIREBASE_CLIENT_EMAIL = 'mock-client-email@mock.com';
process.env.FIREBASE_PRIVATE_KEY =
  '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----';
process.env.FIREBASE_STORAGE_BUCKET = 'mock-bucket';
process.env.R2_PUBLIC_URL = 'https://r2.example.test';
process.env.GEMINI_API_KEY = 'mock-gemini-key';
process.env.SEPAY_WEBHOOK_API_KEY = 'mock-sepay-key';
process.env.PORT = '3000';

import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FirebaseAuthGuard } from '../src/auth/guards/firebase-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Subscription and payment mock APIs (e2e)', () => {
  let app: INestApplication;
  let authenticatedApp: INestApplication;

  const mockPrismaService: any = {
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
    userSubscription: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    paymentOrder: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    documentContent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    document: {
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 0 },
        _sum: { fileSize: null },
      }),
    },
    chatMessage: {
      count: jest.fn().mockResolvedValue(10),
    },
  };

  interface CustomRequest {
    user: { id: string; role: { name: string } };
  }

  const mockFirebaseAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest<CustomRequest>();
      req.user = { id: 'user-id', role: { name: 'USER' } };
      return true;
    },
  };

  const configureApp = (nestApp: INestApplication): void => {
    nestApp.setGlobalPrefix('api');
    nestApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
  };

  beforeAll(async () => {
    const publicModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = publicModuleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const authenticatedModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideGuard(FirebaseAuthGuard)
      .useValue(mockFirebaseAuthGuard)
      .compile();

    authenticatedApp = authenticatedModuleRef.createNestApplication();
    configureApp(authenticatedApp);
    await authenticatedApp.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaService.paymentOrder.findMany.mockResolvedValue([]);
    mockPrismaService.paymentOrder.updateMany.mockResolvedValue({ count: 0 });
  });

  afterAll(async () => {
    if (authenticatedApp) {
      await authenticatedApp.close();
    }
    if (app) {
      await app.close();
    }
  });

  it('GET /api/subscription/plans is public', async () => {
    await request(app.getHttpServer())
      .get('/api/subscription/plans')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'FREE', amount: 0 }),
            expect.objectContaining({ code: 'PRO', amount: 349000 }),
          ]),
        );
      });
  });

  it.each(['/api/subscription/current', '/api/payments/history'])(
    'requires Firebase bearer token for %s',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
    },
  );

  it('GET /api/subscription/current returns the current mock subscription', async () => {
    mockPrismaService.subscription.findUnique.mockResolvedValue({
      id: 'sub-id-1',
      plan: 'PRO',
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
      expiresAt: new Date('2029-07-01T00:00:00.000Z'),
      storageLimitMb: 5120,
      uploadLimit: 500,
      aiChatLimit: null,
      aiChatsUsed: 10,
    });

    await request(authenticatedApp.getHttpServer())
      .get('/api/subscription/current')
      .expect(200)
      .expect({
        plan: 'PRO',
        startsAt: '2026-06-01T00:00:00.000Z',
        expiresAt: '2029-07-01T00:00:00.000Z',
        storageLimitMb: 5120,
        uploadLimit: 500,
        aiChatLimit: null,
        aiChatsUsed: 10,
        aiChatsRemaining: null,
        uploadsUsed: 0,
        uploadsRemaining: 500,
        storageUsedMb: 0,
        storageRemainingMb: 5120,
      });
  });

  it('GET /api/payments/history returns mock payment history', async () => {
    mockPrismaService.paymentOrder.findMany.mockResolvedValue([
      {
        invoiceNumber: 'pay_mock_001',
        plan: 'PRO',
        paymentMethod: 'SEPAY',
        amount: 349000,
        currency: 'VND',
        status: 'PAID',
        paidAt: new Date('2026-06-01T00:00:00.000Z'),
        expiresAt: new Date('2026-07-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);

    await request(authenticatedApp.getHttpServer())
      .get('/api/payments/history')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              invoiceNumber: 'pay_mock_001',
              plan: 'PRO',
              status: 'PAID',
            }),
          ]),
        );
      });
  });
});
