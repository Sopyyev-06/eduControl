import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE || path.resolve(process.cwd(), '.env') });

const isProd = process.env.NODE_ENV === 'production';
const warnings: string[] = [];

function text(name: string, fallback = ''): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  if (isProd) throw new Error(`Missing required env var: ${name}`);
  return fallback;
}

/** 32-byte key in hex (64 chars). Refuses weak/short keys in production. */
function key32(name: string): Buffer {
  const raw = process.env[name];
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw.trim())) return Buffer.from(raw.trim(), 'hex');
  if (isProd) throw new Error(`${name} must be 64 hex chars (32 bytes)`);
  warnings.push(`${name} was not provided -> using an ephemeral development key (DO NOT use in production)`);
  return crypto.scryptSync(`dev-${name}-${process.cwd()}`, 'educontrol-dev-salt', 32);
}

function secret(name: string, min = 32): Buffer {
  const raw = process.env[name];
  if (raw && raw.length >= min) return Buffer.from(raw, 'utf8');
  if (isProd) throw new Error(`${name} must be at least ${min} characters`);
  warnings.push(`${name} is missing/short -> ephemeral development secret generated`);
  return crypto.scryptSync(`dev-secret-${name}-${process.cwd()}`, 'educontrol-dev-salt-2', 48);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  appOrigin: (process.env.APP_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === 'true',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'educontrol',
    password: text('DB_PASSWORD', 'educontrol_dev_pw'),
    name: process.env.DB_NAME || 'educontrol',
    poolMax: Number(process.env.DB_POOL_MAX || 10),
  },
  jwtSecret: secret('JWT_SECRET'),
  jwtIssuer: 'educontrol',
  jwtAudience: 'educontrol-web',
  accessTtlSec: Number(process.env.ACCESS_TTL_SEC || 900),
  refreshTtlSec: Number(process.env.REFRESH_TTL_SEC || 60 * 60 * 12),
  piiKey: key32('PII_KEY'),
  piiKeyVersion: Number(process.env.PII_KEY_VERSION || 1),
  cookieSecure: process.env.COOKIE_SECURE === 'false' ? false : (process.env.COOKIE_SECURE === 'true' || isProd),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  remindersEnabled: process.env.REMINDERS_ENABLED !== 'false',
};

for (const w of warnings) console.warn(`[env] ${w}`);
