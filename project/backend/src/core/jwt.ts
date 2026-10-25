import crypto from 'crypto';
import { env } from '../config/env';

export interface AccessPayload {
  sub: number;
  role: string;
  facultyId: number | null;
  pwdChanged: boolean;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

const b64u = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromb64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(data: string): Buffer {
  return crypto.createHmac('sha256', env.jwtSecret).update(data).digest();
}

export function signAccessToken(payload: Omit<AccessPayload, 'iat' | 'exp' | 'iss' | 'aud' | 'jti'> & { jti?: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const body: AccessPayload = {
    ...payload,
    jti: payload.jti || crypto.randomUUID(),
    iat: now,
    exp: now + env.accessTtlSec,
    iss: env.jwtIssuer,
    aud: env.jwtAudience,
  };
  const header = b64u(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const claims = b64u(Buffer.from(JSON.stringify(body)));
  const sig = b64u(sign(`${header}.${claims}`));
  return `${header}.${claims}.${sig}`;
}

export function verifyAccessToken(token: string): AccessPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, c, s] = parts;
  let header: any;
  try {
    header = JSON.parse(fromb64u(h).toString('utf8'));
  } catch {
    return null;
  }
  if (!header || header.alg !== 'HS256') return null; // rejects alg=none / RS confusion
  const expected = sign(`${h}.${c}`);
  const given = fromb64u(s);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let claims: AccessPayload;
  try {
    claims = JSON.parse(fromb64u(c).toString('utf8'));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!claims || claims.iss !== env.jwtIssuer || claims.aud !== env.jwtAudience) return null;
  if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
  if (typeof claims.iat !== 'number' || claims.iat > now + 60) return null;
  return claims;
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}
