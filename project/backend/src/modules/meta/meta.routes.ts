import { Router } from 'express';
import { q } from '../../db/pool';
import { asyncHandler } from '../../core/errors';
import { ok } from '../../core/http';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

/** GET /api/meta — dictionaries the UI needs after login */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [reportTypes, reasons, faculties, groups] = await Promise.all([
      q('SELECT id, code, name FROM report_types WHERE is_active = 1 ORDER BY id'),
      q('SELECT id, code, name, requires_document, requires_comment FROM absence_reasons WHERE is_active = 1 ORDER BY sort_order, id'),
      q('SELECT id, code, name FROM faculties WHERE is_active = 1 ORDER BY name'),
      q('SELECT id, faculty_id, name, course FROM study_groups WHERE is_active = 1 ORDER BY name'),
    ]);
    ok(res, { reportTypes, reasons, faculties, groups });
  }),
);

export default router;
