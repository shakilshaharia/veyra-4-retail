// Request validation and error shapes shared by every route.
//
// Every error the API returns has the same body, so the admin can show a
// message and highlight the exact fields that failed:
//   { error: { message, code, fields?: { path: message } } }

import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { Prisma } from '../generated/prisma/client.ts';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Item') => new HttpError(404, `${what} not found.`, 'not_found');
export const forbidden = (message = 'You do not have permission to do that.') =>
  new HttpError(403, message, 'forbidden');
export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError(400, message, 'invalid', fields);

function fieldsFromZod(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw badRequest('Some fields need attention.', fieldsFromZod(result.error));
  }
  return result.data;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, code: err.code, fields: err.fields } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { message: 'Some fields need attention.', code: 'invalid', fields: fieldsFromZod(err) } });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? (err.meta?.target as string[]).join(', ') : 'value';
      res.status(409).json({ error: { message: `That ${target} is already in use.`, code: 'conflict', fields: { [String(target)]: 'Already in use.' } } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { message: 'Item not found.', code: 'not_found' } });
      return;
    }
  }
  // Multer and body-parser errors carry their own status.
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: { message: (err as Error).message, code: 'invalid' } });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: { message: 'Something went wrong on our side.', code: 'server_error' } });
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// In production the chain is Cloudflare -> nginx -> this process, so the
// socket peer is always loopback and the real visitor is in CF-Connecting-IP.
// That header is only trusted when the request arrived through the local
// proxy; a direct caller could otherwise set it to anything.
export function clientIp(req: Request) {
  const peer = req.socket.remoteAddress ?? '';
  const cf = req.headers['cf-connecting-ip'];
  if (LOOPBACK.has(peer) && typeof cf === 'string' && cf.length <= 64) return cf;
  return req.ip ?? peer;
}
