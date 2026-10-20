import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { env } from '../env.ts';
import type { Prisma } from '../generated/prisma/client.ts';
import { logActivity } from '../lib/activity.ts';
import { requireCap } from '../lib/auth.ts';
import { badRequest, parse } from '../lib/http.ts';
import { isMailConfigured, resetMailTransport, sendTestMail } from '../lib/mail.ts';
import { validateCustomCode } from '../lib/sanitize.ts';
import { getAllSettings, getSetting, settingGroups, type SettingKey } from '../lib/settings.ts';

export const settingsRouter = Router();
settingsRouter.use(requireCap('settings.manage'));

const emailOrEmpty = z.string().trim().max(200).refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value), 'Enter a valid email address.');

settingsRouter.get('/', async (_req, res) => {
  const all = await getAllSettings();
  // Never send the SMTP password to the browser; just say whether one is set.
  const { pass, ...email } = all.email;
  res.json({
    ...all,
    email: { ...email, hasPassword: Boolean(pass) },
    environment: {
      mailConfigured: await isMailConfigured(),
      storageDriver: env.STORAGE_DRIVER,
      recaptchaConfigured: Boolean(env.RECAPTCHA_SECRET),
      siteUrl: env.siteUrl,
    },
  });
});

// Verify the saved SMTP settings and send a test message.
settingsRouter.post('/email/test', async (req, res) => {
  const { to } = parse(z.object({ to: z.string().trim().toLowerCase().email('Enter a valid email address to send the test to.') }), req.body);
  try {
    const result = await sendTestMail(to);
    res.json(result.sent ? { ok: true, message: `Test email sent to ${to}.` } : { ok: false, message: 'SMTP is not configured yet, so the message was written to dev-mail.' });
  } catch (error) {
    throw badRequest(`Could not send the test email: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
});

settingsRouter.put('/:key', async (req, res) => {
  const key = String(req.params.key) as SettingKey;
  const group = settingGroups[key];
  if (!group) throw badRequest('Unknown settings group.');

  const value = parse(group.schema, req.body) as Record<string, unknown>;

  // The password is never sent to the browser, so an empty one on save means
  // "keep the current password" rather than "clear it".
  if (key === 'email' && !value.pass) {
    value.pass = (await getSetting('email')).pass;
  }

  if (key === 'site') {
    const fields: Record<string, string> = {};
    for (const field of ['contactEmail', 'notificationEmail'] as const) {
      const check = emailOrEmpty.safeParse(value[field]);
      if (!check.success) fields[field] = check.error.issues[0].message;
    }
    for (const field of ['headerScripts', 'footerScripts'] as const) {
      const problem = validateCustomCode(String(value[field] ?? ''));
      if (problem) fields[field] = problem;
    }
    if (Object.keys(fields).length) throw badRequest('Some settings need attention.', fields);
  }
  if (key === 'demo' && value.mode === 'url' && !value.url) {
    throw badRequest('Add the booking link, or switch back to the request form.', { url: 'Required when using a link.' });
  }

  await db.setting.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue, updatedById: req.user!.id },
    create: { key, value: value as Prisma.InputJsonValue, updatedById: req.user!.id },
  });
  // New SMTP settings take effect on the next email, without a restart.
  if (key === 'email') resetMailTransport();
  logActivity(req, 'update', 'settings', `Updated ${key} settings`);

  if (key === 'email') {
    const { pass, ...safe } = value as Record<string, unknown>;
    return void res.json({ email: { ...safe, hasPassword: Boolean(pass) } });
  }
  res.json({ [key]: value });
});
