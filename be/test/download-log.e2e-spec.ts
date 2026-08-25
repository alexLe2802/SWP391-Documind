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

describe('DownloadLog (e2e)', () => {
  let app: INestApplication;

  const mockPrismaService = {
    downloadLog: {
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

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/admin/logs/downloads', async () => {
    const mockLogs = [
      {
        id: 'download-log-1',
        userId: 'user-1',
        documentId: 'document-1',
        downloadedAt: '2026-06-17T10:00:00.000Z',
        user: {
          id: 'user-1',
          email: 'student@example.com',
          fullName: 'Student User',
        },
        document: {
          id: 'document-1',
          title: 'Lecture Notes',
          fileName: 'lecture.pdf',
          fileType: 'application/pdf',
        },
      },
    ];

    mockPrismaService.downloadLog.findMany.mockResolvedValue(mockLogs);
    mockPrismaService.downloadLog.count.mockResolvedValue(1);

    await request(app.getHttpServer())
      .get(
        '/api/admin/logs/downloads?page=1&limit=10&userId=user-1&documentId=document-1',
      )
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

  it('GET /api/admin/logs/downloads returns empty state', async () => {
    mockPrismaService.downloadLog.findMany.mockResolvedValue([]);
    mockPrismaService.downloadLog.count.mockResolvedValue(0);

    await request(app.getHttpServer())
      .get('/api/admin/logs/downloads')
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
