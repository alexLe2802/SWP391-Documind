import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ContentExtractionService } from '../src/content-extraction/content-extraction.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function run() {
  console.log('Initializing reindexing context...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const extractionService = app.get(ContentExtractionService);

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const confirm = args.includes('--confirm');
  const docIdArg = args.find((arg) => arg.startsWith('--documentId='));
  const documentId = docIdArg ? docIdArg.split('=')[1] : null;
  const delayArg = args.find((arg) => arg.startsWith('--delay='));
  const delayMs = delayArg ? parseInt(delayArg.split('=')[1], 10) : 2000;
  const emailArg = args.find((arg) => arg.startsWith('--userEmail='));
  const userEmail = emailArg ? emailArg.split('=')[1] : null;

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npm run documents:reindex -- --dry-run [--userEmail=<email>]');
    console.log('  npm run documents:reindex -- --documentId=<id>');
    console.log('  npm run documents:reindex -- --all --confirm [--delay=<ms>] [--userEmail=<email>]');
    await app.close();
    return;
  }

  let userFilter = {};
  if (userEmail) {
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true },
    });
    if (!user) {
      console.error(`User with email ${userEmail} not found.`);
      await app.close();
      return;
    }
    userFilter = { ownerId: user.id };
  }

  if (dryRun) {
    const docs = await prisma.document.findMany({
      where: {
        status: 'ACTIVE',
        ...userFilter,
      },
      select: { id: true, title: true, fileName: true },
    });
    console.log(`[DRY RUN] Found ${docs.length} active documents needing re-indexing${userEmail ? ` for ${userEmail}` : ''}:`);
    for (const doc of docs) {
      console.log(`- [${doc.id}] ${doc.title} (${doc.fileName})`);
    }
  } else if (documentId) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId, status: 'ACTIVE' },
      select: { id: true, title: true },
    });
    if (!doc) {
      console.error(`Document with ID ${documentId} not found or is not ACTIVE.`);
      await app.close();
      return;
    }
    console.log(`Reindexing document [${doc.id}] "${doc.title}"...`);
    
    // Find if it has content, get the job ID or generate one
    const content = await prisma.documentContent.findUnique({
      where: { documentId },
    });
    const jobId = content?.jobId || 'reindex-job-' + Date.now();
    
    // Run processExtraction directly
    await extractionService.processExtraction(documentId, jobId);
    console.log(`Reindexing completed successfully for [${doc.id}] "${doc.title}"`);
  } else if (all) {
    if (!confirm) {
      console.error('Error: You must pass --confirm to reindex all documents.');
      await app.close();
      return;
    }
    const docs = await prisma.document.findMany({
      where: {
        status: 'ACTIVE',
        ...userFilter,
      },
      select: { id: true, title: true },
    });
    console.log(`Reindexing ${docs.length} documents${userEmail ? ` for ${userEmail}` : ''}...`);
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      try {
        console.log(`[${i + 1}/${docs.length}] Reindexing [${doc.id}] "${doc.title}"...`);
        const content = await prisma.documentContent.findUnique({
          where: { documentId: doc.id },
        });
        const jobId = content?.jobId || 'reindex-job-' + Date.now();
        await extractionService.processExtraction(doc.id, jobId);
        
        if (i < docs.length - 1 && delayMs > 0) {
          console.log(`Sleeping for ${delayMs}ms to respect API rate limits...`);
          await sleep(delayMs);
        }
      } catch (err) {
        console.error(`Failed to reindex [${doc.id}] "${doc.title}":`, err);
        console.log('Error encountered. Cooling down for 5 seconds...');
        await sleep(5000);
      }
    }
    console.log('All documents reindexed successfully.');
  }

  await app.close();
}

run().catch((err) => {
  console.error('Reindexing failed:', err);
  process.exit(1);
});
