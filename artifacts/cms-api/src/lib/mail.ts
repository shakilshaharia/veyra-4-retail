// Outgoing email. SMTP can be configured from the admin (Settings → Email) or,
// as a fallback, from environment variables. With neither configured (local
// development) each message is written to ./dev-mail so password-reset links
// and notifications can still be followed end to end.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EmailSettings } from '@workspace/cms-content';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.ts';
import { getSetting } from './settings.ts';

type Message = { to: string; subject: string; text: string; html?: string; replyTo?: string };

type Resolved = { transport: Transporter; from: string } | null;

// The effective SMTP config: the admin's settings when enabled, otherwise the
// environment. Returns null when nothing is configured (dev-mail fallback).
function resolveConfig(email: EmailSettings): { host: string; port: number; secure: boolean; user: string; pass: string; from: string } | null {
  if (email.enabled && email.host) {
    const fromEmail = email.fromEmail || email.user;
    const from = fromEmail ? (email.fromName ? `${email.fromName} <${fromEmail}>` : fromEmail) : env.MAIL_FROM;
    return { host: email.host, port: email.port, secure: email.secure, user: email.user, pass: email.pass, from };
  }
  if (env.SMTP_HOST) {
    return { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER ?? '', pass: env.SMTP_PASS ?? '', from: env.MAIL_FROM };
  }
  return null;
}

// Cache the transport and rebuild it only when the config changes, so settings
// edited in the admin take effect immediately without a restart.
let cache: { key: string; resolved: Resolved } | null = null;

function buildTransport(email: EmailSettings): Resolved {
  const config = resolveConfig(email);
  const key = JSON.stringify(config);
  if (cache && cache.key === key) return cache.resolved;
  const resolved: Resolved = config
    ? {
        transport: nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: config.user ? { user: config.user, pass: config.pass } : undefined,
        }),
        from: config.from,
      }
    : null;
  cache = { key, resolved };
  return resolved;
}

// Call after the email settings are saved so the next send uses them.
export function resetMailTransport() {
  cache = null;
}

export async function isMailConfigured(): Promise<boolean> {
  return Boolean(buildTransport(await getSetting('email')));
}

export async function sendMail(message: Message) {
  const resolved = buildTransport(await getSetting('email'));
  if (resolved) {
    await resolved.transport.sendMail({ from: resolved.from, ...message });
    return { delivered: true as const };
  }
  const dir = path.resolve('dev-mail');
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${stamp}-${message.subject.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.txt`);
  const body = [`To: ${message.to}`, `Subject: ${message.subject}`, message.replyTo ? `Reply-To: ${message.replyTo}` : '', '', message.text]
    .filter((line, index) => line !== '' || index > 2)
    .join('\n');
  await writeFile(file, body, 'utf8');
  console.log(`[mail] SMTP not configured; wrote "${message.subject}" to ${path.relative(process.cwd(), file)}`);
  return { delivered: false as const, file };
}

// Verifies the current (saved) SMTP settings and sends a test message. Throws
// nodemailer's error so the admin sees exactly what went wrong.
export async function sendTestMail(to: string) {
  const resolved = buildTransport(await getSetting('email'));
  if (!resolved) {
    const result = await sendMail({ to, subject: 'Veyra test email', text: 'SMTP is not configured, so this was written to dev-mail instead of being sent.' });
    return { sent: false as const, devMail: 'file' in result ? result.file : undefined };
  }
  await resolved.transport.verify();
  await resolved.transport.sendMail({
    from: resolved.from,
    to,
    subject: 'Veyra test email',
    text: 'This is a test email from your Veyra CMS. If you received it, SMTP is working.',
    html: simpleHtml('SMTP is working', ['This is a test email from your Veyra CMS.', 'If you received it, outgoing email is set up correctly.']),
  });
  return { sent: true as const };
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

// A plain, readable HTML wrapper so messages look intentional in a mail client.
export function simpleHtml(title: string, paragraphs: string[], action?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escape(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:22px 0"><a href="${escape(action.url)}" style="display:inline-block;background:#231FCD;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:600">${escape(action.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5fa;font-family:Inter,Arial,sans-serif;color:#111114"><div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;padding:28px"><h1 style="margin:0 0 16px;font-size:20px">${escape(title)}</h1>${body}${button}</div></body></html>`;
}
