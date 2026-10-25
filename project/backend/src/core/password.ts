import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt) as (p: string, s: Buffer, k: number) => Promise<Buffer>;
const N = 16384, R = 8, P = 1, KEYLEN = 64;

/** OWASP-recommended scrypt (memory-hard) instead of fast hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(password.normalize('NFKC'), salt, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    if (Number(n) !== N || Number(r) !== R || Number(p) !== P) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const dk = await scrypt(password.normalize('NFKC'), salt, expected.length);
    return crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

export function passwordProblems(pw: string): string[] {
  const out: string[] = [];
  if (pw.length < 10) out.push('Minimum 10 characters');
  if (!/[a-z]/.test(pw)) out.push('At least one lowercase letter');
  if (!/[A-Z]/.test(pw)) out.push('At least one uppercase letter');
  if (!/[0-9]/.test(pw)) out.push('At least one digit');
  if (/^(?:password|123456|qwerty|admin)/i.test(pw)) out.push('Too common');
  return out;
}

export function randomPassword(len = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits + '!@#$%&*';
  const pick = (s: string) => s[crypto.randomInt(0, s.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick('!@#$%&*')];
  while (chars.length < len) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
