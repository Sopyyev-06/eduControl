import { Router } from 'express';
import { z } from 'zod';
import { pool, one, q } from '../../db/pool';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../../core/errors';
import { ok } from '../../core/http';
import { validate } from '../../middleware/validate';
import { requirePermission, scopedFacultyId } from '../../middleware/auth';
import { audit } from '../../core/audit';
import { canDecideChangeRequest, changeApproverRole, type ReportStatus } from '../../core/workflow';

const router = Router();

const createSchema = z.object({
  reportId: z.number().int().positive(),
  changes: z
    .array(
      z.object({
        reportItemId: z.number().int().positive(),
        field: z.enum(['status', 'absence_reason_id', 'comment', 'document_provided']),
        newValue: z.string().max(500).nullable(),
      }),
    )
    .min(1)
    .max(200),
});

const decideSchema = z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().max(500).optional() });

async function loadReportFor(req: any, reportId: number) {
  const report = await one<any>('SELECT * FROM reports WHERE id = ?', [reportId]);
  if (!report) throw notFound('Report not found');
  const scoped = scopedFacultyId(req);
  if (scoped !== null && scoped !== report.faculty_id) throw forbidden();
  return report;
}

/**
 * Section 4.2: the approver is decided by the report's CURRENT stage.
 * A draft never needs a request -> direct edit. An approved report needs a new request.
 */
router.post(
  '/',
  requirePermission('CHANGE_REQUEST_CREATE'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof createSchema>;
    const report = await loadReportFor(req, b.reportId);
    const approver = changeApproverRole(report.status as ReportStatus);
    if (!approver) {
      throw badRequest('This report stage does not accept change requests (draft = direct edit)');
    }
    const items = await q<any>('SELECT id, student_id, status, absence_reason_id, comment, document_provided FROM report_items WHERE report_id = ?', [
      report.id,
    ]);
    const byId = new Map(items.map((i) => [Number(i.id), i]));
    for (const c of b.changes) {
      if (!byId.has(Number(c.reportItemId))) throw badRequest(`Item ${c.reportItemId} does not belong to this report`);
    }
    await q('SELECT 1'); // keep parameterized-only access path explicit
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [cres] = await conn.execute(
        `INSERT INTO change_requests (report_id, requested_by, status, approver_role) VALUES (?,?, 'pending', ?)`,
        [report.id, req.auth!.userId, approver],
      );
      const crId = (cres as any).insertId as number;
      for (const c of b.changes) {
        const cur = byId.get(Number(c.reportItemId))!;
        const oldVal = cur[c.field];
        await conn.execute(
          `INSERT INTO change_request_items (change_request_id, report_item_id, field, old_value, new_value) VALUES (?,?,?,?,?)`,
          [crId, c.reportItemId, c.field, oldVal === null || oldVal === undefined ? null : String(oldVal), c.newValue],
        );
      }
      const approvers =
        approver === 'dean'
          ? ((await conn.query('SELECT id FROM users WHERE role_id = 4 AND is_active = 1 AND (faculty_id = ? OR faculty_id IS NULL)', [report.faculty_id])) as any)[0]
          : ((await conn.query("SELECT id FROM users WHERE role_id IN (1,2,3) AND is_active = 1")) as any)[0];
      for (const a of approvers as any[]) {
        await conn.execute('INSERT INTO notifications (user_id, title, body) VALUES (?,?,?)', [
          a.id,
          'Üýtgetme haýyşy geldi',
          `Hasabat #${report.id} üçin ${b.changes.length} üýtgeşme`,
        ]);
      }
      await conn.commit();
      await audit(req, 'CHANGE_REQUEST_CREATE', 'change_request', crId, { reportId: report.id, changes: b.changes.length, approver });
      ok(res, { id: crId, approverRole: approver }, 201);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }),
);

/** GET /api/change-requests?status= */
router.get(
  '/',
  requirePermission('CHANGE_REQUEST_READ'),
  asyncHandler(async (req, res) => {
    const status = String((req.query as any).status || '');
    const scoped = scopedFacultyId(req);
    const where: string[] = [];
    const params: unknown[] = [];
    if (status) {
      where.push('cr.status = ?');
      params.push(status);
    }
    if (scoped !== null) {
      where.push('r.faculty_id = ?');
      params.push(scoped);
    }
    if (req.auth!.role === 'vice_dean') {
      where.push('cr.requested_by = ?');
      params.push(req.auth!.userId);
    }
    const rows = await q(
      `SELECT cr.id, cr.status, cr.approver_role, cr.created_at, cr.decided_at, cr.decision_comment,
              cr.reminder_count, r.id AS report_id, r.report_date, r.status AS report_status,
              g.name AS group_name, u.full_name AS requested_by_name,
              (SELECT COUNT(*) FROM change_request_items ci WHERE ci.change_request_id = cr.id) AS changes_count
         FROM change_requests cr
         JOIN reports r ON r.id = cr.report_id
         JOIN study_groups g ON g.id = r.group_id
         JOIN users u ON u.id = cr.requested_by
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY cr.id DESC LIMIT 200`,
      params,
    );
    ok(res, rows);
  }),
);

