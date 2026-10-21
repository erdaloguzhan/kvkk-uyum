import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { blindIndex, encryptField, isEncrypted } from '../common/field-crypto';

export async function runMigrations(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
    await encryptNationalIds(pool);
  } finally {
    await pool.end();
  }
}

/**
 * 0014 öncesinde düz metin kaydedilmiş T.C. kimlik numaralarını şifreler ve özetlerini doldurur.
 * Her açılışta çalışır; işlenecek kayıt yoksa hiçbir şey yapmaz.
 */
async function encryptNationalIds(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const table of ['employees', 'trainers']) {
      const { rows } = await client.query<{ id: string; national_id: string }>(
        `select id, national_id from ${table} where national_id_hash is null for update`,
      );
      for (const row of rows) {
        if (isEncrypted(row.national_id)) throw new Error(`${table} ${row.id}: şifreli kayıtta özet eksik`);
        await client.query(`update ${table} set national_id = $1, national_id_hash = $2 where id = $3`, [
          encryptField(row.national_id),
          blindIndex(row.national_id),
          row.id,
        ]);
      }
      if (rows.length) console.log(`${table}: ${rows.length} T.C. kimlik no şifrelendi`);
      await client.query(`alter table ${table} alter column national_id_hash set not null`);
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL tanımlı değil');
  runMigrations(url).then(() => console.log('Migration tamamlandı'));
}
