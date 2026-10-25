import mysql from 'mysql2/promise';
import { env } from '../config/env';

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  waitForConnections: true,
  connectionLimit: env.db.poolMax,
  maxIdle: env.db.poolMax,
  queueLimit: 0,
  namedPlaceholders: false,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
  dateStrings: ['DATE'],
  multipleStatements: false,
});

export type Row = Record<string, any>;

/** All reads/writes go through prepared statements -> no string-built SQL. */
export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params as any[]);
  return rows as T[];
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows.length ? rows[0] : null;
}

export async function exec(sql: string, params: unknown[] = []) {
  const [res] = await pool.execute(sql, params as any[]);
  return res as mysql.ResultSetHeader;
}

export async function tx<T>(fn: (c: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw e;
  } finally {
    conn.release();
  }
}

export async function dbHealthy(): Promise<boolean> {
  try {
    const r = await one<{ ok: number }>('SELECT 1 AS ok');
    return r?.ok === 1;
  } catch {
    return false;
  }
}
