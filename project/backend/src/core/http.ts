import crypto from 'crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env';

const DAYS = 86400;

export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

interface CookieOpts {
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
  path?: string;
  maxAge?: number;
  domain?: string;
}

export function setCookie(res: Response, name: string, value: string, opts: CookieOpts = {}): void {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${opts.sameSite ?? 'Strict'}`);
  if (opts.secure ?? env.cookieSecure) parts.push('Secure');
  if (opts.domain ?? env.cookieDomain) parts.push(`Domain=${opts.domain ?? env.cookieDomain}`);
  res.append('Set-Cookie', parts.join('; '));
}

export function clearCookie(res: Response, name: string, path = '/'): void {
  setCookie(res, name, '', { path, maxAge: 0, httpOnly: false });
}

export const COOKIES = { access: 'ec_at', refresh: 'ec_rt', csrf: 'csrft' } as const;

export function issueSessionCookies(res: Response, accessToken: string, refreshToken: string): string {
  setCookie(res, COOKIES.access, accessToken, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: env.accessTtlSec,
  });
  setCookie(res, COOKIES.refresh, refreshToken, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/api/auth',
    maxAge: env.refreshTtlSec,
  });
  const csrf = crypto.randomBytes(24).toString('base64url');
  setCookie(res, COOKIES.csrf, csrf, { httpOnly: false, sameSite: 'Strict', path: '/', maxAge: env.refreshTtlSec });
  return csrf;
}

export function clearSessionCookies(res: Response): void {
  clearCookie(res, COOKIES.access, '/');
  clearCookie(res, COOKIES.refresh, '/api/auth');
  clearCookie(res, COOKIES.csrf, '/');
}

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ ok: true, data });
}
