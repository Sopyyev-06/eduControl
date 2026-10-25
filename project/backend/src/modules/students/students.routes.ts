import { Router } from 'express';
import { z } from 'zod';
import { exec, one, q, tx } from '../../db/pool';
import { asyncHandler, badRequest, forbidden, notFound } from '../../core/errors';
import { ok } from '../../core/http';
import { validate } from '../../middleware/validate';
import { requirePermission, scopedFacultyId } from '../../middleware/auth';
import { audit } from '../../core/audit';
import { can } from '../../core/permissions';
import { decryptField, encryptField, maskPassport, maskPhone, maskPinfl } from '../../core/crypto';

const router = Router();

const studentBody = z.object({
  studentNo: z.string().min(1).max(30),
  groupId: z.number().int().positive(),
  lastName: z.string().min(1).max(80),
  firstName: z.string().min(1).max(80),
  patronymic: z.string().max(80).optional().nullable(),
  isGroupLeader: z.boolean().optional(),
  status: z.enum(['active', 'academic_leave', 'expelled', 'graduated']).optional(),
});

const piiBody = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  gender: z.enum(['male', 'female']).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  parentName: z.string().max(120).optional().nullable(),
  parentPhone: z.string().max(30).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  passportNo: z.string().max(30).optional().nullable(),
  pinfl: z.string().max(20).optional().nullable(),
});

type Pii = z.infer<typeof piiBody>;

const PII_COLUMNS: Array<[keyof Pii, string]> = [
  ['birthDate', 'birth_date'],
  ['gender', 'gender'],
  ['phone', 'phone'],
  ['parentName', 'parent_name'],
  ['parentPhone', 'parent_phone'],
  ['address', 'address'],
  ['passportNo', 'passport_no'],
  ['pinfl', 'pinfl'],
];

async function assertGroupAccess(req: any, groupId: number) {
  const g = await one<any>('SELECT id, faculty_id FROM study_groups WHERE id = ?', [groupId]);
  if (!g) throw badRequest('Unknown group');
  const scoped = scopedFacultyId(req);
  if (scoped !== null && scoped !== g.faculty_id) throw forbidden('Group is outside your faculty');
  return g;
}

/** GET /api/students?groupId=&q=&page= */
router.get(
  '/',
  requirePermission('STUDENT_READ'),
  asyncHandler(async (req, res) => {
    const groupId = Number((req.query as any).groupId || 0);
    const search = String((req.query as any).q || '').trim();
    const page = Math.max(1, Number((req.query as any).page || 1));
    const size = Math.min(200, Math.max(1, Number((req.query as any).size || 50)));
    const scoped = scopedFacultyId(req);

    const where: string[] = [];
    const params: unknown[] = [];
    if (groupId) {
      where.push('s.group_id = ?');
      params.push(groupId);
    }
    if (scoped !== null) {
      where.push('f.id = ?');
      params.push(scoped);
    }
    if (search) {
      where.push('(s.last_name LIKE ? OR s.first_name LIKE ? OR s.student_no LIKE ?)');
      const like = `%${search.replace(/[%_]/g, '')}%`;
      params.push(like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await q(
      `SELECT s.id, s.student_no, s.last_name, s.first_name, s.patronymic, s.is_group_leader, s.status,
              g.name AS group_name, g.id AS group_id, f.name AS faculty_name
         FROM students s JOIN study_groups g ON g.id = s.group_id JOIN faculties f ON f.id = g.faculty_id
         ${clause} ORDER BY s.last_name, s.first_name LIMIT ? OFFSET ?`,
      [...params, size, (page - 1) * size],
    );
    const total = await one<any>(
      `SELECT COUNT(*) AS n FROM students s JOIN study_groups g ON g.id = s.group_id JOIN faculties f ON f.id = g.faculty_id ${clause}`,
      params,
    );
    ok(res, { items: rows, total: Number(total?.n || 0), page, size });
  }),
);

router.get(
  '/:id',
  requirePermission('STUDENT_READ'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = await one<any>(
      `SELECT s.id, s.student_no, s.last_name, s.first_name, s.patronymic, s.is_group_leader, s.status,
              g.id AS group_id, g.name AS group_name, f.id AS faculty_id, f.name AS faculty_name
         FROM students s JOIN study_groups g ON g.id = s.group_id JOIN faculties f ON f.id = g.faculty_id
        WHERE s.id = ?`,
      [id],
    );
    if (!row) throw notFound();
    const scoped = scopedFacultyId(req);
    if (scoped !== null && scoped !== row.faculty_id) throw forbidden();
    ok(res, row);
  }),
);

router.post(
  '/',
  requirePermission('STUDENT_WRITE'),
  validate({ body: studentBody }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof studentBody>;
    const g = await assertGroupAccess(req, b.groupId);
    const r = await exec(
      `INSERT INTO students (student_no, group_id, last_name, first_name, patronymic, is_group_leader, status)
       VALUES (?,?,?,?,?,?,?)`,
      [b.studentNo, b.groupId, b.lastName, b.firstName, b.patronymic ?? null, b.isGroupLeader ? 1 : 0, b.status ?? 'active'],
    );
    await audit(req, 'STUDENT_CREATE', 'student', r.insertId, { groupId: g.id });
    ok(res, { id: r.insertId }, 201);
  }),
);

