import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { badRequest } from '../core/errors';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) (req as any).validatedQuery = schemas.query.parse(req.query);
      if (schemas.params) (req as any).validatedParams = schemas.params.parse(req.params);
      next();
    } catch (e) {
      if (e instanceof ZodError) {
        return next(
          badRequest(
            'Validation failed',
            e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
      }
      next(e);
    }
  };
}
