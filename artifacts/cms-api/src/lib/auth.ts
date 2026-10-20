import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { env } from '../env.ts';
import type { Role } from '../generated/prisma/client.ts';
import { HttpError, clientIp, forbidden } from './http.ts';
import { can, capabilitiesFor, type Capability } from './permissions.ts';

export const SESSION_COOKIE = 'veyra_session';
const BCRYPT_ROUNDS = 12;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string;
  twoFactorEnabled: boolean;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'Use at most 200 characters.')
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
    message: 'Mix letters and numbers.',
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(200);

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// A real hash of a throwaway password, compared against when an email does not
// exist so a failed login takes the same time either way and cannot be used to
// discover which addresses have accounts.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

export async function verifyPassword(password: string, hash: string | null | undefined) {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function cookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

export async function startSession(res: Response, req: Request, userId: string) {
  const token = randomToken();
  const ttl = env.SESSION_DAYS * 24 * 60 * 60 * 1000;
  await db.session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + ttl),
      ip: clientIp(req).slice(0, 64),
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    },
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(ttl));
}

export async function endSession(req: Request, res: Response) {
  if (req.sessionId) {
    await db.session.deleteMany({ where: { id: req.sessionId } });
  }
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export function toAuthUser(user: { id: string; email: string; name: string; role: Role; avatarUrl: string; totpEnabledAt?: Date | null; emailOtpEnabled?: boolean }): AuthUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: user.avatarUrl, twoFactorEnabled: Boolean(user.totpEnabledAt) || Boolean(user.emailOtpEnabled) };
}

// A 6-digit email one-time code: returned once (to email it), stored only as a
// hash, valid for ten minutes.
export const EMAIL_OTP_TTL_MINUTES = 10;
export const EMAIL_OTP_MAX_ATTEMPTS = 5;

export function generateEmailOtp() {
  const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
  return { code, hash: sha256(code), expiresAt: new Date(Date.now() + EMAIL_OTP_TTL_MINUTES * 60 * 1000) };
}

// Hide most of an address for display: "jane@example.com" -> "j••e@example.com".
export function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const shown = local.length <= 2 ? local[0] ?? '' : `${local[0]}${'•'.repeat(Math.min(3, local.length - 2))}${local[local.length - 1]}`;
  return `${shown}@${domain}`;
}

// A short-lived, signed hand-off between the password step and the code step of
// a two-factor sign-in. It is stateless (HMAC over APP_SECRET) so it needs no
// storage, carries only the user id, and expires in ten minutes (long enough
// for an emailed code to arrive and be entered).
const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export function signMfaChallenge(userId: string) {
  const payload = `${userId}.${Date.now() + MFA_CHALLENGE_TTL_MS}`;
  const sig = createHash('sha256').update(`${payload}.${env.APP_SECRET}`).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyMfaChallenge(token: string): string | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(body, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = createHash('sha256').update(`${payload}.${env.APP_SECRET}`).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  const [userId, expiry] = payload.split('.');
  if (!userId || !expiry || Number(expiry) < Date.now()) return null;
  return userId;
}

export function describeUser(user: AuthUser) {
  return { ...user, capabilities: capabilitiesFor(user.role) };
}

// Resolves the session cookie to a user on every request. Never rejects:
// routes that need a user say so with requireAuth.
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return next();

  const id = sha256(token);
  const session = await db.session.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!session) return next();
  if (session.expiresAt < new Date() || !session.user.active) {
    await db.session.deleteMany({ where: { id } });
    return next();
  }

  req.user = toAuthUser(session.user);
  req.sessionId = id;

  // Record activity at most every five minutes rather than on every request.
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    db.session.update({ where: { id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue.', 'unauthenticated'));
  next();
}

export function requireCap(...needed: Capability[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in to continue.', 'unauthenticated'));
    // Any one of the listed capabilities is enough.
    if (!needed.some((capability) => can(req.user!.role, capability))) return next(forbidden());
    next();
  };
}

export function userCan(req: Request, capability: Capability) {
  return Boolean(req.user && can(req.user.role, capability));
}
