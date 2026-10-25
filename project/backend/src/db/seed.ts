import { exec, one, q } from './pool';
import { hashPassword, randomPassword } from '../core/password';
import { env } from '../config/env';

const ROLES: Array<[number, string, string]> = [
  [1, 'rector', 'Rektor'],
  [2, 'prorector', 'Prorektor'],
  [3, 'rectorate_staff', 'Rektorat isgari'],
  [4, 'dean', 'Dekan'],
  [5, 'vice_dean', 'Orunbasar dekan'],
  [6, 'teacher', 'Mugallym'],
];

const REPORT_TYPES: Array<[string, string]> = [
  ['morning_attendance', 'Irdenki gatnaşyk hasabaty'],
  ['evening_dorm', 'Agşamky umumy ýatakhana barlagy'],
  ['event_attendance', 'Çäre gatnaşyk hasabaty'],
];

const REASONS: Array<[string, string, number, number]> = [
  ['sick_with_doc', 'Kesel (saglyk kepilnamasy bilen)', 1, 0],
  ['sick_no_doc', 'Kesel (kepilnamasyz)', 0, 0],
  ['family', 'Masgala sabypli', 0, 0],
  ['academic_leave', 'Okuw rugsady', 0, 0],
  ['academic_trip', 'Okuw sapary / barc', 0, 0],
  ['late', 'Gijikme', 0, 0],
  ['other', 'Baska', 0, 1],
];

async function main() {
  for (const [id, code, name] of ROLES) {
    await exec('INSERT INTO roles (id, code, name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [id, code, name]);
  }
  for (const [code, name] of REPORT_TYPES) {
    await exec('INSERT INTO report_types (code, name) VALUES (?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [code, name]);
  }
  let order = 10;
  for (const [code, name, doc, comment] of REASONS) {
    await exec(
      `INSERT INTO absence_reasons (code, name, requires_document, requires_comment, sort_order)
       VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [code, name, doc, comment, order],
    );
    order += 10;
  }

  const faculty = await one<any>('SELECT id FROM faculties WHERE code = ?', ['IEM']);
  let facultyId = faculty?.id;
  if (!facultyId) {
    const r = await exec('INSERT INTO faculties (code, name) VALUES (?,?)', ['IEM', 'Ykdysadyyet we dolandyrys instituty']);
    facultyId = r.insertId;
  }

  for (const [name, course] of [['IE-21', 2], ['IE-22', 2], ['MEN-23', 1]] as Array<[string, number]>) {
    await exec(
      'INSERT INTO study_groups (faculty_id, name, course) VALUES (?,?,?) ON DUPLICATE KEY UPDATE course = VALUES(course)',
      [facultyId, name, course],
    );
  }

  const existing = await one<any>('SELECT id FROM users WHERE username = ?', ['rector']);
  let generatedPassword: string | null = null;
  if (!existing) {
    const pw = process.env.SEED_ADMIN_PASSWORD || (env.isProd ? randomPassword(16) : 'Rector#2026');
    if (!process.env.SEED_ADMIN_PASSWORD) generatedPassword = pw;
    await exec(
      `INSERT INTO users (username, password_hash, full_name, role_id, faculty_id, must_change_password)
       VALUES (?,?,?,?,?,1)`,
      ['rector', await hashPassword(pw), 'Rektor (başlangyç hasap)', 1, null],
    );
    console.log(`[seed] rector account created. username=rector password=${pw}`);
  } else {
    console.log('[seed] rector account already exists - password untouched');
  }

  if (process.env.SEED_DEMO === 'true') {
    const groups = await q<any>('SELECT id, name FROM study_groups');
    const surnames = ['Atayew', 'Berdiyew', 'Gurbanow', 'Jumayew', 'Orazow', 'Saparow', 'Toylyyew', 'Ylmyradow'];
    const names = ['Myrat', 'Ayna', 'Begench', 'Dovlet', 'Gulshat', 'Kerim', 'Leýla', 'Sohbet'];
    let i = 0;
    for (const g of groups) {
      for (let k = 0; k < 8; k++) {
        const no = `${g.name}-${String(k + 1).padStart(3, '0')}`;
        const exists = await one<any>('SELECT id FROM students WHERE student_no = ?', [no]);
        if (exists) continue;
        await exec(
          `INSERT INTO students (student_no, group_id, last_name, first_name, patronymic, is_group_leader)
           VALUES (?,?,?,?,?,?)`,
          [no, g.id, surnames[i % surnames.length], names[i % names.length], 'Ogulmyradovich', k === 0 ? 1 : 0],
        );
        i++;
      }
    }
    console.log('[seed] demo students ensured (SEED_DEMO=true)');
  }

  console.log('[seed] done');
  if (generatedPassword && env.isProd) {
    console.log('[seed] IMPORTANT: store this one-time password and change it after first login');
  }
}

main()
  .then(async () => {
    const { pool } = await import('./pool');
    await pool.end().catch(() => undefined);
    process.exit(0);
  })
  .catch((e) => {
    console.error('[seed] failed:', e.message);
    process.exit(1);
  });