router.patch(
  '/:id',
  requirePermission('STUDENT_WRITE'),
  validate({ body: studentBody.partial() }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const cur = await one<any>(
      'SELECT s.*, g.faculty_id FROM students s JOIN study_groups g ON g.id = s.group_id WHERE s.id = ?',
      [id],
    );
    if (!cur) throw notFound();
    const scoped = scopedFacultyId(req);
    if (scoped !== null && scoped !== cur.faculty_id) throw forbidden();
    const b = req.body as Partial<z.infer<typeof studentBody>>;
    if (b.groupId) await assertGroupAccess(req, b.groupId);
    await exec(
      `UPDATE students SET student_no = COALESCE(?, student_no), group_id = COALESCE(?, group_id),
              last_name = COALESCE(?, last_name), first_name = COALESCE(?, first_name),
              patronymic = COALESCE(?, patronymic), status = COALESCE(?, status),
              is_group_leader = COALESCE(?, is_group_leader)
        WHERE id = ?`,
      [
        b.studentNo ?? null,
        b.groupId ?? null,
        b.lastName ?? null,
        b.firstName ?? null,
        b.patronymic ?? null,
        b.status ?? null,
        b.isGroupLeader === undefined ? null : b.isGroupLeader ? 1 : 0,
        id,
      ],
    );
    await audit(req, 'STUDENT_UPDATE', 'student', id, { fields: Object.keys(b) });
    ok(res, { updated: true });
  }),
);

/**
 * GET /api/students/:id/personal — MASKED by default. Every read is audited.
 * Personal data lives in its own table, encrypted with AES-256-GCM.
 */
router.get(
  '/:id/personal',
  requirePermission('PII_READ'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const st = await one<any>(
      'SELECT s.id, g.faculty_id FROM students s JOIN study_groups g ON g.id = s.group_id WHERE s.id = ?',
      [id],
    );
    if (!st) throw notFound();
    const scoped = scopedFacultyId(req);
    if (scoped !== null && scoped !== st.faculty_id) throw forbidden();

    const reveal = String((req.query as any).reveal || '') === '1';
    if (reveal && !can(req.auth!.role, 'PII_READ')) throw forbidden();
    if (reveal && scoped !== null && scoped !== st.faculty_id) throw forbidden();

    const row = await one<any>('SELECT * FROM student_personal_data WHERE student_id = ?', [id]);
    const plain = {
      birthDate: decryptField(row?.birth_date),
      gender: decryptField(row?.gender),
      phone: decryptField(row?.phone),
      parentName: decryptField(row?.parent_name),
      parentPhone: decryptField(row?.parent_phone),
      address: decryptField(row?.address),
      passportNo: decryptField(row?.passport_no),
      pinfl: decryptField(row?.pinfl),
    };
    const masked = {
      birthDate: plain.birthDate ? `••••-${plain.birthDate.slice(5)}` : null,
      gender: plain.gender,
      phone: maskPhone(plain.phone),
      parentName: plain.parentName ? '••••••' : null,
      parentPhone: maskPhone(plain.parentPhone),
      address: plain.address ? '••••••••••' : null,
      passportNo: maskPassport(plain.passportNo),
      pinfl: maskPinfl(plain.pinfl),
    };
    await audit(req, reveal ? 'PII_REVEAL' : 'PII_VIEW_MASKED', 'student', id, { fields: Object.keys(plain) });
    ok(res, { masked: reveal ? plain : masked, revealed: reveal, isEmpty: !row });
  }),
);

