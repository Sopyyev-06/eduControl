import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { exec, one, q } from '../../db/pool';
import { asyncHandler, badRequest, forbidden, unauthorized } from '../../core/errors';
import { hashPassword, passwordProblems, verifyPassword } from '../../core/password';
import { hashToken, newRefreshToken, signAccessToken } from '../../core/jwt';
import { COOKIES, clearSessionCookies, issueSessionCookies, ok, parseCookies } from '../../core/http';
import { validate } from '../../middleware/validate';
import { rateLimit } from '../../middleware/rateLimit';
import { authenticate, requirePasswordChanged } from '../../middleware/auth';
import { audit } from '../../core/audit';
import { env } from '../../config/env';

const router = Router();

const USER_SELECT = `SELECT u.*, r.code AS role_code, r.name AS role_name, f.name AS faculty_name
  FROM users u JOIN roles r ON r.id = u.role_id
  LEFT JOIN faculties f ON f.id = u.faculty_id`;

const loginSchema = z.object({
  username: z.string().min(3).max(60).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(1).max(200),
});

function userPayload(u: any) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role_code,
    roleLabel: u.role_name,
    facultyId: u.faculty_id ?? null,
    facultyName: u.faculty_name ?? null,
    mustChangePassword: !!u.must_change_password,
  };
}

async function startSession(res: any, req: any, user: any, familyId?: string) {
  const access = signAccessToken({
    sub: user.id,
    role: user.role_code,
    facultyId: user.faculty_id ?? null,
    pwdChanged: !user.must_change_password,
  });
  const refresh = newRefreshToken();
  const family = familyId ?? crypto.randomUUID();
  await exec(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, ip, user_agent)
     VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?)`,
    [
      user.id,
      family,
      hashToken(refresh),
      env.refreshTtlSec,
      String(req.ip || '').slice(0, 45),
      String(req.headers['user-agent'] || '').slice(0, 255),
    ],
  );
  const csrf = issueSessionCookies(res, access, refresh);
  return { csrf, refreshHash: hashToken(refresh) };
}

/** POST /api/auth/login */
router.post(
  '/login',
  rateLimit(10, 60_000),
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as z.infer<typeof loginSchema>;
    const user = await one<any>(`${USER_SELECT} WHERE u.username = ?`, [username]);

    if (!user) {
      await hashPassword('decoy-password-value'); // equalize timing, no user enumeration
      await audit(req, 'AUTH_LOGIN_FAILED', 'auth', null, { reason: 'unknown_user' });
      throw unauthorized('Invalid credentials');
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      await audit(req, 'AUTH_LOGIN_BLOCKED', 'auth', user.id, { reason: 'locked' });
      throw forbidden('Account temporarily locked. Try again later.');
    }
    if (!user.is_active) {
      await audit(req, 'AUTH_LOGIN_FAILED', 'auth', user.id, { reason: 'inactive' });
      throw forbidden('Account is disabled');
    }
    if (!(await verifyPassword(password, user.password_hash))) {
      const attempts = Number(user.failed_attempts) + 1;
      const lock = attempts >= env.loginMaxAttempts;
      if (lock) {
        await exec('UPDATE users SET failed_attempts = ?, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?', [
          attempts,
          env.loginLockMinutes,
          user.id,
        ]);
      } else {
        await exec('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, user.id]);
      }
      await audit(req, 'AUTH_LOGIN_FAILED', 'auth', user.id, { reason: 'bad_password', attempts });
      throw unauthorized('Invalid credentials');
    }

    await exec('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [user.id]);
    req.auth = { userId: user.id, role: user.role_code, facultyId: user.faculty_id ?? null, pwdChanged: !user.must_change_password };
    const session = await startSession(res, req, user);
    await audit(req, 'AUTH_LOGIN', 'auth', user.id, {});
    ok(res, { user: userPayload(user), csrfToken: session.csrf });
  }),
);

/** POST /api/auth/refresh — rotating refresh tokens + reuse detection */
router.post(
  '/refresh',
  rateLimit(40, 60_000),
  asyncHandler(async (req, res) => {
    const token = parseCookies(req)[COOKIES.refresh];
    if (!token) throw unauthorized('No session');
    const row = await one<any>('SELECT * FROM refresh_tokens WHERE token_hash = ?', [hashToken(token)]);
    if (!row) throw unauthorized('Invalid session');

    if (row.revoked_at || row.replaced_by_hash) {
      await exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL', [row.family_id]);
      await audit(req, 'AUTH_REFRESH_REUSE', 'auth', row.user_id, {});
      clearSessionCookies(res);
      throw unauthorized('Session revoked');
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [row.id]);
      clearSessionCookies(res);
      throw unauthorized('Session expired');
    }

    const user = await one<any>(`${USER_SELECT} WHERE u.id = ?`, [row.user_id]);
    if (!user || !user.is_active) {
      await exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = ?', [row.family_id]);
      clearSessionCookies(res);
      throw unauthorized('Account unavailable');
    }

    const session = await startSession(res, req, user, row.family_id);
    await exec('UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_hash = ? WHERE id = ?', [session.refreshHash, row.id]);
    ok(res, { user: userPayload(user), csrfToken: session.csrf });
  }),
);

/** POST /api/auth/logout */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = parseCookies(req)[COOKIES.refresh];
    if (token) await exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?', [hashToken(token)]);
    clearSessionCookies(res);
    await audit(req, 'AUTH_LOGOUT', 'auth', null, {});
    ok(res, { loggedOut: true });
  }),
);

/** GET /api/auth/me */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await one<any>(`${USER_SELECT} WHERE u.id = ?`, [req.auth!.userId]);
    if (!user || !user.is_active) throw unauthorized('Account unavailable');
    ok(res, { user: userPayload(user), csrfToken: (req as any).cookies?.[COOKIES.csrf] ?? null });
  }),
);

const changeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});

/** POST /api/auth/change-password */
router.post(
  '/change-password',
  authenticate,
  validate({ body: changeSchema }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changeSchema>;
    const user = await one<any>('SELECT * FROM users WHERE id = ?', [req.auth!.userId]);
    if (!user) throw unauthorized();
    if (!(await verifyPassword(currentPassword, user.password_hash))) throw badRequest('Current password is incorrect');
    const problems = passwordProblems(newPassword);
    if (problems.length) throw badRequest('Password too weak', problems);
    if (await verifyPassword(newPassword, user.password_hash)) throw badRequest('New password must differ');
    await exec('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [await hashPassword(newPassword), user.id]);
    await exec('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [user.id]);
    const refreshed = await one<any>(`${USER_SELECT} WHERE u.id = ?`, [user.id]);
    const session = await startSession(res, req, refreshed);
    await audit(req, 'AUTH_PASSWORD_CHANGED', 'user', user.id, {});
    ok(res, { user: userPayload(refreshed), csrfToken: session.csrf });
  }),
);

/** GET /api/auth/notifications */
router.get(
  '/notifications',
  authenticate,
  asyncHandler(async (req, res) => {
    ok(
      res,
      await q('SELECT id, title, body, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', [
        req.auth!.userId,
      ]),
    );
  }),
);

/** POST /api/auth/notifications/:id/read */
router.post(
  '/notifications/:id/read',
  authenticate,
  requirePasswordChanged,
  asyncHandler(async (req, res) => {
    await exec('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [Number(req.params.id), req.auth!.userId]);
    ok(res, { read: true });
  }),
);

export default router;
