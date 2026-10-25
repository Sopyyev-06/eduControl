import type { Request } from 'express';
import { exec } from '../db/pool';

export function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim().slice(0, 45);
  return (req.ip || req.socket.remoteAddress || '').replace('::ffff:', '').slice(0, 45);
}

export function userAgent(req: Request): string {
  return String(req.headers['user-agent'] || '').slice(0, 255);
}

const REDACTED_META_KEYS = new Set(['password', 'newPassword', 'token', 'refresh', 'pinfl', 'passportNo', 'phone', 'address', 'parentPhone']);

function scrub(meta: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = REDACTED_META_KEYS.has(k) ? '[redacted]' : v;
  }
  return out;
}

/** Append-only audit trail. Never throws into the request path. */
export async function audit(
  req: Request | null,
  action: string,
  entity: string,
  entityId?: string | number | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await exec(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity, entity_id, ip, user_agent, meta)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        req?.auth?.userId ?? null,
        req?.auth?.role ?? null,
        action.slice(0, 60),
        entity.slice(0, 40),
        entityId === undefined || entityId === null ? null : String(entityId).slice(0, 40),
        req ? clientIp(req) : null,
        req ? userAgent(req) : null,
        meta ? JSON.stringify(scrub(meta)) : null,
      ],
    );
  } catch (e) {
    console.error('[audit] failed to persist', (e as Error).message);
  }
}