/** PUT /api/students/:id/personal — encrypted write, audited (values never logged) */
router.put(
  '/:id/personal',
  requirePermission('PII_WRITE'),
  validate({ body: piiBody }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const st = await one<any>(
      'SELECT s.id, g.faculty_id FROM students s JOIN study_groups g ON g.id = s.group_id WHERE s.id = ?',
      [id],
    );
    if (!st) throw notFound();
    const scoped = scopedFacultyId(req);
    if (scoped !== null && scoped !== st.faculty_id) throw forbidden();

    const b = req.body as Pii;
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, col] of PII_COLUMNS) {
      if (b[key] !== undefined) {
        sets.push(`${col} = ?`);
        params.push(encryptField(b[key] as string | null));
      }
    }
    if (!sets.length) throw badRequest('Nothing to update');

    await tx(async (c) => {
      await c.execute(
        `INSERT INTO student_personal_data (student_id, updated_by) VALUES (?, ?) ON DUPLICATE KEY UPDATE updated_by = VALUES(updated_by)`,
        [id, req.auth!.userId],
      );
      await c.execute(`UPDATE student_personal_data SET ${sets.join(', ')}, updated_by = ? WHERE student_id = ?`, [
        ...params,
        req.auth!.userId,
        id,
      ] as any[]);
    });
    await audit(req, 'PII_UPDATE', 'student', id, { fields: Object.keys(b) });
    ok(res, { updated: true });
  }),
);

/** POST /api/students/import — minimal CSV import (student_no;group;last;first) */
router.post(
  '/import',
  requirePermission('STUDENT_WRITE'),
  asyncHandler(async (req, res) => {
    const csv = String((req.body as any)?.csv || '');
    if (!csv.trim()) throw badRequest('Empty CSV');
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    const created: string[] = [];
    const errors: string[] = [];
    for (const [i, line] of lines.entries()) {
      if (i === 0 && /student_no/i.test(line)) continue;
      const [studentNo, groupName, lastName, firstName] = line.split(/[;\t]/).map((s) => (s || '').trim());
      if (!studentNo || !groupName || !lastName || !firstName) {
        errors.push(`line ${i + 1}: expected 4 columns`);
        continue;
      }
      const g = await one<any>('SELECT id, faculty_id FROM study_groups WHERE name = ?', [groupName]);
      if (!g) {
        errors.push(`line ${i + 1}: unknown group ${groupName}`);
        continue;
      }
      const scoped = scopedFacultyId(req);
      if (scoped !== null && scoped !== g.faculty_id) {
        errors.push(`line ${i + 1}: group outside your faculty`);
        continue;
      }
      try {
        await exec('INSERT INTO students (student_no, group_id, last_name, first_name) VALUES (?,?,?,?)', [
          studentNo,
          g.id,
          lastName,
          firstName,
        ]);
        created.push(studentNo);
      } catch (e: any) {
        errors.push(`line ${i + 1}: ${e?.code === 'ER_DUP_ENTRY' ? 'duplicate student_no' : 'insert failed'}`);
      }
    }
    await audit(req, 'STUDENT_IMPORT', 'student', null, { created: created.length, errors: errors.length });
    ok(res, { created: created.length, errors });
  }),
);

export default router;
