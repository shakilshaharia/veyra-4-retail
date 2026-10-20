// Creates a CMS account, or recovers an existing one, from the command line.
// Useful on a fresh server and when every Super Admin is locked out.
//
//   pnpm create-admin --email you@company.com --name "Your Name"
//   pnpm create-admin --email you@company.com --role EDITOR
//   pnpm create-admin --email you@company.com --reset     new password for an existing account
//
// The password is generated and printed once, unless CMS_ADMIN_PASSWORD is set
// in the environment (it is never taken as an argument, so it stays out of
// shell history). For an existing account --reset also unlocks it, re-enables
// it and signs it out everywhere.

import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { db } from '../src/db.ts';
import { emailSchema, hashPassword, passwordSchema } from '../src/lib/auth.ts';

const roles = ['SUPER_ADMIN', 'EDITOR', 'AUTHOR'] as const;
type Role = (typeof roles)[number];

function fail(message: string): never {
  console.error(`create-admin: ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'SUPER_ADMIN' },
    reset: { type: 'boolean', default: false },
  },
});

const email = emailSchema.safeParse(values.email ?? '');
if (!email.success) fail('pass --email with a valid address.');
const role = values.role?.toUpperCase() as Role;
if (!roles.includes(role)) fail(`--role must be one of ${roles.join(', ')}.`);

let password = process.env.CMS_ADMIN_PASSWORD ?? '';
const generated = !password;
if (generated) password = `${randomBytes(15).toString('base64url')}7`;
const checked = passwordSchema.safeParse(password);
if (!checked.success) fail(`CMS_ADMIN_PASSWORD is too weak: ${checked.error.issues[0]?.message}`);

try {
  const existing = await db.user.findUnique({ where: { email: email.data } });
  if (existing && !values.reset) {
    fail(`${email.data} already exists (${existing.role}). Add --reset to give it a new password.`);
  }

  const passwordHash = await hashPassword(password);
  if (existing) {
    await db.$transaction([
      db.user.update({
        where: { id: existing.id },
        data: { passwordHash, role, active: true, failedLogins: 0, lockedUntil: null, ...(values.name ? { name: values.name } : {}) },
      }),
      db.session.deleteMany({ where: { userId: existing.id } }),
      db.passwordResetToken.deleteMany({ where: { userId: existing.id } }),
    ]);
    console.log(`Reset ${email.data} (${role}); existing sessions were signed out.`);
  } else {
    await db.user.create({ data: { email: email.data, name: values.name?.trim() || 'Site Admin', role, passwordHash } });
    console.log(`Created ${email.data} (${role}).`);
  }
  if (generated) {
    console.log(`Password: ${password}`);
    console.log('It is shown only once. Sign in and change it from the Profile page.');
  }
} finally {
  await db.$disconnect();
}
