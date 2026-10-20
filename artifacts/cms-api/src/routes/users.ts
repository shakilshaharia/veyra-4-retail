import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { env } from '../env.ts';
import { Prisma } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { emailSchema, hashPassword, passwordSchema, randomToken, requireCap, sha256 } from '../lib/auth.ts';
import { HttpError, badRequest, notFound, parse } from '../lib/http.ts';
import { sendMail, simpleHtml } from '../lib/mail.ts';
import { roleLabels } from '../lib/permissions.ts';

export const usersRouter = Router();
usersRouter.use(requireCap('users.manage'));

const roleSchema = z.enum(['SUPER_ADMIN', 'EDITOR', 'AUTHOR']);

const publicUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  active: true,
  lastLoginAt: true,
  lockedUntil: true,
  totpEnabledAt: true,
  emailOtpEnabled: true,
  createdAt: true,
  _count: { select: { posts: true } },
} as const;

// A new or reset user gets a one-time link to choose their own password, so
// no administrator ever has to know or send someone else's password.
async function sendPasswordLink(user: { id: string; email: string; name: string }, kind: 'invite' | 'reset') {
  const token = randomToken();
  await db.passwordResetToken.create({
    data: {
      tokenHash: sha256(token),
      userId: user.id,
      // Invitations get longer than self-service resets.
      expiresAt: new Date(Date.now() + (kind === 'invite' ? 72 : 1) * 60 * 60 * 1000),
    },
  });
  const link = `${env.adminUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const paragraphs =
    kind === 'invite'
      ? [`Hi ${user.name},`, 'You have been given an account on the Veyra website admin. Choose a password to sign in. This link works once and expires in 72 hours.']
      : [`Hi ${user.name},`, 'An administrator has asked you to set a new password for the Veyra website admin. This link works once and expires in one hour.'];
  await sendMail({
    to: user.email,
    subject: kind === 'invite' ? 'You have been invited to the Veyra admin' : 'Set a new Veyra admin password',
    text: `${paragraphs.join('\n\n')}\n\n${link}`,
    html: simpleHtml(kind === 'invite' ? 'Welcome to the Veyra admin' : 'Set a new password', paragraphs, { label: 'Choose a password', url: link }),
  });
}

async function assertAnotherSuperAdmin(excludingId: string) {
  const others = await db.user.count({ where: { role: 'SUPER_ADMIN', active: true, id: { not: excludingId } } });
  if (others === 0) {
    throw badRequest('There must always be at least one active Super Admin.', { role: 'Last active Super Admin.' });
  }
}

usersRouter.get('/', async (_req, res) => {
  const users = await db.user.findMany({ select: publicUser, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  res.json({ items: users });
});

usersRouter.post('/', async (req, res) => {
  const input = parse(
    z.object({
      name: z.string().trim().min(1, 'Enter a name.').max(120),
      email: emailSchema,
      role: roleSchema,
      // Optional: without one, the user is emailed a link to set their own.
      password: passwordSchema.optional().or(z.literal('').transform(() => undefined)),
    }),
    req.body,
  );
  const exists = await db.user.findUnique({ where: { email: input.email } });
  if (exists) throw badRequest('A user with that email already exists.', { email: 'Already in use.' });

  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      // An unusable hash until the invitation is accepted.
      passwordHash: await hashPassword(input.password ?? randomToken(32)),
    },
    select: publicUser,
  });
  let invited = false;
  if (!input.password) {
    await sendPasswordLink(user, 'invite');
    invited = true;
  }
  logActivity(req, 'create', 'user', `Added ${roleLabels[user.role]} ${user.name}`, user.id);
  res.status(201).json({ user, invited });
});

usersRouter.patch('/:id', async (req, res) => {
  const input = parse(
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      email: emailSchema.optional(),
      role: roleSchema.optional(),
      active: z.boolean().optional(),
    }),
    req.body,
  );
  const user = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!user) throw notFound('User');

  const isSelf = user.id === req.user!.id;
  if (isSelf && input.role && input.role !== user.role) throw badRequest('You cannot change your own role.', { role: 'Ask another Super Admin.' });
  if (isSelf && input.active === false) throw badRequest('You cannot deactivate your own account.', { active: 'Ask another Super Admin.' });
  const losingSuperAdmin = user.role === 'SUPER_ADMIN' && ((input.role && input.role !== 'SUPER_ADMIN') || input.active === false);
  if (losingSuperAdmin) await assertAnotherSuperAdmin(user.id);

  const updated = await db.user.update({
    where: { id: user.id },
    data: { ...input, ...(input.active === true ? { lockedUntil: null, failedLogins: 0 } : {}) },
    select: publicUser,
  });
  // Deactivation or a role change takes effect immediately, not at next login.
  if (input.active === false || (input.role && input.role !== user.role)) {
    await db.session.deleteMany({ where: { userId: user.id } });
  }
  logActivity(req, 'update', 'user', `Updated user ${updated.name}`, updated.id);
  res.json({ user: updated });
});

// Turn on email sign-in codes for a user. Unlike the authenticator app (which
// the user must set up on their own device), email codes can be enabled for
// someone by an administrator; codes are sent to the user's own email.
usersRouter.post('/:id/enable-email-2fa', async (req, res) => {
  const user = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!user) throw notFound('User');
  if (user.emailOtpEnabled) throw badRequest(`${user.name} already uses email sign-in codes.`);
  await db.user.update({ where: { id: user.id }, data: { emailOtpEnabled: true } });
  logActivity(req, 'update', 'user', `Turned on email two-factor codes for ${user.name}`, user.id);
  // Let the user know their sign-in now needs a code.
  await sendMail({
    to: user.email,
    subject: 'Two-factor authentication was turned on for your Veyra admin account',
    text: `Hi ${user.name},\n\nAn administrator turned on email two-factor authentication for your Veyra admin account. From now on, signing in will also ask for a 6-digit code sent to this address.`,
    html: simpleHtml('Two-factor authentication is on', [`Hi ${user.name},`, 'An administrator turned on email two-factor authentication for your Veyra admin account. From now on, signing in will also ask for a 6-digit code sent to this address.']),
  }).catch((e: unknown) => console.error('[users] 2fa notice failed:', (e as Error).message));
  res.json({ ok: true, message: `Email two-factor codes are on for ${user.name}.` });
});

// Recovery / off switch: a Super Admin clears all of a colleague's two-factor
// methods (authenticator and email), e.g. after a lost device. They can sign in
// with just their password until they set it up again.
usersRouter.post('/:id/reset-2fa', async (req, res) => {
  const user = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!user) throw notFound('User');
  if (!user.totpEnabledAt && !user.totpSecret && !user.emailOtpEnabled) throw badRequest(`${user.name} does not have two-factor authentication set up.`);
  await db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, backupCodes: Prisma.DbNull, emailOtpEnabled: false, emailOtpCodeHash: null, emailOtpExpiresAt: null, emailOtpAttempts: 0 } });
  logActivity(req, 'reset', 'user', `Turned off two-factor authentication for ${user.name}`, user.id);
  res.json({ ok: true, message: `Two-factor authentication was turned off for ${user.name}.` });
});

usersRouter.post('/:id/send-reset', async (req, res) => {
  const user = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!user) throw notFound('User');
  await sendPasswordLink(user, 'reset');
  logActivity(req, 'reset', 'user', `Sent a password link to ${user.name}`, user.id);
  res.json({ ok: true, message: `A password link was sent to ${user.email}.` });
});

usersRouter.delete('/:id', async (req, res) => {
  const user = await db.user.findUnique({ where: { id: String(req.params.id) } });
  if (!user) throw notFound('User');
  if (user.id === req.user!.id) throw new HttpError(400, 'You cannot delete your own account.', 'invalid');
  if (user.role === 'SUPER_ADMIN') await assertAnotherSuperAdmin(user.id);

  // Their posts stay published; ownership moves to whoever deletes the account.
  await db.$transaction([
    db.post.updateMany({ where: { authorId: user.id }, data: { authorId: req.user!.id } }),
    db.user.delete({ where: { id: user.id } }),
  ]);
  logActivity(req, 'delete', 'user', `Removed user ${user.name}`, user.id);
  res.json({ ok: true });
});
