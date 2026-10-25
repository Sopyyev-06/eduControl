import type { NextFunction, Request, Response } from 'express';

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

function keyOf(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const ip = (typeof xff === 'string' ? xff.split(',')[0] : req.ip) || 'unknown';
  return `${ip}:${req.baseUrl}${req.path}`;
}

/** Fixed-window limiter. For multi-instance deployments swap the Map for Redis (see SECURITY.md). */
export function rateLimit(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    sweep(now);
    const key = keyOf(req);
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Remaining', String(limit - 1));
      return next();
    }
    b.count += 1;
    if (b.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
      return;
    }
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - b.count)));
    next();
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}
