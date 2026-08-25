const { Client } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Read .env from backend folder
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set in backend/.env');
  process.exit(1);
}

async function main() {
  console.log('Connecting to database...');
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected. Running CREATE EXTENSION IF NOT EXISTS vector...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('Success: Extension pgvector is enabled!');
  } catch (err) {
    console.error('Error enabling pgvector:', err);
  } finally {
    await client.end();
  }
}

main();
