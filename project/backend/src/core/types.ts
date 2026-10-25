import 'express';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: number;
        role: string;
        facultyId: number | null;
        username?: string;
        pwdChanged: boolean;
      };
      requestId?: string;
    }
  }
}

export {};
