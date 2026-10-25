import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../core/errors';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
}

/** Never leaks stack traces, SQL text or driver messages to the client. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId;
  if (err instanceof AppError) {
    res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, details: err.details, requestId } });
    return;
  }
  const anyErr = err as any;
  if (anyErr?.type === 'entity.too.large') {
    res.status(413).json({ ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large', requestId } });
    return;
  }
  if (anyErr?.code === 'ER_DUP_ENTRY') {
    res.status(409).json({ ok: false, error: { code: 'DUPLICATE', message: 'Record already exists', requestId } });
    return;
  }
  if (anyErr?.code === 'ER_ROW_IS_REFERENCED_2' || anyErr?.code === 'ER_ROW_IS_REFERENCED') {
    res.status(409).json({ ok: false, error: { code: 'IN_USE', message: 'Record is referenced by other data', requestId } });
    return;
  }
  console.error(`[error] ${requestId ?? '-'}`, anyErr);
  const msg = anyErr?.message || 'Internal server error';
  res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: msg, requestId } });
}
