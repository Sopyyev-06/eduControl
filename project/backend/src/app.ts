import express from 'express';
import { corsStrict, csrfProtection, requestId, securityHeaders } from './middleware/security';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authenticate, requirePasswordChanged } from './middleware/auth';
import { dbHealthy } from './db/pool';
import { env } from './config/env';

import authRoutes from './modules/auth/auth.routes';
import metaRoutes from './modules/meta/meta.routes';
import structureRoutes from './modules/structure/structure.routes';
import studentRoutes from './modules/students/students.routes';
import reportRoutes from './modules/reports/reports.routes';
import changeRequestRoutes from './modules/changeRequests/changeRequests.routes';
import adminRoutes from './modules/admin/admin.routes';
import auditRoutes from './modules/audit/audit.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';

export function createApp() {
  const app = express();
  if (env.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.disable('etag');

  app.use(requestId);
  app.use(securityHeaders);
  app.use(corsStrict);
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  app.get('/api/health', async (_req, res) => {
    const db = await dbHealthy();
    res.status(db ? 200 : 503).json({ ok: db, db, uptime: Math.round(process.uptime()) });
  });

  // Public auth endpoints (login/refresh/logout) + CSRF for state-changing calls.
  app.use('/api/auth', csrfProtection, authRoutes);

  // Everything below requires a session AND a real (non-temporary) password.
  const guard = [authenticate, requirePasswordChanged];
  app.use('/api/meta', guard, metaRoutes);
  app.use('/api/structure', guard, structureRoutes);
  app.use('/api/students', guard, studentRoutes);
  app.use('/api/reports', guard, reportRoutes);
  app.use('/api/change-requests', guard, changeRequestRoutes);
  app.use('/api/admin', guard, adminRoutes);
  app.use('/api/audit', guard, auditRoutes);
  app.use('/api/dashboard', guard, dashboardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
