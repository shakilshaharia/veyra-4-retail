import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { env } from '../env.ts';
import type { User } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import {
  describeUser,
  EMAIL_OTP_MAX_ATTEMPTS,
  emailSchema,
  endSession,
  generateEmailOtp,
  hashPassword,
  maskEmail,
  passwordSchema,
  randomToken,
  requireAuth,
  sha256,
  safeEqual,
  signMfaChallenge,
  startSession,
  toAuthUser,
  verifyMfaChallenge,
  verifyPassword,
} from '../lib/auth.ts';
import { clientIp, HttpError, badRequest, parse } from '../lib/http.ts';
import { sendMail, simpleHtml } from '../lib/mail.ts';
import { limiter } from '../lib/rate.ts';
import { getSetting } from '../lib/settings.ts';
import { decryptSecret, verifyTotp } from '../lib/totp.ts';

export const authRouter = Router();

type BackupCode = { code: string; usedAt: string | null };

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const RESET_TTL_MINUTES = 60;

// Finish a sign-in once every required factor has checked out: reset the
// lockout counters, start the session, note a sign-in from a device not seen
// before, and return the user with whether 2FA is required site-wide.
async function completeLogin(req: Request, res: Response, user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'avatarUrl' | 'totpEnabledAt' | 'emailOtpEnabled'>) {
  const ip = clientIp(req);
  const knownDevice = await db.session.findFirst({ where: { userId: user.id, ip } });

  // Clear any pending email code and reset the lockout counter.
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), emailOtpCodeHash: null, emailOtpExpiresAt: null, emailOtpAttempts: 0 } });
  await startSession(res, req, user.id);
  req.user = toAuthUser(user);
  logActivity(req, 'login', 'user', `${user.name} signed in`, user.id);

  if (!knownDevice) {
    const security = await getSetting('security');
    logActivity(req, 'login', 'user', `${user.name} signed in from a new device`, user.id);
    if (security.alertOnNewDeviceLogin) void sendNewDeviceAlert(user, req).catch((e: unknown) => console.error('[auth] new-device alert failed:', (e as Error).message));
  }

  const { requireTwoFactor } = await getSetting('security');
  res.json({ user: describeUser(toAuthUser(user)), twoFactorRequired: requireTwoFactor });
}

async function sendNewDeviceAlert(user: { email: string; name: string }, req: Request) {
  const when = new Date().toUTCString();
  const agent = String(req.headers['user-agent'] ?? 'an unknown browser').slice(0, 300);
  const paragraphs = [
    `Hi ${user.name},`,
    `Your Veyra admin account was just signed in from a device or location we had not seen before, on ${when}.`,
    `Browser: ${agent}`,
    'If this was you, there is nothing to do. If it was not, change your password immediately and sign out other devices from your Profile.',
  ];
  await sendMail({ to: user.email, subject: 'New sign-in to your Veyra admin account', text: paragraphs.join('\n\n'), html: simpleHtml('New sign-in detected', paragraphs) });
}

// Generate a fresh email sign-in code, store only its hash, and email it.
async function issueEmailOtp(user: { id: string; email: string; name: string }) {
  const { code, hash, expiresAt } = generateEmailOtp();
  await db.user.update({ where: { id: user.id }, data: { emailOtpCodeHash: hash, emailOtpExpiresAt: expiresAt, emailOtpAttempts: 0 } });
  const paragraphs = [
    `Hi ${user.name},`,
    'Use this code to finish signing in to the Veyra admin. It expires in 10 minutes.',
    `Your code: ${code}`,
    'If you did not try to sign in, you can ignore this email and consider changing your password.',
  ];
  await sendMail({ to: user.email, subject: `Your Veyra sign-in code: ${code}`, text: paragraphs.join('\n\n'), html: simpleHtml('Your sign-in code', paragraphs) }).catch((e: unknown) =>
    console.error('[auth] email code send failed:', (e as Error).message),
  );
}

// Check an emailed code: valid hash, not expired, within the attempt budget.
// Consumes the code on success and counts the attempt on failure.
async function consumeEmailOtp(user: Pick<User, 'id' | 'emailOtpCodeHash' | 'emailOtpExpiresAt' | 'emailOtpAttempts'>, candidate: string): Promise<boolean> {
  if (!user.emailOtpCodeHash || !user.emailOtpExpiresAt || user.emailOtpExpiresAt < new Date()) return false;
  if (user.emailOtpAttempts >= EMAIL_OTP_MAX_ATTEMPTS) return false;
  if (safeEqual(user.emailOtpCodeHash, sha256(candidate))) {
    await db.user.update({ where: { id: user.id }, data: { emailOtpCodeHash: null, emailOtpExpiresAt: null, emailOtpAttempts: 0 } });
    return true;
  }
  await db.user.update({ where: { id: user.id }, data: { emailOtpAttempts: { increment: 1 } } });
  return false;
}

// Per-IP throttles. The per-account lockout below catches a slow attack that
// rotates addresses.
const loginLimiter = limiter({
  windowMinutes: 15,
  limit: 20,
  message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
});

