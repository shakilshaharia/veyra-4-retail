import QRCode from 'qrcode';
import { Router } from 'express';
import { z } from 'zod';
import { urlSchema } from '@workspace/cms-content';
import { db } from '../db.ts';
import { Prisma } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { describeUser, emailSchema, hashPassword, passwordSchema, sha256, toAuthUser, verifyPassword } from '../lib/auth.ts';
import { HttpError, badRequest, parse } from '../lib/http.ts';
import { getSetting } from '../lib/settings.ts';
import { decryptSecret, encryptSecret, generateBackupCodes, generateTotpSecret, totpUri, verifyTotp } from '../lib/totp.ts';

export const profileRouter = Router();

type BackupCode = { code: string; usedAt: string | null };

const unusedBackupCodes = (stored: unknown) => (Array.isArray(stored) ? (stored as BackupCode[]) : []).filter((c) => c && !c.usedAt).length;

profileRouter.get('/', async (req, res) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const sessions = await db.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, lastSeenAt: true, userAgent: true, ip: true },
    orderBy: { lastSeenAt: 'desc' },
  });
  const { requireTwoFactor } = await getSetting('security');
  res.json({
    user: { ...describeUser(toAuthUser(user)), lastLoginAt: user.lastLoginAt, createdAt: user.createdAt },
    twoFactor: {
      enabled: Boolean(user.totpEnabledAt) || user.emailOtpEnabled,
      totp: Boolean(user.totpEnabledAt),
      email: user.emailOtpEnabled,
      enabledAt: user.totpEnabledAt,
      required: requireTwoFactor,
      backupCodesRemaining: unusedBackupCodes(user.backupCodes),
    },
    sessions: sessions.map((session) => ({
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      userAgent: session.userAgent,
      current: session.id === req.sessionId,
    })),
  });
});

profileRouter.patch('/', async (req, res) => {
  const input = parse(
    z.object({
      name: z.string().trim().min(1, 'Enter your name.').max(120).optional(),
      email: emailSchema.optional(),
      avatarUrl: urlSchema.optional(),
      // Changing the sign-in email requires the current password.
      currentPassword: z.string().max(200).optional(),
    }),
    req.body,
  );
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (input.email && input.email !== user.email) {
    if (!input.currentPassword || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw badRequest('Enter your current password to change your email.', { currentPassword: 'Current password is required.' });
    }
    if (await db.user.findUnique({ where: { email: input.email } })) {
      throw badRequest('That email is already used by another account.', { email: 'Already in use.' });
    }
  }
  const updated = await db.user.update({
    where: { id: user.id },
    data: { name: input.name, email: input.email, avatarUrl: input.avatarUrl },
  });
  logActivity(req, 'update', 'profile', `${updated.name} updated their profile`, updated.id);
  res.json({ user: describeUser(toAuthUser(updated)) });
});

profileRouter.post('/password', async (req, res) => {
  const input = parse(
    z.object({
      currentPassword: z.string().min(1, 'Enter your current password.').max(200),
      newPassword: passwordSchema,
    }),
    req.body,
  );
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Your current password is not correct.', 'invalid', { currentPassword: 'Not correct.' });
  }
  if (input.currentPassword === input.newPassword) {
    throw badRequest('Choose a password different from your current one.', { newPassword: 'Same as current.' });
  }
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } }),
    // Sign out every other device; keep this one.
    db.session.deleteMany({ where: { userId: user.id, id: { not: req.sessionId } } }),
  ]);
  logActivity(req, 'update', 'profile', `${user.name} changed their password`, user.id);
  res.json({ ok: true, message: 'Password changed. Other devices have been signed out.' });
});

profileRouter.post('/sign-out-others', async (req, res) => {
  const { count } = await db.session.deleteMany({ where: { userId: req.user!.id, id: { not: req.sessionId } } });
  res.json({ ok: true, message: count ? `Signed out ${count} other session${count === 1 ? '' : 's'}.` : 'No other sessions were active.' });
});

// --- Two-factor authentication (TOTP) -------------------------------------

// Step 1: generate a secret and the QR code to scan. The secret is stored
// (encrypted) but 2FA is not active until a code is confirmed in step 2.
profileRouter.post('/2fa/setup', async (req, res) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (user.totpEnabledAt) throw badRequest('Two-factor authentication is already on. Turn it off first to set it up again.');

  const secret = generateTotpSecret();
  const issuer = (await getSetting('site')).siteName || 'Veyra';
  const uri = totpUri(secret, user.email, issuer);
  await db.user.update({ where: { id: user.id }, data: { totpSecret: encryptSecret(secret) } });
  res.json({ secret, otpauthUri: uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) });
});

