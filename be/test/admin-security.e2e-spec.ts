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
import { PrismaService } from '../src/prisma/prisma.service';
import { FirebaseAuthGuard } from '../src/auth/guards/firebase-auth.guard';

describe('Admin security (e2e)', () => {
  let unauthenticatedApp: INestApplication;
  let nonAdminApp: INestApplication;

  interface CustomRequest {
    user: { id: string; role: { name: string } };
  }

  const adminGetPaths = [
    '/api/admin/dashboard/summary',
    '/api/admin/dashboard/user-stats',
    '/api/admin/dashboard/document-stats',
    '/api/admin/dashboard/statistics',
    '/api/admin/dashboard/documents-by-subject',
    '/api/admin/dashboard/documents-by-category',
    '/api/admin/dashboard/upload-statistics',
    '/api/admin/dashboard/chatbot-stats',
    '/api/admin/reports/upload-statistics',
    '/api/admin/reports/most-downloaded',
    '/api/admin/reports/most-saved',
    '/api/admin/logs/audit',
    '/api/admin/logs/downloads',
    '/api/admin/users',
  ] as const;

  const mockUserFirebaseAuthGuard = {
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

  const mockPrismaService = {
    documentContent: { findMany: jest.fn().mockResolvedValue([]) },
  };

  beforeAll(async () => {
    const unauthenticatedModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    unauthenticatedApp = unauthenticatedModuleRef.createNestApplication();
    configureApp(unauthenticatedApp);
    await unauthenticatedApp.init();

    const nonAdminModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideGuard(FirebaseAuthGuard)
      .useValue(mockUserFirebaseAuthGuard)
      .compile();

    nonAdminApp = nonAdminModuleRef.createNestApplication();
    configureApp(nonAdminApp);
    await nonAdminApp.init();
  });

  afterAll(async () => {
    if (nonAdminApp) {
      await nonAdminApp.close();
    }
    if (unauthenticatedApp) {
      await unauthenticatedApp.close();
    }
  });

  it.each(adminGetPaths)(
    'requires Firebase bearer token for %s',
    async (path) => {
      await request(unauthenticatedApp.getHttpServer()).get(path).expect(401);
    },
  );

  it('protects the API-02 admin user list', async () => {
    await request(unauthenticatedApp.getHttpServer())
      .get('/api/admin/users')
      .expect(401);
  });

  it('protects the API-02 PATCH user status endpoint', async () => {
    await request(unauthenticatedApp.getHttpServer())
      .patch('/api/admin/users/user-id/status')
      .send({ status: 'BLOCKED' })
      .expect(401);
  });

  it.each(adminGetPaths)(
    'returns 403 for authenticated non-admin requests to %s',
    async (path) => {
      await request(nonAdminApp.getHttpServer()).get(path).expect(403);
    },
  );

  it('returns 403 for authenticated non-admin requests to patch admin user status', async () => {
    await request(nonAdminApp.getHttpServer())
      .patch('/api/admin/users/5a651c0b-7621-4ee8-99c7-39b85e560c13/status')
      .send({ status: 'BLOCKED' })
      .expect(403);
  });
});