/** GET /api/change-requests/:id */
router.get(
  '/:id',
  requirePermission('CHANGE_REQUEST_READ'),
  asyncHandler(async (req, res) => {
    const cr = await one<any>(
      `SELECT cr.*, r.report_date, r.status AS report_status, r.faculty_id, g.name AS group_name,
              u.full_name AS requested_by_name
         FROM change_requests cr JOIN reports r ON r.id = cr.report_id
         JOIN study_groups g ON g.id = r.group_id JOIN users u ON u.id = cr.requested_by
        WHERE cr.id = ?`,
      [Number(req.params.id)],
    );
    if (!cr) throw notFound();
    const scoped = scopedFacultyId(req);
    if (scoped !== null && scoped !== cr.faculty_id) throw forbidden();
    if (req.auth!.role === 'vice_dean' && cr.requested_by !== req.auth!.userId) throw forbidden();
    const items = await q(
      `SELECT ci.id, ci.field, ci.old_value, ci.new_value, ci.report_item_id,
              s.last_name, s.first_name, s.student_no
         FROM change_request_items ci
         JOIN report_items ri ON ri.id = ci.report_item_id
         JOIN students s ON s.id = ri.student_id
        WHERE ci.change_request_id = ?`,
      [cr.id],
    );
    ok(res, { request: cr, items });
  }),
);

/**
 * POST /api/change-requests/:id/decide — bulk approve/reject.
 * Section 4.2: the whole request is approved or rejected as ONE unit; rejection needs a comment;
 * rejection leaves the report untouched.
 */
router.post(
  '/:id/decide',
  validate({ body: decideSchema }),
  asyncHandler(async (req, res) => {
    const { decision, comment } = req.body as z.infer<typeof decideSchema>;
    const cr = await one<any>(
      `SELECT cr.*, r.status AS report_status, r.faculty_id FROM change_requests cr
         JOIN reports r ON r.id = cr.report_id WHERE cr.id = ?`,
      [Number(req.params.id)],
    );
    if (!cr) throw notFound();
    if (cr.status !== 'pending') throw conflict('Request already decided');
    const scoped = scopedFacultyId(req);
    if (scoped !== null && scoped !== cr.faculty_id) throw forbidden();
    if (!canDecideChangeRequest(cr.report_status as ReportStatus, req.auth!.role)) {
      throw forbidden('You are not the approver for the current report stage');
    }
    if (decision === 'reject' && !comment?.trim()) throw badRequest('Rejection comment is required');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (decision === 'approve') {
        const [items] = await conn.query('SELECT report_item_id, field, new_value FROM change_request_items WHERE change_request_id = ?', [cr.id]);
        const ALLOWED = new Set(['status', 'absence_reason_id', 'comment', 'document_provided']);
        for (const it of items as any[]) {
          if (!ALLOWED.has(it.field)) continue; // column name is allow-listed, never interpolated from user input
          const value =
            it.field === 'absence_reason_id' || it.field === 'document_provided'
              ? it.new_value === null || it.new_value === '' ? null : Number(it.new_value)
              : it.new_value;
          await conn.execute(`UPDATE report_items SET ${it.field} = ? WHERE id = ?`, [value, it.report_item_id]);
        }
        await conn.execute('UPDATE reports SET version = version + 1 WHERE id = ?', [cr.report_id]);
      }
      await conn.execute(
        `UPDATE change_requests SET status = ?, decided_by = ?, decided_at = NOW(), decision_comment = ? WHERE id = ? AND status = 'pending'`,
        [decision === 'approve' ? 'approved' : 'rejected', req.auth!.userId, comment?.trim() || null, cr.id],
      );
      await conn.execute('INSERT INTO notifications (user_id, title, body) VALUES (?,?,?)', [
        cr.requested_by,
        decision === 'approve' ? 'Üýtgetme haýyşyňyz kabul edildi' : 'Üýtgetme haýyşyňyz ret edildi',
        `Hasabat #${cr.report_id}`,
      ]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(req, `CHANGE_REQUEST_${decision.toUpperCase()}`, 'change_request', cr.id, { reportId: cr.report_id });
    ok(res, { decided: decision });
  }),
);

export default router;
