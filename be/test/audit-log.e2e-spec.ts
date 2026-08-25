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

// Inject mock environment variables for validation
process.env.DATABASE_URL = 'postgresql://localhost:5432/mock';
process.env.FIREBASE_PROJECT_ID = 'mock-project-id';
process.env.FIREBASE_CLIENT_EMAIL = 'mock-client-email@mock.com';
process.env.FIREBASE_PRIVATE_KEY =
  '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----';
process.env.FIREBASE_STORAGE_BUCKET = 'mock-bucket';
process.env.R2_PUBLIC_URL = 'https://r2.example.test';
process.env.GEMINI_API_KEY = 'mock-gemini-key';
process.env.SEPAY_WEBHOOK_API_KEY = 'mock-sepay-key';
process.env.PORT = '3000';

import { Test } from '@nestjs/testing';
import {
  INestApplication,
  ExecutionContext,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FirebaseAuthGuard } from '../src/auth/guards/firebase-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';

describe('AuditLog (e2e)', () => {
  let app: INestApplication;

  const mockPrismaService = {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    documentContent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  interface CustomRequest {
    user: { id: string; role: { name: string } };
  }

  const mockFirebaseAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest<CustomRequest>();
      req.user = { id: 'admin-id', role: { name: 'ADMIN' } };
      return true;
    },
  };

  const mockRolesGuard = { canActivate: () => true };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideGuard(FirebaseAuthGuard)
      .useValue(mockFirebaseAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/admin/logs/audit', async () => {
    const mockLogs = [
      {
        id: 'log-uuid-1',
        action: 'DOCUMENT_UPLOAD',
        targetType: 'DOCUMENT',
        targetId: 'doc-uuid-1',
        userId: 'admin-id',
        metadata: { fileName: 'lecture1.pdf' },
        createdAt: new Date().toISOString(),
      },
    ];

    mockPrismaService.auditLog.findMany.mockResolvedValue(mockLogs);
    mockPrismaService.auditLog.count.mockResolvedValue(1);

    await request(app.getHttpServer())
      .get('/api/admin/logs/audit?page=1&limit=10&action=DOCUMENT_UPLOAD')
      .expect(200)
      .expect({
        items: mockLogs,
        meta: {
          page: 1,
          limit: 10,
          totalItems: 1,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      });
  });

  it('GET /api/admin/logs/audit returns empty state', async () => {
    mockPrismaService.auditLog.findMany.mockResolvedValue([]);
    mockPrismaService.auditLog.count.mockResolvedValue(0);

    await request(app.getHttpServer())
      .get('/api/admin/logs/audit')
      .expect(200)
      .expect({
        items: [],
        meta: {
          page: 1,
          limit: 10,
          totalItems: 0,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
        },
      });
  });
});
