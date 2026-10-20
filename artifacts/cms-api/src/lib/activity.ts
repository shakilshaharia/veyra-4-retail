import type { Request } from 'express';
import { db } from '../db.ts';

// Activity is a convenience feed, not an audit guarantee: a failure to record
// it must never fail the action the user actually asked for.
export function logActivity(
  req: Request,
  action: string,
  entityType: string,
  summary: string,
  entityId?: string | null,
) {
  return db.activityLog
    .create({
      data: {
        userId: req.user?.id ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        summary: summary.slice(0, 300),
      },
    })
    .catch((error: unknown) => console.warn('[activity] not recorded:', (error as Error).message));
}
