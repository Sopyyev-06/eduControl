import { Router } from 'express';
import { z } from 'zod';
import { pool, one, q } from '../../db/pool';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../../core/errors';
import { ok } from '../../core/http';
import { validate } from '../../middleware/validate';
import { requirePermission, scopedFacultyId } from '../../middleware/auth';
import { audit } from '../../core/audit';
import {
  REPORT_STATUS,
  canPerform,
  isImmutable,
  needsRequestInsteadOfEdit,
  type ReportAction,
  type ReportStatus,
} from '../../core/workflow';

const router = Router();

const itemSchema = z.object({
  studentId: z.number().int().positive(),
  status: z.enum(['present', 'absent', 'late']),
  absenceReasonId: z.number().int().positive().nullable().optional(),
  comment: z.string().max(500).nullable().optional(),
  documentProvided: z.boolean().optional(),
});

const createSchema = z.object({
  reportTypeId: z.number().int().positive(),
  groupId: z.number().int().positive(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(itemSchema).min(1).max(500),
});

const patchSchema = z.object({ items: z.array(itemSchema).min(1).max(500) });

/** Validates absence bookkeeping: reason required when absent, comment required for "other". */
async function normalizeItems(items: z.infer<typeof itemSchema>[]) {
  const reasons = await q<any>('SELECT id, code, requires_document, requires_comment, is_active FROM absence_reasons');
  const byId = new Map(reasons.map((r) => [Number(r.id), r]));
  return items.map((it) => {
    if (it.status === 'present') {
      return { ...it, absenceReasonId: null, comment: null, documentProvided: false };
    }
    if (!it.absenceReasonId) throw badRequest('Absence reason is required for absent/late students');
    const reason = byId.get(Number(it.absenceReasonId));
    if (!reason || !Number(reason.is_active)) throw badRequest(`Unknown absence reason ${it.absenceReasonId}`);
    if (Number(reason.requires_comment) && !(it.comment && it.comment.trim())) {
      throw badRequest(`Reason "${reason.name}" requires a comment`);
    }
    return {
      ...it,
      absenceReasonId: Number(it.absenceReasonId),
      comment: it.comment?.trim() || null,
      documentProvided: Number(reason.requires_document) ? !!it.documentProvided : false,
    };
  });
}

async function loadReport(req: any, id: number) {
  const report = await one<any>(
    `SELECT r.*, rt.name AS type_name, g.name AS group_name, f.name AS faculty_name,
            u.full_name AS created_by_name
       FROM reports r
       JOIN report_types rt ON rt.id = r.report_type_id
       JOIN study_groups g ON g.id = r.group_id
       JOIN faculties f ON f.id = r.faculty_id
       JOIN users u ON u.id = r.created_by
      WHERE r.id = ?`,
    [id],
  );
  if (!report) throw notFound('Report not found');
  const scoped = scopedFacultyId(req);
  if (scoped !== null && scoped !== report.faculty_id) throw forbidden();
  return report;
}

/** GET /api/reports?status=&groupId=&from=&to=&page= */
router.get(
  '/',
  requirePermission('REPORT_READ'),
  asyncHandler(async (req, res) => {
    const status = String((req.query as any).status || '');
    const groupId = Number((req.query as any).groupId || 0);
    const from = String((req.query as any).from || '');
    const to = String((req.query as any).to || '');
    const page = Math.max(1, Number((req.query as any).page || 1));
    const size = Math.min(100, Math.max(1, Number((req.query as any).size || 30)));
    const scoped = scopedFacultyId(req);

    const where: string[] = [];
    const params: unknown[] = [];
    if (status) {
      where.push('r.status = ?');
      params.push(status);
    }
    if (groupId) {
      where.push('r.group_id = ?');
      params.push(groupId);
    }
    if (from) {
      where.push('r.report_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('r.report_date <= ?');
      params.push(to);
    }
    if (scoped !== null) {
      where.push('r.faculty_id = ?');
      params.push(scoped);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(
      `SELECT r.id, r.report_date, r.status, r.version, r.submitted_at, r.approved_at,
              rt.name AS type_name, rt.code AS type_code, g.name AS group_name, f.name AS faculty_name,
              u.full_name AS created_by_name,
              (SELECT COUNT(*) FROM report_items ri WHERE ri.report_id = r.id AND ri.status <> 'present') AS absent_count,
              (SELECT COUNT(*) FROM report_items ri WHERE ri.report_id = r.id) AS total_count
         FROM reports r
         JOIN report_types rt ON rt.id = r.report_type_id
         JOIN study_groups g ON g.id = r.group_id
         JOIN faculties f ON f.id = r.faculty_id
         JOIN users u ON u.id = r.created_by
         ${clause}
        ORDER BY r.report_date DESC, r.id DESC
        LIMIT ? OFFSET ?`,
      [...params, size, (page - 1) * size],
    );
    const total = await one<any>(`SELECT COUNT(*) AS n FROM reports r ${clause}`, params);
    ok(res, { items: rows, total: Number(total?.n || 0), page, size });
  }),
);

/** GET /api/reports/:id */
router.get(
  '/:id',
  requirePermission('REPORT_READ'),
  asyncHandler(async (req, res) => {
    const report = await loadReport(req, Number(req.params.id));
    const items = await q(
      `SELECT ri.id, ri.student_id, ri.status, ri.absence_reason_id, ri.comment, ri.document_provided,
              s.last_name, s.first_name, s.patronymic, s.student_no, s.is_group_leader,
              ar.name AS reason_name, ar.code AS reason_code
         FROM report_items ri
         JOIN students s ON s.id = ri.student_id
         LEFT JOIN absence_reasons ar ON ar.id = ri.absence_reason_id
        WHERE ri.report_id = ?
        ORDER BY s.last_name, s.first_name`,
      [report.id],
    );
    const transitions = await q(
      `SELECT t.id, t.from_status, t.to_status, t.comment, t.created_at, u.full_name AS actor_name
         FROM report_transitions t JOIN users u ON u.id = t.actor_id
        WHERE t.report_id = ? ORDER BY t.id`,
      [report.id],
    );
    ok(res, { report, items, transitions });
  }),
);

/** POST /api/reports — creates a draft with a full snapshot of the group */
router.post(
  '/',
  requirePermission('REPORT_CREATE'),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof createSchema>;
    const group = await one<any>('SELECT id, faculty_id, name FROM study_groups WHERE id = ? AND is_active = 1', [b.groupId]);
    if (!group) throw badRequest('Unknown group');
    const scoped = scopedFacultyId(req);
    if (scoped !== null && scoped !== group.faculty_id) throw forbidden('Group is outside your faculty');

    const existing = await one<any>('SELECT id FROM reports WHERE report_type_id = ? AND group_id = ? AND report_date = ?', [
      b.reportTypeId,
      b.groupId,
      b.reportDate,
    ]);
    if (existing) throw conflict('A report for this group/date/type already exists');

    const items = await normalizeItems(b.items);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rres] = await conn.execute(
        `INSERT INTO reports (report_type_id, faculty_id, group_id, report_date, status, created_by)
         VALUES (?,?,?,?, 'draft', ?)`,
        [b.reportTypeId, group.faculty_id, b.groupId, b.reportDate, req.auth!.userId],
      );
      const reportId = (rres as any).insertId as number;
      for (const it of items) {
        await conn.execute(
          `INSERT INTO report_items (report_id, student_id, status, absence_reason_id, comment, document_provided)
           VALUES (?,?,?,?,?,?)`,
          [reportId, it.studentId, it.status, it.absenceReasonId ?? null, it.comment ?? null, it.documentProvided ? 1 : 0],
        );
      }
      await conn.commit();
      await audit(req, 'REPORT_CREATE', 'report', reportId, { groupId: b.groupId, date: b.reportDate, items: items.length });
      ok(res, { id: reportId }, 201);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }),
);

