import { Router } from 'express';
import { one, q } from '../../db/pool';
import { asyncHandler } from '../../core/errors';
import { ok } from '../../core/http';
import { requirePermission } from '../../middleware/auth';

const router = Router();

/** GET /api/audit?action=&entity=&actorId=&from=&to=&page= */
router.get(
  '/',
  requirePermission('AUDIT_READ'),
  asyncHandler(async (req, res) => {
    const action = String((req.query as any).action || '');
    const entity = String((req.query as any).entity || '');
    const actorId = Number((req.query as any).actorId || 0);
    const from = String((req.query as any).from || '');
    const to = String((req.query as any).to || '');
    const page = Math.max(1, Number((req.query as any).page || 1));
    const size = Math.min(200, Math.max(1, Number((req.query as any).size || 50)));

    const where: string[] = [];
    const params: unknown[] = [];
    if (action) {
      where.push('a.action LIKE ?');
      params.push(`${action}%`);
    }
    if (entity) {
      where.push('a.entity = ?');
      params.push(entity);
    }
    if (actorId) {
      where.push('a.actor_id = ?');
      params.push(actorId);
    }
    if (from) {
      where.push('a.created_at >= ?');
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      where.push('a.created_at <= ?');
      params.push(`${to} 23:59:59`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.ip, a.meta, a.created_at,
              u.full_name AS actor_name, a.actor_role
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
         ${clause} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, size, (page - 1) * size],
    );
    const total = await one<any>(`SELECT COUNT(*) AS n FROM audit_logs a ${clause}`, params);
    ok(res, { items: rows, total: Number(total?.n || 0), page, size });
  }),
);

export default router;
