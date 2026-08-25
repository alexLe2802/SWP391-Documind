import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is missing in environment!');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Error: Please specify the user email:');
    console.error('Usage: npx ts-node scripts/make-admin.ts <email>');
    process.exit(1);
  }

  console.log(`Connecting to database...`);
  console.log(`Checking ADMIN role...`);
  let adminRole = await prisma.role.findFirst({
    where: { name: 'ADMIN' },
  });

  if (!adminRole) {
    console.log('Role ADMIN does not exist, creating it...');
    adminRole = await prisma.role.create({
      data: { name: 'ADMIN' },
    });
  }

  console.log(`Finding user with email "${email}"...`);
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.error(`Error: User with email "${email}" not found in database.`);
    console.error(`Note: The user must sign up/log in on the website once first to sync their Firebase profile to the database.`);
    process.exit(1);
  }

  console.log(`Promoting user "${user.fullName}" (ID: ${user.id}) to ADMIN and activating account...`);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      roleId: adminRole.id,
      status: 'ACTIVE',
    },
  });

  console.log(`\n🎉 Success! User "${user.fullName}" is now an ADMIN.`);
}

main()
  .catch((e) => {
    console.error('\n❌ Execution failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