/** PATCH /api/reports/:id — only while the report is still the author's draft */
router.patch(
  '/:id',
  requirePermission('REPORT_EDIT_OWN'),
  validate({ body: patchSchema }),
  asyncHandler(async (req, res) => {
    const report = await loadReport(req, Number(req.params.id));
    if (needsRequestInsteadOfEdit(report.status as ReportStatus)) {
      throw forbidden('Report is already submitted - submit a change request instead');
    }
    const items = await normalizeItems((req.body as z.infer<typeof patchSchema>).items);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const it of items) {
        await conn.execute(
          `UPDATE report_items SET status = ?, absence_reason_id = ?, comment = ?, document_provided = ?
            WHERE report_id = ? AND student_id = ?`,
          [it.status, it.absenceReasonId ?? null, it.comment ?? null, it.documentProvided ? 1 : 0, report.id, it.studentId],
        );
      }
      await conn.execute('UPDATE reports SET version = version + 1 WHERE id = ?', [report.id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(req, 'REPORT_UPDATE', 'report', report.id, { items: items.length });
    ok(res, { updated: true });
  }),
);

const actionSchema = z.object({ action: z.enum(['submit', 'dean_approve', 'dean_reject', 'rectorate_approve', 'rectorate_reject']), comment: z.string().max(500).optional() });

/** POST /api/reports/:id/action — the single, audited workflow gate */
router.post(
  '/:id/action',
  requirePermission('REPORT_READ'),
  validate({ body: actionSchema }),
  asyncHandler(async (req, res) => {
    const { action, comment } = req.body as z.infer<typeof actionSchema>;
    const report = await loadReport(req, Number(req.params.id));
    const status = report.status as ReportStatus;

    if (isImmutable(status)) throw forbidden('Report is approved and immutable');
    if ((action === 'submit' || action === 'dean_reject') && report.created_by !== req.auth!.userId && req.auth!.role === 'vice_dean') {
      throw forbidden('Only the author can submit this report');
    }
    if (!canPerform(status, action as ReportAction, req.auth!.role)) {
      throw forbidden(`Action "${action}" is not allowed for your role at status "${status}"`);
    }

    let next: ReportStatus;
    switch (action) {
      case 'submit':
        next = REPORT_STATUS.TO_DEAN;
        break;
      case 'dean_approve':
        next = REPORT_STATUS.TO_RECTORATE;
        break;
      case 'dean_reject':
        next = REPORT_STATUS.REJECTED;
        break;
      case 'rectorate_approve':
        next = REPORT_STATUS.APPROVED;
        break;
      default:
        next = REPORT_STATUS.REJECTED;
    }
    if ((action === 'dean_reject' || action === 'rectorate_reject') && !comment?.trim()) {
      throw badRequest('A rejection comment is required');
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Optimistic locking: only move the row if it is still in the status we validated.
      const [upd] = await conn.execute(
        `UPDATE reports
            SET status = ?,
                submitted_at = IF(? = 'submit', NOW(), submitted_at),
                approved_at = IF(? = 'approved', NOW(), approved_at),
                approved_by = IF(? = 'approved', ?, approved_by)
          WHERE id = ? AND status = ?`,
        [next, next, next, next, req.auth!.userId, report.id, status],
      );
      if ((upd as any).affectedRows === 0) throw conflict('Report status changed - reload and retry');
      await conn.execute(
        `INSERT INTO report_transitions (report_id, from_status, to_status, actor_id, comment) VALUES (?,?,?,?,?)`,
        [report.id, status, next, req.auth!.userId, comment?.trim() || null],
      );
      if (next === REPORT_STATUS.TO_DEAN) {
        const deans = await conn.query('SELECT id FROM users WHERE role_id = 4 AND is_active = 1 AND (faculty_id = ? OR faculty_id IS NULL)', [report.faculty_id]);
        for (const d of (deans as any)[0] as any[]) {
          await conn.execute('INSERT INTO notifications (user_id, title, body) VALUES (?,?,?)', [
            d.id,
            'Täze hasabat tassyklamaga geldi',
            `${report.group_name} — ${report.report_date}`,
          ]);
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(req, `REPORT_${action.toUpperCase()}`, 'report', report.id, { from: status, to: next });
    ok(res, { status: next });
  }),
);

export default router;
