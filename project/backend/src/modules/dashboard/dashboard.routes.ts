import { Router } from 'express';
import { one, q } from '../../db/pool';
import { asyncHandler } from '../../core/errors';
import { ok } from '../../core/http';
import { requirePermission, scopedFacultyId } from '../../middleware/auth';

const router = Router();

/** GET /api/dashboard — counts + last 14 days trend, faculty-scoped */
router.get(
  '/',
  requirePermission('DASHBOARD_READ'),
  asyncHandler(async (req, res) => {
    const scoped = scopedFacultyId(req);
    const fac = scoped !== null ? 'AND r.faculty_id = ?' : '';
    const p = scoped !== null ? [scoped] : [];

    const studentsSql = scoped !== null
      ? 'SELECT COUNT(*) AS c FROM students s JOIN study_groups g ON g.id = s.group_id WHERE s.status = "active" AND g.faculty_id = ?'
      : 'SELECT COUNT(*) AS c FROM students s WHERE s.status = "active"';
    const groupsSql = scoped !== null
      ? 'SELECT COUNT(*) AS c FROM study_groups g WHERE g.is_active = 1 AND g.faculty_id = ?'
      : 'SELECT COUNT(*) AS c FROM study_groups g WHERE g.is_active = 1';

    const [
      studentsRes,
      groupsRes,
      reportsRes,
      pendingDeanRes,
      pendingRectorateRes,
      pendingChangesRes,
      byStatus,
      trend,
      topReasons,
    ] = await Promise.all([
      one<any>(studentsSql, p),
      one<any>(groupsSql, p),
      one<any>(`SELECT COUNT(*) AS c FROM reports r WHERE 1=1 ${fac}`, p),
      one<any>(`SELECT COUNT(*) AS c FROM reports r WHERE r.status = 'submitted_to_dean' ${fac}`, p),
      one<any>(`SELECT COUNT(*) AS c FROM reports r WHERE r.status = 'submitted_to_rectorate' ${fac}`, p),
      one<any>(`SELECT COUNT(*) AS c FROM change_requests cr JOIN reports r ON r.id = cr.report_id WHERE cr.status = 'pending' ${fac}`, p),
      q<any>(`SELECT r.status, COUNT(*) AS n FROM reports r WHERE 1=1 ${fac} GROUP BY r.status`, p),
      q<any>(
        `SELECT r.report_date,
                COUNT(DISTINCT r.id) AS reports,
                COUNT(CASE WHEN ri.status IN ('absent', 'late') THEN 1 END) AS absences
           FROM reports r
           LEFT JOIN report_items ri ON ri.report_id = r.id
          WHERE r.report_date >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) ${fac}
          GROUP BY r.report_date ORDER BY r.report_date`,
        p,
      ),
      q<any>(
        `SELECT ar.name, COUNT(*) AS n FROM report_items ri
           JOIN absence_reasons ar ON ar.id = ri.absence_reason_id
           JOIN reports r ON r.id = ri.report_id
          WHERE 1=1 ${fac}
          GROUP BY ar.name ORDER BY n DESC LIMIT 6`,
        p,
      ),
    ]);

    const counts = {
      students: Number(studentsRes?.c || 0),
      groups: Number(groupsRes?.c || 0),
      reports: Number(reportsRes?.c || 0),
      pending_dean: Number(pendingDeanRes?.c || 0),
      pending_rectorate: Number(pendingRectorateRes?.c || 0),
      pending_changes: Number(pendingChangesRes?.c || 0),
    };

    ok(res, { counts, byStatus, trend, topReasons });
  }),
);

export default router;
