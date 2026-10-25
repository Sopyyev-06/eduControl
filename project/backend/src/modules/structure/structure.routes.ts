import { Router } from 'express';
import { z } from 'zod';
import { exec, one, q } from '../../db/pool';
import { asyncHandler, badRequest, conflict, notFound } from '../../core/errors';
import { ok } from '../../core/http';
import { validate } from '../../middleware/validate';
import { requirePermission } from '../../middleware/auth';
import { audit } from '../../core/audit';

const router = Router();

const facultyBody = z.object({ code: z.string().min(2).max(20), name: z.string().min(3).max(160) });
const groupBody = z.object({
  facultyId: z.number().int().positive(),
  name: z.string().min(1).max(60),
  course: z.number().int().min(1).max(6),
});

router.get(
  '/faculties',
  asyncHandler(async (_req, res) => {
    ok(res, await q('SELECT id, code, name, is_active FROM faculties ORDER BY name'));
  }),
);

router.post(
  '/faculties',
  requirePermission('FACULTY_MANAGE'),
  validate({ body: facultyBody }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof facultyBody>;
    const r = await exec('INSERT INTO faculties (code, name) VALUES (?,?)', [b.code.toUpperCase(), b.name]);
    await audit(req, 'FACULTY_CREATE', 'faculty', r.insertId, { code: b.code });
    ok(res, { id: r.insertId }, 201);
  }),
);

router.patch(
  '/faculties/:id',
  requirePermission('FACULTY_MANAGE'),
  validate({ body: facultyBody.partial() }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as Partial<z.infer<typeof facultyBody>>;
    if (!(await one('SELECT id FROM faculties WHERE id = ?', [id]))) throw notFound();
    await exec('UPDATE faculties SET code = COALESCE(?, code), name = COALESCE(?, name) WHERE id = ?', [
      b.code ? b.code.toUpperCase() : null,
      b.name ?? null,
      id,
    ]);
    await audit(req, 'FACULTY_UPDATE', 'faculty', id, b as Record<string, unknown>);
    ok(res, { updated: true });
  }),
);

router.get(
  '/groups',
  asyncHandler(async (req, res) => {
    const facultyId = Number((req.query as any).facultyId || 0);
    const rows = await q(
      `SELECT g.id, g.faculty_id, f.name AS faculty_name, g.name, g.course, g.is_active,
              (SELECT COUNT(*) FROM students s WHERE s.group_id = g.id AND s.status = 'active') AS students
         FROM study_groups g JOIN faculties f ON f.id = g.faculty_id
        ${facultyId ? 'WHERE g.faculty_id = ?' : ''}
        ORDER BY g.name`,
      facultyId ? [facultyId] : [],
    );
    ok(res, rows);
  }),
);

router.post(
  '/groups',
  requirePermission('GROUP_MANAGE'),
  validate({ body: groupBody }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof groupBody>;
    const fac = await one('SELECT id FROM faculties WHERE id = ?', [b.facultyId]);
    if (!fac) throw badRequest('Unknown faculty');
    try {
      const r = await exec('INSERT INTO study_groups (faculty_id, name, course) VALUES (?,?,?)', [b.facultyId, b.name, b.course]);
      await audit(req, 'GROUP_CREATE', 'group', r.insertId, { name: b.name });
      ok(res, { id: r.insertId }, 201);
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') throw conflict('Group already exists in this faculty');
      throw e;
    }
  }),
);

router.patch(
  '/groups/:id',
  requirePermission('GROUP_MANAGE'),
  validate({ body: groupBody.partial() }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body as Partial<z.infer<typeof groupBody>>;
    if (!(await one('SELECT id FROM study_groups WHERE id = ?', [id]))) throw notFound();
    await exec('UPDATE study_groups SET name = COALESCE(?, name), course = COALESCE(?, course) WHERE id = ?', [
      b.name ?? null,
      b.course ?? null,
      id,
    ]);
    await audit(req, 'GROUP_UPDATE', 'group', id, b as Record<string, unknown>);
    ok(res, { updated: true });
  }),
);

export default router;