// Step 2: confirm a code from the app, which turns 2FA on and returns the
// one-time backup codes (shown once; only their hashes are stored).
profileRouter.post('/2fa/enable', async (req, res) => {
  const { password, code } = parse(
    z.object({ password: z.string().min(1, 'Enter your password.').max(200), code: z.string().trim().min(6).max(10) }),
    req.body,
  );
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await verifyPassword(password, user.passwordHash))) throw badRequest('Your password is not correct.', { password: 'Not correct.' });
  if (user.totpEnabledAt) throw badRequest('Two-factor authentication is already on.');
  if (!user.totpSecret) throw badRequest('Start the setup again — no pending secret was found.');
  if (!verifyTotp(decryptSecret(user.totpSecret), code)) throw badRequest('That code did not match. Check the app and try again.', { code: 'Incorrect code.' });

  const plain = generateBackupCodes(10);
  const backupCodes: BackupCode[] = plain.map((c) => ({ code: sha256(c.toLowerCase()), usedAt: null }));
  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), backupCodes } });
  logActivity(req, 'update', 'profile', `${user.name} turned on two-factor authentication`, user.id);
  res.json({ ok: true, backupCodes: plain, message: 'Two-factor authentication is on. Save your backup codes somewhere safe.' });
});

const passwordBody = z.object({ password: z.string().min(1, 'Enter your password.').max(200) });

async function verifyOwnPassword(userId: string, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) throw badRequest('Your password is not correct.', { password: 'Not correct.' });
  return user;
}

// Turn off the authenticator-app method only. Blocked if it is the user's last
// factor while 2FA is required site-wide.
profileRouter.post('/2fa/totp/disable', async (req, res) => {
  const { password } = parse(passwordBody, req.body);
  const user = await verifyOwnPassword(req.user!.id, password);
  if (!user.totpEnabledAt) throw badRequest('The authenticator app is not set up.');
  const { requireTwoFactor } = await getSetting('security');
  if (requireTwoFactor && !user.emailOtpEnabled) throw new HttpError(403, 'Two-factor is required. Turn on email codes before removing the authenticator app.', 'mfa_required');
  await db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, backupCodes: Prisma.DbNull } });
  logActivity(req, 'update', 'profile', `${user.name} turned off the authenticator app`, user.id);
  res.json({ ok: true, message: 'Authenticator app removed.' });
});

// Turn on email sign-in codes for your own account.
profileRouter.post('/2fa/email/enable', async (req, res) => {
  const { password } = parse(passwordBody, req.body);
  const user = await verifyOwnPassword(req.user!.id, password);
  if (!user.emailOtpEnabled) {
    await db.user.update({ where: { id: user.id }, data: { emailOtpEnabled: true } });
    logActivity(req, 'update', 'profile', `${user.name} turned on email sign-in codes`, user.id);
  }
  res.json({ ok: true, message: `Email codes are on. They will be sent to ${user.email} at sign-in.` });
});

// Turn off email codes. Blocked if it is the last factor while 2FA is required.
profileRouter.post('/2fa/email/disable', async (req, res) => {
  const { password } = parse(passwordBody, req.body);
  const user = await verifyOwnPassword(req.user!.id, password);
  const { requireTwoFactor } = await getSetting('security');
  if (requireTwoFactor && !user.totpEnabledAt) throw new HttpError(403, 'Two-factor is required. Set up the authenticator app before removing email codes.', 'mfa_required');
  await db.user.update({ where: { id: user.id }, data: { emailOtpEnabled: false, emailOtpCodeHash: null, emailOtpExpiresAt: null, emailOtpAttempts: 0 } });
  logActivity(req, 'update', 'profile', `${user.name} turned off email sign-in codes`, user.id);
  res.json({ ok: true, message: 'Email codes are off.' });
});

// Turn off every second factor at once. Blocked while 2FA is required.
profileRouter.post('/2fa/disable', async (req, res) => {
  const { password } = parse(passwordBody, req.body);
  const { requireTwoFactor } = await getSetting('security');
  if (requireTwoFactor) throw new HttpError(403, 'Two-factor authentication is required for all admins and cannot be turned off.', 'mfa_required');
  const user = await verifyOwnPassword(req.user!.id, password);
  await db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, backupCodes: Prisma.DbNull, emailOtpEnabled: false, emailOtpCodeHash: null, emailOtpExpiresAt: null, emailOtpAttempts: 0 } });
  logActivity(req, 'update', 'profile', `${user.name} turned off two-factor authentication`, user.id);
  res.json({ ok: true, message: 'Two-factor authentication is off.' });
});

// Replace the backup codes with a fresh set (invalidates the old ones).
profileRouter.post('/2fa/backup-codes', async (req, res) => {
  const { password } = parse(z.object({ password: z.string().min(1, 'Enter your password.').max(200) }), req.body);
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!user.totpEnabledAt) throw badRequest('Turn on two-factor authentication first.');
  if (!(await verifyPassword(password, user.passwordHash))) throw badRequest('Your password is not correct.', { password: 'Not correct.' });

  const plain = generateBackupCodes(10);
  const backupCodes: BackupCode[] = plain.map((c) => ({ code: sha256(c.toLowerCase()), usedAt: null }));
  await db.user.update({ where: { id: user.id }, data: { backupCodes } });
  logActivity(req, 'update', 'profile', `${user.name} regenerated two-factor backup codes`, user.id);
  res.json({ ok: true, backupCodes: plain, message: 'New backup codes generated. The old ones no longer work.' });
});
