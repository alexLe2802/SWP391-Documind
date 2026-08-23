import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is missing!');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  console.log('Seeding roles...');

  const roles = [
    { name: 'USER' },
    { name: 'ADMIN' },
  ];

  for (const role of roles) {
    const upsertedRole = await prisma.role.upsert({
      where: { name: role.name as any },
      update: {},
      create: { name: role.name as any },
    });
    console.log(`Role: ${upsertedRole.name} (ID: ${upsertedRole.id})`);
  }

  console.log('\nSeeding default subjects...');
  const subjects = [
    { code: 'SWE', name: 'Software Engineering', description: 'Software engineering principles and practices' },
    { code: 'AI', name: 'Artificial Intelligence', description: 'Introduction to machine learning and AI' },
    { code: 'DB', name: 'Database Systems', description: 'Relational database design and SQL' },
  ];

  for (const s of subjects) {
    const existing = await prisma.subject.findFirst({
      where: {
        ownerId: null,
        code: s.code,
      },
    });
    if (!existing) {
      const created = await prisma.subject.create({
        data: {
          ...s,
          ownerId: null,
        },
      });
      console.log(`Subject: ${created.code} -> ID: ${created.id}`);
    } else {
      console.log(`Subject: ${existing.code} -> ID: ${existing.id}`);
    }
  }

  console.log('\nSeeding default categories...');
  const categories = [
    { name: 'Backend', description: 'Server-side development and APIs' },
    { name: 'Frontend', description: 'Client-side web development' },
    { name: 'DevOps', description: 'CI/CD and cloud infrastructure' },
    { name: 'Lecture Notes', description: 'Weekly slide summaries and notes' },
  ];

  for (const c of categories) {
    const existing = await prisma.category.findFirst({
      where: {
        ownerId: null,
        subjectId: null,
        name: c.name,
      },
    });
    if (!existing) {
      const created = await prisma.category.create({
        data: {
          ...c,
          ownerId: null,
          subjectId: null,
        },
      });
      console.log(`Category: ${created.name} -> ID: ${created.id}`);
    } else {
      console.log(`Category: ${existing.name} -> ID: ${existing.id}`);
    }
  }

  console.log('\nSeeding mock admin user and demo user...');
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
  });
  const userRole = await prisma.role.findUnique({
    where: { name: 'USER' },
  });

  let mockAdmin;
  if (adminRole) {
    mockAdmin = await prisma.user.upsert({
      where: { id: '00000000-0000-0000-0000-000000000000' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000000',
        firebaseUid: 'mock-firebase-admin-uid',
        email: 'admin.mock@documind.local',
        fullName: 'Mock Admin',
        authProvider: 'EMAIL_PASSWORD',
        roleId: adminRole.id,
        status: 'ACTIVE',
      },
    });
    console.log(`Mock Admin User: ${mockAdmin.fullName} (ID: ${mockAdmin.id})`);
  }

  let demoUser;
  if (userRole) {
    demoUser = await prisma.user.upsert({
      where: { id: '11111111-1111-4111-8111-111111111111' },
      update: {},
      create: {
        id: '11111111-1111-4111-8111-111111111111',
        firebaseUid: 'mock-firebase-demo-user-uid',
        email: 'user.demo@documind.local',
        fullName: 'Demo Student User',
        authProvider: 'EMAIL_PASSWORD',
        roleId: userRole.id,
        status: 'ACTIVE',
      },
    });
    console.log(`Demo User: ${demoUser.fullName} (ID: ${demoUser.id})`);
  }

  if (demoUser) {
    console.log('\nSeeding mock subscriptions & payments...');
    await prisma.userSubscription.upsert({
      where: { id: '22222222-2222-4222-8222-222222222222' },
      update: {},
      create: {
        id: '22222222-2222-4222-8222-222222222222',
        userId: demoUser.id,
        planId: 'PRO',
        status: 'ACTIVE',
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.payment.upsert({
      where: { transactionCode: 'PAY-DEMO-PRO-001' },
      update: {},
      create: {
        userId: demoUser.id,
        planId: 'PRO',
        amount: 100000,
        status: 'SUCCESS',
        transactionCode: 'PAY-DEMO-PRO-001',
        paymentGateway: 'SEPAY',
      },
    });

    console.log('\nSeeding mock documents & download logs...');
    const firstSubject = await prisma.subject.findFirst();
    const firstCategory = await prisma.category.findFirst();

    if (firstSubject && firstCategory) {
      const demoDoc = await prisma.document.upsert({
        where: { id: '33333333-3333-4333-8333-333333333333' },
        update: {},
        create: {
          id: '33333333-3333-4333-8333-333333333333',
          ownerId: demoUser.id,
          subjectId: firstSubject.id,
          categoryId: firstCategory.id,
          title: 'Giáo trình Kiến trúc Phần mềm và Microservices',
          fileName: 'kientruc_phanmem.pdf',
          fileType: 'application/pdf',
          fileSize: BigInt(1048576),
          storagePath: 'documents/demo/kientruc_phanmem.pdf',
          visibility: 'PUBLIC',
          status: 'ACTIVE',
          extractionStatus: 'COMPLETED',
        },
      });

      await prisma.downloadLog.create({
        data: {
          userId: demoUser.id,
          documentId: demoDoc.id,
        },
      });

      console.log('\nSeeding mock chatbot retrieval audit logs & citations...');
      const session = await prisma.chatSession.create({
        data: {
          userId: demoUser.id,
          documentId: demoDoc.id,
          mode: 'ASK_THIS_DOCUMENT',
          title: 'Hỏi về Kiến trúc Phần mềm',
        },
      });

      const message = await prisma.chatMessage.create({
        data: {
          chatSessionId: session.id,
          sender: 'AI',
          content: 'Kiến trúc microservices giúp chia nhỏ ứng dụng thành các dịch vụ độc lập.',
        },
      });

      await prisma.chatSource.upsert({
        where: {
          chatMessageId_documentId: {
            chatMessageId: message.id,
            documentId: demoDoc.id,
          },
        },
        update: {},
        create: {
          chatMessageId: message.id,
          documentId: demoDoc.id,
          relevanceScore: 0.95,
          snippet: 'Microservices architecture pattern overview.',
        },
      });

      // Audit logs with timing metrics
      const mockQueries = [
        {
          sessionId: session.id,
          mode: 'ASK_THIS_DOCUMENT',
          question: 'Microservices là gì?',
          noSource: false,
          fallbackKeyword: false,
          sourcesCount: 1,
          citedDocumentIds: [demoDoc.id],
          timings: {
            embeddingMs: 45,
            searchMs: 110,
            geminiMs: 1050,
            saveDbMs: 30,
            totalMs: 1235,
          },
        },
        {
          sessionId: session.id,
          mode: 'ASK_MY_LIBRARY',
          question: 'Tìm kiếm tài liệu liên quan đến NestJS',
          noSource: false,
          fallbackKeyword: true,
          sourcesCount: 1,
          citedDocumentIds: [demoDoc.id],
          timings: {
            embeddingMs: 35,
            searchMs: 95,
            geminiMs: 980,
            saveDbMs: 25,
            totalMs: 1135,
          },
        },
        {
          sessionId: session.id,
          mode: 'ASK_MY_LIBRARY',
          question: 'Tài liệu về nấu ăn',
          noSource: true,
          fallbackKeyword: false,
          sourcesCount: 0,
          citedDocumentIds: [],
          timings: {
            embeddingMs: 25,
            searchMs: 40,
            geminiMs: 0,
            saveDbMs: 15,
            totalMs: 80,
          },
        },
      ];

      for (const queryLog of mockQueries) {
        await prisma.auditLog.create({
          data: {
            userId: demoUser.id,
            action: 'CHATBOT_QUERY',
            targetType: 'CHATBOT',
            targetId: session.id,
            metadata: queryLog,
          },
        });
      }
    }
  }

  console.log('\nSeeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
