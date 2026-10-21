import { Client } from 'pg';
import { runMigrations } from '../src/db/migrate';

/**
 * Testler gerçek bir PostgreSQL veritabanında çalışır.
 * TEST_DATABASE_URL ile değiştirilebilir; şema her çalıştırmada sıfırlanır.
 */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/kvkk_test';
  process.env.DATABASE_URL = url;
  process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await client.end();
  await runMigrations(url);
}
