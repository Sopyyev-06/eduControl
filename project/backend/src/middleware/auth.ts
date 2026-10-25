import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../core/jwt';
import { can, type PermissionKey } from '../core/permissions';
import { forbidden, unauthorized } from '../core/errors';
import { COOKIES, parseCookies } from '../core/http';

/** Accepts the access token from the httpOnly cookie (preferred) or a Bearer header. */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req);
  (req as any).cookies = cookies;
  const header = req.headers.authorization;
  const bearer = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || cookies[COOKIES.access];
  if (!token) return next(unauthorized());
  const payload = verifyAccessToken(token);
  if (!payload) return next(unauthorized('Session expired'));
  req.auth = {
    userId: payload.sub,
    role: payload.role,
    facultyId: payload.facultyId ?? null,
    pwdChanged: payload.pwdChanged,
  };
  next();
}

export function requirePermission(...perms: PermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) return next(unauthorized());
    const allowed = perms.some((p) => can(req.auth!.role, p));
    if (!allowed) return next(forbidden());
    next();
  };
}

/** Forces the user to set a real password after an admin-issued temporary one. */
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction): void {
  if (req.auth && !req.auth.pwdChanged) {
    return next(forbidden('Password change required'));
  }
  next();
}

/** Faculty scoping helper: rectorate sees everything, others only their own faculty. */
export function scopedFacultyId(req: Request): number | null {
  const role = req.auth?.role;
  if (role === 'rector' || role === 'prorector' || role === 'rectorate_staff') return null;
  return req.auth?.facultyId ?? -1;
}
