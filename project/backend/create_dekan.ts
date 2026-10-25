import { pool, exec, one } from './src/db/pool';
import { hashPassword } from './src/core/password';

async function run() {
  const hpRector = await hashPassword('Rector#2026');
  await exec(
    `UPDATE users SET password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = NULL WHERE username = 'rector'`,
    [hpRector]
  );

  const faculty = await one<any>('SELECT id FROM faculties LIMIT 1');
  const facultyId = faculty?.id || 1;

  const hpDekan = await hashPassword('Dekan#2026');
  await exec(
    `INSERT INTO users (username, password_hash, full_name, role_id, faculty_id, must_change_password)
     VALUES (?, ?, ?, 4, ?, 0)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), must_change_password = 0, failed_attempts = 0, locked_until = NULL`,
    ['dekan', hpDekan, 'Mekan Berdiyew (Dekan)', facultyId]
  );

  await exec("UPDATE report_types SET name = 'Irdenki gatnaşyk hasabaty' WHERE code = 'morning_attendance'");
  await exec("UPDATE report_types SET name = 'Agşamky umumy ýatakhana barlagy' WHERE code = 'evening_dorm'");
  await exec("UPDATE report_types SET name = 'Çäre gatnaşyk hasabaty' WHERE code = 'event_attendance'");

  console.log('SUCCESS: report_types, rector and dekan set successfully!');
  await pool.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
