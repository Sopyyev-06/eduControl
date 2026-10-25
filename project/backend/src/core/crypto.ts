import crypto from 'crypto';
import { env } from '../config/env';

const ALGO = 'aes-256-gcm';

/**
 * Field level encryption for personal data (AES-256-GCM, per-value random IV).
 * Stored format: v1.<iv b64>.<tag b64>.<ciphertext b64>
 */
export function encryptField(plain: string | null | undefined): Buffer | null {
  if (plain === null || plain === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, env.piiKey, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = `v${env.piiKeyVersion}.${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
  return Buffer.from(payload, 'utf8');
}

export function decryptField(buf: Buffer | string | null | undefined): string | null {
  if (buf === null || buf === undefined) return null;
  const raw = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4 || !parts[0].startsWith('v')) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ct = Buffer.from(parts[3], 'base64');
    const decipher = crypto.createDecipheriv(ALGO, env.piiKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Masking helpers - used everywhere except an explicitly audited reveal. */
export function maskPhone(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (digits.length < 5) return '••••';
  return `${v.slice(0, 4)} ••• •• ${digits.slice(-2)}`;
}

export function maskPassport(v: string | null): string | null {
  if (!v) return null;
  return `${v.slice(0, 2)}••••••${v.slice(-1)}`;
}

export function maskPinfl(v: string | null): string | null {
  if (!v) return null;
  return `••••••••••••${v.slice(-2)}`;
}

export function maskText(v: string | null): string | null {
  if (!v) return null;
  return '••••••';
}
