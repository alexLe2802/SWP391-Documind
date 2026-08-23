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
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Reports (e2e)', () => {
  let adminApp: INestApplication;
  let nonAdminApp: INestApplication;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    document: {
      findMany: jest.fn(),
    },
    downloadLog: {
      groupBy: jest.fn(),
    },
    savedDocument: {
      groupBy: jest.fn(),
    },
    documentContent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  interface CustomRequest {
    user: { id: string; role: { name: string } };
  }

  const mockAdminFirebaseAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest<CustomRequest>();
      req.user = { id: 'admin-id', role: { name: 'ADMIN' } };
      return true;
    },
  };

  const mockUserFirebaseAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest<CustomRequest>();
      req.user = { id: 'user-id', role: { name: 'USER' } };
      return true;
    },
  };

  const mockRolesGuard = { canActivate: () => true };

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
    const adminModuleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideGuard(FirebaseAuthGuard)
      .useValue(mockAdminFirebaseAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    adminApp = adminModuleRef.createNestApplication();
    configureApp(adminApp);
    await adminApp.init();

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
    if (adminApp) {
      await adminApp.close();
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/admin/reports/upload-statistics', async () => {
    mockPrismaService.$queryRaw.mockResolvedValue([
      { date: '2026-06-01', count: 2 },
    ]);

    await request(adminApp.getHttpServer())
      .get('/api/admin/reports/upload-statistics?groupBy=day')
      .expect(200)
      .expect({
        filters: { groupBy: 'day' },
        data: [{ date: '2026-06-01', count: 2 }],
        message: 'Upload statistics retrieved successfully',
      });
  });

  it('GET /api/admin/reports/most-downloaded', async () => {
    mockPrismaService.downloadLog.groupBy.mockResolvedValue([
      { documentId: 'document-1', _count: { _all: 4 } },
    ]);
    mockPrismaService.document.findMany.mockResolvedValue([
      {
        id: 'document-1',
        title: 'Lecture 1',
        fileName: 'lecture-1.pdf',
        fileType: 'application/pdf',
      },
    ]);

    await request(adminApp.getHttpServer())
      .get('/api/admin/reports/most-downloaded?limit=5')
      .expect(200)
      .expect({
        filters: { limit: 5 },
        data: [
          {
            documentId: 'document-1',
            title: 'Lecture 1',
            fileName: 'lecture-1.pdf',
            fileType: 'application/pdf',
            downloadCount: 4,
          },
        ],
        message: 'Most downloaded documents retrieved successfully',
      });
  });

  it('GET /api/admin/reports/most-saved', async () => {
    mockPrismaService.savedDocument.groupBy.mockResolvedValue([
      { documentId: 'document-1', _count: { _all: 6 } },
    ]);
    mockPrismaService.document.findMany.mockResolvedValue([
      {
        id: 'document-1',
        title: 'Lecture 1',
        fileName: 'lecture-1.pdf',
        fileType: 'application/pdf',
      },
    ]);

    await request(adminApp.getHttpServer())
      .get('/api/admin/reports/most-saved?limit=5')
      .expect(200)
      .expect({
        filters: { limit: 5 },
        data: [
          {
            documentId: 'document-1',
            title: 'Lecture 1',
            fileName: 'lecture-1.pdf',
            fileType: 'application/pdf',
            saveCount: 6,
          },
        ],
        message: 'Most saved documents retrieved successfully',
      });
  });

  it('rejects limit parameter outside 1..100 boundary', async () => {
    await request(adminApp.getHttpServer())
      .get('/api/admin/reports/most-downloaded?limit=0')
      .expect(400);

    await request(adminApp.getHttpServer())
      .get('/api/admin/reports/most-downloaded?limit=101')
      .expect(400);
  });

  it('rejects date range where fromDate is after toDate', async () => {
    await request(adminApp.getHttpServer())
      .get(
        '/api/admin/reports/most-saved?fromDate=2026-06-10T00:00:00Z&toDate=2026-06-01T00:00:00Z',
      )
      .expect(400);
  });

  it.each([
    '/api/admin/reports/upload-statistics',
    '/api/admin/reports/most-downloaded',
    '/api/admin/reports/most-saved',
  ])('returns 403 for authenticated non-admin requests to %s', async (path) => {
    await request(nonAdminApp.getHttpServer()).get(path).expect(403);
  });
});
