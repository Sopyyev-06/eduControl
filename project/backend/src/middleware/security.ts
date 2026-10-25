import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { parseCookies } from '../core/http';

/** Strict security headers (Helmet-equivalent, no extra dependency). */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  if (env.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/** Explicit origin allow-list CORS with credentials; everything else is rejected. */
export function corsStrict(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && env.appOrigin.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.requestId = String(id).slice(0, 64);
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

/**
 * Double-submit CSRF check. Login/refresh are exempt because there is no session
 * cookie to protect yet (and the login response issues the CSRF cookie itself).
 */
const CSRF_EXEMPT = new Set(['/login', '/refresh']);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (CSRF_EXEMPT.has(req.path)) return next();
  const cookies = (req as any).cookies ?? parseCookies(req);
  const fromCookie = cookies?.['csrft'] || '';
  const fromHeader = String(req.headers['x-csrf-token'] || '');
  const a = Buffer.from(fromCookie);
  const b = Buffer.from(fromHeader);
  const valid = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
  if (!valid) {
    res.status(403).json({ ok: false, error: { code: 'CSRF_FAILED', message: 'CSRF token invalid' } });
    return;
  }
  next();
}
