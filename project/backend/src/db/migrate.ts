import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { env } from '../config/env';

const SQL_DIR = path.resolve(__dirname, '../../sql');

async function main() {
  // Admin connection without a database, to allow creating it on first run.
  const admin = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${env.db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await admin.end();

  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    multipleStatements: true,
  });

  const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  await conn.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`,
  );
  const [appliedRows] = await conn.query<any[]>('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(SQL_DIR, file), 'utf8');
    console.log(`[migrate] applying ${file}`);
    await conn.query(sql);
    await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
  }
  await conn.end();
  console.log('[migrate] done');
}

main().catch((e) => {
  console.error('[migrate] failed:', e.message);
  process.exit(1);
});
