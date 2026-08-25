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
import {
  DocumentStatus,
  DocumentVisibility,
  ExtractionStatus,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';

describe('Documents download tracking (e2e)', () => {
  let app: INestApplication;

  const userId = '11111111-1111-4111-8111-111111111111';
  const documentId = '22222222-2222-4222-8222-222222222222';

  const mockPrismaService = {
    document: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    downloadLog: {
      create: jest.fn(),
    },
    documentContent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockStorageService = {
    createObjectDownloadUrl: jest.fn(),
  };

  interface CustomRequest {
    user: { id: string; role: { name: string } };
  }

  const mockFirebaseAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest<CustomRequest>();
      req.user = { id: userId, role: { name: 'USER' } };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(StorageService)
      .useValue(mockStorageService)
      .overrideGuard(FirebaseAuthGuard)
      .useValue(mockFirebaseAuthGuard)
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

  it('GET /api/documents/:id/download creates a download log after authorization', async () => {
    mockPrismaService.document.findFirst.mockResolvedValue({
      id: documentId,
      ownerId: userId,
      subjectId: '33333333-3333-4333-8333-333333333333',
      categoryId: '44444444-4444-4444-8444-444444444444',
      title: 'Lecture Notes',
      description: null,
      fileName: 'Lecture Notes.pdf',
      fileType: 'application/pdf',
      fileSize: BigInt(1024),
      storagePath: `users/${userId}/lecture-notes.pdf`,
      fileUrl: null,
      visibility: DocumentVisibility.PRIVATE,
      status: DocumentStatus.ACTIVE,
      extractionStatus: ExtractionStatus.COMPLETED,
      owner: {
        id: userId,
        fullName: 'Student User',
        email: 'student@example.com',
        avatarUrl: null,
      },
      subject: null,
      category: null,
      tags: [],
      content: null,
      savedBy: [],
      createdAt: new Date('2026-06-17T10:00:00.000Z'),
      updatedAt: new Date('2026-06-17T10:00:00.000Z'),
    });
    mockStorageService.createObjectDownloadUrl.mockResolvedValue({
      url: 'https://signed.example/download',
      strategy: 'presigned',
      expiresAt: '2026-06-17T10:05:00.000Z',
    });
    mockPrismaService.document.update.mockResolvedValue({
      id: documentId,
      downloadCount: 1,
    });
    mockPrismaService.downloadLog.create.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      userId,
      documentId,
      downloadedAt: new Date('2026-06-17T10:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/download`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          url: 'https://signed.example/download',
          strategy: 'presigned',
          expiresAt: '2026-06-17T10:05:00.000Z',
        });
      });

    expect(mockStorageService.createObjectDownloadUrl).toHaveBeenCalledWith(
      `users/${userId}/lecture-notes.pdf`,
      'Lecture Notes.pdf',
      'application/pdf',
    );
    expect(mockPrismaService.document.update).toHaveBeenCalledWith({
      where: { id: documentId },
      data: { downloadCount: { increment: 1 } },
    });
    expect(mockPrismaService.downloadLog.create).toHaveBeenCalledWith({
      data: {
        userId,
        documentId,
      },
    });
  });

  it('GET /api/documents/:id/download does not create a log when access fails', async () => {
    mockPrismaService.document.findFirst.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/download`)
      .expect(404);

    expect(mockStorageService.createObjectDownloadUrl).not.toHaveBeenCalled();
    expect(mockPrismaService.document.update).not.toHaveBeenCalled();
    expect(mockPrismaService.downloadLog.create).not.toHaveBeenCalled();
  });
});
