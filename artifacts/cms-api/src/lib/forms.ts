// Shared handling for the site's two forms: spam checks, storage and the
// admin notification email.

import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { db } from '../db.ts';
import { env } from '../env.ts';
import type { FormType, Prisma } from '../generated/prisma/client.ts';
import { HttpError, clientIp } from './http.ts';
import { sendMail, simpleHtml } from './mail.ts';
import { getSetting } from './settings.ts';

const MIN_FILL_MS = 2500;

export type SpamVerdict = { spam: boolean; silent: boolean; reason?: string };

// Honeypot hits are answered with a fake success and never stored, so a bot
// learns nothing. Softer signals are stored as SPAM for a human to check.
export function spamVerdict(input: { website?: string; startedAt?: number; message?: string }): SpamVerdict {
  if (input.website && input.website.trim()) return { spam: true, silent: true, reason: 'honeypot' };
  if (typeof input.startedAt === 'number' && Date.now() - input.startedAt < MIN_FILL_MS) {
    return { spam: true, silent: false, reason: 'submitted too quickly' };
  }
  const links = (input.message ?? '').match(/https?:\/\//gi)?.length ?? 0;
  if (links > 3) return { spam: true, silent: false, reason: 'too many links' };
  return { spam: false, silent: false };
}

export async function verifyRecaptcha(token: string | undefined, req: Request) {
  if (!env.RECAPTCHA_SECRET) return;
  if (!token) throw new HttpError(400, 'Please complete the verification and try again.', 'captcha');
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: env.RECAPTCHA_SECRET, response: token, remoteip: clientIp(req) }),
  }).then((r) => r.json() as Promise<{ success: boolean; score?: number }>).catch(() => null);
  if (!response?.success || (typeof response.score === 'number' && response.score < env.RECAPTCHA_MIN_SCORE)) {
    throw new HttpError(400, 'We could not verify this submission. Please try again.', 'captcha');
  }
}

export function ipHash(req: Request) {
  return createHash('sha256').update(`${env.APP_SECRET}:${clientIp(req)}`).digest('hex').slice(0, 32);
}

export async function assertFormOpen(type: FormType) {
  const forms = await getSetting('forms');
  const open = type === 'DEMO' ? forms.demoEnabled : forms.contactEnabled;
  if (!open) throw new HttpError(403, 'This form is not accepting submissions right now.', 'form_closed');
}

export async function saveSubmission(
  req: Request,
  type: FormType,
  fields: { name: string; email: string; company: string; data: Record<string, string> },
  verdict: SpamVerdict,
) {
  const submission = await db.formSubmission.create({
    data: {
      type,
      status: verdict.spam ? 'SPAM' : 'NEW',
      name: fields.name,
      email: fields.email,
      company: fields.company,
      data: fields.data as Prisma.InputJsonValue,
      notes: verdict.spam && verdict.reason ? `Flagged automatically: ${verdict.reason}.` : '',
      ipHash: ipHash(req),
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    },
  });
  if (!verdict.spam) void notify(submission.id);
  return submission;
}

const labels: Record<string, string> = {
  interest: 'Interested in',
  inquiryType: 'Inquiry type',
  solution: 'Solution of interest',
  message: 'Message',
};

// Fire-and-forget: a mail outage must not lose the submission, which is
// already safely in the database and visible in the admin.
async function notify(id: string) {
  try {
    const submission = await db.formSubmission.findUniqueOrThrow({ where: { id } });
    const site = await getSetting('site');
    const to = site.notificationEmail || site.contactEmail;
    if (!to) return;
    const kind = submission.type === 'DEMO' ? 'demo request' : 'contact message';
    const data = submission.data as Record<string, string>;
    const lines = [
      `Name: ${submission.name}`,
      `Email: ${submission.email}`,
      ...(submission.company ? [`Company: ${submission.company}`] : []),
      ...Object.entries(data)
        .filter(([, value]) => value)
        .map(([key, value]) => `${labels[key] ?? key}: ${value}`),
    ];
    const link = `${env.adminUrl}/submissions/${submission.id}`;
    await sendMail({
      to,
      replyTo: submission.email,
      subject: `New ${kind} from ${submission.name}${submission.company ? ` (${submission.company})` : ''}`,
      text: `${lines.join('\n')}\n\nOpen in the admin: ${link}`,
      html: simpleHtml(`New ${kind}`, lines, { label: 'Open in the admin', url: link }),
    });
    await db.formSubmission.update({ where: { id }, data: { emailed: true } });
  } catch (error) {
    console.error('[forms] notification failed:', (error as Error).message);
  }
}
