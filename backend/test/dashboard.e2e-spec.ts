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
import {
  DocumentStatus,
  DocumentVisibility,
  RoleName,
  UserStatus,
} from '../src/generated/prisma/client';

describe('Dashboard (e2e)', () => {
  let app: INestApplication;

  const mockPrismaService = {
    $queryRaw: jest.fn(),
    user: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    role: {
      findMany: jest.fn(),
    },
    document: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    chatSession: {
      count: jest.fn(),
    },
    downloadLog: {
      count: jest.fn(),
    },
    subject: {
      findMany: jest.fn(),
    },
    category: {
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
    chatSource: {
      groupBy: jest.fn(),
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/admin/dashboard/summary', async () => {
    mockPrismaService.user.count.mockResolvedValue(5);
    mockPrismaService.document.count.mockImplementation(
      (args?: {
        where?: { status?: DocumentStatus; visibility?: DocumentVisibility };
      }) => {
        if (args?.where?.visibility === DocumentVisibility.PUBLIC) {
          return Promise.resolve(2);
        }
        if (args?.where?.visibility === DocumentVisibility.PRIVATE) {
          return Promise.resolve(2);
        }
        return Promise.resolve(4); // total active docs
      },
    );
    mockPrismaService.chatSession.count.mockResolvedValue(10);
    mockPrismaService.downloadLog.count.mockResolvedValue(15);

    await request(app.getHttpServer())
      .get('/api/admin/dashboard/summary')
      .expect(200)
      .expect({
        totalUsers: 5,
        totalDocuments: 4,
        totalPublicDocuments: 2,
        totalPrivateDocuments: 2,
        totalChats: 10,
        totalDownloads: 15,
        message: 'Dashboard summary retrieved successfully',
      });
  });

  it('rejects invalid date range values', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/dashboard/documents-by-subject?from=not-a-date')
      .expect(400);
  });

  it('rejects date range where from is after to', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/admin/dashboard/documents-by-subject?from=2026-06-10T00:00:00Z&to=2026-06-01T00:00:00Z',
      )
      .expect(400);
  });

  it('GET /api/admin/dashboard/user-stats', async () => {
    mockPrismaService.role.findMany.mockResolvedValue([
      { name: RoleName.ADMIN, _count: { users: 1 } },
      { name: RoleName.USER, _count: { users: 4 } },
    ]);
    mockPrismaService.user.groupBy.mockResolvedValue([
      { status: UserStatus.ACTIVE, _count: { _all: 5 } },
    ]);

    await request(app.getHttpServer())
      .get('/api/admin/dashboard/user-stats')
      .expect(200)
      .expect({
        byRole: [
          { role: RoleName.ADMIN, count: 1 },
          { role: RoleName.USER, count: 4 },
        ],
        byStatus: [{ status: UserStatus.ACTIVE, count: 5 }],
        message: 'User statistics retrieved successfully',
      });
  });

  it('GET /api/admin/dashboard/document-stats', async () => {
    mockPrismaService.document.groupBy.mockImplementation(
      (args: { by: string[] }) => {
        if (args.by.includes('status')) {
          return Promise.resolve([
            { status: DocumentStatus.ACTIVE, _count: { _all: 3 } },
            { status: DocumentStatus.HIDDEN, _count: { _all: 1 } },
          ]);
        }
        if (args.by.includes('visibility')) {
          return Promise.resolve([
            { visibility: DocumentVisibility.PUBLIC, _count: { _all: 2 } },
            { visibility: DocumentVisibility.PRIVATE, _count: { _all: 2 } },
          ]);
        }
        return Promise.resolve([]);
      },
    );

    await request(app.getHttpServer())
      .get('/api/admin/dashboard/document-stats')
      .expect(200)
      .expect({
        byStatus: [
          { status: DocumentStatus.ACTIVE, count: 3 },
          { status: DocumentStatus.HIDDEN, count: 1 },
        ],
        byVisibility: [
          { visibility: DocumentVisibility.PUBLIC, count: 2 },
          { visibility: DocumentVisibility.PRIVATE, count: 2 },
        ],
        message: 'Document statistics retrieved successfully',
      });
  });

  it('GET /api/admin/dashboard/statistics', async () => {
    mockPrismaService.role.findMany.mockResolvedValue([
      { name: RoleName.ADMIN, _count: { users: 1 } },
      { name: RoleName.USER, _count: { users: 4 } },
    ]);
    mockPrismaService.user.groupBy.mockResolvedValue([
      { status: UserStatus.ACTIVE, _count: { _all: 4 } },
      { status: UserStatus.BLOCKED, _count: { _all: 1 } },
    ]);
    mockPrismaService.document.groupBy.mockImplementation(
      (args: { by: string[] }) => {
        if (args.by.includes('status')) {
          return Promise.resolve([
            { status: DocumentStatus.ACTIVE, _count: { _all: 3 } },
            { status: DocumentStatus.HIDDEN, _count: { _all: 1 } },
          ]);
        }
        if (args.by.includes('visibility')) {
          return Promise.resolve([
            { visibility: DocumentVisibility.PUBLIC, _count: { _all: 2 } },
            { visibility: DocumentVisibility.PRIVATE, _count: { _all: 2 } },
          ]);
        }
        return Promise.resolve([]);
      },
    );
    mockPrismaService.subject.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        code: 'MATH101',
        name: 'Mathematics',
        _count: { documents: 2 },
      },
    ]);
    mockPrismaService.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: 'Lecture Notes',
        _count: { documents: 3 },
      },
    ]);

    await request(app.getHttpServer())
      .get('/api/admin/dashboard/statistics')
      .expect(200)
      .expect({
        users: {
          byRole: [
            { role: RoleName.ADMIN, count: 1 },
            { role: RoleName.USER, count: 4 },
          ],
          byStatus: [
            { status: UserStatus.ACTIVE, count: 4 },
            { status: UserStatus.BLOCKED, count: 1 },
          ],
        },
        documents: {
          byStatus: [
            { status: DocumentStatus.ACTIVE, count: 3 },
            { status: DocumentStatus.HIDDEN, count: 1 },
          ],
          byVisibility: [
            { visibility: DocumentVisibility.PUBLIC, count: 2 },
            { visibility: DocumentVisibility.PRIVATE, count: 2 },
          ],
          bySubject: [
            { id: 'sub-1', code: 'MATH101', name: 'Mathematics', count: 2 },
          ],
          byCategory: [{ id: 'cat-1', name: 'Lecture Notes', count: 3 }],
        },
        message: 'Dashboard statistics retrieved successfully',
      });
  });

  it('GET /api/admin/dashboard/statistics returns empty state', async () => {
    mockPrismaService.role.findMany.mockResolvedValue([]);
    mockPrismaService.user.groupBy.mockResolvedValue([]);
    mockPrismaService.document.groupBy.mockResolvedValue([]);
    mockPrismaService.subject.findMany.mockResolvedValue([]);
    mockPrismaService.category.findMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/admin/dashboard/statistics')
      .expect(200)
      .expect({
        users: {
          byRole: [],
          byStatus: [],
        },
        documents: {
          byStatus: [],
          byVisibility: [],
          bySubject: [],
          byCategory: [],
        },
        message: 'Dashboard statistics retrieved successfully',
      });
  });

  it('GET /api/admin/dashboard/documents-by-subject', async () => {
    mockPrismaService.subject.findMany.mockResolvedValue([
      {
        id: 'sub-1',
        code: 'MATH101',
        name: 'Mathematics',
        _count: { documents: 3 },
      },
    ]);

    await request(app.getHttpServer())
      .get(
        '/api/admin/dashboard/documents-by-subject?from=2026-06-01T00:00:00Z',
      )
      .expect(200)
      .expect({
        filters: { from: '2026-06-01T00:00:00Z' },
        data: [{ id: 'sub-1', code: 'MATH101', name: 'Mathematics', count: 3 }],
        message: 'Documents by subject retrieved successfully',
      });
  });

  it('GET /api/admin/dashboard/documents-by-category', async () => {
    mockPrismaService.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: 'Lecture Notes',
        _count: { documents: 2 },
      },
    ]);

    await request(app.getHttpServer())
      .get(
        '/api/admin/dashboard/documents-by-category?from=2026-06-01T00:00:00Z',
      )
      .expect(200)
      .expect({
        filters: { from: '2026-06-01T00:00:00Z' },
        data: [{ id: 'cat-1', name: 'Lecture Notes', count: 2 }],
        message: 'Documents by category retrieved successfully',
      });
  });

  it('GET /api/admin/dashboard/upload-statistics', async () => {
    mockPrismaService.$queryRaw.mockResolvedValue([
      { date: '2026-06-01', count: 2 },
    ]);

    await request(app.getHttpServer())
      .get('/api/admin/dashboard/upload-statistics?groupBy=day')
      .expect(200)
      .expect({
        filters: { groupBy: 'day' },
        data: [{ date: '2026-06-01', count: 2 }],
        message: 'Upload statistics retrieved successfully',
      });
  });

  it('GET /api/admin/dashboard/upload-statistics returns empty series', async () => {
    mockPrismaService.$queryRaw.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/admin/dashboard/upload-statistics?groupBy=week')
      .expect(200)
      .expect({
        filters: { groupBy: 'week' },
        data: [],
        message: 'Upload statistics retrieved successfully',
      });
  });

  it('GET /api/admin/dashboard/chatbot-stats', async () => {
    mockPrismaService.auditLog.findMany.mockResolvedValue([
      {
        metadata: {
          noSource: false,
          fallbackKeyword: true,
          timings: {
            embeddingMs: 40,
            searchMs: 100,
            geminiMs: 1000,
            saveDbMs: 30,
            totalMs: 1170,
          },
        },
      },
    ]);
    mockPrismaService.chatSource.groupBy.mockResolvedValue([
      { documentId: 'doc-1', _count: { documentId: 10 } },
    ]);
    mockPrismaService.document.findMany.mockResolvedValue([
      { id: 'doc-1', title: 'Doc One' },
    ]);

    await request(app.getHttpServer())
      .get('/api/admin/dashboard/chatbot-stats')
      .expect(200)
      .expect({
        totalQuestions: 1,
        avgResponseTime: {
          avgEmbeddingMs: 40,
          avgSearchMs: 100,
          avgGeminiMs: 1000,
          avgSaveDbMs: 30,
          avgTotalMs: 1170,
        },
        noSourceCount: 0,
        fallbackKeywordCount: 1,
        topCitedDocuments: [
          { documentId: 'doc-1', title: 'Doc One', citeCount: 10 },
        ],
        message: 'Chatbot statistics retrieved successfully',
      });
  });
});