const resetLimiter = limiter({
  windowMinutes: 60,
  limit: 8,
  message: 'Too many reset requests. Please try again later.',
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(
    z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password.').max(200) }),
    req.body,
  );

  const user = await db.user.findUnique({ where: { email } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new HttpError(
      429,
      `This account is temporarily locked after repeated failed sign-ins. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`,
      'locked',
    );
  }

  // Always run the hash comparison, even with no such user, so response time
  // does not reveal whether an email has an account.
  const ok = await verifyPassword(password, user?.passwordHash);

  if (!user || !ok || !user.active) {
    if (user) {
      const failures = user.failedLogins + 1;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failures,
          lockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
        },
      });
    }
    throw new HttpError(401, 'That email and password do not match an active account.', 'invalid_credentials');
  }

  // Password is correct, so clear the lockout counter. If the account has a
  // second factor, hand off a short-lived challenge instead of a session: no
  // session exists until the code is verified.
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  if (user.totpEnabledAt || user.emailOtpEnabled) {
    // Email method: send a code now so it is waiting on the next screen.
    if (user.emailOtpEnabled) await issueEmailOtp(user);
    return void res.json({
      mfaRequired: true,
      challenge: signMfaChallenge(user.id),
      methods: { totp: Boolean(user.totpEnabledAt), email: user.emailOtpEnabled },
      emailHint: user.emailOtpEnabled ? maskEmail(user.email) : undefined,
    });
  }

  await completeLogin(req, res, user);
});

// Second step of a two-factor sign-in: an authenticator code, an emailed code,
// or a backup code — whichever methods the account has.
authRouter.post('/login/totp', loginLimiter, async (req, res) => {
  const { challenge, code } = parse(
    z.object({ challenge: z.string().min(10).max(400), code: z.string().trim().min(6).max(14) }),
    req.body,
  );
  const userId = verifyMfaChallenge(challenge);
  if (!userId) throw new HttpError(400, 'Your sign-in session expired. Enter your email and password again.', 'mfa_challenge_expired');

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active || (!user.totpEnabledAt && !user.emailOtpEnabled)) {
    throw new HttpError(401, 'That code did not match. Try again.', 'invalid_code');
  }

  const digits = code.replace(/\s/g, '');
  let ok = false;
  if (user.totpEnabledAt && user.totpSecret) ok = verifyTotp(decryptSecret(user.totpSecret), digits);
  if (!ok && user.emailOtpEnabled) ok = await consumeEmailOtp(user, digits);
  if (!ok && user.totpEnabledAt) ok = await consumeBackupCode(user.id, user.backupCodes, digits);
  if (!ok) throw new HttpError(401, 'That code did not match. Try again.', 'invalid_code');

  await completeLogin(req, res, user);
});

// Resend the emailed sign-in code (for the email method).
const resendLimiter = limiter({ windowMinutes: 15, limit: 5, message: 'Too many code requests. Please wait a few minutes.' });
authRouter.post('/login/resend', resendLimiter, async (req, res) => {
  const { challenge } = parse(z.object({ challenge: z.string().min(10).max(400) }), req.body);
  const userId = verifyMfaChallenge(challenge);
  if (!userId) throw new HttpError(400, 'Your sign-in session expired. Enter your email and password again.', 'mfa_challenge_expired');
  const user = await db.user.findUnique({ where: { id: userId } });
  // Always answer the same way; only actually send when the method is on.
  if (user?.active && user.emailOtpEnabled) await issueEmailOtp(user);
  res.json({ ok: true, challenge: signMfaChallenge(userId), emailHint: user ? maskEmail(user.email) : undefined });
});

// A backup code is accepted once. Returns true and marks it used if it matches
// an unused code; false otherwise.
async function consumeBackupCode(userId: string, stored: unknown, candidate: string): Promise<boolean> {
  const codes = Array.isArray(stored) ? (stored as BackupCode[]) : [];
  const hash = sha256(candidate.toLowerCase());
  const index = codes.findIndex((entry) => entry && !entry.usedAt && typeof entry.code === 'string' && safeEqual(entry.code, hash));
  if (index < 0) return false;
  codes[index] = { code: codes[index].code, usedAt: new Date().toISOString() };
  await db.user.update({ where: { id: userId }, data: { backupCodes: codes } });
  return true;
}

authRouter.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { requireTwoFactor } = await getSetting('security');
  res.json({ user: describeUser(req.user!), twoFactorRequired: requireTwoFactor });
});

// Always answers the same way, so it cannot be used to test which emails
// belong to accounts.
authRouter.post('/forgot-password', resetLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: emailSchema }), req.body);
  const user = await db.user.findUnique({ where: { email } });

  if (user?.active) {
    const token = randomToken();
    await db.passwordResetToken.create({
      data: {
        tokenHash: sha256(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      },
    });
    const link = `${env.adminUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const paragraphs = [
      `Hi ${user.name},`,
      'Someone asked to reset the password for your Veyra admin account. Use the link below to choose a new one. It works once and expires in one hour.',
      'If you did not ask for this, you can ignore this email; your password will not change.',
    ];
    await sendMail({
      to: user.email,
      subject: 'Reset your Veyra admin password',
      text: `${paragraphs.join('\n\n')}\n\n${link}`,
      html: simpleHtml('Reset your password', paragraphs, { label: 'Choose a new password', url: link }),
    }).catch((error: unknown) => console.error('[auth] reset email failed:', (error as Error).message));
  }

  res.json({ ok: true, message: 'If that email belongs to an account, a reset link is on its way.' });
});

authRouter.post('/reset-password', resetLimiter, async (req, res) => {
  const { token, password } = parse(
    z.object({ token: z.string().min(20).max(200), password: passwordSchema }),
    req.body,
  );

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest('This reset link is invalid or has expired. Request a new one.', {
      token: 'Invalid or expired.',
    });
  }

  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLogins: 0, lockedUntil: null },
    }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // A reset should evict anyone who was signed in with the old password.
    db.session.deleteMany({ where: { userId: record.userId } }),
    db.passwordResetToken.deleteMany({ where: { userId: record.userId, usedAt: null } }),
  ]);

  res.json({ ok: true, message: 'Password updated. You can sign in now.' });
});
