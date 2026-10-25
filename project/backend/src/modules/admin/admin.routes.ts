import { Router } from 'express';
import { z } from 'zod';
import { exec, one, q } from '../../db/pool';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../../core/errors';
import { ok } from '../../core/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/auth';
import { audit } from '../../core/audit';
import { hashPassword, passwordProblems, randomPassword } from '../../core/password';

const router = Router();

const ROLE_ID: Record<string, number> = { rector: 1, prorector: 2, rectorate_staff: 3, dean: 4, vice_dean: 5, teacher: 6 };

const userSchema = z.object({
  username: z.string().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/),
  fullName: z.string().min(3).max(160),
  role: z.enum(['rector', 'prorector', 'rectorate_staff', 'dean', 'vice_dean', 'teacher']),
  facultyId: z.number().int().positive().nullable().optional(),
});

router.get(
  '/users',
  requirePermission('USER_MANAGE'),
  asyncHandler(async (_req, res) => {
    ok(
      res,
      await q(
        `SELECT u.id, u.username, u.full_name, u.is_active, u.must_change_password, u.last_login_at, u.locked_until,
                r.code AS role, r.name AS role_label, f.name AS faculty_name
           FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN faculties f ON f.id = u.faculty_id
          ORDER BY u.id`,
      ),
    );
  }),
);

/** POST /api/admin/users — admin creates the account, a strong temporary password is returned once */
router.post(
  '/users',
  requirePermission('USER_MANAGE'),
  validate({ body: userSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof userSchema>;
    if (['dean', 'vice_dean', 'teacher'].includes(b.role) && !b.facultyId) {
      throw badRequest('Faculty is required for this role');
    }
    const tmp = randomPassword(16);
    const problems = passwordProblems(tmp);
    if (problems.length) throw badRequest('Generated password failed policy', problems);
    try {
      const r = await exec(
        `INSERT INTO users (username, password_hash, full_name, role_id, faculty_id, must_change_password)
         VALUES (?,?,?,?,?,1)`,
        [b.username, await hashPassword(tmp), b.fullName, ROLE_ID[b.role], b.facultyId ?? null],
      );
      await audit(req, 'USER_CREATE', 'user', r.insertId, { role: b.role, facultyId: b.facultyId });
      ok(res, { id: r.insertId, temporaryPassword: tmp, mustChangePassword: true }, 201);
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') throw conflict('Username already exists');
      throw e;
    }
  }),
);

router.patch(
  '/users/:id',
  requirePermission('USER_MANAGE'),
  validate({ body: z.object({ fullName: z.string().min(3).max(160).optional(), isActive: z.boolean().optional(), facultyId: z.number().int().positive().nullable().optional(), resetPassword: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const target = await one<any>('SELECT u.id, r.code AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', [id]);
    if (!target) throw notFound();
    if (target.role === 'rector' && id !== req.auth!.userId) throw forbidden('The rector account cannot be modified by others');
    const b = req.body as any;

    if (b.fullName !== undefined || b.isActive !== undefined || b.facultyId !== undefined) {
      await exec(
        `UPDATE users SET full_name = COALESCE(?, full_name),
                is_active = COALESCE(?, is_active),
                faculty_id = COALESCE(?, faculty_id) WHERE id = ?`,
        [b.fullName ?? null, b.isActive === undefined ? null : b.isActive ? 1 : 0, b.facultyId ?? null, id],
      );
      if (b.isActive === false) await exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
    }
    let temp: string | null = null;
    if (b.resetPassword) {
      temp = randomPassword(16);
      await exec('UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?', [
        await hashPassword(temp),
        id,
      ]);
      await exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [id]);
    }
    await audit(req, 'USER_UPDATE', 'user', id, { fields: Object.keys(b) });
    ok(res, { updated: true, temporaryPassword: temp });
  }),
);

/** Absence reasons — spec 4.1: soft delete only, rectorate manages the list */
router.get(
  '/absence-reasons',
  asyncHandler(async (_req, res) => {
    ok(
      res,
      await q('SELECT id, code, name, requires_document, requires_comment, is_active, sort_order FROM absence_reasons ORDER BY sort_order, id'),
    );
  }),
);

const reasonSchema = z.object({
  name: z.string().min(3).max(160),
  requiresDocument: z.boolean().optional(),
  requiresComment: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

router.post(
  '/absence-reasons',
  requirePermission('DICTIONARY_MANAGE'),
  validate({ body: reasonSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof reasonSchema>;
    const code = `custom_${Date.now().toString(36)}`;
    const r = await exec(
      `INSERT INTO absence_reasons (code, name, requires_document, requires_comment, sort_order)
       VALUES (?,?,?,?,?)`,
      [code, b.name, b.requiresDocument ? 1 : 0, b.requiresComment ? 1 : 0, b.sortOrder ?? 100],
    );
    await audit(req, 'REASON_CREATE', 'absence_reason', r.insertId, { name: b.name });
    ok(res, { id: r.insertId }, 201);
  }),
);

/** Deactivate = soft delete (is_active = false). History is never destroyed. */
router.patch(
  '/absence-reasons/:id',
  requirePermission('DICTIONARY_MANAGE'),
  validate({ body: reasonSchema.partial().extend({ isActive: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!(await one('SELECT id FROM absence_reasons WHERE id = ?', [id]))) throw notFound();
    const b = req.body as any;
    await exec(
      `UPDATE absence_reasons SET name = COALESCE(?, name),
              requires_document = COALESCE(?, requires_document),
              requires_comment = COALESCE(?, requires_comment),
              sort_order = COALESCE(?, sort_order),
              is_active = COALESCE(?, is_active) WHERE id = ?`,
      [
        b.name ?? null,
        b.requiresDocument === undefined ? null : b.requiresDocument ? 1 : 0,
        b.requiresComment === undefined ? null : b.requiresComment ? 1 : 0,
        b.sortOrder ?? null,
        b.isActive === undefined ? null : b.isActive ? 1 : 0,
        id,
      ],
    );
    await audit(req, 'REASON_UPDATE', 'absence_reason', id, { fields: Object.keys(b) });
    ok(res, { updated: true });
  }),
);

export default router;
