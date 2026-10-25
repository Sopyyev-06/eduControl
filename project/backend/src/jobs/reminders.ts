import { exec, q } from '../db/pool';

/**
 * Spec 4.2 "Напоминания": no auto-reject. A reminder goes to the approver after
 * 3 days of inactivity, a second one after 7 days. Runs on a small interval.
 */
export async function runReminderSweep(): Promise<number> {
  const pending = await q<any>(
    `SELECT cr.id, cr.report_id, cr.requested_by, cr.approver_role, cr.reminder_count, cr.last_reminder_at, cr.created_at,
            r.faculty_id, g.name AS group_name
       FROM change_requests cr
       JOIN reports r ON r.id = cr.report_id
       JOIN study_groups g ON g.id = r.group_id
      WHERE cr.status = 'pending'`,
  );

  let sent = 0;
  for (const cr of pending) {
    const since = cr.last_reminder_at ? new Date(cr.last_reminder_at) : new Date(cr.created_at);
    const days = (Date.now() - since.getTime()) / 86_400_000;
    const stage = Number(cr.reminder_count);
    let due = false;
    if (stage === 0 && days >= 3) due = true;
    else if (stage === 1 && days >= 4) due = true; // 7 days total from the first reminder
    if (!due) continue;

    const approvers =
      cr.approver_role === 'dean'
        ? await q<any>('SELECT id FROM users WHERE role_id = 4 AND is_active = 1 AND (faculty_id = ? OR faculty_id IS NULL)', [cr.faculty_id])
        : await q<any>('SELECT id FROM users WHERE role_id IN (1,2,3) AND is_active = 1');

    for (const a of approvers) {
      await exec('INSERT INTO notifications (user_id, title, body) VALUES (?,?,?)', [
        a.id,
        stage === 0 ? 'Ýatlatma: üýtgetme haýyşy 3 günden bäri garaşýar' : 'Ikınji ýatlatma: üýtgetme haýyşy 7 günden bäri garaşýar',
        `${cr.group_name} — Hasabat #${cr.report_id}`,
      ]);
    }
    await exec('UPDATE change_requests SET reminder_count = reminder_count + 1, last_reminder_at = NOW() WHERE id = ?', [cr.id]);
    sent += 1;
  }
  return sent;
}

export function startReminderJob(): NodeJS.Timeout {
  const tick = async () => {
    try {
      const n = await runReminderSweep();
      if (n > 0) console.log(`[reminders] sent for ${n} request(s)`);
    } catch (e) {
      console.error('[reminders] sweep failed:', (e as Error).message);
    }
  };
  setTimeout(tick, 30_000);
  return setInterval(tick, 60 * 60 * 1000);
}
